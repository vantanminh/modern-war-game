import { canPlayerBuild, canPlayerProduce, defaultGameConfig, getBuildingConfig, getPlayerBuildings, getPlayerUnits, getUnitConfig } from './config';
import { createInitialGameState, getBuildPlacementStatus, getSelectionSummary, issueCommand, stepSimulation } from './simulation';
import type {
  BuildingState,
  CommandMode,
  GameConfig,
  GameState,
  GridPoint,
  PlacementPreview,
  PlayerId,
  SelectionSummary,
  UnitState,
} from './types';

export interface HudAction {
  id: string;
  label: string;
  cost: number;
  imagePath: string | null;
  disabled: boolean;
  active: boolean;
}

export interface ArmyEntry {
  unitTypeId: string;
  name: string;
  count: number;
}

export interface QueueEntry {
  unitName: string;
  progress: number;
  remainingTicks: number;
  totalTicks: number;
}

export interface HudModel {
  resources: number;
  incomePerSecond: number;
  projectedIncomePerSecond: number;
  pendingIncome: number;
  activeWorkers: number;
  activeResourceNodes: number;
  enemyResources: number;
  tick: number;
  paused: boolean;
  winner: string | null;
  mapName: string;
  mapSizeLabel: string;
  selectionCount: number;
  modeLabel: string;
  selectionTitle: string;
  selectionDetail: string;
  selectionTarget: string | null;
  selectionCombatDetail: string | null;
  buildActions: HudAction[];
  trainActions: HudAction[];
  armyOverview: ArmyEntry[];
  enemyArmyOverview: ArmyEntry[];
  productionQueues: QueueEntry[];
  playerUnitCount: number;
  enemyUnitCount: number;
  playerBuildingCount: number;
  enemyBuildingCount: number;
}

type Listener = (state: GameState) => void;

export class BattleSession {
  readonly config: GameConfig;
  state: GameState;
  paused = false;

  private accumulator = 0;
  private listeners = new Set<Listener>();

  constructor(config: GameConfig = defaultGameConfig) {
    this.config = config;
    this.state = createInitialGameState(config);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.syncRenderState();
    this.listeners.forEach((listener) => listener(this.state));
  }

  private syncRenderState() {
    const validSelectedIds = this.state.render.selectedIds.filter(
      (id) => Boolean(this.state.sim.units[id] ?? this.state.sim.buildings[id]),
    );

    if (validSelectedIds.length !== this.state.render.selectedIds.length) {
      this.state.render.selectedIds = validSelectedIds;
    }

    const preview = this.state.render.placementPreview;
    if (preview) {
      this.state.render.placementPreview = this.computePlacementPreview(preview.buildingTypeId, {
        x: preview.tileX,
        y: preview.tileY,
      });
    }
  }

  reset() {
    this.accumulator = 0;
    this.paused = false;
    this.state = createInitialGameState(this.config);
    this.emit();
  }

  update(deltaMs: number) {
    if (this.paused || this.state.sim.winnerId) {
      return;
    }

    this.accumulator += deltaMs;
    const tickMs = 1000 / this.config.tickRate;
    let advanced = false;

    while (this.accumulator >= tickMs) {
      this.accumulator -= tickMs;
      stepSimulation(this.state, this.config, 1);
      advanced = true;
    }

    if (advanced) {
      this.emit();
    }
  }

  togglePause() {
    this.paused = !this.paused;
    this.emit();
  }

  setSelection(selectedIds: string[]) {
    this.state.render.selectedIds = [...new Set(selectedIds)];
    this.emit();
  }

  getSelection() {
    return getSelectionSummary(this.state);
  }

  startBuildPlacement(buildingTypeId: string, tile: GridPoint = { x: 0, y: 0 }) {
    const preview = this.state.render.placementPreview;
    if (this.state.render.commandMode === 'build' && preview?.buildingTypeId === buildingTypeId) {
      this.cancelModes();
      return;
    }

    this.state.render.commandMode = 'build';
    this.state.render.placementPreview = this.computePlacementPreview(buildingTypeId, tile);
    this.emit();
  }

  updatePlacementPreview(tile: GridPoint) {
    const preview = this.state.render.placementPreview;
    if (!preview) {
      return;
    }

    const nextPreview = this.computePlacementPreview(preview.buildingTypeId, tile);
    const changed =
      preview.tileX !== nextPreview.tileX ||
      preview.tileY !== nextPreview.tileY ||
      preview.valid !== nextPreview.valid;

    this.state.render.placementPreview = nextPreview;
    if (changed) {
      this.emit();
    }
  }

