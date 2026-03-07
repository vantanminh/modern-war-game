import type { GameConfig, GridPoint, RectangleArea, SimulationState } from './types';

export interface ReachablePathResult {
  point: GridPoint;
  path: GridPoint[];
}

interface NeighborOffset {
  dx: number;
  dy: number;
  cost: number;
}

const CARDINAL_COST = 1;
const DIAGONAL_COST = Math.SQRT2;
const NEIGHBOR_OFFSETS: NeighborOffset[] = [
  { dx: 1, dy: 0, cost: CARDINAL_COST },
  { dx: -1, dy: 0, cost: CARDINAL_COST },
  { dx: 0, dy: 1, cost: CARDINAL_COST },
  { dx: 0, dy: -1, cost: CARDINAL_COST },
  { dx: 1, dy: 1, cost: DIAGONAL_COST },
  { dx: 1, dy: -1, cost: DIAGONAL_COST },
  { dx: -1, dy: 1, cost: DIAGONAL_COST },
  { dx: -1, dy: -1, cost: DIAGONAL_COST },
];

const terrainBlockedCache = new WeakMap<GameConfig, Set<string>>();
const obstacleSetCache = new WeakMap<GameConfig, Set<string>>();

function key(point: GridPoint) {
  return `${point.x},${point.y}`;
}

function getTerrainBlockedSet(config: GameConfig) {
  const cached = terrainBlockedCache.get(config);
  if (cached) {
    return cached;
  }

  const terrainBlocked = new Set<string>(config.map.terrainBlocked.map((point) => key(point)));
  terrainBlockedCache.set(config, terrainBlocked);
  return terrainBlocked;
}

function getObstacleSet(config: GameConfig, obstacleAreas: RectangleArea[]) {
  const cached = obstacleSetCache.get(config);
  if (cached) {
    return cached;
  }

  const obstacleSet = new Set<string>();
  obstacleAreas.forEach((area) => {
    for (let y = area.y; y < area.y + area.height; y += 1) {
      for (let x = area.x; x < area.x + area.width; x += 1) {
        obstacleSet.add(toTileKey(x, y));
      }
    }
  });

  obstacleSetCache.set(config, obstacleSet);
  return obstacleSet;
}

function popLowestScore(open: GridPoint[], score: Map<string, number>) {
  let lowestIndex = 0;
  let lowestScore = score.get(key(open[0])) ?? Infinity;

  for (let index = 1; index < open.length; index += 1) {
    const currentScore = score.get(key(open[index])) ?? Infinity;
    if (currentScore < lowestScore) {
      lowestScore = currentScore;
      lowestIndex = index;
    }
  }

  const [point] = open.splice(lowestIndex, 1);
  return point;
}

export function toTileKey(x: number, y: number) {
  return `${x},${y}`;
}

export function inBounds(config: GameConfig, point: GridPoint) {
  return point.x >= 0 && point.y >= 0 && point.x < config.map.width && point.y < config.map.height;
}

export function createBlockedSet(config: GameConfig, sim: SimulationState, ignoredBuildingId?: string) {
  const blocked = new Set<string>(getTerrainBlockedSet(config));

  Object.values(sim.buildings).forEach((building) => {
    if (building.id === ignoredBuildingId) {
      return;
    }

    const footprint = config.buildings[building.buildingTypeId].footprint;
    for (let y = 0; y < footprint.height; y += 1) {
      for (let x = 0; x < footprint.width; x += 1) {
        blocked.add(toTileKey(building.tileX + x, building.tileY + y));
      }
    }
  });

  return blocked;
}

function heuristic(a: GridPoint, b: GridPoint) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diagonalSteps = Math.min(dx, dy);
  const cardinalSteps = Math.max(dx, dy) - diagonalSteps;
  return diagonalSteps * DIAGONAL_COST + cardinalSteps * CARDINAL_COST;
}

function tileCenterDistance(point: GridPoint, target: { x: number; y: number }) {
  return Math.hypot(point.x + 0.5 - target.x, point.y + 0.5 - target.y);
}

function reconstruct(cameFrom: Map<string, GridPoint>, current: GridPoint) {
  const path: GridPoint[] = [current];
  let cursor = current;

  while (cameFrom.has(key(cursor))) {
    cursor = cameFrom.get(key(cursor))!;
    path.push(cursor);
  }

  path.reverse();
  return path.slice(1);
}

function isBlockedOrOutOfBounds(config: GameConfig, blocked: Set<string>, point: GridPoint) {
  return !inBounds(config, point) || blocked.has(key(point));
}

function canTraverseStep(
  config: GameConfig,
  blocked: Set<string>,
  from: GridPoint,
  to: GridPoint,
) {
  if (isBlockedOrOutOfBounds(config, blocked, to)) {
    return false;
  }

  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const isDiagonal = Math.abs(deltaX) === 1 && Math.abs(deltaY) === 1;

  if (!isDiagonal) {
    return true;
  }

  // Prevent clipping through tight corners when navigating around walls/buildings.
  const sideA = { x: from.x + deltaX, y: from.y };
  const sideB = { x: from.x, y: from.y + deltaY };
  return !isBlockedOrOutOfBounds(config, blocked, sideA) && !isBlockedOrOutOfBounds(config, blocked, sideB);
}

function hasLineOfSight(
  config: GameConfig,
  blocked: Set<string>,
  from: GridPoint,
  to: GridPoint,
) {
  if (from.x === to.x && from.y === to.y) {
    return true;
  }

  let current = from;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY));

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    const next = {
      x: Math.round(from.x + deltaX * ratio),
      y: Math.round(from.y + deltaY * ratio),
    };

    if (next.x === current.x && next.y === current.y) {
      continue;
    }

    if (!canTraverseStep(config, blocked, current, next)) {
      return false;
    }

    current = next;
  }

  return true;
}

