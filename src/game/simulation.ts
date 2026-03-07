import {
  canPlayerBuild,
  canPlayerProduce,
  defaultGameConfig,
  getBuildingConfig,
  getPlayerBuildings,
  getPlayerUnits,
  getUnitConfig,
} from './config';
import {
  createBlockedSet,
  findBestReachablePath,
  findBuildSite,
  findPath,
  nearestReachablePoint,
  smoothPath,
  toTileKey,
} from './pathfinding';
import type {
  AttackCommand,
  BuildCommand,
  BuildingState,
  Command,
  GameConfig,
  GameState,
  GridPoint,
  MoveCommand,
  PlayerId,
  ProduceCommand,
  ResourceNodeState,
  SelectionSummary,
  SimulationState,
  UnitConfig,
  UnitState,
} from './types';

let idCounter = 0;

function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

interface TargetBuckets {
  units: UnitState[];
  buildings: BuildingState[];
}

interface SimulationTickCache {
  tick: number;
  blockedSet?: Set<string>;
  ignoredBlockedSets: Map<string, Set<string>>;
  targetsByOwner?: Record<PlayerId, TargetBuckets>;
}

interface UnitNavigationState {
  lastX: number;
  lastY: number;
  stuckTicks: number;
  lastWaypointKey: string | null;
}

const simulationTickCaches = new WeakMap<SimulationState, SimulationTickCache>();
const resourceTileCaches = new WeakMap<GameConfig, Set<string>>();
const unitNavigationStates = new WeakMap<SimulationState, Map<string, UnitNavigationState>>();

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getSimulationTickCache(sim: SimulationState) {
  const cached = simulationTickCaches.get(sim);
  if (cached && cached.tick === sim.tick) {
    return cached;
  }

  const nextCache: SimulationTickCache = {
    tick: sim.tick,
    ignoredBlockedSets: new Map<string, Set<string>>(),
  };
  simulationTickCaches.set(sim, nextCache);
  return nextCache;
}

function getUnitNavigationState(sim: SimulationState, unit: UnitState) {
  let states = unitNavigationStates.get(sim);
  if (!states) {
    states = new Map<string, UnitNavigationState>();
    unitNavigationStates.set(sim, states);
  }

  let nav = states.get(unit.id);
  if (!nav) {
    nav = {
      lastX: unit.x,
      lastY: unit.y,
      stuckTicks: 0,
      lastWaypointKey: unit.order.path[0]
        ? toTileKey(unit.order.path[0].x, unit.order.path[0].y)
        : null,
    };
    states.set(unit.id, nav);
  }

  return nav;
}

function pruneUnitNavigationState(sim: SimulationState) {
  const states = unitNavigationStates.get(sim);
  if (!states) {
    return;
  }

  for (const unitId of states.keys()) {
    if (!sim.units[unitId]) {
      states.delete(unitId);
    }
  }
}

function invalidateBlockedSetCache(sim: SimulationState) {
  const cache = simulationTickCaches.get(sim);
  if (!cache) {
    return;
  }

  cache.blockedSet = undefined;
  cache.ignoredBlockedSets.clear();
}

function invalidateTargetCache(sim: SimulationState) {
  const cache = simulationTickCaches.get(sim);
  if (cache) {
    cache.targetsByOwner = undefined;
  }
}

function getBlockedSetForTick(
  config: GameConfig,
  sim: SimulationState,
  ignoredBuildingId?: string,
) {
  const cache = getSimulationTickCache(sim);

  if (!ignoredBuildingId) {
    if (!cache.blockedSet) {
      cache.blockedSet = createBlockedSet(config, sim);
    }

    return cache.blockedSet;
  }

  const cached = cache.ignoredBlockedSets.get(ignoredBuildingId);
  if (cached) {
    return cached;
  }

  const blocked = createBlockedSet(config, sim, ignoredBuildingId);
  cache.ignoredBlockedSets.set(ignoredBuildingId, blocked);
  return blocked;
}

function getResourceTileSet(config: GameConfig) {
  const cached = resourceTileCaches.get(config);
  if (cached) {
    return cached;
  }

  const tiles = new Set<string>(
    config.map.resourceNodes.map((resource) => toTileKey(Math.round(resource.x), Math.round(resource.y))),
  );
  resourceTileCaches.set(config, tiles);
  return tiles;
}

function getTargetsByOwner(sim: SimulationState, ownerId: PlayerId) {
  const cache = getSimulationTickCache(sim);
  if (!cache.targetsByOwner) {
    cache.targetsByOwner = {
      player: { units: [], buildings: [] },
      enemy: { units: [], buildings: [] },
    };

    Object.values(sim.units).forEach((unit) => {
      cache.targetsByOwner![unit.ownerId].units.push(unit);
    });

    Object.values(sim.buildings).forEach((building) => {
      cache.targetsByOwner![building.ownerId].buildings.push(building);
    });
  }

  return cache.targetsByOwner[ownerId === 'player' ? 'enemy' : 'player'];
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function centerOfBuilding(building: BuildingState, config: GameConfig) {
  const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);

  return {
    x: building.tileX + buildingConfig.footprint.width / 2,
    y: building.tileY + buildingConfig.footprint.height / 2,
  };
}

function initialUnitOrder() {
  return {
    kind: 'idle' as const,
    path: [] as GridPoint[],
  };
}

function createUnit(
  ownerId: PlayerId,
  factionId: UnitState['factionId'],
  unitTypeId: string,
  x: number,
  y: number,
  config: GameConfig,
): UnitState {
  const unitConfig = getUnitConfig(config, factionId, unitTypeId);

  return {
    id: nextId('unit'),
    ownerId,
    factionId,
    unitTypeId,
    x,
    y,
    hp: unitConfig.maxHp,
    cooldownRemaining: 0,
    cargo: 0,
    order: initialUnitOrder(),
  };
}

