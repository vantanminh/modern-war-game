// src/game/config.ts
var units = {
  courier: {
    id: "courier",
    name: "Courier",
    role: "worker",
    maxHp: 65,
    damage: 4,
    range: 1.1,
    speed: 3.4,
    cost: 80,
    buildTime: 16,
    armorType: "light",
    attackCooldown: 12,
    carryCapacity: 70,
    harvestRate: 8,
    attackBuildings: false,
    color: 13169515
  },
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    role: "infantry",
    maxHp: 90,
    damage: 10,
    range: 3.2,
    speed: 2.25,
    cost: 110,
    buildTime: 18,
    armorType: "light",
    attackCooldown: 10,
    attackBuildings: true,
    attackBias: {
      light: 1.1,
      armored: 0.85,
      structure: 0.75
    },
    color: 14870768
  },
  striker: {
    id: "striker",
    name: "Striker",
    role: "vehicle",
    maxHp: 180,
    damage: 22,
    range: 3.6,
    speed: 1.9,
    cost: 220,
    buildTime: 26,
    armorType: "armored",
    attackCooldown: 16,
    attackBuildings: true,
    attackBias: {
      light: 1.15,
      armored: 1,
      structure: 0.9
    },
    color: 16762967
  },
  ember: {
    id: "ember",
    name: "Ember",
    role: "artillery",
    maxHp: 120,
    damage: 32,
    range: 5.2,
    speed: 1.4,
    cost: 260,
    buildTime: 32,
    armorType: "armored",
    attackCooldown: 22,
    attackBuildings: true,
    attackBias: {
      light: 0.8,
      armored: 1.05,
      structure: 1.45
    },
    color: 16743282
  }
};
var buildings = {
  "command-core": {
    id: "command-core",
    name: "Command Core",
    category: "hq",
    footprint: { width: 3, height: 3 },
    maxHp: 900,
    cost: 0,
    buildTime: 0,
    armorType: "structure",
    producesUnitIds: ["courier"],
    isHQ: true,
    grantsBuildIds: ["refinery", "barracks", "sentry"],
    color: 2450411
  },
  refinery: {
    id: "refinery",
    name: "Refinery",
    category: "resource",
    footprint: { width: 3, height: 2 },
    maxHp: 500,
    cost: 180,
    buildTime: 26,
    armorType: "structure",
    isRefinery: true,
    grantsBuildIds: ["motor-pool"],
    requiresBuildingIds: ["command-core"],
    color: 2278750
  },
  barracks: {
    id: "barracks",
    name: "Barracks",
    category: "production",
    footprint: { width: 3, height: 2 },
    maxHp: 420,
    cost: 200,
    buildTime: 28,
    armorType: "structure",
    producesUnitIds: ["vanguard", "ember"],
    requiresBuildingIds: ["command-core"],
    color: 16347926
  },
  "motor-pool": {
    id: "motor-pool",
    name: "Motor Pool",
    category: "production",
    footprint: { width: 3, height: 3 },
    maxHp: 550,
    cost: 260,
    buildTime: 34,
    armorType: "structure",
    producesUnitIds: ["striker"],
    requiresBuildingIds: ["refinery"],
    color: 15708416
  },
  sentry: {
    id: "sentry",
    name: "Sentry Grid",
    category: "defense",
    footprint: { width: 2, height: 2 },
    maxHp: 360,
    cost: 160,
    buildTime: 24,
    armorType: "structure",
    attackRange: 4.4,
    attackDamage: 18,
    attackCooldown: 14,
    requiresBuildingIds: ["barracks"],
    color: 9133302
  }
};
var factions = {
  aurora: {
    id: "aurora",
    name: "Aurora Combine",
    color: 5809919,
    accent: "#58a6ff",
    availableUnitIds: ["courier", "vanguard", "striker", "ember"],
    availableBuildingIds: ["command-core", "refinery", "barracks", "motor-pool", "sentry"],
    startResources: 520,
    unitModifiers: {
      courier: { speed: 0.2 },
      vanguard: { range: 0.2 }
    },
    buildingModifiers: {
      sentry: { attackRange: 0.25 }
    }
  },
  obsidian: {
    id: "obsidian",
    name: "Obsidian Front",
    color: 16739179,
    accent: "#ff6b6b",
    availableUnitIds: ["courier", "vanguard", "striker", "ember"],
    availableBuildingIds: ["command-core", "refinery", "barracks", "motor-pool", "sentry"],
    startResources: 520,
    unitModifiers: {
      striker: { damage: 3 },
      ember: { buildTime: -2 }
    },
    buildingModifiers: {
      barracks: { maxHp: 30 }
    }
  }
};
function createBlockedFromAreas(width, height, areas) {
  const blocked = [];
  for (const area of areas) {
    for (let y = area.y; y < area.y + area.height; y += 1) {
      for (let x = area.x; x < area.x + area.width; x += 1) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          blocked.push({ x, y });
        }
      }
    }
  }
  return blocked;
}
var obstacleAreas = [
  { x: 18, y: 0, width: 3, height: 10 },
  { x: 18, y: 13, width: 3, height: 15 },
  { x: 9, y: 11, width: 4, height: 3 },
  { x: 27, y: 14, width: 4, height: 3 }
];
var defaultGameConfig = {
  tickRate: 10,
  tileSize: 28,
  factions,
  units,
  buildings,
  map: {
    id: "red-scar",
    name: "Red Scar Crossing",
    width: 40,
    height: 28,
    obstacleAreas,
    terrainBlocked: createBlockedFromAreas(40, 28, obstacleAreas),
    resourceNodes: [
      { id: "ore-west", x: 8, y: 6, amount: 2800 },
      { id: "ore-east", x: 31, y: 21, amount: 2800 },
      { id: "ore-mid", x: 20, y: 11, amount: 1600 }
    ],
    spawns: [
      {
        playerId: "player",
        factionId: "aurora",
        hq: { x: 3, y: 20 },
        refinery: { x: 6, y: 18 },
        rally: { x: 11, y: 18 },
        buildAnchor: { x: 10, y: 20 }
      },
      {
        playerId: "enemy",
        factionId: "obsidian",
        hq: { x: 34, y: 4 },
        refinery: { x: 31, y: 7 },
        rally: { x: 27, y: 9 },
        buildAnchor: { x: 27, y: 6 }
      }
    ]
  },
  ai: {
    thinkInterval: 8,
    attackThreshold: 3,
    economyTarget: 5,
    defenseRadius: 10,
    reserveRatio: 0.2,
    retreatHpRatio: 0.25,
    maxWorkers: 6,
    expandResourceThreshold: 900,
    pathRepathInterval: 4
  }
};
function getUnitConfig(config, factionId, unitTypeId) {
  const base = config.units[unitTypeId];
  const modifier = config.factions[factionId].unitModifiers?.[unitTypeId];
  return {
    ...base,
    maxHp: base.maxHp + (modifier?.maxHp ?? 0),
    damage: base.damage + (modifier?.damage ?? 0),
    range: base.range + (modifier?.range ?? 0),
    speed: base.speed + (modifier?.speed ?? 0),
    cost: base.cost + (modifier?.cost ?? 0),
    buildTime: Math.max(1, base.buildTime + (modifier?.buildTime ?? 0)),
    attackCooldown: Math.max(1, base.attackCooldown + (modifier?.attackCooldown ?? 0))
  };
}
function getBuildingConfig(config, factionId, buildingTypeId) {
  const base = config.buildings[buildingTypeId];
  const modifier = config.factions[factionId].buildingModifiers?.[buildingTypeId];
  return {
    ...base,
    maxHp: base.maxHp + (modifier?.maxHp ?? 0),
    cost: base.cost + (modifier?.cost ?? 0),
    buildTime: Math.max(0, base.buildTime + (modifier?.buildTime ?? 0)),
    attackRange: (base.attackRange ?? 0) + (modifier?.attackRange ?? 0),
    attackDamage: (base.attackDamage ?? 0) + (modifier?.attackDamage ?? 0),
    attackCooldown: base.attackCooldown ? Math.max(1, base.attackCooldown + (modifier?.attackCooldown ?? 0)) : void 0
  };
}
function getPlayerBuildings(buildingsState, playerId) {
  return Object.values(buildingsState).filter((building) => building.ownerId === playerId);
}
function getPlayerUnits(unitsState, playerId) {
  return Object.values(unitsState).filter((unit) => unit.ownerId === playerId);
}
function hasCompletedBuilding(buildingsState, playerId, buildingTypeId) {
  return getPlayerBuildings(buildingsState, playerId).some(
    (building) => building.buildingTypeId === buildingTypeId && building.constructionRemaining === 0
  );
}
function canPlayerBuild(config, playerId, factionId, buildingsState, buildingTypeId) {
  const faction = config.factions[factionId];
  const buildingConfig = getBuildingConfig(config, factionId, buildingTypeId);
  if (!faction.availableBuildingIds.includes(buildingTypeId)) {
    return false;
  }
  return (buildingConfig.requiresBuildingIds ?? []).every(
    (requiredId) => hasCompletedBuilding(buildingsState, playerId, requiredId)
  );
}
function canPlayerProduce(config, factionId, buildingTypeId, unitTypeId) {
  const faction = config.factions[factionId];
  const buildingConfig = getBuildingConfig(config, factionId, buildingTypeId);
  return faction.availableUnitIds.includes(unitTypeId) && Boolean(buildingConfig.producesUnitIds?.includes(unitTypeId));
}

