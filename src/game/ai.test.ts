import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import { createInitialGameState, stepSimulation } from './simulation';

describe('ai', () => {
  it('builds economy infrastructure and grows its army', () => {
    const config = {
      ...defaultGameConfig,
      factions: {
        ...defaultGameConfig.factions,
        aurora: {
          ...defaultGameConfig.factions.aurora,
          startResources: 900,
        },
        obsidian: {
          ...defaultGameConfig.factions.obsidian,
          startResources: 900,
        },
      },
      units: {
        ...defaultGameConfig.units,
        vanguard: {
          ...defaultGameConfig.units.vanguard,
          cost: 90,
          buildTime: 10,
        },
      },
      buildings: {
        ...defaultGameConfig.buildings,
        barracks: {
          ...defaultGameConfig.buildings.barracks,
          cost: 120,
          buildTime: 12,
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
        thinkInterval: 6,
        attackThreshold: 1,
        economyTarget: 3,
        reserveRatio: 0,
        maxWorkers: 3,
      },
    };
    const state = createInitialGameState(config);
    const initialEnemyGuard = Object.values(state.sim.units).find(
      (unit) => unit.ownerId === 'enemy' && unit.unitTypeId === 'vanguard',
    );

    if (!initialEnemyGuard) {
      throw new Error('Expected default enemy guard');
    }

    state.sim.units['test-enemy-escort'] = {
      ...initialEnemyGuard,
      id: 'test-enemy-escort',
      x: initialEnemyGuard.x + 0.8,
      y: initialEnemyGuard.y + 0.6,
      order: {
        kind: 'idle',
        path: [],
      },
    };
    const initialUnitCount = Object.values(state.sim.units).filter(
      (unit) => unit.ownerId === 'enemy',
    ).length;

    stepSimulation(state, config, 780);

    const enemyBuildings = Object.values(state.sim.buildings).filter((building) => building.ownerId === 'enemy');
    const enemyUnits = Object.values(state.sim.units).filter((unit) => unit.ownerId === 'enemy');
    const enemyWorkers = enemyUnits.filter((unit) => unit.unitTypeId === 'courier');

    expect(enemyBuildings.some((building) => building.buildingTypeId === 'barracks')).toBe(true);
    expect(enemyWorkers.length).toBeGreaterThanOrEqual(3);
    expect(enemyUnits.length).toBeGreaterThan(initialUnitCount);
  });
});