function createBuilding(
  ownerId: PlayerId,
  factionId: BuildingState['factionId'],
  buildingTypeId: string,
  tileX: number,
  tileY: number,
  config: GameConfig,
  constructionRemaining = 0,
): BuildingState {
  const buildingConfig = getBuildingConfig(config, factionId, buildingTypeId);
  const hpRatio = constructionRemaining > 0 ? 0.35 : 1;

  return {
    id: nextId('building'),
    ownerId,
    factionId,
    buildingTypeId,
    tileX,
    tileY,
    hp: Math.round(buildingConfig.maxHp * hpRatio),
    queue: [],
    rallyPoint: {
      x: tileX + buildingConfig.footprint.width + 1,
      y: tileY + Math.floor(buildingConfig.footprint.height / 2),
    },
    cooldownRemaining: 0,
    constructionRemaining,
  };
}

function findNearestResource(
  sim: SimulationState,
  position: { x: number; y: number },
): ResourceNodeState | null {
  let best: ResourceNodeState | null = null;
  let bestDistance = Infinity;

  Object.values(sim.resources).forEach((resource) => {
    if (resource.amount <= 0) {
      return;
    }

    const currentDistance = distance(position, resource);
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      best = resource;
    }
  });

  return best;
}

function findNearestRefinery(
  sim: SimulationState,
  config: GameConfig,
  ownerId: PlayerId,
  position: { x: number; y: number },
): BuildingState | null {
  let best: BuildingState | null = null;
  let bestDistance = Infinity;

  getPlayerBuildings(sim.buildings, ownerId).forEach((building) => {
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    if (!buildingConfig.isRefinery || building.constructionRemaining > 0) {
      return;
    }

    const currentDistance = distance(position, centerOfBuilding(building, config));
    if (currentDistance < bestDistance) {
      bestDistance = currentDistance;
      best = building;
    }
  });

  return best;
}

function assignHarvestOrder(unit: UnitState, sim: SimulationState, config: GameConfig) {
  const resource = findNearestResource(sim, unit);
  const refinery = findNearestRefinery(sim, config, unit.ownerId, unit);

  if (!resource || !refinery) {
    unit.order = initialUnitOrder();
    return;
  }

  unit.order = {
    kind: 'harvest',
    path: [],
    resourceId: resource.id,
    refineryId: refinery.id,
  };
}

function getEntityPosition(
  sim: SimulationState,
  config: GameConfig,
  entityId: string,
) {
  const unit = sim.units[entityId];
  if (unit) {
    return { x: unit.x, y: unit.y };
  }

  const building = sim.buildings[entityId];
  if (building) {
    return centerOfBuilding(building, config);
  }

  return null;
}

function getEntityOwner(sim: SimulationState, entityId: string) {
  if (sim.units[entityId]) {
    return sim.units[entityId].ownerId;
  }
  if (sim.buildings[entityId]) {
    return sim.buildings[entityId].ownerId;
  }
  return null;
}

function getEntityArmor(sim: SimulationState, config: GameConfig, entityId: string) {
  if (sim.units[entityId]) {
    return getUnitConfig(config, sim.units[entityId].factionId, sim.units[entityId].unitTypeId).armorType;
  }
  if (sim.buildings[entityId]) {
    return getBuildingConfig(config, sim.buildings[entityId].factionId, sim.buildings[entityId].buildingTypeId).armorType;
  }
  return 'structure';
}

function applyDamage(
  sim: SimulationState,
  config: GameConfig,
  attackerConfig: UnitConfig | ReturnType<typeof getBuildingConfig>,
  targetId: string,
) {
  const armorType = getEntityArmor(sim, config, targetId);
  const bias = 'attackBias' in attackerConfig ? attackerConfig.attackBias?.[armorType] ?? 1 : 1;
  const baseDamage =
    'damage' in attackerConfig ? attackerConfig.damage : attackerConfig.attackDamage ?? 0;
  const damage = Math.max(1, Math.round(baseDamage * bias));

  if (sim.units[targetId]) {
    sim.units[targetId].hp -= damage;
  } else if (sim.buildings[targetId]) {
    sim.buildings[targetId].hp -= damage;
  }
}

function cleanupDestroyed(sim: SimulationState) {
  let removedUnits = false;
  let removedBuildings = false;

  Object.values(sim.units).forEach((unit) => {
    if (unit.hp <= 0) {
      delete sim.units[unit.id];
      removedUnits = true;
    }
  });

  Object.values(sim.buildings).forEach((building) => {
    if (building.hp <= 0) {
      delete sim.buildings[building.id];
      removedBuildings = true;
    }
  });

  if (removedUnits) {
    invalidateTargetCache(sim);
  }

  if (removedBuildings) {
    invalidateBlockedSetCache(sim);
    invalidateTargetCache(sim);
  }
}

function checkLossCondition(sim: SimulationState, config: GameConfig) {
  (Object.keys(sim.players) as PlayerId[]).forEach((playerId) => {
    const playerBuildings = getPlayerBuildings(sim.buildings, playerId);
    const hasHQ = playerBuildings.some((building) =>
      getBuildingConfig(config, building.factionId, building.buildingTypeId).isHQ,
    );
    const hasProduction = playerBuildings.some((building) => {
      const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
      return building.constructionRemaining === 0 && Boolean(buildingConfig.producesUnitIds?.length);
    });

    if (!hasHQ || (!hasProduction && getPlayerUnits(sim.units, playerId).length === 0)) {
      sim.players[playerId].defeated = true;
    }
  });

  if (sim.players.player.defeated && !sim.players.enemy.defeated) {
    sim.winnerId = 'enemy';
    sim.lossReason = 'Your command structure collapsed.';
  } else if (sim.players.enemy.defeated && !sim.players.player.defeated) {
    sim.winnerId = 'player';
    sim.lossReason = 'Enemy command structure neutralized.';
  }
}

