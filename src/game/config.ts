import type {
  BuildingConfig,
  BuildingState,
  FactionConfig,
  FactionId,
  GameConfig,
  PlayerId,
  UnitConfig,
  UnitState,
} from './types';

const units: Record<string, UnitConfig> = {
  courier: {
    id: 'courier',
    name: 'Courier',
    role: 'worker',
    maxHp: 65,
    damage: 4,
    range: 1.1,
    speed: 3.4,
    cost: 80,
    buildTime: 16,
    armorType: 'light',
    attackCooldown: 12,
    carryCapacity: 70,
    harvestRate: 8,
    attackBuildings: false,
    color: 0xc8f36b,
  },
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    role: 'infantry',
    maxHp: 90,
    damage: 10,
    range: 3.2,
    speed: 2.25,
    cost: 110,
    buildTime: 18,
    armorType: 'light',
    attackCooldown: 10,
    attackBuildings: true,
    attackBias: {
      light: 1.1,
      armored: 0.85,
      structure: 0.75,
    },
    color: 0xe2e8f0,
  },
  striker: {
    id: 'striker',
    name: 'Striker',
    role: 'vehicle',
    maxHp: 180,
    damage: 22,
    range: 3.6,
    speed: 1.9,
    cost: 220,
    buildTime: 26,
    armorType: 'armored',
    attackCooldown: 16,
    attackBuildings: true,
    attackBias: {
      light: 1.15,
      armored: 1,
      structure: 0.9,
    },
    color: 0xffc857,
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    role: 'artillery',
    maxHp: 120,
    damage: 32,
    range: 5.2,
    speed: 1.4,
    cost: 260,
    buildTime: 32,
    armorType: 'armored',
    attackCooldown: 22,
    attackBuildings: true,
    attackBias: {
      light: 0.8,
      armored: 1.05,
      structure: 1.45,
    },
    color: 0xff7b72,
  },
};

const buildings: Record<string, BuildingConfig> = {
  'command-core': {
    id: 'command-core',
    name: 'Command Core',
    category: 'hq',
    footprint: { width: 3, height: 3 },
    maxHp: 900,
    cost: 0,
    buildTime: 0,
    armorType: 'structure',
    producesUnitIds: ['courier'],
    isHQ: true,
    grantsBuildIds: ['refinery', 'barracks', 'sentry'],
    color: 0x2563eb,
  },
  refinery: {
    id: 'refinery',
    name: 'Refinery',
    category: 'resource',
    footprint: { width: 3, height: 2 },
    maxHp: 500,
    cost: 180,
    buildTime: 26,
    armorType: 'structure',
    isRefinery: true,
    grantsBuildIds: ['motor-pool'],
    requiresBuildingIds: ['command-core'],
    color: 0x22c55e,
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    category: 'production',
    footprint: { width: 3, height: 2 },
    maxHp: 420,
    cost: 200,
    buildTime: 28,
    armorType: 'structure',
    producesUnitIds: ['vanguard', 'ember'],
    requiresBuildingIds: ['command-core'],
    color: 0xf97316,
  },
  'motor-pool': {
    id: 'motor-pool',
    name: 'Motor Pool',
    category: 'production',
    footprint: { width: 3, height: 3 },
    maxHp: 550,
    cost: 260,
    buildTime: 34,
    armorType: 'structure',
    producesUnitIds: ['striker'],
    requiresBuildingIds: ['refinery'],
    color: 0xefb100,
  },
  sentry: {
    id: 'sentry',
    name: 'Sentry Grid',
    category: 'defense',
    footprint: { width: 2, height: 2 },
    maxHp: 360,
    cost: 160,
    buildTime: 24,
    armorType: 'structure',
    attackRange: 4.4,
    attackDamage: 18,
    attackCooldown: 14,
    requiresBuildingIds: ['barracks'],
    color: 0x8b5cf6,
  },
};

const factions: Record<FactionId, FactionConfig> = {
  aurora: {
    id: 'aurora',
    name: 'Aurora Combine',
    color: 0x58a6ff,
    accent: '#58a6ff',
    availableUnitIds: ['courier', 'vanguard', 'striker', 'ember'],
    availableBuildingIds: ['command-core', 'refinery', 'barracks', 'motor-pool', 'sentry'],
    startResources: 520,
    unitModifiers: {
      courier: { speed: 0.2 },
      vanguard: { range: 0.2 },
    },
    buildingModifiers: {
      sentry: { attackRange: 0.25 },
    },
  },
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Front',
    color: 0xff6b6b,
    accent: '#ff6b6b',
    availableUnitIds: ['courier', 'vanguard', 'striker', 'ember'],
    availableBuildingIds: ['command-core', 'refinery', 'barracks', 'motor-pool', 'sentry'],
    startResources: 520,
    unitModifiers: {
      striker: { damage: 3 },
      ember: { buildTime: -2 },
    },
    buildingModifiers: {
      barracks: { maxHp: 30 },
    },
  },
};