// src/game/pathfinding.ts
var CARDINALS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
function key(point) {
  return `${point.x},${point.y}`;
}
function toTileKey(x, y) {
  return `${x},${y}`;
}
function inBounds(config, point) {
  return point.x >= 0 && point.y >= 0 && point.x < config.map.width && point.y < config.map.height;
}
function createBlockedSet(config, sim, ignoredBuildingId) {
  const blocked = new Set(config.map.terrainBlocked.map((point) => key(point)));
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
function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function tileCenterDistance(point, target) {
  return Math.hypot(point.x + 0.5 - target.x, point.y + 0.5 - target.y);
}
function reconstruct(cameFrom, current) {
  const path = [current];
  let cursor = current;
  while (cameFrom.has(key(cursor))) {
    cursor = cameFrom.get(key(cursor));
    path.push(cursor);
  }
  path.reverse();
  return path.slice(1);
}
function findPath(config, blocked, from, to) {
  if (!inBounds(config, from) || !inBounds(config, to)) {
    return [];
  }
  if (from.x === to.x && from.y === to.y) {
    return [];
  }
  const open = [from];
  const cameFrom = /* @__PURE__ */ new Map();
  const gScore = /* @__PURE__ */ new Map([[key(from), 0]]);
  const fScore = /* @__PURE__ */ new Map([[key(from), heuristic(from, to)]]);
  const closed = /* @__PURE__ */ new Set();
  while (open.length > 0) {
    open.sort((a, b) => (fScore.get(key(a)) ?? Infinity) - (fScore.get(key(b)) ?? Infinity));
    const current = open.shift();
    const currentKey = key(current);
    if (current.x === to.x && current.y === to.y) {
      return reconstruct(cameFrom, current);
    }
    closed.add(currentKey);
    for (const offset of CARDINALS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };
      const neighborKey = key(neighbor);
      if (!inBounds(config, neighbor) || blocked.has(neighborKey) || closed.has(neighborKey)) {
        continue;
      }
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) {
        continue;
      }
      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + heuristic(neighbor, to));
      if (!open.some((point) => point.x === neighbor.x && point.y === neighbor.y)) {
        open.push(neighbor);
      }
    }
  }
  return [];
}
function nearestReachablePoint(config, blocked, target, maxRadius = 6) {
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
function findBestReachablePath(config, blocked, from, target, _searchRadius = 10, maxDistanceFromTarget = Number.POSITIVE_INFINITY) {
  if (!inBounds(config, from)) {
    return null;
  }
  const open = [from];
  const cameFrom = /* @__PURE__ */ new Map();
  const gScore = /* @__PURE__ */ new Map([[key(from), 0]]);
  let bestPoint = from;
  let bestPathLength = 0;
  let bestTargetDistance = tileCenterDistance(from, target);
  if (Number.isFinite(maxDistanceFromTarget) && bestTargetDistance <= maxDistanceFromTarget) {
    return {
      point: from,
      path: []
    };
  }
  while (open.length > 0) {
    open.sort((a, b) => (gScore.get(key(a)) ?? Infinity) - (gScore.get(key(b)) ?? Infinity));
    const current = open.shift();
    const currentKey = key(current);
    const currentPathLength = gScore.get(currentKey) ?? Infinity;
    const currentTargetDistance = tileCenterDistance(current, target);
    if (currentTargetDistance < bestTargetDistance || currentTargetDistance === bestTargetDistance && currentPathLength < bestPathLength) {
      bestPoint = current;
      bestPathLength = currentPathLength;
      bestTargetDistance = currentTargetDistance;
    }
    if (Number.isFinite(maxDistanceFromTarget) && currentTargetDistance <= maxDistanceFromTarget) {
      return {
        point: current,
        path: reconstruct(cameFrom, current)
      };
    }
    for (const offset of CARDINALS) {
      const neighbor = { x: current.x + offset.x, y: current.y + offset.y };
      const neighborKey = key(neighbor);
      if (!inBounds(config, neighbor) || blocked.has(neighborKey)) {
        continue;
      }
      const tentative = currentPathLength + 1;
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) {
        continue;
      }
      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentative);
      if (!open.some((point) => point.x === neighbor.x && point.y === neighbor.y)) {
        open.push(neighbor);
      }
    }
  }
  return {
    point: bestPoint,
    path: reconstruct(cameFrom, bestPoint)
  };
}
function findBuildSite(config, blocked, obstacleAreas2, footprint, anchor, maxRadius = 10) {
  const obstacleSet = /* @__PURE__ */ new Set();
  obstacleAreas2.forEach((area) => {
    for (let y = area.y; y < area.y + area.height; y += 1) {
      for (let x = area.x; x < area.x + area.width; x += 1) {
        obstacleSet.add(toTileKey(x, y));
      }
    }
  });
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

// src/game/simulation.ts
var idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function centerOfBuilding(building, config) {
  const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
  return {
    x: building.tileX + buildingConfig.footprint.width / 2,
    y: building.tileY + buildingConfig.footprint.height / 2
  };
}
function initialUnitOrder() {
  return {
    kind: "idle",
    path: []
  };
}
function createUnit(ownerId, factionId, unitTypeId, x, y, config) {
  const unitConfig = getUnitConfig(config, factionId, unitTypeId);
  return {
    id: nextId("unit"),
    ownerId,
    factionId,
    unitTypeId,
    x,
    y,
    hp: unitConfig.maxHp,
    cooldownRemaining: 0,
    cargo: 0,
    order: initialUnitOrder()
  };
}
function createBuilding(ownerId, factionId, buildingTypeId, tileX, tileY, config, constructionRemaining = 0) {
  const buildingConfig = getBuildingConfig(config, factionId, buildingTypeId);
  const hpRatio = constructionRemaining > 0 ? 0.35 : 1;
  return {
    id: nextId("building"),
    ownerId,
    factionId,
    buildingTypeId,
    tileX,
    tileY,
    hp: Math.round(buildingConfig.maxHp * hpRatio),
    queue: [],
    rallyPoint: {
      x: tileX + buildingConfig.footprint.width + 1,
      y: tileY + Math.floor(buildingConfig.footprint.height / 2)
    },
    cooldownRemaining: 0,
    constructionRemaining
  };
}
function findNearestResource(sim, position) {
  let best = null;
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
function findNearestRefinery(sim, config, ownerId, position) {
  let best = null;
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
function assignHarvestOrder(unit, sim, config) {
  const resource = findNearestResource(sim, unit);
  const refinery = findNearestRefinery(sim, config, unit.ownerId, unit);
  if (!resource || !refinery) {
    unit.order = initialUnitOrder();
    return;
  }
  unit.order = {
    kind: "harvest",
    path: [],
    resourceId: resource.id,
    refineryId: refinery.id
  };
}
function getEntityPosition(sim, config, entityId) {
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
function getEntityOwner(sim, entityId) {
  if (sim.units[entityId]) {
    return sim.units[entityId].ownerId;
  }
  if (sim.buildings[entityId]) {
    return sim.buildings[entityId].ownerId;
  }
  return null;
}
function getEntityArmor(sim, config, entityId) {
  if (sim.units[entityId]) {
    return getUnitConfig(config, sim.units[entityId].factionId, sim.units[entityId].unitTypeId).armorType;
  }
  if (sim.buildings[entityId]) {
    return getBuildingConfig(config, sim.buildings[entityId].factionId, sim.buildings[entityId].buildingTypeId).armorType;
  }
  return "structure";
}
function applyDamage(sim, config, attackerConfig, targetId) {
  const armorType = getEntityArmor(sim, config, targetId);
  const bias = "attackBias" in attackerConfig ? attackerConfig.attackBias?.[armorType] ?? 1 : 1;
  const baseDamage = "damage" in attackerConfig ? attackerConfig.damage : attackerConfig.attackDamage ?? 0;
  const damage = Math.max(1, Math.round(baseDamage * bias));
  if (sim.units[targetId]) {
    sim.units[targetId].hp -= damage;
  } else if (sim.buildings[targetId]) {
    sim.buildings[targetId].hp -= damage;
  }
}
function cleanupDestroyed(sim) {
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
function checkLossCondition(sim, config) {
  Object.keys(sim.players).forEach((playerId) => {
    const playerBuildings = getPlayerBuildings(sim.buildings, playerId);
    const hasHQ = playerBuildings.some(
      (building) => getBuildingConfig(config, building.factionId, building.buildingTypeId).isHQ
    );
    const hasProduction = playerBuildings.some((building) => {
      const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
      return building.constructionRemaining === 0 && Boolean(buildingConfig.producesUnitIds?.length);
    });
    if (!hasHQ || !hasProduction && getPlayerUnits(sim.units, playerId).length === 0) {
      sim.players[playerId].defeated = true;
    }
  });
  if (sim.players.player.defeated && !sim.players.enemy.defeated) {
    sim.winnerId = "enemy";
    sim.lossReason = "Your command structure collapsed.";
  } else if (sim.players.enemy.defeated && !sim.players.player.defeated) {
    sim.winnerId = "player";
    sim.lossReason = "Enemy command structure neutralized.";
  }
}
function formationTargets(target, count) {
  const offsets = [];
  const columns = Math.ceil(Math.sqrt(count));
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    offsets.push({
      x: target.x + column - Math.floor(columns / 2),
      y: target.y + row - Math.floor(columns / 2)
    });
  }
  return offsets;
}
function roundedPoint(position) {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}
function isPathWaypointBlocked(blocked, path) {
  const next = path[0];
  return Boolean(next && blocked.has(toTileKey(next.x, next.y)));
}
function getPathSearchRadius(config, preferredRadius) {
  return Math.max(8, preferredRadius, Math.ceil(Math.max(config.map.width, config.map.height) * 0.3));
}
function planPathToDestination(sim, config, unit, destination, maxDistanceFromTarget = Number.POSITIVE_INFINITY, preferredSearchRadius = 10) {
  const blocked = createBlockedSet(config, sim);
  const origin = roundedPoint(unit);
  const result = findBestReachablePath(
    config,
    blocked,
    origin,
    destination,
    getPathSearchRadius(config, preferredSearchRadius),
    maxDistanceFromTarget
  );
  return {
    blocked,
    destination: result?.point ?? destination,
    path: result?.path ?? []
  };
}
function shouldRefreshOrderPath(sim, config, path, blocked, allowPeriodicRefresh = true) {
  if (path.length === 0) {
    return true;
  }
  if (isPathWaypointBlocked(blocked, path)) {
    return true;
  }
  return allowPeriodicRefresh && sim.tick % config.ai.pathRepathInterval === 0;
}
function applyMoveCommand(sim, config, command) {
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
      12
    );
    unit.order = {
      kind: "move",
      target: plan.destination,
      path: plan.path
    };
  });
}
function applyAttackCommand(sim, config, command) {
  const targets = formationTargets(command.target, command.unitIds.length);
  command.unitIds.forEach((unitId, index) => {
    const unit = sim.units[unitId];
    if (!unit || unit.ownerId !== command.playerId) {
      return;
    }
    if (command.targetId) {
      const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
      const targetPosition = getEntityPosition(sim, config, command.targetId) ?? command.target;
      const plan2 = planPathToDestination(
        sim,
        config,
        unit,
        targetPosition,
        unitConfig.range,
        Math.max(10, Math.ceil(unitConfig.range) + 8)
      );
      unit.order = {
        kind: "attack-target",
        targetId: command.targetId,
        target: targetPosition,
        path: plan2.path
      };
      return;
    }
    const plan = planPathToDestination(
      sim,
      config,
      unit,
      targets[index] ?? command.target,
      Number.POSITIVE_INFINITY,
      12
    );
    unit.order = {
      kind: "attack-move",
      target: plan.destination,
      path: plan.path
    };
  });
}
function isBuildPlacementValid(state, config, playerId, buildingTypeId, tileX, tileY) {
  const player = state.sim.players[playerId];
  const buildingConfig = getBuildingConfig(config, player.factionId, buildingTypeId);
  if (!canPlayerBuild(config, playerId, player.factionId, state.sim.buildings, buildingTypeId) || player.resources < buildingConfig.cost) {
    return false;
  }
  const blocked = createBlockedSet(config, state.sim);
  for (let y = 0; y < buildingConfig.footprint.height; y += 1) {
    for (let x = 0; x < buildingConfig.footprint.width; x += 1) {
      const pointKey = toTileKey(tileX + x, tileY + y);
      if (tileX + x < 0 || tileY + y < 0 || tileX + x >= config.map.width || tileY + y >= config.map.height || blocked.has(pointKey)) {
        return false;
      }
      if (Object.values(state.sim.resources).some(
        (resource) => Math.round(resource.x) === tileX + x && Math.round(resource.y) === tileY + y
      )) {
        return false;
      }
    }
  }
  return true;
}
function applyBuildCommand(state, config, command) {
  if (!isBuildPlacementValid(state, config, command.playerId, command.buildingTypeId, command.tileX, command.tileY)) {
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
    buildingConfig.buildTime
  );
  state.sim.buildings[building.id] = building;
}
function applyProduceCommand(state, config, command) {
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
    remainingTicks: unitConfig.buildTime
  });
}
function updateConstruction(sim, config) {
  Object.values(sim.buildings).forEach((building) => {
    if (building.constructionRemaining <= 0) {
      return;
    }
    building.constructionRemaining -= 1;
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    building.hp = clamp(
      Math.round(
        buildingConfig.maxHp * (1 - building.constructionRemaining / Math.max(1, buildingConfig.buildTime))
      ),
      Math.round(buildingConfig.maxHp * 0.35),
      buildingConfig.maxHp
    );
  });
}
function spawnUnitNearBuilding(sim, config, building, unitTypeId) {
  const blocked = createBlockedSet(config, sim, building.id);
  const anchor = building.rallyPoint;
  const destination = findBuildSite(
    config,
    blocked,
    config.map.obstacleAreas,
    { width: 1, height: 1 },
    anchor,
    4
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
    config
  );
  unit.order = {
    kind: "move",
    target: anchor,
    path: findPath(
      config,
      blocked,
      { x: destination.x, y: destination.y },
      nearestReachablePoint(config, blocked, anchor) ?? destination
    )
  };
  sim.units[unit.id] = unit;
  return true;
}
function updateProduction(sim, config) {
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
function findNearestEnemyTarget(sim, config, ownerId, position, range, canAttackBuildings) {
  let bestId = null;
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
function moveUnitAlongPath(unit, config) {
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
  unit.x += dx / remaining * stepDistance;
  unit.y += dy / remaining * stepDistance;
}
function retargetPath(sim, config, unit, destination, maxDistanceFromTarget = Number.POSITIVE_INFINITY, preferredSearchRadius = 10) {
  const plan = planPathToDestination(
    sim,
    config,
    unit,
    destination,
    maxDistanceFromTarget,
    preferredSearchRadius
  );
  unit.order.target = plan.destination;
  unit.order.path = plan.path;
}
function updateWorkerOrder(sim, config, unit) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
  const refineryDropoffRange = 3.2;
  if (unitConfig.role !== "worker") {
    return;
  }
  if (unit.order.kind === "idle") {
    assignHarvestOrder(unit, sim, config);
  }
  if (unit.order.kind === "harvest") {
    const resource = unit.order.resourceId ? sim.resources[unit.order.resourceId] : void 0;
    if (!resource || resource.amount <= 0) {
      assignHarvestOrder(unit, sim, config);
      return;
    }
    const resourcePoint = { x: Math.round(resource.x), y: Math.round(resource.y) };
    if (distance(unit, resource) > 0.8) {
      const blocked = createBlockedSet(config, sim);
      if (shouldRefreshOrderPath(sim, config, unit.order.path, blocked, false)) {
        retargetPath(sim, config, unit, resourcePoint);
      }
      moveUnitAlongPath(unit, config);
      return;
    }
    const gathered = Math.min(unitConfig.harvestRate ?? 0, resource.amount);
    resource.amount -= gathered;
    unit.cargo += gathered;
    if (unit.cargo >= (unitConfig.carryCapacity ?? 0)) {
      unit.order.kind = "return";
      unit.order.path = [];
    }
  }
  if (unit.order.kind === "return") {
    const refinery = unit.order.refineryId ? sim.buildings[unit.order.refineryId] : void 0;
    if (!refinery) {
      assignHarvestOrder(unit, sim, config);
      return;
    }
    const returnPoint = centerOfBuilding(refinery, config);
    if (distance(unit, returnPoint) > refineryDropoffRange) {
      const blocked = createBlockedSet(config, sim);
      if (shouldRefreshOrderPath(sim, config, unit.order.path, blocked, false)) {
        retargetPath(sim, config, unit, returnPoint, refineryDropoffRange, 10);
      }
      moveUnitAlongPath(unit, config);
      return;
    }
    sim.players[unit.ownerId].resources += unit.cargo;
    unit.cargo = 0;
    unit.order.kind = "harvest";
    unit.order.path = [];
  }
}
function updateUnitCombat(sim, config, unit) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
  unit.cooldownRemaining = Math.max(0, unit.cooldownRemaining - 1);
  if (unit.order.kind === "attack-target" && unit.order.targetId) {
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
    const blocked = createBlockedSet(config, sim);
    if (shouldRefreshOrderPath(sim, config, unit.order.path, blocked)) {
      retargetPath(
        sim,
        config,
        unit,
        targetPosition,
        unitConfig.range,
        Math.max(10, Math.ceil(unitConfig.range) + 8)
      );
    }
    moveUnitAlongPath(unit, config);
    return;
  }
  const nearbyEnemyId = findNearestEnemyTarget(
    sim,
    config,
    unit.ownerId,
    unit,
    unitConfig.range,
    unitConfig.attackBuildings ?? true
  );
  if (nearbyEnemyId && unit.cooldownRemaining === 0) {
    applyDamage(sim, config, unitConfig, nearbyEnemyId);
    unit.cooldownRemaining = unitConfig.attackCooldown;
    return;
  }
  if (unit.order.kind === "move" || unit.order.kind === "attack-move") {
    const blocked = createBlockedSet(config, sim);
    if (unit.order.target && shouldRefreshOrderPath(sim, config, unit.order.path, blocked)) {
      retargetPath(sim, config, unit, unit.order.target);
    }
    moveUnitAlongPath(unit, config);
    if (unit.order.path.length === 0 && unit.order.kind === "move") {
      unit.order = initialUnitOrder();
    }
  }
}
function updateBuildingCombat(sim, config, building) {
  const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
  if (building.constructionRemaining > 0 || !buildingConfig.attackRange || !buildingConfig.attackDamage || !buildingConfig.attackCooldown) {
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
    true
  );
  if (targetId) {
    applyDamage(sim, config, buildingConfig, targetId);
    building.cooldownRemaining = buildingConfig.attackCooldown;
  }
}
function findEnemyThreatsNearBase(sim, playerId, baseCenter, radius) {
  const enemyId = playerId === "player" ? "enemy" : "player";
  return Object.values(sim.units).filter(
    (unit) => unit.ownerId === enemyId && distance(unit, baseCenter) <= radius
  );
}
function aiBuildStructure(state, config, playerId, buildingTypeId, anchor, searchRadius) {
  if (!canPlayerBuild(config, playerId, state.sim.players[playerId].factionId, state.sim.buildings, buildingTypeId)) {
    return false;
  }
  const bConfig = getBuildingConfig(config, state.sim.players[playerId].factionId, buildingTypeId);
  if (state.sim.players[playerId].resources < bConfig.cost) {
    return false;
  }
  const placement = findBuildSite(
    config,
    createBlockedSet(config, state.sim),
    config.map.obstacleAreas,
    bConfig.footprint,
    anchor,
    searchRadius
  );
  if (placement) {
    applyBuildCommand(state, config, {
      type: "build",
      playerId,
      buildingTypeId,
      tileX: placement.x,
      tileY: placement.y
    });
    return true;
  }
  return false;
}
function runAiTurn(state, config, playerId) {
  const player = state.sim.players[playerId];
  if (player.defeated) {
    return;
  }
  const spawn = config.map.spawns.find((entry) => entry.playerId === playerId);
  if (!spawn) {
    return;
  }
  const enemyId = playerId === "player" ? "enemy" : "player";
  const playerBuildings = getPlayerBuildings(state.sim.buildings, playerId);
  const playerUnits = getPlayerUnits(state.sim.units, playerId);
  const enemyUnits = getPlayerUnits(state.sim.units, enemyId);
  const workerCount = playerUnits.filter((u) => u.unitTypeId === "courier").length;
  const combatUnits = playerUnits.filter((u) => u.unitTypeId !== "courier");
  const readyCombatUnits = combatUnits.filter((u) => u.order.kind === "idle" || u.order.kind === "move");
  const hq = playerBuildings.find((b) => b.buildingTypeId === "command-core");
  const baseCenter = hq ? centerOfBuilding(hq, config) : spawn.hq;
  const hasRefinery = playerBuildings.some(
    (b) => b.buildingTypeId === "refinery" && b.constructionRemaining === 0
  );
  const barracks = playerBuildings.find(
    (b) => b.buildingTypeId === "barracks" && b.constructionRemaining === 0
  );
  const motorPool = playerBuildings.find(
    (b) => b.buildingTypeId === "motor-pool" && b.constructionRemaining === 0
  );
  const sentryCount = playerBuildings.filter(
    (b) => b.buildingTypeId === "sentry"
  ).length;
  const threats = findEnemyThreatsNearBase(state.sim, playerId, baseCenter, config.ai.defenseRadius);
  if (threats.length > 0) {
    const idleCombat = combatUnits.filter(
      (u) => u.order.kind === "idle" || u.order.kind === "move" && distance(u, baseCenter) < config.ai.defenseRadius * 1.5
    );
    if (idleCombat.length > 0) {
      const nearestThreat = threats.reduce(
        (best, t) => distance(t, baseCenter) < distance(best, baseCenter) ? t : best
      );
      applyAttackCommand(state.sim, config, {
        type: "attack",
        playerId,
        unitIds: idleCombat.map((u) => u.id),
        targetId: nearestThreat.id,
        target: { x: Math.round(nearestThreat.x), y: Math.round(nearestThreat.y) }
      });
    }
  }
  combatUnits.forEach((unit) => {
    const uConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    if (unit.hp / uConfig.maxHp < config.ai.retreatHpRatio && unit.order.kind !== "move") {
      unit.order = {
        kind: "move",
        target: { x: Math.round(baseCenter.x), y: Math.round(baseCenter.y) },
        path: []
      };
    }
  });
  if (!hasRefinery) {
    if (aiBuildStructure(state, config, playerId, "refinery", spawn.refinery, 6)) return;
  }
  if (hq && workerCount < Math.min(config.ai.economyTarget, config.ai.maxWorkers) && hq.queue.length < 2) {
    applyProduceCommand(state, config, {
      type: "produce",
      playerId,
      buildingId: hq.id,
      unitTypeId: "courier"
    });
  }
  if (!barracks) {
    if (aiBuildStructure(state, config, playerId, "barracks", spawn.buildAnchor, 8)) return;
  }
  if (barracks && sentryCount < 2) {
    const sentryAnchor = { x: spawn.hq.x + 2, y: spawn.hq.y - 1 };
    if (aiBuildStructure(state, config, playerId, "sentry", sentryAnchor, 8)) return;
  }
  if (!motorPool) {
    if (aiBuildStructure(state, config, playerId, "motor-pool", spawn.buildAnchor, 10)) return;
  }
  const refineryCount = playerBuildings.filter((b) => b.buildingTypeId === "refinery").length;
  if (refineryCount < 2 && player.resources >= config.ai.expandResourceThreshold) {
    const midNode = config.map.resourceNodes.find((n) => distance(n, spawn.refinery) > 6);
    if (midNode) {
      aiBuildStructure(state, config, playerId, "refinery", { x: midNode.x - 1, y: midNode.y + 1 }, 6);
    }
  }
  if (hq && workerCount < config.ai.economyTarget && hq.queue.length === 0) {
    applyProduceCommand(state, config, {
      type: "produce",
      playerId,
      buildingId: hq.id,
      unitTypeId: "courier"
    });
  }
  if (barracks && barracks.queue.length < 2) {
    const infantryCount = combatUnits.filter((u) => u.unitTypeId === "vanguard").length;
    const artilleryCount = combatUnits.filter((u) => u.unitTypeId === "ember").length;
    const wantEmber = artilleryCount * 3 < infantryCount && artilleryCount < 3;
    applyProduceCommand(state, config, {
      type: "produce",
      playerId,
      buildingId: barracks.id,
      unitTypeId: wantEmber ? "ember" : "vanguard"
    });
  }
  if (motorPool && motorPool.queue.length < 2) {
    applyProduceCommand(state, config, {
      type: "produce",
      playerId,
      buildingId: motorPool.id,
      unitTypeId: "striker"
    });
  }
  const stagingPoint = {
    x: Math.round((baseCenter.x + spawn.rally.x) / 2),
    y: Math.round((baseCenter.y + spawn.rally.y) / 2)
  };
  const pressureGroup = readyCombatUnits.filter((unit) => distance(unit, stagingPoint) > 3.5);
  if (combatUnits.length >= 2 && threats.length === 0 && pressureGroup.length > 0) {
    applyMoveCommand(state.sim, config, {
      type: "move",
      playerId,
      unitIds: pressureGroup.slice(0, 2).map((unit) => unit.id),
      target: stagingPoint
    });
  }
  const enemyBuildings = getPlayerBuildings(state.sim.buildings, enemyId);
  const enemyHQ = enemyBuildings.find((b) => getBuildingConfig(config, b.factionId, b.buildingTypeId).isHQ);
  const enemyCombatCount = enemyUnits.filter((u) => u.unitTypeId !== "courier").length;
  const reserveSize = Math.max(1, Math.floor(combatUnits.length * config.ai.reserveRatio));
  const attackForce = readyCombatUnits.sort((a, b) => {
    const aConf = getUnitConfig(config, a.factionId, a.unitTypeId);
    const bConf = getUnitConfig(config, b.factionId, b.unitTypeId);
    return b.hp / bConf.maxHp - a.hp / aConf.maxHp;
  });
  const availableForAttack = attackForce.length > reserveSize ? attackForce.slice(0, attackForce.length - reserveSize) : [];
  const shouldAttack = availableForAttack.length >= config.ai.attackThreshold && state.sim.tick - player.lastAttackTick >= config.tickRate * 5 && (availableForAttack.length >= Math.max(2, enemyCombatCount) || availableForAttack.length >= config.ai.attackThreshold + 2 || state.sim.tick >= config.tickRate * 70);
  if (shouldAttack && availableForAttack.length > 0) {
    const attackTarget = enemyBuildings.length > 0 ? enemyBuildings.reduce((best, b) => {
      const bCenter = centerOfBuilding(b, config);
      const bestCenter = centerOfBuilding(best, config);
      return distance(bCenter, baseCenter) < distance(bestCenter, baseCenter) ? b : best;
    }) : null;
    const target = attackTarget ?? enemyHQ;
    if (target) {
      const targetCenter = centerOfBuilding(target, config);
      applyAttackCommand(state.sim, config, {
        type: "attack",
        playerId,
        unitIds: availableForAttack.map((u) => u.id),
        targetId: target.id,
        target: { x: Math.round(targetCenter.x), y: Math.round(targetCenter.y) }
      });
      player.lastAttackTick = state.sim.tick;
    }
  }
}
function issueCommand(state, config, command) {
  if (state.sim.winnerId) {
    return;
  }
  switch (command.type) {
    case "move":
      applyMoveCommand(state.sim, config, command);
      break;
    case "attack":
      applyAttackCommand(state.sim, config, command);
      break;
    case "build":
      applyBuildCommand(state, config, command);
      break;
    case "produce":
      applyProduceCommand(state, config, command);
      break;
    case "select":
      state.render.selectedIds = command.selectedIds;
      break;
  }
}
function updateUnits(sim, config) {
  Object.values(sim.units).forEach((unit) => {
    if (sim.winnerId) {
      return;
    }
    updateWorkerOrder(sim, config, unit);
    updateUnitCombat(sim, config, unit);
  });
}
function stepSimulation(state, config = defaultGameConfig, steps = 1) {
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
      runAiTurn(state, config, "enemy");
    }
    checkLossCondition(state.sim, config);
  }
}
function getSelectionSummary(state) {
  const ids = new Set(state.render.selectedIds);
  return {
    units: Object.values(state.sim.units).filter((unit) => ids.has(unit.id)),
    buildings: Object.values(state.sim.buildings).filter((building) => ids.has(building.id))
  };
}
function createInitialGameState(config = defaultGameConfig) {
  idCounter = 0;
  const sim = {
    tick: 0,
    winnerId: null,
    lossReason: null,
    players: {
      player: {
        id: "player",
        factionId: "aurora",
        resources: config.factions.aurora.startResources,
        defeated: false,
        lastAttackTick: -999
      },
      enemy: {
        id: "enemy",
        factionId: "obsidian",
        resources: config.factions.obsidian.startResources,
        defeated: false,
        lastAttackTick: -999
      }
    },
    units: {},
    buildings: {},
    resources: Object.fromEntries(
      config.map.resourceNodes.map((resource) => [
        resource.id,
        {
          ...resource
        }
      ])
    )
  };
  config.map.spawns.forEach((spawn) => {
    const hq = createBuilding(spawn.playerId, spawn.factionId, "command-core", spawn.hq.x, spawn.hq.y, config);
    hq.rallyPoint = spawn.rally;
    sim.buildings[hq.id] = hq;
    const refinery = createBuilding(
      spawn.playerId,
      spawn.factionId,
      "refinery",
      spawn.refinery.x,
      spawn.refinery.y,
      config
    );
    refinery.rallyPoint = spawn.rally;
    sim.buildings[refinery.id] = refinery;
    const courierA = createUnit(
      spawn.playerId,
      spawn.factionId,
      "courier",
      spawn.refinery.x + 1.5,
      spawn.refinery.y + 2.5,
      config
    );
    const courierB = createUnit(
      spawn.playerId,
      spawn.factionId,
      "courier",
      spawn.refinery.x + 2.3,
      spawn.refinery.y + 2.3,
      config
    );
    const guard = createUnit(
      spawn.playerId,
      spawn.factionId,
      "vanguard",
      spawn.hq.x + 1.5,
      spawn.hq.y + 4.2,
      config
    );
    sim.units[courierA.id] = courierA;
    sim.units[courierB.id] = courierB;
    sim.units[guard.id] = guard;
  });
  const state = {
    sim,
    render: {
      selectedIds: [],
      commandMode: "normal",
      placementPreview: null
    }
  };
  Object.values(state.sim.units).forEach((unit) => {
    if (unit.unitTypeId === "courier") {
      assignHarvestOrder(unit, state.sim, config);
    }
  });
  return state;
}
export {
  createInitialGameState,
  getSelectionSummary,
  isBuildPlacementValid,
  issueCommand,
  stepSimulation
};
