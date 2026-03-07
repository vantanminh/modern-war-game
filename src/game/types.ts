export interface GridPoint {
  x: number;
  y: number;
}

export interface RectangleArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlayerId = 'player' | 'enemy';
export type FactionId = 'aurora' | 'obsidian';
export type ArmorType = 'light' | 'armored' | 'structure';
export type UnitRole = 'worker' | 'infantry' | 'vehicle' | 'artillery';
export type BuildingCategory = 'hq' | 'resource' | 'production' | 'defense';
export type CommandMode = 'normal' | 'attack-move' | 'build';
export type UnitOrderKind =
  | 'idle'
  | 'move'
  | 'attack-move'
  | 'attack-target'
  | 'harvest'
  | 'return';

export interface UnitConfig {
  id: string;
  name: string;
  role: UnitRole;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  cost: number;
  buildTime: number;
  armorType: ArmorType;
  attackCooldown: number;
  carryCapacity?: number;
  harvestRate?: number;
  attackBias?: Partial<Record<ArmorType, number>>;
  attackBuildings?: boolean;
  color: number;
}

export interface BuildingConfig {
  id: string;
  name: string;
  category: BuildingCategory;
  footprint: {
    width: number;
    height: number;
  };
  maxHp: number;
  cost: number;
  buildTime: number;
  armorType: ArmorType;
  producesUnitIds?: string[];
  attackRange?: number;
  attackDamage?: number;
  attackCooldown?: number;
  isHQ?: boolean;
  isRefinery?: boolean;
  grantsBuildIds?: string[];
  requiresBuildingIds?: string[];
  powerDelta?: number;
  color: number;
}

export interface UnitStatModifier {
  maxHp?: number;
  damage?: number;
  range?: number;
  speed?: number;
  cost?: number;
  buildTime?: number;
  attackCooldown?: number;
}

export interface BuildingStatModifier {
  maxHp?: number;
  cost?: number;
  buildTime?: number;
  attackRange?: number;
  attackDamage?: number;
  attackCooldown?: number;
}

export interface FactionConfig {
  id: FactionId;
  name: string;
  color: number;
  accent: string;
  availableUnitIds: string[];
  availableBuildingIds: string[];
  startResources: number;
  unitModifiers?: Record<string, UnitStatModifier>;
  buildingModifiers?: Record<string, BuildingStatModifier>;
}

export interface ResourceNodeConfig {
  id: string;
  x: number;
  y: number;
  amount: number;
}

export interface SpawnConfig {
  playerId: PlayerId;
  factionId: FactionId;
  hq: GridPoint;
  refinery: GridPoint;
  rally: GridPoint;
  buildAnchor: GridPoint;
}

export interface MapConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  terrainBlocked: GridPoint[];
  obstacleAreas: RectangleArea[];
  resourceNodes: ResourceNodeConfig[];
  spawns: SpawnConfig[];
}

export interface AiConfig {
  thinkInterval: number;
  attackThreshold: number;
  economyTarget: number;
}

export interface GameConfig {
  tickRate: number;
  tileSize: number;
  factions: Record<FactionId, FactionConfig>;
  units: Record<string, UnitConfig>;
  buildings: Record<string, BuildingConfig>;
  map: MapConfig;
  ai: AiConfig;
}

export interface ProductionItem {
  unitTypeId: string;
  remainingTicks: number;
}

export interface UnitOrder {
  kind: UnitOrderKind;
  target?: GridPoint;
  targetId?: string;
  path: GridPoint[];
  resourceId?: string;
  refineryId?: string;
}

export interface UnitState {
  id: string;
  ownerId: PlayerId;
  factionId: FactionId;
  unitTypeId: string;
  x: number;
  y: number;
  hp: number;
  cooldownRemaining: number;
  cargo: number;
  order: UnitOrder;
}

export interface BuildingState {
  id: string;
  ownerId: PlayerId;
  factionId: FactionId;
  buildingTypeId: string;
  tileX: number;
  tileY: number;
  hp: number;
  queue: ProductionItem[];
  rallyPoint: GridPoint;
  cooldownRemaining: number;
  constructionRemaining: number;
}

export interface ResourceNodeState {
  id: string;
  x: number;
  y: number;
  amount: number;
}

export interface PlayerState {
  id: PlayerId;
  factionId: FactionId;
  resources: number;
  defeated: boolean;
  lastAttackTick: number;
}

export interface SimulationState {
  tick: number;
  winnerId: PlayerId | null;
  lossReason: string | null;
  players: Record<PlayerId, PlayerState>;
  units: Record<string, UnitState>;
  buildings: Record<string, BuildingState>;
  resources: Record<string, ResourceNodeState>;
}

export interface PlacementPreview {
  buildingTypeId: string;
  tileX: number;
  tileY: number;
  valid: boolean;
}

export interface RenderState {
  selectedIds: string[];
  commandMode: CommandMode;
  placementPreview: PlacementPreview | null;
}

export interface GameState {
  sim: SimulationState;
  render: RenderState;
}

export interface BaseCommand {
  type: 'move' | 'attack' | 'build' | 'produce' | 'select';
}

export interface MoveCommand extends BaseCommand {
  type: 'move';
  playerId: PlayerId;
  unitIds: string[];
  target: GridPoint;
}

export interface AttackCommand extends BaseCommand {
  type: 'attack';
  playerId: PlayerId;
  unitIds: string[];
  target: GridPoint;
  targetId?: string;
}

export interface BuildCommand extends BaseCommand {
  type: 'build';
  playerId: PlayerId;
  buildingTypeId: string;
  tileX: number;
  tileY: number;
}

export interface ProduceCommand extends BaseCommand {
  type: 'produce';
  playerId: PlayerId;
  buildingId: string;
  unitTypeId: string;
}

export interface SelectCommand extends BaseCommand {
  type: 'select';
  selectedIds: string[];
}

export type Command =
  | MoveCommand
  | AttackCommand
  | BuildCommand
  | ProduceCommand
  | SelectCommand;

export interface SelectionSummary {
  units: UnitState[];
  buildings: BuildingState[];
}