  private computePlacementPreview(buildingTypeId: string, tile: GridPoint): PlacementPreview {
    const placement = getBuildPlacementStatus(
      this.state,
      this.config,
      'player',
      buildingTypeId,
      tile.x,
      tile.y,
    );

    return {
      buildingTypeId,
      tileX: tile.x,
      tileY: tile.y,
      valid: placement.valid,
      reason: placement.reason,
    };
  }

  confirmPlacement() {
    const preview = this.state.render.placementPreview;
    if (!preview || !preview.valid) {
      return false;
    }

    issueCommand(this.state, this.config, {
      type: 'build',
      playerId: 'player',
      buildingTypeId: preview.buildingTypeId,
      tileX: preview.tileX,
      tileY: preview.tileY,
    });

    this.state.render.commandMode = 'normal';
    this.state.render.placementPreview = null;
    this.emit();
    return true;
  }

  armAttackMove() {
    this.state.render.commandMode = 'attack-move';
    this.state.render.placementPreview = null;
    this.emit();
  }

  cancelModes() {
    if (this.state.render.commandMode === 'normal' && !this.state.render.placementPreview) {
      if (this.state.render.selectedIds.length > 0) {
        this.state.render.selectedIds = [];
        this.emit();
      }
      return;
    }

    this.state.render.commandMode = 'normal';
    this.state.render.placementPreview = null;
    this.emit();
  }

  commandSelectedUnits(target: GridPoint, targetId?: string) {
    const selectedUnits = this.getSelection().units.filter((unit) => unit.ownerId === 'player');
    if (selectedUnits.length === 0) {
      return;
    }

    if (this.state.render.commandMode === 'attack-move' || targetId) {
      issueCommand(this.state, this.config, {
        type: 'attack',
        playerId: 'player',
        unitIds: selectedUnits.map((unit) => unit.id),
        target,
        targetId,
      });
    } else {
      issueCommand(this.state, this.config, {
        type: 'move',
        playerId: 'player',
        unitIds: selectedUnits.map((unit) => unit.id),
        target,
      });
    }

    this.state.render.commandMode = 'normal';
    this.emit();
  }

  setSelectedBuildingRally(target: GridPoint) {
    const selected = this.getSelection();
    if (selected.buildings.length !== 1 || selected.units.length > 0) {
      return;
    }

    const building = selected.buildings[0];
    if (building.ownerId !== 'player') {
      return;
    }

    building.rallyPoint = target;
    this.emit();
  }

  queueSelectedBuildingUnit(unitTypeId: string) {
    const selected = this.getSelection();
    if (selected.buildings.length !== 1 || selected.units.length > 0) {
      return;
    }

    issueCommand(this.state, this.config, {
      type: 'produce',
      playerId: 'player',
      buildingId: selected.buildings[0].id,
      unitTypeId,
    });
    this.emit();
  }

