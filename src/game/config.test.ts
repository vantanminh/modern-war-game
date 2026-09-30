import { describe, expect, it } from 'vitest';

import { defaultGameConfig, getPlayerSlot } from './config';

describe('config content', () => {
  it('defines a footprint and colour for every building so the renderer can draw it', () => {
    Object.values(defaultGameConfig.buildings).forEach((building) => {
      expect(building.footprint.width).toBeGreaterThan(0);
      expect(building.footprint.height).toBeGreaterThan(0);
      expect(typeof building.color).toBe('number');
    });
  });

  it('assigns a stable team slot per spawn', () => {
    defaultGameConfig.map.spawns.forEach((spawn, index) => {
      expect(getPlayerSlot(defaultGameConfig, spawn.playerId)).toBe(index);
    });
    expect(getPlayerSlot(defaultGameConfig, 'unknown-player')).toBe(0);
  });
});
