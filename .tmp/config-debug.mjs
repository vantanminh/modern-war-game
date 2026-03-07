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
export {
  canPlayerBuild,
  canPlayerProduce,
  defaultGameConfig,
  getBuildingConfig,
  getPlayerBuildings,
  getPlayerUnits,
  getUnitConfig,
  hasCompletedBuilding
};