function createBlockedFromAreas(
  width: number,
  height: number,
  areas: { x: number; y: number; width: number; height: number }[],
) {
  const blocked: { x: number; y: number }[] = [];

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

const obstacleAreas = [
  { x: 18, y: 0, width: 3, height: 10 },
  { x: 18, y: 13, width: 3, height: 15 },
  { x: 9, y: 11, width: 4, height: 3 },
  { x: 27, y: 14, width: 4, height: 3 },
];

export const defaultGameConfig: GameConfig = {
  tickRate: 10,
  tileSize: 28,
  factions,
  units,
  buildings,
  map: {
    id: 'red-scar',
    name: 'Red Scar Crossing',
    width: 40,
    height: 28,
    obstacleAreas,
    terrainBlocked: createBlockedFromAreas(40, 28, obstacleAreas),
    resourceNodes: [
      { id: 'ore-west', x: 8, y: 6, amount: 2800 },
      { id: 'ore-east', x: 31, y: 21, amount: 2800 },
      { id: 'ore-mid', x: 20, y: 11, amount: 1600 },
    ],
    spawns: [
      {
        playerId: 'player',
        factionId: 'aurora',
        hq: { x: 3, y: 20 },
        refinery: { x: 6, y: 18 },
        rally: { x: 11, y: 18 },
        buildAnchor: { x: 10, y: 20 },
      },
      {
        playerId: 'enemy',
        factionId: 'obsidian',
        hq: { x: 34, y: 4 },
        refinery: { x: 31, y: 7 },
        rally: { x: 27, y: 9 },
        buildAnchor: { x: 27, y: 6 },
      },
    ],
  },
  ai: {
    thinkInterval: 10,
    attackThreshold: 4,
    economyTarget: 4,
    defenseRadius: 8,
    reserveRatio: 0.3,
    retreatHpRatio: 0.25,
    maxWorkers: 7,
    expandResourceThreshold: 1200,
  },
};

export function getUnitConfig(
  config: GameConfig,
  factionId: FactionId,
  unitTypeId: string,
): UnitConfig {
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
    attackCooldown: Math.max(1, base.attackCooldown + (modifier?.attackCooldown ?? 0)),
  };
}

export function getBuildingConfig(
  config: GameConfig,
  factionId: FactionId,
  buildingTypeId: string,
): BuildingConfig {
  const base = config.buildings[buildingTypeId];
  const modifier = config.factions[factionId].buildingModifiers?.[buildingTypeId];

  return {
    ...base,
    maxHp: base.maxHp + (modifier?.maxHp ?? 0),
    cost: base.cost + (modifier?.cost ?? 0),
    buildTime: Math.max(0, base.buildTime + (modifier?.buildTime ?? 0)),
    attackRange: (base.attackRange ?? 0) + (modifier?.attackRange ?? 0),
    attackDamage: (base.attackDamage ?? 0) + (modifier?.attackDamage ?? 0),
    attackCooldown: base.attackCooldown
      ? Math.max(1, base.attackCooldown + (modifier?.attackCooldown ?? 0))
      : undefined,
  };
}

export function getPlayerBuildings(
  buildingsState: Record<string, BuildingState>,
  playerId: PlayerId,
) {
  return Object.values(buildingsState).filter((building) => building.ownerId === playerId);
}

export function getPlayerUnits(unitsState: Record<string, UnitState>, playerId: PlayerId) {
  return Object.values(unitsState).filter((unit) => unit.ownerId === playerId);
}

export function hasCompletedBuilding(
  buildingsState: Record<string, BuildingState>,
  playerId: PlayerId,
  buildingTypeId: string,
) {
  return getPlayerBuildings(buildingsState, playerId).some(
    (building) => building.buildingTypeId === buildingTypeId && building.constructionRemaining === 0,
  );
}

export function canPlayerBuild(
  config: GameConfig,
  playerId: PlayerId,
  factionId: FactionId,
  buildingsState: Record<string, BuildingState>,
  buildingTypeId: string,
) {
  const faction = config.factions[factionId];
  const buildingConfig = getBuildingConfig(config, factionId, buildingTypeId);

  if (!faction.availableBuildingIds.includes(buildingTypeId)) {
    return false;
  }

  return (buildingConfig.requiresBuildingIds ?? []).every((requiredId) =>
    hasCompletedBuilding(buildingsState, playerId, requiredId),
  );
}

export function canPlayerProduce(
  config: GameConfig,
  factionId: FactionId,
  buildingTypeId: string,
  unitTypeId: string,
) {
  const faction = config.factions[factionId];
  const buildingConfig = getBuildingConfig(config, factionId, buildingTypeId);

  return (
    faction.availableUnitIds.includes(unitTypeId) &&
    Boolean(buildingConfig.producesUnitIds?.includes(unitTypeId))
  );
}
