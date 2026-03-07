import { describe, expect, it } from 'vitest';

import { defaultGameConfig } from './config';
import { findPath } from './pathfinding';

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
});