function formationTargets(target: GridPoint, count: number) {
  const offsets: GridPoint[] = [];
  const columns = Math.ceil(Math.sqrt(count));

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    offsets.push({
      x: target.x + column - Math.floor(columns / 2),
      y: target.y + row - Math.floor(columns / 2),
    });
  }

  return offsets;
}

function roundedPoint(position: { x: number; y: number }): GridPoint {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
  };
}

function isPathWaypointBlocked(blocked: Set<string>, path: GridPoint[]) {
  const next = path[0];
  return Boolean(next && blocked.has(toTileKey(next.x, next.y)));
}

function getPathSearchRadius(config: GameConfig, preferredRadius: number) {
  return Math.max(8, preferredRadius, Math.ceil(Math.max(config.map.width, config.map.height) * 0.3));
}

function planPathToDestination(
  sim: SimulationState,
  config: GameConfig,
  unit: UnitState,
  destination: { x: number; y: number },
  maxDistanceFromTarget = Number.POSITIVE_INFINITY,
  preferredSearchRadius = 10,
) {
  const blocked = getBlockedSetForTick(config, sim);
  const origin = roundedPoint(unit);
  const result = findBestReachablePath(
    config,
    blocked,
    origin,
    destination,
    getPathSearchRadius(config, preferredSearchRadius),
    maxDistanceFromTarget,
  );

  const shouldCenterOnCurrentTile =
    Number.isFinite(maxDistanceFromTarget) &&
    result &&
    result.path.length === 0 &&
    result.point.x === origin.x &&
    result.point.y === origin.y &&
    Math.hypot(unit.x - destination.x, unit.y - destination.y) > maxDistanceFromTarget;

  const path = shouldCenterOnCurrentTile ? [origin] : result?.path ?? [];

  return {
    blocked,
    destination: result?.point ?? destination,
    path: smoothPath(config, blocked, origin, path),
  };
}

function shouldRefreshOrderPath(
  sim: SimulationState,
  config: GameConfig,
  entityId: string,
  path: GridPoint[],
  blocked: Set<string>,
  allowPeriodicRefresh = true,
) {
  if (path.length === 0) {
    return true;
  }

  if (isPathWaypointBlocked(blocked, path)) {
    return true;
  }

  if (!allowPeriodicRefresh || config.ai.pathRepathInterval <= 0) {
    return false;
  }

  return (sim.tick + hashString(entityId)) % config.ai.pathRepathInterval === 0;
}

function applyMoveCommand(sim: SimulationState, config: GameConfig, command: MoveCommand) {
  const targets = formationTargets(command.target, command.unitIds.length);

  command.unitIds.forEach((unitId, index) => {
    const unit = sim.units[unitId];
    if (!unit || unit.ownerId !== command.playerId) {
      return;
    }

    const plan = planPathToDestination(
      sim,
      config,
      unit,
      targets[index] ?? command.target,
      Number.POSITIVE_INFINITY,
      12,
    );

    unit.order = {
      kind: 'move',
      target: plan.destination,
      path: plan.path,
    };
  });
}

function applyAttackCommand(sim: SimulationState, config: GameConfig, command: AttackCommand) {
  const targets = formationTargets(command.target, command.unitIds.length);

  command.unitIds.forEach((unitId, index) => {
    const unit = sim.units[unitId];
    if (!unit || unit.ownerId !== command.playerId) {
      return;
    }

    if (command.targetId) {
      const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
      const targetPosition = getEntityPosition(sim, config, command.targetId) ?? command.target;
      const plan = planPathToDestination(
        sim,
        config,
        unit,
        targetPosition,
        unitConfig.range,
        Math.max(10, Math.ceil(unitConfig.range) + 8),
      );

      unit.order = {
        kind: 'attack-target',
        targetId: command.targetId,
        target: targetPosition,
        path: plan.path,
      };
      return;
    }

    const plan = planPathToDestination(
      sim,
      config,
      unit,
      targets[index] ?? command.target,
      Number.POSITIVE_INFINITY,
      12,
    );
    unit.order = {
      kind: 'attack-move',
      target: plan.destination,
      path: plan.path,
    };
  });
}

export function isBuildPlacementValid(
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  buildingTypeId: string,
  tileX: number,
  tileY: number,
) {
  return getBuildPlacementStatus(state, config, playerId, buildingTypeId, tileX, tileY).valid;
}

export function getBuildPlacementStatus(
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  buildingTypeId: string,
  tileX: number,
  tileY: number,
) {
  const player = state.sim.players[playerId];
  const buildingConfig = getBuildingConfig(config, player.factionId, buildingTypeId);

  if (!canPlayerBuild(config, playerId, player.factionId, state.sim.buildings, buildingTypeId)) {
    return {
      valid: false,
      reason: 'Tech requirements not met.',
    };
  }

  if (player.resources < buildingConfig.cost) {
    return {
      valid: false,
      reason: `Need ${buildingConfig.cost - player.resources} more credits.`,
    };
  }

  const blocked = getBlockedSetForTick(config, state.sim);
  const resourceTiles = getResourceTileSet(config);

  for (let y = 0; y < buildingConfig.footprint.height; y += 1) {
    for (let x = 0; x < buildingConfig.footprint.width; x += 1) {
      const footprintX = tileX + x;
      const footprintY = tileY + y;
      const pointKey = toTileKey(footprintX, footprintY);
      if (footprintX < 0 || footprintY < 0 || footprintX >= config.map.width || footprintY >= config.map.height) {
        return {
          valid: false,
          reason: 'Outside battlefield bounds.',
        };
      }

      if (blocked.has(pointKey)) {
        return {
          valid: false,
          reason: 'Blocked by terrain or existing structure.',
        };
      }

      if (resourceTiles.has(pointKey)) {
        return {
          valid: false,
          reason: 'Resource deposits must stay clear.',
        };
      }
    }
  }

  return {
    valid: true,
    reason: 'Left click to confirm placement.',
  };
}