  getHudModel(): HudModel {
    const selection = this.getSelection();
    const player = this.state.sim.players.player;
    const enemy = this.state.sim.players.enemy;
    const faction = this.config.factions[player.factionId];
    const economy = buildEconomySnapshot(this.state, this.config, 'player');
    const selectedBuilding =
      selection.buildings.length === 1 && selection.units.length === 0 ? selection.buildings[0] : null;

    return {
      resources: player.resources,
      incomePerSecond: player.incomePerSecond,
      projectedIncomePerSecond: economy.projectedIncomePerSecond,
      pendingIncome: player.pendingIncome,
      activeWorkers: economy.activeWorkers,
      activeResourceNodes: Object.values(this.state.sim.resources).filter((resource) => resource.amount > 0).length,
      enemyResources: enemy.resources,
      tick: this.state.sim.tick,
      paused: this.paused,
      mapName: this.config.map.name,
      mapSizeLabel: `${this.config.map.width} x ${this.config.map.height}`,
      selectionCount: selection.units.length + selection.buildings.length,
      winner: this.state.sim.winnerId
        ? this.state.sim.winnerId === 'player'
          ? 'Victory'
          : 'Defeat'
        : null,
      modeLabel: getModeLabel(this.state.render.commandMode, this.state.render.placementPreview),
      selectionTitle: describeSelection(selection, this.config),
      selectionDetail: describeSelectionDetail(selection, this.config),
      selectionTarget: describeSelectionTarget(this.state, this.config, selection),
      selectionCombatDetail: describeSelectionCombat(this.state, this.config, selection),
      buildActions: faction.availableBuildingIds
        .filter((buildingTypeId) => buildingTypeId !== 'command-core')
        .map((buildingTypeId) => {
          const buildingConfig = getBuildingConfig(this.config, player.factionId, buildingTypeId);
          return {
            id: buildingTypeId,
            label: buildingConfig.name,
            cost: buildingConfig.cost,
            imagePath: buildingConfig.image?.path ?? null,
            disabled:
              !canPlayerBuild(this.config, 'player', player.factionId, this.state.sim.buildings, buildingTypeId) ||
              player.resources < buildingConfig.cost,
            active: this.state.render.placementPreview?.buildingTypeId === buildingTypeId,
          };
        }),
      trainActions: selectedBuilding ? getTrainActions(this.config, player.factionId, selectedBuilding, player.resources) : [],
      armyOverview: buildArmyOverview(this.state, this.config, 'player'),
      enemyArmyOverview: buildArmyOverview(this.state, this.config, 'enemy'),
      productionQueues: buildProductionQueues(this.state, this.config, 'player'),
      playerUnitCount: getPlayerUnits(this.state.sim.units, 'player').length,
      enemyUnitCount: getPlayerUnits(this.state.sim.units, 'enemy').length,
      playerBuildingCount: getPlayerBuildings(this.state.sim.buildings, 'player').length,
      enemyBuildingCount: getPlayerBuildings(this.state.sim.buildings, 'enemy').length,
    };
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centerOfBuilding(building: BuildingState, config: GameConfig) {
  const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);

  return {
    x: building.tileX + buildingConfig.footprint.width / 2,
    y: building.tileY + buildingConfig.footprint.height / 2,
  };
}

function estimateWorkerIncomePerSecond(state: GameState, config: GameConfig, unit: UnitState) {
  const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
  const carryCapacity = unitConfig.carryCapacity ?? 0;
  const harvestRate = unitConfig.harvestRate ?? 0;
  const speedPerTick = unitConfig.speed / config.tickRate;

  if (unitConfig.role !== 'worker' || carryCapacity === 0 || harvestRate === 0 || speedPerTick === 0) {
    return 0;
  }

  const refinery = unit.order.refineryId ? state.sim.buildings[unit.order.refineryId] : undefined;
  if (!refinery || refinery.constructionRemaining > 0) {
    return 0;
  }

  const refineryPoint = centerOfBuilding(refinery, config);

  if (unit.order.kind === 'return' && unit.cargo > 0) {
    const returnTicks = Math.max(1, Math.ceil(Math.max(0, distance(unit, refineryPoint) - 3.2) / speedPerTick));
    return (unit.cargo / returnTicks) * config.tickRate;
  }

  const resource = unit.order.resourceId ? state.sim.resources[unit.order.resourceId] : undefined;
  if (!resource || resource.amount <= 0) {
    return 0;
  }

  const resourcePoint = { x: Math.round(resource.x), y: Math.round(resource.y) };
  const remainingCapacity = Math.max(0, carryCapacity - unit.cargo);
  const gatherTicks = remainingCapacity === 0 ? 0 : Math.ceil(remainingCapacity / harvestRate);
  const travelToResourceTicks = Math.ceil(Math.max(0, distance(unit, resourcePoint) - 0.8) / speedPerTick);
  const travelToRefineryTicks = Math.ceil(Math.max(0, distance(resourcePoint, refineryPoint) - 3.2) / speedPerTick);
  const cycleTicks = Math.max(1, gatherTicks + travelToResourceTicks + travelToRefineryTicks);
  const deliveryAmount = Math.min(carryCapacity, unit.cargo + remainingCapacity);

  return (deliveryAmount / cycleTicks) * config.tickRate;
}

function buildEconomySnapshot(state: GameState, config: GameConfig, playerId: PlayerId) {
  const workers = getPlayerUnits(state.sim.units, playerId).filter((unit) => {
    const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    return unitConfig.role === 'worker';
  });

  const activeWorkers = workers.filter((unit) => unit.order.kind === 'harvest' || unit.order.kind === 'return' || unit.cargo > 0).length;
  const projectedIncomePerSecond = Math.round(workers.reduce(
    (sum, unit) => sum + estimateWorkerIncomePerSecond(state, config, unit),
    0,
  ));

  return {
    activeWorkers,
    projectedIncomePerSecond,
  };
}

function getModeLabel(mode: CommandMode, preview: PlacementPreview | null) {
  if (mode === 'attack-move') {
    return 'Attack-move primed. Right click to commit, Esc to cancel.';
  }

  if (mode === 'build' && preview) {
    const placementState = preview.valid ? 'ready' : 'blocked';
    const placementHint = preview.reason ? ` ${preview.reason}` : '';
    return `Placing ${preview.buildingTypeId} at ${preview.tileX},${preview.tileY} (${placementState}).${placementHint}`;
  }

  return 'Standard orders: drag to select, Shift adds, right click issues orders, Esc clears.';
}

function describeSelection(selection: SelectionSummary, config: GameConfig) {
  if (selection.units.length > 1 && selection.buildings.length === 0) {
    return `${selection.units.length} units selected`;
  }

  if (selection.units.length === 1 && selection.buildings.length === 0) {
    return getUnitConfig(config, selection.units[0].factionId, selection.units[0].unitTypeId).name;
  }

  if (selection.buildings.length === 1 && selection.units.length === 0) {
    return getBuildingConfig(config, selection.buildings[0].factionId, selection.buildings[0].buildingTypeId).name;
  }

  if (selection.units.length === 0 && selection.buildings.length === 0) {
    return 'No selection';
  }

  return `${selection.units.length} units, ${selection.buildings.length} buildings`;
}

function orderLabel(kind: string) {
  switch (kind) {
    case 'idle': return 'Idle';
    case 'move': return 'Moving';
    case 'attack-move': return 'Attack-moving';
    case 'attack-target': return 'Attacking';
    case 'harvest': return 'Harvesting';
    case 'return': return 'Returning cargo';
    default: return kind;
  }
}

function describeSelectionDetail(selection: SelectionSummary, config: GameConfig) {
  if (selection.units.length === 1 && selection.buildings.length === 0) {
    const unit = selection.units[0];
    const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    const status = orderLabel(unit.order.kind);
    const cargoInfo = unitConfig.carryCapacity ? ` | Cargo ${unit.cargo}/${unitConfig.carryCapacity}` : '';
    return `HP ${Math.max(0, Math.round(unit.hp))}/${unitConfig.maxHp} | ${status}${cargoInfo}`;
  }

  if (selection.buildings.length === 1 && selection.units.length === 0) {
    const building = selection.buildings[0];
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    const hpText = `HP ${Math.max(0, Math.round(building.hp))}/${buildingConfig.maxHp}`;

    if (building.constructionRemaining > 0) {
      const totalBuild = buildingConfig.buildTime;
      const progress = Math.round(((totalBuild - building.constructionRemaining) / totalBuild) * 100);
      return `${hpText} | Building ${progress}% (${building.constructionRemaining} ticks left)`;
    }

    if (building.queue.length > 0) {
      const first = building.queue[0];
      const uConfig = getUnitConfig(config, building.factionId, first.unitTypeId);
      const totalTicks = uConfig.buildTime;
      const progress = Math.round(((totalTicks - first.remainingTicks) / totalTicks) * 100);
      return `${hpText} | Training ${uConfig.name} ${progress}% | Queue: ${building.queue.length}`;
    }

    return `${hpText} | Queue empty`;
  }

  if (selection.units.length > 1) {
    const counts = selection.units.reduce<Record<string, number>>((accumulator, unit) => {
      accumulator[unit.unitTypeId] = (accumulator[unit.unitTypeId] ?? 0) + 1;
      return accumulator;
    }, {});

    const totalHp = selection.units.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    const totalMaxHp = selection.units.reduce((sum, u) => sum + getUnitConfig(config, u.factionId, u.unitTypeId).maxHp, 0);
    const hpPercent = Math.round((totalHp / totalMaxHp) * 100);

    const unitSummary = Object.entries(counts)
      .map(([unitTypeId, count]) => `${getUnitConfig(config, selection.units[0].factionId, unitTypeId).name} x${count}`)
      .join(', ');

    return `${unitSummary} | HP ${hpPercent}%`;
  }

  return 'Select a factory to train units or use the build column to place structures.';
}

function describeEntityName(state: GameState, config: GameConfig, entityId: string) {
  const unit = state.sim.units[entityId];
  if (unit) {
    return getUnitConfig(config, unit.factionId, unit.unitTypeId).name;
  }

  const building = state.sim.buildings[entityId];
  if (building) {
    return getBuildingConfig(config, building.factionId, building.buildingTypeId).name;
  }

  return null;
}

function describeSelectionTarget(state: GameState, config: GameConfig, selection: SelectionSummary) {
  if (selection.units.length !== 1 || selection.buildings.length > 0) {
    return null;
  }

  const unit = selection.units[0];
  if (unit.order.targetId) {
    const entityName = describeEntityName(state, config, unit.order.targetId);
    return entityName ? `Target locked: ${entityName}` : 'Target lock lost';
  }

  if ((unit.order.kind === 'move' || unit.order.kind === 'attack-move') && unit.order.target) {
    const label = unit.order.kind === 'attack-move' ? 'Attack lane' : 'Move lane';
    return `${label}: ${unit.order.target.x},${unit.order.target.y}`;
  }

  return null;
}

function describeSelectionCombat(_state: GameState, config: GameConfig, selection: SelectionSummary) {
  if (selection.units.length === 1 && selection.buildings.length === 0) {
    const unit = selection.units[0];
    const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    const cooldownLabel = unit.cooldownRemaining === 0
      ? 'Weapons ready'
      : `Reload ${unit.cooldownRemaining}/${unitConfig.attackCooldown}`;
    return `Range ${unitConfig.range.toFixed(1)} | ${cooldownLabel}`;
  }

  if (selection.units.length > 1) {
    const readyCount = selection.units.filter((unit) => unit.cooldownRemaining === 0).length;
    const attackOrders = selection.units.filter((unit) => unit.order.kind === 'attack-target').length;
    return `${readyCount}/${selection.units.length} ready | ${attackOrders} tracking targets`;
  }

  if (selection.buildings.length === 1) {
    const building = selection.buildings[0];
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    if (buildingConfig.attackRange && buildingConfig.attackCooldown) {
      const cooldownLabel = building.cooldownRemaining === 0
        ? 'Defense ready'
        : `Reload ${building.cooldownRemaining}/${buildingConfig.attackCooldown}`;
      return `Range ${buildingConfig.attackRange.toFixed(1)} | ${cooldownLabel}`;
    }
  }

  return null;
}

function buildArmyOverview(state: GameState, config: GameConfig, playerId: PlayerId): ArmyEntry[] {
  const units = getPlayerUnits(state.sim.units, playerId);
  const counts: Record<string, number> = {};

  units.forEach((unit) => {
    counts[unit.unitTypeId] = (counts[unit.unitTypeId] ?? 0) + 1;
  });

  return Object.entries(counts).map(([unitTypeId, count]) => {
    const factionId = state.sim.players[playerId].factionId;
    const uConfig = getUnitConfig(config, factionId, unitTypeId);
    return { unitTypeId, name: uConfig.name, count };
  });
}

function buildProductionQueues(state: GameState, config: GameConfig, playerId: PlayerId): QueueEntry[] {
  const buildings = getPlayerBuildings(state.sim.buildings, playerId);
  const entries: QueueEntry[] = [];
  const factionId = state.sim.players[playerId].factionId;

  buildings.forEach((building) => {
    building.queue.forEach((item, index) => {
      const uConfig = getUnitConfig(config, factionId, item.unitTypeId);
      const totalTicks = uConfig.buildTime;
      const progress = index === 0
        ? (totalTicks - item.remainingTicks) / totalTicks
        : 0;
      entries.push({
        unitName: uConfig.name,
        progress,
        remainingTicks: item.remainingTicks,
        totalTicks,
      });
    });
  });

  return entries;
}

function getTrainActions(
  config: GameConfig,
  factionId: BuildingState['factionId'],
  building: BuildingState,
  resources: number,
) {
  const buildingConfig = getBuildingConfig(config, factionId, building.buildingTypeId);

  return (buildingConfig.producesUnitIds ?? [])
    .filter((unitTypeId) => canPlayerProduce(config, factionId, building.buildingTypeId, unitTypeId))
    .map((unitTypeId) => {
      const unitConfig = getUnitConfig(config, factionId, unitTypeId);
      return {
        id: unitTypeId,
        label: unitConfig.name,
        cost: unitConfig.cost,
        imagePath: unitConfig.image?.path ?? null,
        disabled: building.constructionRemaining > 0 || resources < unitConfig.cost,
        active: false,
      };
    });
}
