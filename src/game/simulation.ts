import {
  canPlayerBuild,
  canPlayerProduce,
  defaultGameConfig,
  getBuildingConfig,
  getPlayerBuildings,
  getPlayerUnits,
  getUnitConfig,
} from './config';
import { createBlockedSet, findBuildSite, findPath, nearestReachablePoint, toTileKey } from './pathfinding';
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
  Object.values(sim.units).forEach((unit) => {
    if (unit.hp <= 0) {
      delete sim.units[unit.id];
    }
  });

  Object.values(sim.buildings).forEach((building) => {
    if (building.hp <= 0) {
      delete sim.buildings[building.id];
    }
  });
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

function applyMoveCommand(sim: SimulationState, config: GameConfig, command: MoveCommand) {
  const blocked = createBlockedSet(config, sim);
  const targets = formationTargets(command.target, command.unitIds.length);

  command.unitIds.forEach((unitId, index) => {
    const unit = sim.units[unitId];
    if (!unit || unit.ownerId !== command.playerId) {
      return;
    }

    const destination = nearestReachablePoint(config, blocked, targets[index] ?? command.target) ?? command.target;
    const path = findPath(
      config,
      blocked,
      { x: Math.round(unit.x), y: Math.round(unit.y) },
      destination,
    );

    unit.order = {
      kind: 'move',
      target: destination,
      path,
    };
  });
}