function applyBuildCommand(state: GameState, config: GameConfig, command: BuildCommand) {
  if (
    !isBuildPlacementValid(state, config, command.playerId, command.buildingTypeId, command.tileX, command.tileY)
  ) {
    return;
  }

  const player = state.sim.players[command.playerId];
  const buildingConfig = getBuildingConfig(config, player.factionId, command.buildingTypeId);
  player.resources -= buildingConfig.cost;

  const building = createBuilding(
    command.playerId,
    player.factionId,
    command.buildingTypeId,
    command.tileX,
    command.tileY,
    config,
    buildingConfig.buildTime,
  );

  state.sim.buildings[building.id] = building;
  invalidateBlockedSetCache(state.sim);
  invalidateTargetCache(state.sim);
}

function applyProduceCommand(state: GameState, config: GameConfig, command: ProduceCommand) {
  const building = state.sim.buildings[command.buildingId];
  if (!building || building.ownerId !== command.playerId || building.constructionRemaining > 0) {
    return;
  }

  const player = state.sim.players[command.playerId];
  if (!canPlayerProduce(config, player.factionId, building.buildingTypeId, command.unitTypeId)) {
    return;
  }

  const unitConfig = getUnitConfig(config, player.factionId, command.unitTypeId);
  if (player.resources < unitConfig.cost) {
    return;
  }

  player.resources -= unitConfig.cost;
  building.queue.push({
    unitTypeId: command.unitTypeId,
    remainingTicks: unitConfig.buildTime,
  });
}

function updateConstruction(sim: SimulationState, config: GameConfig) {
  Object.values(sim.buildings).forEach((building) => {
    if (building.constructionRemaining <= 0) {
      return;
    }

    building.constructionRemaining -= 1;
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    building.hp = clamp(
      Math.round(
        buildingConfig.maxHp * (1 - building.constructionRemaining / Math.max(1, buildingConfig.buildTime)),
      ),
      Math.round(buildingConfig.maxHp * 0.35),
      buildingConfig.maxHp,
    );
  });
}

function spawnUnitNearBuilding(
  sim: SimulationState,
  config: GameConfig,
  building: BuildingState,
  unitTypeId: string,
) {
  const blocked = getBlockedSetForTick(config, sim, building.id);
  const anchor = building.rallyPoint;
  const destination = findBuildSite(
    config,
    blocked,
    config.map.obstacleAreas,
    { width: 1, height: 1 },
    anchor,
    4,
  );

  if (!destination) {
    return false;
  }

  const unit = createUnit(
    building.ownerId,
    building.factionId,
    unitTypeId,
    destination.x + 0.5,
    destination.y + 0.5,
    config,
  );

  unit.order = {
    kind: 'move',
    target: anchor,
    path: findPath(
      config,
      blocked,
      { x: destination.x, y: destination.y },
      nearestReachablePoint(config, blocked, anchor) ?? destination,
    ),
  };

  sim.units[unit.id] = unit;
  return true;
}

function updateProduction(sim: SimulationState, config: GameConfig) {
  Object.values(sim.buildings).forEach((building) => {
    if (building.constructionRemaining > 0 || building.queue.length === 0) {
      return;
    }

    const first = building.queue[0];
    if (first.remainingTicks > 0) {
      first.remainingTicks -= 1;
      return;
    }

    if (spawnUnitNearBuilding(sim, config, building, first.unitTypeId)) {
      building.queue.shift();
    }
  });
}

interface EnemyTargetCandidate {
  id: string;
  distance: number;
  inAttackRange: boolean;
}

function findNearestEnemyTarget(
  sim: SimulationState,
  config: GameConfig,
  ownerId: PlayerId,
  position: { x: number; y: number },
  attackRange: number,
  detectionRange: number,
  canAttackBuildings: boolean,
): EnemyTargetCandidate | null {
  const targets = getTargetsByOwner(sim, ownerId);
  let best: EnemyTargetCandidate | null = null;
  let bestDistance = Infinity;

  targets.units.forEach((unit) => {
    const currentDistance = distance(position, unit);
    if (currentDistance <= detectionRange && currentDistance < bestDistance) {
      bestDistance = currentDistance;
      best = {
        id: unit.id,
        distance: currentDistance,
        inAttackRange: currentDistance <= attackRange,
      };
    }
  });

  if (best || !canAttackBuildings) {
    return best;
  }

  targets.buildings.forEach((building) => {
    const currentDistance = distance(position, centerOfBuilding(building, config));
    if (currentDistance <= detectionRange && currentDistance < bestDistance) {
      bestDistance = currentDistance;
      best = {
        id: building.id,
        distance: currentDistance,
        inAttackRange: currentDistance <= attackRange,
      };
    }
  });

  return best;
}

function moveUnitAlongPath(unit: UnitState, config: GameConfig) {
  if (unit.order.path.length === 0) {
    return false;
  }

  const stepDistance = getUnitConfig(config, unit.factionId, unit.unitTypeId).speed / config.tickRate;
  const nextPoint = unit.order.path[0];
  const targetX = nextPoint.x + 0.5;
  const targetY = nextPoint.y + 0.5;
  const dx = targetX - unit.x;
  const dy = targetY - unit.y;
  const remaining = Math.hypot(dx, dy);

  if (remaining <= stepDistance) {
    unit.x = targetX;
    unit.y = targetY;
    unit.order.path.shift();
    return true;
  }

  unit.x += (dx / remaining) * stepDistance;
  unit.y += (dy / remaining) * stepDistance;
  return true;
}

function trackNavigationProgress(sim: SimulationState, config: GameConfig, unit: UnitState) {
  const nav = getUnitNavigationState(sim, unit);
  const movedDistance = Math.hypot(unit.x - nav.lastX, unit.y - nav.lastY);
  const waypointKey = unit.order.path[0] ? toTileKey(unit.order.path[0].x, unit.order.path[0].y) : null;
  const movedEnough = movedDistance >= Math.max(0.035, 0.35 / config.tickRate);

  if (unit.order.path.length === 0) {
    nav.stuckTicks = 0;
  } else if (movedEnough || waypointKey !== nav.lastWaypointKey) {
    nav.stuckTicks = 0;
  } else {
    nav.stuckTicks += 1;
  }

  nav.lastX = unit.x;
  nav.lastY = unit.y;
  nav.lastWaypointKey = waypointKey;

  return nav.stuckTicks >= config.ai.pathStuckThreshold;
}

