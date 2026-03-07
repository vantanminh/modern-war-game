import { canPlayerBuild, canPlayerProduce, defaultGameConfig, getBuildingConfig, getUnitConfig } from './config';
import { createInitialGameState, getSelectionSummary, isBuildPlacementValid, issueCommand, stepSimulation } from './simulation';
import type {
  BuildingState,
  CommandMode,
  GameConfig,
  GameState,
  GridPoint,
  PlacementPreview,
  SelectionSummary,
} from './types';

export interface HudAction {
  id: string;
  label: string;
  cost: number;
  disabled: boolean;
  active: boolean;
}

export interface HudModel {
  resources: number;
  tick: number;
  paused: boolean;
  winner: string | null;
  modeLabel: string;
  selectionTitle: string;
  selectionDetail: string;
  buildActions: HudAction[];
  trainActions: HudAction[];
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
    this.listeners.forEach((listener) => listener(this.state));
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
    this.state.render.selectedIds = selectedIds;
    this.emit();
  }

  getSelection() {
    return getSelectionSummary(this.state);
  }

  startBuildPlacement(buildingTypeId: string, tile: GridPoint = { x: 0, y: 0 }) {
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
    return {
      buildingTypeId,
      tileX: tile.x,
      tileY: tile.y,
      valid: isBuildPlacementValid(this.state, this.config, 'player', buildingTypeId, tile.x, tile.y),
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
    const faction = this.config.factions[player.factionId];
    const selectedBuilding =
      selection.buildings.length === 1 && selection.units.length === 0 ? selection.buildings[0] : null;

    return {
      resources: player.resources,
      tick: this.state.sim.tick,
      paused: this.paused,
      winner: this.state.sim.winnerId
        ? this.state.sim.winnerId === 'player'
          ? 'Victory'
          : 'Defeat'
        : null,
      modeLabel: getModeLabel(this.state.render.commandMode, this.state.render.placementPreview),
      selectionTitle: describeSelection(selection, this.config),
      selectionDetail: describeSelectionDetail(selection, this.config),
      buildActions: faction.availableBuildingIds
        .filter((buildingTypeId) => buildingTypeId !== 'command-core')
        .map((buildingTypeId) => {
          const buildingConfig = getBuildingConfig(this.config, player.factionId, buildingTypeId);
          return {
            id: buildingTypeId,
            label: buildingConfig.name,
            cost: buildingConfig.cost,
            disabled:
              !canPlayerBuild(this.config, 'player', player.factionId, this.state.sim.buildings, buildingTypeId) ||
              player.resources < buildingConfig.cost,
            active: this.state.render.placementPreview?.buildingTypeId === buildingTypeId,
          };
        }),
      trainActions: selectedBuilding ? getTrainActions(this.config, player.factionId, selectedBuilding, player.resources) : [],
    };
  }
}

function getModeLabel(mode: CommandMode, preview: PlacementPreview | null) {
  if (mode === 'attack-move') {
    return 'Attack-move armed: right click to issue.';
  }

  if (mode === 'build' && preview) {
    return `Placing ${preview.buildingTypeId} at ${preview.tileX},${preview.tileY}`;
  }

  return 'Standard orders: left drag to select, right click to move or attack.';
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

function describeSelectionDetail(selection: SelectionSummary, config: GameConfig) {
  if (selection.units.length === 1 && selection.buildings.length === 0) {
    const unit = selection.units[0];
    const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    return `HP ${Math.max(0, Math.round(unit.hp))}/${unitConfig.maxHp} • cargo ${unit.cargo}`;
  }

  if (selection.buildings.length === 1 && selection.units.length === 0) {
    const building = selection.buildings[0];
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    return `HP ${Math.max(0, Math.round(building.hp))}/${buildingConfig.maxHp} • queue ${building.queue.length}`;
  }

  if (selection.units.length > 1) {
    const counts = selection.units.reduce<Record<string, number>>((accumulator, unit) => {
      accumulator[unit.unitTypeId] = (accumulator[unit.unitTypeId] ?? 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([unitTypeId, count]) => `${getUnitConfig(config, selection.units[0].factionId, unitTypeId).name} x${count}`)
      .join(' • ');
  }

  return 'Select a factory to train units or use the build column to place structures.';
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
        disabled: building.constructionRemaining > 0 || resources < unitConfig.cost,
        active: false,
      };
    });
}
