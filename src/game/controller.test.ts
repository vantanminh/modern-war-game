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
});