function getUnitDetectionRange(config: GameConfig, unitConfig: UnitConfig) {
  const proximity = Math.max(2.25, unitConfig.range * config.ai.proximityVisionBonus);
  return Math.max(unitConfig.range + 0.35, proximity);
}

function refreshUnitPathIfStuck(
  sim: SimulationState,
  config: GameConfig,
  unit: UnitState,
  maxDistanceFromTarget = Number.POSITIVE_INFINITY,
  preferredSearchRadius = 10,
) {
  if (!unit.order.target) {
    return;
  }

  const isStuck = trackNavigationProgress(sim, config, unit);
  if (!isStuck) {
    return;
  }

  const blocked = getBlockedSetForTick(config, sim);
  if (unit.order.path.length > 1 && !blocked.has(toTileKey(unit.order.path[1].x, unit.order.path[1].y))) {
    unit.order.path.shift();
    return;
  }

  retargetPath(sim, config, unit, unit.order.target, maxDistanceFromTarget, preferredSearchRadius);
}

function retargetPath(
  sim: SimulationState,
  config: GameConfig,
  unit: UnitState,
  destination: { x: number; y: number },
  maxDistanceFromTarget = Number.POSITIVE_INFINITY,
  preferredSearchRadius = 10,
) {
  const plan = planPathToDestination(
    sim,
    config,
    unit,
    destination,
    maxDistanceFromTarget,
    preferredSearchRadius,
  );
  unit.order.target = plan.destination;
  unit.order.path = plan.path;
}

function updateWorkerOrder(sim: SimulationState, config: GameConfig, unit: UnitState) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
  const refineryDropoffRange = 3.2;
  if (unitConfig.role !== 'worker') {
    return;
  }

  if (unit.order.kind === 'idle') {
    assignHarvestOrder(unit, sim, config);
  }

  if (unit.order.kind === 'harvest') {
    const resource = unit.order.resourceId ? sim.resources[unit.order.resourceId] : undefined;
    if (!resource || resource.amount <= 0) {
      assignHarvestOrder(unit, sim, config);
      return;
    }

    const resourcePoint = { x: Math.round(resource.x), y: Math.round(resource.y) };
    if (distance(unit, resource) > 0.8) {
      const blocked = getBlockedSetForTick(config, sim);
      if (shouldRefreshOrderPath(sim, config, unit.id, unit.order.path, blocked, true)) {
        retargetPath(sim, config, unit, resourcePoint);
      }
      if (moveUnitAlongPath(unit, config)) {
        refreshUnitPathIfStuck(sim, config, unit, Number.POSITIVE_INFINITY, 10);
      }
      return;
    }

    const gathered = unitConfig.harvestRate ?? 0;
    unit.cargo += gathered;
    if (unit.cargo >= (unitConfig.carryCapacity ?? 0)) {
      unit.order.kind = 'return';
      unit.order.path = [];
    }
  }

  if (unit.order.kind === 'return') {
    const refinery = unit.order.refineryId ? sim.buildings[unit.order.refineryId] : undefined;
    if (!refinery) {
      assignHarvestOrder(unit, sim, config);
      return;
    }

    const returnPoint = centerOfBuilding(refinery, config);
    if (distance(unit, returnPoint) > refineryDropoffRange) {
      const blocked = getBlockedSetForTick(config, sim);
      if (shouldRefreshOrderPath(sim, config, unit.id, unit.order.path, blocked, true)) {
        retargetPath(sim, config, unit, returnPoint, refineryDropoffRange, 10);
      }
      if (moveUnitAlongPath(unit, config)) {
        refreshUnitPathIfStuck(sim, config, unit, refineryDropoffRange, 10);
      }
      return;
    }

    sim.players[unit.ownerId].pendingIncome += unit.cargo;
    unit.cargo = 0;
    unit.order.kind = 'harvest';
    unit.order.path = [];
  }
}

function payoutIncome(sim: SimulationState, config: GameConfig) {
  if (sim.tick % config.tickRate !== 0) {
    return;
  }

  (Object.keys(sim.players) as PlayerId[]).forEach((playerId) => {
    const player = sim.players[playerId];
    player.incomePerSecond = player.pendingIncome;
    if (player.pendingIncome > 0) {
      player.resources += player.pendingIncome;
      player.pendingIncome = 0;
    }
  });
}

