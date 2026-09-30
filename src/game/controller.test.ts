import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import { BattleSession } from './controller';

describe('controller', () => {
  it('exposes selected unit target and cooldown details in the HUD model', () => {
    const session = new BattleSession(defaultGameConfig);
    const playerUnit = Object.values(session.state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'vanguard',
    );
    const enemyHQ = Object.values(session.state.sim.buildings).find(
      (building) => building.ownerId === 'enemy' && building.buildingTypeId === 'command-core',
    );

    if (!playerUnit || !enemyHQ) {
      throw new Error('Expected default battle setup');
    }

    playerUnit.cooldownRemaining = 4;
    playerUnit.order = {
      kind: 'attack-target',
      targetId: enemyHQ.id,
      target: { x: enemyHQ.tileX, y: enemyHQ.tileY },
      path: [],
    };

    session.setSelection([playerUnit.id]);
    const model = session.getHudModel();

    expect(model.selectionTarget).toContain('Command Core');
    expect(model.selectionCombatDetail).toContain('Reload 4');
    expect(model.selectionCombatDetail).toContain('Range');
  });

  it('exposes income per second in the HUD model', () => {
    const session = new BattleSession(defaultGameConfig);

    session.state.sim.players.player.incomePerSecond = 42;

    const model = session.getHudModel();

    expect(model.incomePerSecond).toBe(42);
  });

  it('exposes projected income, pending payout, and active workers in the HUD model', () => {
    const session = new BattleSession(defaultGameConfig);
    const playerCourier = Object.values(session.state.sim.units).find(
      (unit) => unit.ownerId === 'player' && unit.unitTypeId === 'courier',
    );
    const playerRefinery = Object.values(session.state.sim.buildings).find(
      (building) => building.ownerId === 'player' && building.buildingTypeId === 'refinery',
    );
    const oreField = Object.values(session.state.sim.resources)[0];

    if (!playerCourier || !playerRefinery || !oreField) {
      throw new Error('Expected default economy setup');
    }

    playerCourier.order = {
      kind: 'harvest',
      path: [],
      resourceId: oreField.id,
      refineryId: playerRefinery.id,
    };
    playerCourier.x = oreField.x;
    playerCourier.y = oreField.y;
    session.state.sim.players.player.pendingIncome = 24;

    const model = session.getHudModel();

    expect(model.pendingIncome).toBe(24);
    expect(model.activeWorkers).toBeGreaterThan(0);
    expect(model.projectedIncomePerSecond).toBeGreaterThan(0);
  });

  it('exposes battlefield summary and blocked placement feedback in the HUD model', () => {
    const session = new BattleSession(defaultGameConfig);

    session.startBuildPlacement('barracks', { x: -1, y: 0 });

    const model = session.getHudModel();

    expect(model.mapName).toBe(defaultGameConfig.map.name);
    expect(model.mapSizeLabel).toBe(`${defaultGameConfig.map.width} x ${defaultGameConfig.map.height}`);
    expect(model.activeResourceNodes).toBe(defaultGameConfig.map.resourceNodes.length);
    expect(model.modeLabel).toContain('Barracks');
    expect(model.modeHint).toContain('Blocked');
    expect(model.modeHint).toContain('Outside battlefield bounds.');
  });

  it('clears the current selection when cancel is pressed in normal mode', () => {
    const session = new BattleSession(defaultGameConfig);
    const playerUnit = Object.values(session.state.sim.units).find((unit) => unit.ownerId === 'player');

    if (!playerUnit) {
      throw new Error('Expected default battle setup');
    }

    session.setSelection([playerUnit.id]);
    session.cancelModes();

    expect(session.getHudModel().selectionTitle).toBe('No selection');
  });
});