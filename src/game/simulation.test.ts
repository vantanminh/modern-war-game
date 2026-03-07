import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import type { GameConfig } from './types';
import { createInitialGameState, issueCommand, isBuildPlacementValid, stepSimulation } from './simulation';

describe('simulation', () => {
  it('validates build placement against occupied and open tiles', () => {
    const state = createInitialGameState(defaultGameConfig);

    expect(isBuildPlacementValid(state, defaultGameConfig, 'player', 'barracks', 4, 23)).toBe(false);
    expect(isBuildPlacementValid(state, defaultGameConfig, 'player', 'barracks', 12, 24)).toBe(true);
  });

  it('deducts cost and completes a production queue', () => {
    const state = createInitialGameState(defaultGameConfig);
    const hq = Object.values(state.sim.buildings).find(
      (building) => building.ownerId === 'player' && building.buildingTypeId === 'command-core',
    );

    if (!hq) {
      throw new Error('Expected player HQ');
    }

    const initialResources = state.sim.players.player.resources;

    issueCommand(state, defaultGameConfig, {
      type: 'produce',
      playerId: 'player',
      buildingId: hq.id,
      unitTypeId: 'courier',
    });

    expect(state.sim.players.player.resources).toBe(initialResources - defaultGameConfig.units.courier.cost);
    expect(hq.queue).toHaveLength(1);

    stepSimulation(state, defaultGameConfig, defaultGameConfig.units.courier.buildTime + 8);

    const courierCount = Object.values(state.sim.units).filter(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'courier',
    ).length;
    expect(courierCount).toBeGreaterThan(2);
  });

  it('runs the economy loop for harvesters and refinery', () => {
    const config: GameConfig = {
      ...defaultGameConfig,
      ai: {
        ...defaultGameConfig.ai,
        automatedPlayers: [],
      },
    };
    const state = createInitialGameState(config);
    const initialResources = state.sim.players.player.resources;
    stepSimulation(state, config, 260);

    const workerOrders = Object.values(state.sim.units)
      .filter((unit) => unit.ownerId === 'player' && unit.unitTypeId === 'courier')
      .map((worker) => worker.order.kind);

    expect(workerOrders.length).toBeGreaterThan(0);
    expect(workerOrders.some((kind) => kind === 'harvest' || kind === 'return')).toBe(true);
    expect(state.sim.players.player.resources + state.sim.players.player.pendingIncome).toBeGreaterThanOrEqual(initialResources);
    expect(state.sim.players.player.incomePerSecond).toBeGreaterThanOrEqual(0);
  });

  it('buffers refinery income and credits it on second boundaries', () => {
    const state = createInitialGameState(defaultGameConfig);
    const playerCourier = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'courier',
    );
    const playerRefinery = Object.values(state.sim.buildings).find(
      (building) => building.ownerId === 'player' && building.buildingTypeId === 'refinery',
    );

    if (!playerCourier || !playerRefinery) {
      throw new Error('Expected player economy setup');
    }

    const initialResources = state.sim.players.player.resources;
    playerCourier.cargo = 50;
    playerCourier.x = playerRefinery.tileX + 1;
    playerCourier.y = playerRefinery.tileY + 1;
    playerCourier.order = {
      kind: 'return',
      path: [],
      refineryId: playerRefinery.id,
    };

    stepSimulation(state, defaultGameConfig, 1);

    expect(state.sim.players.player.resources).toBe(initialResources);
    expect(state.sim.players.player.pendingIncome).toBe(50);

    stepSimulation(state, defaultGameConfig, defaultGameConfig.tickRate - 1);

    expect(state.sim.players.player.resources).toBe(initialResources + 50);
    expect(state.sim.players.player.pendingIncome).toBe(0);
    expect(state.sim.players.player.incomePerSecond).toBe(50);
  });

  it('resolves combat and ends the match when the enemy HQ is destroyed', () => {
    const state = createInitialGameState(defaultGameConfig);
    const playerUnit = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'vanguard',
    );
    const enemyHQ = Object.values(state.sim.buildings).find(
      (building) => building.ownerId === 'enemy' && building.buildingTypeId === 'command-core',
    );

    if (!playerUnit || !enemyHQ) {
      throw new Error('Expected combat setup');
    }

    Object.values(state.sim.units)
      .filter((unit) => unit.ownerId === 'enemy')
      .forEach((unit) => delete state.sim.units[unit.id]);
    Object.values(state.sim.buildings)
      .filter((building) => building.ownerId === 'enemy' && building.id !== enemyHQ.id)
      .forEach((building) => delete state.sim.buildings[building.id]);

    playerUnit.x = enemyHQ.tileX - 1;
    playerUnit.y = enemyHQ.tileY + 1;
    enemyHQ.hp = 8;

    issueCommand(state, defaultGameConfig, {
      type: 'attack',
      playerId: 'player',
      unitIds: [playerUnit.id],
      targetId: enemyHQ.id,
      target: { x: enemyHQ.tileX, y: enemyHQ.tileY },
    });

    stepSimulation(state, defaultGameConfig, 24);

    expect(state.sim.winnerId).toBe('player');
  });

  it('routes to a reachable firing position when an enemy HQ has a dead-end pocket nearby', () => {
    const config: GameConfig = {
      ...defaultGameConfig,
      map: {
        ...defaultGameConfig.map,
        width: 14,
        height: 8,
        obstacleAreas: [],
        terrainBlocked: [
          { x: 12, y: 3 },
          { x: 11, y: 2 },
          { x: 11, y: 4 },
        ],
        resourceNodes: [
          { id: 'ore-a', x: 1, y: 1, amount: 800 },
          { id: 'ore-b', x: 12, y: 6, amount: 800 },
        ],
        spawns: [
          {
            playerId: 'player',
            factionId: 'aurora',
            hq: { x: 1, y: 4 },
            refinery: { x: 1, y: 1 },
            rally: { x: 4, y: 4 },
            buildAnchor: { x: 4, y: 5 },
          },
          {
            playerId: 'enemy',
            factionId: 'obsidian',
            hq: { x: 8, y: 2 },
            refinery: { x: 11, y: 5 },
            rally: { x: 11, y: 6 },
            buildAnchor: { x: 9, y: 5 },
          },
        ],
      },
    };
    const state = createInitialGameState(config);
    const playerUnit = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'vanguard',
    );
    const enemyHQ = Object.values(state.sim.buildings).find(
      (building) => building.ownerId === 'enemy' && building.buildingTypeId === 'command-core',
    );

    if (!playerUnit || !enemyHQ) {
      throw new Error('Expected custom combat setup');
    }

    Object.values(state.sim.units)
      .filter((unit) => unit.id !== playerUnit.id)
      .forEach((unit) => delete state.sim.units[unit.id]);
    Object.values(state.sim.buildings)
      .filter((building) => building.ownerId === 'enemy' && building.id !== enemyHQ.id)
      .forEach((building) => delete state.sim.buildings[building.id]);

    playerUnit.x = 2.5;
    playerUnit.y = 3.5;
    const initialHp = enemyHQ.hp;

    issueCommand(state, config, {
      type: 'attack',
      playerId: 'player',
      unitIds: [playerUnit.id],
      targetId: enemyHQ.id,
      target: { x: enemyHQ.tileX, y: enemyHQ.tileY },
    });

    stepSimulation(state, config, 160);

    expect(enemyHQ.hp).toBeLessThan(initialHp);
    expect(playerUnit.x).toBeGreaterThan(6.1);
  });

  it('moves to the nearest reachable approach tile when a wall fully blocks the clicked destination', () => {
    const config: GameConfig = {
      ...defaultGameConfig,
      map: {
        ...defaultGameConfig.map,
        width: 30,
        height: 15,
        obstacleAreas: [],
        terrainBlocked: Array.from({ length: 11 * 20 }, (_, index) => {
          const x = 5 + (index % 20);
          const y = 2 + Math.floor(index / 20);
          return { x, y };
        }),
        resourceNodes: [
          { id: 'ore-a', x: 2, y: 2, amount: 800 },
          { id: 'ore-b', x: 27, y: 12, amount: 800 },
        ],
        spawns: [
          {
            playerId: 'player',
            factionId: 'aurora',
            hq: { x: 1, y: 10 },
            refinery: { x: 1, y: 7 },
            rally: { x: 2, y: 7 },
            buildAnchor: { x: 2, y: 10 },
          },
          {
            playerId: 'enemy',
            factionId: 'obsidian',
            hq: { x: 26, y: 1 },
            refinery: { x: 25, y: 12 },
            rally: { x: 24, y: 12 },
            buildAnchor: { x: 23, y: 10 },
          },
        ],
      },
    };
    const state = createInitialGameState(config);
    const playerUnit = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'vanguard',
    );

    if (!playerUnit) {
      throw new Error('Expected player combat unit');
    }

    Object.values(state.sim.units)
      .filter((unit) => unit.id !== playerUnit.id)
      .forEach((unit) => delete state.sim.units[unit.id]);
    Object.values(state.sim.buildings).forEach((building) => delete state.sim.buildings[building.id]);

    playerUnit.x = 2.5;
    playerUnit.y = 7.5;

    issueCommand(state, config, {
      type: 'move',
      playerId: 'player',
      unitIds: [playerUnit.id],
      target: { x: 15, y: 7 },
    });

    stepSimulation(state, config, 80);

    expect(playerUnit.x).toBeGreaterThan(3.5);
    expect(playerUnit.x).toBeLessThan(7.5);
    expect(playerUnit.y < 2.5 || playerUnit.y > 12.5 || playerUnit.x < 5.5).toBe(true);
  });

  it('supports enabling strategic AI for both factions', () => {
    const config: GameConfig = {
      ...defaultGameConfig,
      factions: {
        ...defaultGameConfig.factions,
        aurora: {
          ...defaultGameConfig.factions.aurora,
          startResources: 850,
        },
        obsidian: {
          ...defaultGameConfig.factions.obsidian,
          startResources: 850,
        },
      },
      map: {
        ...defaultGameConfig.map,
        width: 28,
        height: 18,
        obstacleAreas: [],
        terrainBlocked: [],
        resourceNodes: [
          { id: 'ore-west', x: 5, y: 13, amount: 2400 },
          { id: 'ore-east', x: 22, y: 4, amount: 2400 },
          { id: 'ore-mid', x: 14, y: 9, amount: 1200 },
        ],
        spawns: [
          {
            playerId: 'player',
            factionId: 'aurora',
            hq: { x: 2, y: 11 },
            refinery: { x: 4, y: 9 },
            rally: { x: 7, y: 9 },
            buildAnchor: { x: 7, y: 11 },
          },
          {
            playerId: 'enemy',
            factionId: 'obsidian',
            hq: { x: 20, y: 3 },
            refinery: { x: 18, y: 5 },
            rally: { x: 16, y: 6 },
            buildAnchor: { x: 16, y: 4 },
          },
        ],
      },
      ai: {
        ...defaultGameConfig.ai,
        automatedPlayers: ['player', 'enemy'],
        thinkInterval: 6,
        attackThreshold: 1,
        economyTarget: 3,
        reserveRatio: 0,
        maxWorkers: 3,
      },
    };
    const state = createInitialGameState(config);
    const initialPlayerUnits = Object.values(state.sim.units).filter((unit) => unit.ownerId === 'player').length;

    stepSimulation(state, config, 720);

    const playerUnits = Object.values(state.sim.units).filter((unit) => unit.ownerId === 'player');
    const playerBuildings = Object.values(state.sim.buildings).filter((building) => building.ownerId === 'player');

    expect(playerUnits.length).toBeGreaterThan(initialPlayerUnits);
    expect(playerBuildings.some((building) => building.buildingTypeId === 'barracks')).toBe(true);
  });

  it('lets nearby idle combat units close in and attack once detected', () => {
    const state = createInitialGameState(defaultGameConfig);
    const playerUnit = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'vanguard',
    );
    const enemyUnit = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'enemy' && unit.unitTypeId === 'vanguard',
    );

    if (!playerUnit || !enemyUnit) {
      throw new Error('Expected default combat units');
    }

    Object.values(state.sim.units)
      .filter((unit) => unit.id !== playerUnit.id && unit.id !== enemyUnit.id)
      .forEach((unit) => delete state.sim.units[unit.id]);
    Object.values(state.sim.buildings).forEach((building) => delete state.sim.buildings[building.id]);

    playerUnit.x = 10.5;
    playerUnit.y = 10.5;
    enemyUnit.x = 14.7;
    enemyUnit.y = 10.7;
    playerUnit.order = {
      kind: 'idle',
      path: [],
    };
    enemyUnit.order = {
      kind: 'idle',
      path: [],
    };

    const initialDistance = Math.hypot(playerUnit.x - enemyUnit.x, playerUnit.y - enemyUnit.y);
    stepSimulation(state, defaultGameConfig, 100);

    const finalDistance = Math.hypot(playerUnit.x - enemyUnit.x, playerUnit.y - enemyUnit.y);
    expect(finalDistance).toBeLessThan(initialDistance - 0.8);
    expect(playerUnit.hp < defaultGameConfig.units.vanguard.maxHp || enemyUnit.hp < defaultGameConfig.units.vanguard.maxHp).toBe(true);
  });
});