function updateUnitCombat(sim: SimulationState, config: GameConfig, unit: UnitState) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
  unit.cooldownRemaining = Math.max(0, unit.cooldownRemaining - 1);
  const detectionRange = getUnitDetectionRange(config, unitConfig);

  if (unit.order.kind === 'attack-target' && unit.order.targetId) {
    const targetPosition = getEntityPosition(sim, config, unit.order.targetId);
    if (!targetPosition || getEntityOwner(sim, unit.order.targetId) === unit.ownerId) {
      unit.order = initialUnitOrder();
      return;
    }

    if (distance(unit, targetPosition) <= unitConfig.range) {
      if (unit.cooldownRemaining === 0) {
        applyDamage(sim, config, unitConfig, unit.order.targetId);
        unit.cooldownRemaining = unitConfig.attackCooldown;
      }
      return;
    }

    const blocked = getBlockedSetForTick(config, sim);
    if (shouldRefreshOrderPath(sim, config, unit.id, unit.order.path, blocked)) {
      retargetPath(
        sim,
        config,
        unit,
        targetPosition,
        unitConfig.range,
        Math.max(10, Math.ceil(unitConfig.range) + 8),
      );
    }
    if (moveUnitAlongPath(unit, config)) {
      refreshUnitPathIfStuck(
        sim,
        config,
        unit,
        unitConfig.range,
        Math.max(10, Math.ceil(unitConfig.range) + 8),
      );
    }
    return;
  }

  const shouldScanForTargets =
    unit.cooldownRemaining === 0 ||
    unit.order.kind === 'attack-move' ||
    (sim.tick + hashString(unit.id)) % Math.max(2, config.ai.targetSearchInterval) === 0;

  const nearbyEnemy = shouldScanForTargets
    ? findNearestEnemyTarget(
        sim,
        config,
        unit.ownerId,
        unit,
        unitConfig.range,
        detectionRange,
        unitConfig.attackBuildings ?? true,
      )
    : null;

  if (nearbyEnemy && nearbyEnemy.inAttackRange && unit.cooldownRemaining === 0) {
    applyDamage(sim, config, unitConfig, nearbyEnemy.id);
    unit.cooldownRemaining = unitConfig.attackCooldown;
    return;
  }

  if (
    nearbyEnemy &&
    unit.order.kind !== 'attack-target' &&
    unit.order.kind !== 'harvest' &&
    unit.order.kind !== 'return'
  ) {
    const targetPosition = getEntityPosition(sim, config, nearbyEnemy.id);
    if (targetPosition) {
      unit.order = {
        kind: 'attack-target',
        targetId: nearbyEnemy.id,
        target: targetPosition,
        path: unit.order.path,
      };
      retargetPath(
        sim,
        config,
        unit,
        targetPosition,
        unitConfig.range,
        Math.max(10, Math.ceil(detectionRange) + 6),
      );
      if (moveUnitAlongPath(unit, config)) {
        refreshUnitPathIfStuck(
          sim,
          config,
          unit,
          unitConfig.range,
          Math.max(10, Math.ceil(detectionRange) + 6),
        );
      }
      return;
    }
  }

  if (unit.order.kind === 'move' || unit.order.kind === 'attack-move') {
    const blocked = getBlockedSetForTick(config, sim);
    if (unit.order.target && shouldRefreshOrderPath(sim, config, unit.id, unit.order.path, blocked)) {
      retargetPath(sim, config, unit, unit.order.target);
    }
    if (moveUnitAlongPath(unit, config)) {
      refreshUnitPathIfStuck(sim, config, unit);
    }
    if (unit.order.path.length === 0 && unit.order.kind === 'move') {
      unit.order = initialUnitOrder();
    }
    return;
  }

  trackNavigationProgress(sim, config, unit);
}

function updateBuildingCombat(sim: SimulationState, config: GameConfig, building: BuildingState) {
  const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
  if (
    building.constructionRemaining > 0 ||
    !buildingConfig.attackRange ||
    !buildingConfig.attackDamage ||
    !buildingConfig.attackCooldown
  ) {
    return;
  }

  building.cooldownRemaining = Math.max(0, building.cooldownRemaining - 1);
  if (building.cooldownRemaining > 0) {
    return;
  }

  const target = findNearestEnemyTarget(
    sim,
    config,
    building.ownerId,
    centerOfBuilding(building, config),
    buildingConfig.attackRange,
    buildingConfig.attackRange,
    true,
  );

  if (target) {
    applyDamage(sim, config, buildingConfig, target.id);
    building.cooldownRemaining = buildingConfig.attackCooldown;
  }
}

function findEnemyThreatsNearBase(
  sim: SimulationState,
  playerId: PlayerId,
  baseCenter: GridPoint,
  radius: number,
) {
  const enemyId = playerId === 'player' ? 'enemy' : 'player';
  return Object.values(sim.units).filter(
    (unit) => unit.ownerId === enemyId && distance(unit, baseCenter) <= radius,
  );
}

function aiBuildStructure(
  state: GameState,
  config: GameConfig,
  playerId: PlayerId,
  buildingTypeId: string,
  anchor: GridPoint,
  searchRadius: number,
) {
  if (!canPlayerBuild(config, playerId, state.sim.players[playerId].factionId, state.sim.buildings, buildingTypeId)) {
    return false;
  }
  const bConfig = getBuildingConfig(config, state.sim.players[playerId].factionId, buildingTypeId);
  if (state.sim.players[playerId].resources < bConfig.cost) {
    return false;
  }
  const placement = findBuildSite(
    config,
    getBlockedSetForTick(config, state.sim),
    config.map.obstacleAreas,
    bConfig.footprint,
    anchor,
    searchRadius,
  );
  if (placement) {
    applyBuildCommand(state, config, {
      type: 'build',
      playerId,
      buildingTypeId,
      tileX: placement.x,
      tileY: placement.y,
    });
    return true;
  }
  return false;
}

