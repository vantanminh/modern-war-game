import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import { createInitialGameState, stepSimulation } from './simulation';

describe('ai', () => {
  it('builds economy, trains units, and eventually launches an attack wave', () => {
    const state = createInitialGameState(defaultGameConfig);

    stepSimulation(state, defaultGameConfig, 420);

    const enemyBuildings = Object.values(state.sim.buildings).filter((building) => building.ownerId === 'enemy');
    const enemyUnits = Object.values(state.sim.units).filter((unit) => unit.ownerId === 'enemy');
    const enemyWorkers = enemyUnits.filter((unit) => unit.unitTypeId === 'courier');

    expect(enemyBuildings.some((building) => building.buildingTypeId === 'barracks')).toBe(true);
    expect(enemyWorkers.length).toBeGreaterThanOrEqual(4);
    expect(enemyUnits.filter((unit) => unit.unitTypeId !== 'courier').length).toBeGreaterThanOrEqual(1);
    expect(state.sim.players.enemy.lastAttackTick).toBeGreaterThan(0);
  });
});
