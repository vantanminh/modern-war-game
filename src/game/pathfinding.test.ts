import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import { findBestReachablePath, findPath } from './pathfinding';

describe('pathfinding', () => {
  it('routes through the only choke point', () => {
    const config = {
      ...defaultGameConfig,
      map: {
        ...defaultGameConfig.map,
        width: 7,
        height: 7,
        terrainBlocked: [
          { x: 3, y: 0 },
          { x: 3, y: 1 },
          { x: 3, y: 2 },
          { x: 3, y: 4 },
          { x: 3, y: 5 },
          { x: 3, y: 6 },
        ],
        obstacleAreas: [],
      },
    };
    const blocked = new Set(config.map.terrainBlocked.map((point) => `${point.x},${point.y}`));

    const path = findPath(config, blocked, { x: 1, y: 3 }, { x: 5, y: 3 });

    expect(path.length).toBeGreaterThan(0);
    expect(path).toContainEqual({ x: 3, y: 3 });
  });

  it('returns no route when destination is sealed', () => {
    const config = {
      ...defaultGameConfig,
      map: {
        ...defaultGameConfig.map,
        width: 5,
        height: 5,
        terrainBlocked: [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 1, y: 3 },
          { x: 1, y: 4 },
        ],
        obstacleAreas: [],
      },
    };
    const blocked = new Set(config.map.terrainBlocked.map((point) => `${point.x},${point.y}`));

    expect(findPath(config, blocked, { x: 0, y: 2 }, { x: 4, y: 2 })).toHaveLength(0);
  });

  it('chooses a reachable attack position instead of the first open dead-end tile', () => {
    const config = {
      ...defaultGameConfig,
      map: {
        ...defaultGameConfig.map,
        width: 14,
        height: 8,
        terrainBlocked: [
          { x: 12, y: 3 },
          { x: 11, y: 2 },
          { x: 11, y: 4 },
        ],
        obstacleAreas: [],
      },
    };
    const blocked = new Set(config.map.terrainBlocked.map((point) => `${point.x},${point.y}`));

    // Simulate a 3x3 HQ footprint at x:8-10, y:2-4 with an unreachable pocket at 11,3.
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 8; x <= 10; x += 1) {
        blocked.add(`${x},${y}`);
      }
    }

    const plan = findBestReachablePath(config, blocked, { x: 2, y: 3 }, { x: 10, y: 4 }, 10, 3.2);

    expect(plan).not.toBeNull();
    expect(plan?.point).not.toEqual({ x: 11, y: 3 });
    expect(Math.hypot((plan?.point.x ?? 0) - 10, (plan?.point.y ?? 0) - 4)).toBeLessThanOrEqual(3.2);
    expect(plan?.path.length).toBeGreaterThan(0);
  });

  it('does not cut diagonally through blocked corners', () => {
    const config = {
      ...defaultGameConfig,
      map: {
        ...defaultGameConfig.map,
        width: 5,
        height: 5,
        terrainBlocked: [
          { x: 1, y: 2 },
          { x: 2, y: 1 },
        ],
        obstacleAreas: [],
      },
    };
    const blocked = new Set(config.map.terrainBlocked.map((point) => `${point.x},${point.y}`));

    const path = findPath(config, blocked, { x: 1, y: 1 }, { x: 3, y: 3 });

    expect(path).not.toContainEqual({ x: 2, y: 2 });
    expect(path.length).toBeGreaterThan(3);
  });
});