function runAiTurn(state: GameState, config: GameConfig, playerId: PlayerId) {
  const player = state.sim.players[playerId];
  if (player.defeated) {
    return;
  }

  const spawn = config.map.spawns.find((entry) => entry.playerId === playerId);
  if (!spawn) {
    return;
  }

  const enemyId: PlayerId = playerId === 'player' ? 'enemy' : 'player';
  const playerBuildings = getPlayerBuildings(state.sim.buildings, playerId);
  const playerUnits = getPlayerUnits(state.sim.units, playerId);
  const enemyUnits = getPlayerUnits(state.sim.units, enemyId);
  const workerCount = playerUnits.filter((u) => u.unitTypeId === 'courier').length;
  const combatUnits = playerUnits.filter((u) => u.unitTypeId !== 'courier');
  const readyCombatUnits = combatUnits.filter((u) => u.order.kind === 'idle' || u.order.kind === 'move');

  const hq = playerBuildings.find((b) => b.buildingTypeId === 'command-core');
  const baseCenter = hq ? centerOfBuilding(hq, config) : spawn.hq;

  const hasRefinery = playerBuildings.some(
    (b) => b.buildingTypeId === 'refinery' && b.constructionRemaining === 0,
  );
  const barracks = playerBuildings.find(
    (b) => b.buildingTypeId === 'barracks' && b.constructionRemaining === 0,
  );
  const motorPool = playerBuildings.find(
    (b) => b.buildingTypeId === 'motor-pool' && b.constructionRemaining === 0,
  );
  const sentryCount = playerBuildings.filter(
    (b) => b.buildingTypeId === 'sentry',
  ).length;

  // --- DEFENSE: detect threats near base and recall idle combat units ---
  const threats = findEnemyThreatsNearBase(state.sim, playerId, baseCenter, config.ai.defenseRadius);
  if (threats.length > 0) {
    const idleCombat = combatUnits.filter(
      (u) => u.order.kind === 'idle' || (u.order.kind === 'move' && distance(u, baseCenter) < config.ai.defenseRadius * 1.5),
    );
    if (idleCombat.length > 0) {
      const nearestThreat = threats.reduce((best, t) =>
        distance(t, baseCenter) < distance(best, baseCenter) ? t : best,
      );
      applyAttackCommand(state.sim, config, {
        type: 'attack',
        playerId,
        unitIds: idleCombat.map((u) => u.id),
        targetId: nearestThreat.id,
        target: { x: Math.round(nearestThreat.x), y: Math.round(nearestThreat.y) },
      });
    }
  }

  // --- RETREAT: pull back badly wounded units ---
  combatUnits.forEach((unit) => {
    const uConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    if (unit.hp / uConfig.maxHp < config.ai.retreatHpRatio && unit.order.kind !== 'move') {
      unit.order = {
        kind: 'move',
        target: { x: Math.round(baseCenter.x), y: Math.round(baseCenter.y) },
        path: [],
      };
    }
  });

  // --- ECONOMY: build refinery ---
  if (!hasRefinery) {
    if (aiBuildStructure(state, config, playerId, 'refinery', spawn.refinery, 6)) return;
  }

  // --- ECONOMY: train workers ---
  if (hq && workerCount < Math.min(config.ai.economyTarget, config.ai.maxWorkers) && hq.queue.length < 2) {
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: hq.id,
      unitTypeId: 'courier',
    });
  }

  // --- PRODUCTION: build barracks ---
  if (!barracks) {
    if (aiBuildStructure(state, config, playerId, 'barracks', spawn.buildAnchor, 8)) return;
  }

  // --- DEFENSE: build sentry after barracks ---
  if (barracks && sentryCount < 2) {
    const sentryAnchor = { x: spawn.hq.x + 2, y: spawn.hq.y - 1 };
    if (aiBuildStructure(state, config, playerId, 'sentry', sentryAnchor, 8)) return;
  }

  // --- PRODUCTION: build motor pool ---
  if (!motorPool) {
    if (aiBuildStructure(state, config, playerId, 'motor-pool', spawn.buildAnchor, 10)) return;
  }

  // --- ECONOMY: expand with second refinery if resources running low ---
  const refineryCount = playerBuildings.filter((b) => b.buildingTypeId === 'refinery').length;
  if (refineryCount < 2 && player.resources >= config.ai.expandResourceThreshold) {
    const midNode = config.map.resourceNodes.find((n) => distance(n, spawn.refinery) > 6);
    if (midNode) {
      aiBuildStructure(state, config, playerId, 'refinery', { x: midNode.x - 1, y: midNode.y + 1 }, 6);
    }
  }

  // --- ECONOMY: replace lost workers ---
  if (hq && workerCount < config.ai.economyTarget && hq.queue.length === 0) {
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: hq.id,
      unitTypeId: 'courier',
    });
  }

  // --- ARMY: train from barracks with better composition ---
  if (barracks && barracks.queue.length < 2) {
    const infantryCount = combatUnits.filter((u) => u.unitTypeId === 'vanguard').length;
    const artilleryCount = combatUnits.filter((u) => u.unitTypeId === 'ember').length;
    // Ratio: ~3 vanguard per 1 ember
    const wantEmber = artilleryCount * 3 < infantryCount && artilleryCount < 3;
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: barracks.id,
      unitTypeId: wantEmber ? 'ember' : 'vanguard',
    });
  }

  // --- ARMY: train strikers ---
  if (motorPool && motorPool.queue.length < 2) {
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: motorPool.id,
      unitTypeId: 'striker',
    });
  }

  const stagingPoint = {
    x: Math.round((baseCenter.x + spawn.rally.x) / 2),
    y: Math.round((baseCenter.y + spawn.rally.y) / 2),
  };
  const pressureGroup = readyCombatUnits.filter((unit) => distance(unit, stagingPoint) > 3.5);
  if (combatUnits.length >= 2 && threats.length === 0 && pressureGroup.length > 0) {
    applyMoveCommand(state.sim, config, {
      type: 'move',
      playerId,
      unitIds: pressureGroup.slice(0, 2).map((unit) => unit.id),
      target: stagingPoint,
    });
  }

  // --- ATTACK: smarter decisions ---
  const enemyBuildings = getPlayerBuildings(state.sim.buildings, enemyId);
  const enemyHQ = enemyBuildings.find((b) => getBuildingConfig(config, b.factionId, b.buildingTypeId).isHQ);
  const enemyCombatCount = enemyUnits.filter((u) => u.unitTypeId !== 'courier').length;

  // Keep a defensive reserve
  const reserveSize = Math.max(1, Math.floor(combatUnits.length * config.ai.reserveRatio));
  const attackForce = readyCombatUnits
    .sort((a, b) => {
      const aConf = getUnitConfig(config, a.factionId, a.unitTypeId);
      const bConf = getUnitConfig(config, b.factionId, b.unitTypeId);
      return (b.hp / bConf.maxHp) - (a.hp / aConf.maxHp);
    });

  // Leave reserve near base, send the rest
  const availableForAttack = attackForce.length > reserveSize
    ? attackForce.slice(0, attackForce.length - reserveSize)
    : [];

  const shouldAttack =
    availableForAttack.length >= config.ai.attackThreshold &&
    state.sim.tick - player.lastAttackTick >= config.tickRate * 5 &&
    (
      availableForAttack.length >= Math.max(2, enemyCombatCount) ||
      availableForAttack.length >= config.ai.attackThreshold + 2 ||
      state.sim.tick >= config.tickRate * 70
    );

  if (shouldAttack && availableForAttack.length > 0) {
    // Target priority: nearest enemy building, or HQ as fallback
    const attackTarget = enemyBuildings.length > 0
      ? enemyBuildings.reduce((best, b) => {
          const bCenter = centerOfBuilding(b, config);
          const bestCenter = centerOfBuilding(best, config);
          return distance(bCenter, baseCenter) < distance(bestCenter, baseCenter) ? b : best;
        })
      : null;

    const target = attackTarget ?? enemyHQ;
    if (target) {
      const targetCenter = centerOfBuilding(target, config);
      applyAttackCommand(state.sim, config, {
        type: 'attack',
        playerId,
        unitIds: availableForAttack.map((u) => u.id),
        targetId: target.id,
        target: { x: Math.round(targetCenter.x), y: Math.round(targetCenter.y) },
      });
      player.lastAttackTick = state.sim.tick;
    }
  }
}