export function smoothPath(
  config: GameConfig,
  blocked: Set<string>,
  from: GridPoint,
  path: GridPoint[],
) {
  if (path.length <= 1) {
    return path;
  }

  const smoothed: GridPoint[] = [];
  let anchor = from;
  let index = 0;

  while (index < path.length) {
    let furthest = index;

    for (let cursor = index; cursor < path.length; cursor += 1) {
      if (!hasLineOfSight(config, blocked, anchor, path[cursor])) {
        break;
      }
      furthest = cursor;
    }

    smoothed.push(path[furthest]);
    anchor = path[furthest];
    index = furthest + 1;
  }

  return smoothed;
}

export function findPath(
  config: GameConfig,
  blocked: Set<string>,
  from: GridPoint,
  to: GridPoint,
) {
  if (!inBounds(config, from) || !inBounds(config, to)) {
    return [] as GridPoint[];
  }

  if (from.x === to.x && from.y === to.y) {
    return [] as GridPoint[];
  }

  const open = [from];
  const openKeys = new Set<string>([key(from)]);
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>([[key(from), 0]]);
  const fScore = new Map<string, number>([[key(from), heuristic(from, to)]]);
  const closed = new Set<string>();

  while (open.length > 0) {
    const current = popLowestScore(open, fScore);
    const currentKey = key(current);
    openKeys.delete(currentKey);

    if (current.x === to.x && current.y === to.y) {
      return reconstruct(cameFrom, current);
    }

    closed.add(currentKey);

    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = { x: current.x + offset.dx, y: current.y + offset.dy };
      const neighborKey = key(neighbor);

      if (closed.has(neighborKey) || !canTraverseStep(config, blocked, current, neighbor)) {
        continue;
      }

      const tentative = (gScore.get(currentKey) ?? Infinity) + offset.cost;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) {
        continue;
      }

      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + heuristic(neighbor, to));

      if (!openKeys.has(neighborKey)) {
        open.push(neighbor);
        openKeys.add(neighborKey);
      }
    }
  }

  return [] as GridPoint[];
}

export function nearestReachablePoint(
  config: GameConfig,
  blocked: Set<string>,
  target: GridPoint,
  maxRadius = 6,
) {
  if (inBounds(config, target) && !blocked.has(key(target))) {
    return target;
  }

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let y = target.y - radius; y <= target.y + radius; y += 1) {
      for (let x = target.x - radius; x <= target.x + radius; x += 1) {
        const candidate = { x, y };
        if (!inBounds(config, candidate) || blocked.has(key(candidate))) {
          continue;
        }
        return candidate;
      }
    }
  }

  return null;
}

export function findBestReachablePath(
  config: GameConfig,
  blocked: Set<string>,
  from: GridPoint,
  target: GridPoint,
  _searchRadius = 10,
  maxDistanceFromTarget = Number.POSITIVE_INFINITY,
): ReachablePathResult | null {
  if (!inBounds(config, from)) {
    return null;
  }

  const open = [from];
  const openKeys = new Set<string>([key(from)]);
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>([[key(from), 0]]);
  const fScore = new Map<string, number>([[key(from), tileCenterDistance(from, target)]]);

  let bestPoint = from;
  let bestPathLength = Infinity;
  let bestTargetDistance = tileCenterDistance(from, target);

  if (Number.isFinite(maxDistanceFromTarget) && bestTargetDistance <= maxDistanceFromTarget) {
    return {
      point: from,
      path: [],
    };
  }

  while (open.length > 0) {
    const current = popLowestScore(open, fScore);
    const currentKey = key(current);
    openKeys.delete(currentKey);
    const currentPathLength = gScore.get(currentKey) ?? Infinity;
    const currentTargetDistance = tileCenterDistance(current, target);

    if (
      currentTargetDistance < bestTargetDistance ||
      (currentTargetDistance === bestTargetDistance && currentPathLength < bestPathLength)
    ) {
      bestPoint = current;
      bestPathLength = currentPathLength;
      bestTargetDistance = currentTargetDistance;
    }

    if (
      Number.isFinite(maxDistanceFromTarget) &&
      currentTargetDistance <= maxDistanceFromTarget
    ) {
      return {
        point: current,
        path: reconstruct(cameFrom, current),
      };
    }

    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = { x: current.x + offset.dx, y: current.y + offset.dy };
      const neighborKey = key(neighbor);

      if (!canTraverseStep(config, blocked, current, neighbor)) {
        continue;
      }

      const tentative = currentPathLength + offset.cost;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) {
        continue;
      }

      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + tileCenterDistance(neighbor, target));

      if (!openKeys.has(neighborKey)) {
        open.push(neighbor);
        openKeys.add(neighborKey);
      }
    }
  }

  return {
    point: bestPoint,
    path: reconstruct(cameFrom, bestPoint),
  };
}

export function findBuildSite(
  config: GameConfig,
  blocked: Set<string>,
  obstacleAreas: RectangleArea[],
  footprint: { width: number; height: number },
  anchor: GridPoint,
  maxRadius = 10,
) {
  const obstacleSet = getObstacleSet(config, obstacleAreas);

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let y = anchor.y - radius; y <= anchor.y + radius; y += 1) {
      for (let x = anchor.x - radius; x <= anchor.x + radius; x += 1) {
        let valid = true;

        for (let fy = 0; fy < footprint.height; fy += 1) {
          for (let fx = 0; fx < footprint.width; fx += 1) {
            const point = { x: x + fx, y: y + fy };
            if (!inBounds(config, point) || blocked.has(key(point)) || obstacleSet.has(key(point))) {
              valid = false;
            }
          }
        }

        if (valid) {
          return { x, y };
        }
      }
    }
  }

  return null;
}
