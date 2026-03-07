import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
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

    stepSimulation(state, defaultGameConfig, 110);

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
});