function applyAttackCommand(sim: SimulationState, config: GameConfig, command: AttackCommand) {
  const blocked = createBlockedSet(config, sim);
  const targets = formationTargets(command.target, command.unitIds.length);

  command.unitIds.forEach((unitId, index) => {
    const unit = sim.units[unitId];
    if (!unit || unit.ownerId !== command.playerId) {
      return;
    }

    if (command.targetId) {
      unit.order = {
        kind: 'attack-target',
        targetId: command.targetId,
        target: command.target,
        path: [],
      };
      return;
    }

    const destination = nearestReachablePoint(config, blocked, targets[index] ?? command.target) ?? command.target;
    unit.order = {
      kind: 'attack-move',
      target: destination,
      path: findPath(
        config,
        blocked,
        { x: Math.round(unit.x), y: Math.round(unit.y) },
        destination,
      ),
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
  const player = state.sim.players[playerId];
  const buildingConfig = getBuildingConfig(config, player.factionId, buildingTypeId);

  if (
    !canPlayerBuild(config, playerId, player.factionId, state.sim.buildings, buildingTypeId) ||
    player.resources < buildingConfig.cost
  ) {
    return false;
  }

  const blocked = createBlockedSet(config, state.sim);

  for (let y = 0; y < buildingConfig.footprint.height; y += 1) {
    for (let x = 0; x < buildingConfig.footprint.width; x += 1) {
      const pointKey = toTileKey(tileX + x, tileY + y);
      if (
        tileX + x < 0 ||
        tileY + y < 0 ||
        tileX + x >= config.map.width ||
        tileY + y >= config.map.height ||
        blocked.has(pointKey)
      ) {
        return false;
      }

      if (
        Object.values(state.sim.resources).some(
          (resource) => Math.round(resource.x) === tileX + x && Math.round(resource.y) === tileY + y,
        )
      ) {
        return false;
      }
    }
  }

  return true;
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
  const blocked = createBlockedSet(config, sim, building.id);
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

function findNearestEnemyTarget(
  sim: SimulationState,
  config: GameConfig,
  ownerId: PlayerId,
  position: { x: number; y: number },
  range: number,
  canAttackBuildings: boolean,
) {
  let bestId: string | null = null;
  let bestDistance = Infinity;

  Object.values(sim.units).forEach((unit) => {
    if (unit.ownerId === ownerId) {
      return;
    }

    const currentDistance = distance(position, unit);
    if (currentDistance <= range && currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestId = unit.id;
    }
  });

  if (bestId || !canAttackBuildings) {
    return bestId;
  }

  Object.values(sim.buildings).forEach((building) => {
    if (building.ownerId === ownerId) {
      return;
    }

    const currentDistance = distance(position, centerOfBuilding(building, config));
    if (currentDistance <= range && currentDistance < bestDistance) {
      bestDistance = currentDistance;
      bestId = building.id;
    }
  });

  return bestId;
}

function moveUnitAlongPath(unit: UnitState, config: GameConfig) {
  if (unit.order.path.length === 0) {
    return;
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
    return;
  }

  unit.x += (dx / remaining) * stepDistance;
  unit.y += (dy / remaining) * stepDistance;
}

function retargetPath(
  sim: SimulationState,
  config: GameConfig,
  unit: UnitState,
  destination: GridPoint,
) {
  const blocked = createBlockedSet(config, sim);
  const target = nearestReachablePoint(config, blocked, destination) ?? destination;
  unit.order.path = findPath(
    config,
    blocked,
    { x: Math.round(unit.x), y: Math.round(unit.y) },
    target,
  );
}

function updateWorkerOrder(sim: SimulationState, config: GameConfig, unit: UnitState) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
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
      if (unit.order.path.length === 0) {
        retargetPath(sim, config, unit, resourcePoint);
      }
      moveUnitAlongPath(unit, config);
      return;
    }

    const gathered = Math.min(unitConfig.harvestRate ?? 0, resource.amount);
    resource.amount -= gathered;
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
    if (distance(unit, returnPoint) > 2.2) {
      if (unit.order.path.length === 0) {
        retargetPath(sim, config, unit, { x: Math.round(returnPoint.x), y: Math.round(returnPoint.y) });
      }
      moveUnitAlongPath(unit, config);
      return;
    }

    sim.players[unit.ownerId].resources += unit.cargo;
    unit.cargo = 0;
    unit.order.kind = 'harvest';
    unit.order.path = [];
  }
}

function updateUnitCombat(sim: SimulationState, config: GameConfig, unit: UnitState) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
  unit.cooldownRemaining = Math.max(0, unit.cooldownRemaining - 1);

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

    retargetPath(sim, config, unit, { x: Math.round(targetPosition.x), y: Math.round(targetPosition.y) });
    moveUnitAlongPath(unit, config);
    return;
  }

  const nearbyEnemyId = findNearestEnemyTarget(
    sim,
    config,
    unit.ownerId,
    unit,
    unitConfig.range,
    unitConfig.attackBuildings ?? true,
  );

  if (nearbyEnemyId && unit.cooldownRemaining === 0) {
    applyDamage(sim, config, unitConfig, nearbyEnemyId);
    unit.cooldownRemaining = unitConfig.attackCooldown;
    return;
  }

  if (unit.order.kind === 'move' || unit.order.kind === 'attack-move') {
    if (unit.order.path.length === 0 && unit.order.target) {
      retargetPath(sim, config, unit, unit.order.target);
    }
    moveUnitAlongPath(unit, config);
    if (unit.order.path.length === 0 && unit.order.kind === 'move') {
      unit.order = initialUnitOrder();
    }
  }
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

  const targetId = findNearestEnemyTarget(
    sim,
    config,
    building.ownerId,
    centerOfBuilding(building, config),
    buildingConfig.attackRange,
    true,
  );

  if (targetId) {
    applyDamage(sim, config, buildingConfig, targetId);
    building.cooldownRemaining = buildingConfig.attackCooldown;
  }
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

  const playerBuildings = getPlayerBuildings(state.sim.buildings, playerId);
  const playerUnits = getPlayerUnits(state.sim.units, playerId);
  const workerCount = playerUnits.filter((unit) => unit.unitTypeId === 'courier').length;
  const barracks = playerBuildings.find(
    (building) => building.buildingTypeId === 'barracks' && building.constructionRemaining === 0,
  );
  const motorPool = playerBuildings.find(
    (building) => building.buildingTypeId === 'motor-pool' && building.constructionRemaining === 0,
  );
  const hasRefinery = playerBuildings.some(
    (building) => building.buildingTypeId === 'refinery' && building.constructionRemaining === 0,
  );

  if (!hasRefinery && canPlayerBuild(config, playerId, player.factionId, state.sim.buildings, 'refinery')) {
    const placement = findBuildSite(
      config,
      createBlockedSet(config, state.sim),
      config.map.obstacleAreas,
      getBuildingConfig(config, player.factionId, 'refinery').footprint,
      spawn.refinery,
      6,
    );
    if (placement) {
      applyBuildCommand(state, config, {
        type: 'build',
        playerId,
        buildingTypeId: 'refinery',
        tileX: placement.x,
        tileY: placement.y,
      });
      return;
    }
  }

  const hq = playerBuildings.find((building) => building.buildingTypeId === 'command-core');
  if (hq && workerCount < config.ai.economyTarget && hq.queue.length < 2) {
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: hq.id,
      unitTypeId: 'courier',
    });
  }

  if (!barracks && canPlayerBuild(config, playerId, player.factionId, state.sim.buildings, 'barracks')) {
    const placement = findBuildSite(
      config,
      createBlockedSet(config, state.sim),
      config.map.obstacleAreas,
      getBuildingConfig(config, player.factionId, 'barracks').footprint,
      spawn.buildAnchor,
      8,
    );
    if (placement) {
      applyBuildCommand(state, config, {
        type: 'build',
        playerId,
        buildingTypeId: 'barracks',
        tileX: placement.x,
        tileY: placement.y,
      });
      return;
    }
  }

  if (!motorPool && canPlayerBuild(config, playerId, player.factionId, state.sim.buildings, 'motor-pool')) {
    const placement = findBuildSite(
      config,
      createBlockedSet(config, state.sim),
      config.map.obstacleAreas,
      getBuildingConfig(config, player.factionId, 'motor-pool').footprint,
      spawn.buildAnchor,
      10,
    );
    if (placement) {
      applyBuildCommand(state, config, {
        type: 'build',
        playerId,
        buildingTypeId: 'motor-pool',
        tileX: placement.x,
        tileY: placement.y,
      });
      return;
    }
  }

  if (barracks && barracks.queue.length < 2) {
    const infantryCount = playerUnits.filter((unit) => unit.unitTypeId === 'vanguard').length;
    const artilleryCount = playerUnits.filter((unit) => unit.unitTypeId === 'ember').length;
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: barracks.id,
      unitTypeId: infantryCount < 4 ? 'vanguard' : artilleryCount < 2 ? 'ember' : 'vanguard',
    });
  }

  if (motorPool && motorPool.queue.length < 2) {
    applyProduceCommand(state, config, {
      type: 'produce',
      playerId,
      buildingId: motorPool.id,
      unitTypeId: 'striker',
    });
  }

  const combatUnits = playerUnits.filter((unit) => unit.unitTypeId !== 'courier');
  const enemyHQ = getPlayerBuildings(
    state.sim.buildings,
    playerId === 'player' ? 'enemy' : 'player',
  ).find((building) => getBuildingConfig(config, building.factionId, building.buildingTypeId).isHQ);

  if (
    enemyHQ &&
    combatUnits.length >= config.ai.attackThreshold &&
    state.sim.tick - player.lastAttackTick >= config.tickRate * 8
  ) {
    applyAttackCommand(state.sim, config, {
      type: 'attack',
      playerId,
      unitIds: combatUnits.map((unit) => unit.id),
      targetId: enemyHQ.id,
      target: {
        x: enemyHQ.tileX,
        y: enemyHQ.tileY,
      },
    });
    player.lastAttackTick = state.sim.tick;
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

    cleanupDestroyed(state.sim);

    if (state.sim.tick % config.ai.thinkInterval === 0) {
      runAiTurn(state, config, 'enemy');
    }

    checkLossCondition(state.sim, config);
  }
}

export function getSelectionSummary(state: GameState): SelectionSummary {
  const ids = new Set(state.render.selectedIds);
  return {
    units: Object.values(state.sim.units).filter((unit) => ids.has(unit.id)),
    buildings: Object.values(state.sim.buildings).filter((building) => ids.has(building.id)),
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
        defeated: false,
        lastAttackTick: -999,
      },
      enemy: {
        id: 'enemy',
        factionId: 'obsidian',
        resources: config.factions.obsidian.startResources,
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