export function issueCommand(state: GameState, config: GameConfig, command: Command) {
  if (state.sim.winnerId) {
    return;
  }

  switch (command.type) {
    case 'move':
      applyMoveCommand(state.sim, config, command);
      break;
    case 'attack':
      applyAttackCommand(state.sim, config, command);
      break;
    case 'build':
      applyBuildCommand(state, config, command);
      break;
    case 'produce':
      applyProduceCommand(state, config, command);
      break;
    case 'select':
      state.render.selectedIds = command.selectedIds;
      break;
  }
}

function updateUnits(sim: SimulationState, config: GameConfig) {
  Object.values(sim.units).forEach((unit) => {
    if (sim.winnerId) {
      return;
    }

    updateWorkerOrder(sim, config, unit);
    updateUnitCombat(sim, config, unit);
  });
}

export function stepSimulation(
  state: GameState,
  config: GameConfig = defaultGameConfig,
  steps = 1,
) {
  for (let step = 0; step < steps; step += 1) {
    if (state.sim.winnerId) {
      return;
    }

    state.sim.tick += 1;

    updateConstruction(state.sim, config);
    updateProduction(state.sim, config);
    updateUnits(state.sim, config);

    Object.values(state.sim.buildings).forEach((building) => {
      updateBuildingCombat(state.sim, config, building);
    });

    payoutIncome(state.sim, config);

    cleanupDestroyed(state.sim);
    pruneUnitNavigationState(state.sim);

    if (state.sim.tick % config.ai.thinkInterval === 0) {
      config.ai.automatedPlayers.forEach((playerId) => {
        runAiTurn(state, config, playerId);
      });
    }

    checkLossCondition(state.sim, config);
  }
}

export function getSelectionSummary(state: GameState): SelectionSummary {
  const units: UnitState[] = [];
  const buildings: BuildingState[] = [];

  state.render.selectedIds.forEach((id) => {
    const unit = state.sim.units[id];
    if (unit) {
      units.push(unit);
      return;
    }

    const building = state.sim.buildings[id];
    if (building) {
      buildings.push(building);
    }
  });

  return {
    units,
    buildings,
  };
}

export function createInitialGameState(config: GameConfig = defaultGameConfig): GameState {
  idCounter = 0;

  const sim: SimulationState = {
    tick: 0,
    winnerId: null,
    lossReason: null,
    players: {
      player: {
        id: 'player',
        factionId: 'aurora',
        resources: config.factions.aurora.startResources,
        pendingIncome: 0,
        incomePerSecond: 0,
        defeated: false,
        lastAttackTick: -999,
      },
      enemy: {
        id: 'enemy',
        factionId: 'obsidian',
        resources: config.factions.obsidian.startResources,
        pendingIncome: 0,
        incomePerSecond: 0,
        defeated: false,
        lastAttackTick: -999,
      },
    },
    units: {},
    buildings: {},
    resources: Object.fromEntries(
      config.map.resourceNodes.map((resource) => [
        resource.id,
        {
          ...resource,
        },
      ]),
    ),
  };

  config.map.spawns.forEach((spawn) => {
    const hq = createBuilding(spawn.playerId, spawn.factionId, 'command-core', spawn.hq.x, spawn.hq.y, config);
    hq.rallyPoint = spawn.rally;
    sim.buildings[hq.id] = hq;

    const refinery = createBuilding(
      spawn.playerId,
      spawn.factionId,
      'refinery',
      spawn.refinery.x,
      spawn.refinery.y,
      config,
    );
    refinery.rallyPoint = spawn.rally;
    sim.buildings[refinery.id] = refinery;

    const courierA = createUnit(
      spawn.playerId,
      spawn.factionId,
      'courier',
      spawn.refinery.x + 1.5,
      spawn.refinery.y + 2.5,
      config,
    );
    const courierB = createUnit(
      spawn.playerId,
      spawn.factionId,
      'courier',
      spawn.refinery.x + 2.3,
      spawn.refinery.y + 2.3,
      config,
    );
    const guard = createUnit(
      spawn.playerId,
      spawn.factionId,
      'vanguard',
      spawn.hq.x + 1.5,
      spawn.hq.y + 4.2,
      config,
    );

    sim.units[courierA.id] = courierA;
    sim.units[courierB.id] = courierB;
    sim.units[guard.id] = guard;
  });

  const state: GameState = {
    sim,
    render: {
      selectedIds: [],
      commandMode: 'normal',
      placementPreview: null,
    },
  };

  Object.values(state.sim.units).forEach((unit) => {
    if (unit.unitTypeId === 'courier') {
      assignHarvestOrder(unit, state.sim, config);
    }
  });

  return state;
}
