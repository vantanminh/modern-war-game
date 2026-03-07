import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import type { GameConfig } from './types';
import { createInitialGameState, issueCommand, isBuildPlacementValid, stepSimulation } from './simulation';

describe('simulation', () => {
  it('validates build placement against occupied and open tiles', () => {
    const state = createInitialGameState(defaultGameConfig);

    expect(isBuildPlacementValid(state, defaultGameConfig, 'player', 'barracks', 3, 20)).toBe(false);
    expect(isBuildPlacementValid(state, defaultGameConfig, 'player', 'barracks', 11, 20)).toBe(true);
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
    const state = createInitialGameState(defaultGameConfig);
    const initialResources = state.sim.players.player.resources;
    const initialOre = state.sim.resources['ore-west'].amount;

    stepSimulation(state, defaultGameConfig, 220);

    expect(state.sim.players.player.resources).toBeGreaterThan(initialResources);
    expect(state.sim.resources['ore-west'].amount).toBeLessThan(initialOre);
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
});
