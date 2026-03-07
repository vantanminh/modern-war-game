import Phaser from 'phaser';

import { getBuildingConfig, getDeclaredImageAssets, getUnitConfig } from '../config';
import type { BattleSession } from '../controller';
import type { BuildingState, GameState, GridPoint, UnitState } from '../types';

type BaseVisual = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

interface VisualBundle {
  container: Phaser.GameObjects.Container;
  base: BaseVisual;
  frame: Phaser.GameObjects.Rectangle;
  hp: Phaser.GameObjects.Rectangle;
  cooldown: Phaser.GameObjects.Rectangle;
  cooldownBg: Phaser.GameObjects.Rectangle;
  selection: Phaser.GameObjects.Rectangle;
  lastHp: number;
  flashUntil: number;
}

function isBuildingState(entity: UnitState | BuildingState): entity is BuildingState {
  return 'buildingTypeId' in entity;
}

export class BattleScene extends Phaser.Scene {
  private readonly session: BattleSession;
  private readonly visuals = new Map<string, VisualBundle>();
  private readonly resourceVisuals = new Map<string, BaseVisual>();

  private mapGraphics?: Phaser.GameObjects.Graphics;
  private selectionBox?: Phaser.GameObjects.Graphics;
  private previewGraphics?: Phaser.GameObjects.Graphics;
  private combatGraphics?: Phaser.GameObjects.Graphics;
  private rangeGraphics?: Phaser.GameObjects.Graphics;
  private dragStart?: Phaser.Math.Vector2;
  private dragCurrent?: Phaser.Math.Vector2;
  private cameraDragLast?: Phaser.Math.Vector2;
  private cursorKeys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey?: Phaser.Input.Keyboard.Key;
  private centerKey?: Phaser.Input.Keyboard.Key;
  private pauseKey?: Phaser.Input.Keyboard.Key;
  private cancelKey?: Phaser.Input.Keyboard.Key;
  private unsubscribe?: () => void;

  constructor(session: BattleSession) {
    super('battle');
    this.session = session;
  }

  preload() {
    getDeclaredImageAssets(this.session.config).forEach((asset) => {
      if (!this.textures.exists(asset.key)) {
        this.load.image(asset.key, asset.path);
      }
    });
  }

  create() {
    const worldWidth = this.session.config.map.width * this.session.config.tileSize;
    const worldHeight = this.session.config.map.height * this.session.config.tileSize;

    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    const initialFocus = this.getDefaultFocusPoint();
    this.cameras.main.centerOn(initialFocus.x, initialFocus.y);
    this.cameras.main.setZoom(1.05);
    this.input.mouse?.disableContextMenu();

    this.mapGraphics = this.add.graphics();
    this.selectionBox = this.add.graphics();
    this.previewGraphics = this.add.graphics();
    this.combatGraphics = this.add.graphics();
    this.rangeGraphics = this.add.graphics();

    this.cursorKeys = this.input.keyboard?.createCursorKeys();
    this.attackKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.centerKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.pauseKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cancelKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.drawMap();
    this.registerInput();
    this.unsubscribe = this.session.subscribe((state) => this.syncState(state));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  update(_time: number, delta: number) {
    this.handleCamera(delta);
    this.session.update(delta);

    if (this.attackKey && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.session.armAttackMove();
    }

    if (this.centerKey && Phaser.Input.Keyboard.JustDown(this.centerKey)) {
      const focus = this.getSelectionFocusPoint() ?? this.getDefaultFocusPoint();
      this.cameras.main.pan(focus.x, focus.y, 180, 'Sine.easeOut');
    }

    if (this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.session.togglePause();
    }

    if (this.cancelKey && Phaser.Input.Keyboard.JustDown(this.cancelKey)) {
      this.session.cancelModes();
    }

    this.drawSelectionBox();
  }

  private registerInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        this.cameraDragLast = new Phaser.Math.Vector2(pointer.position.x, pointer.position.y);
        return;
      }

      if (!pointer.leftButtonDown()) {
        return;
      }

      if (this.session.state.render.commandMode === 'build') {
        const tile = this.worldToTile(pointer.worldX, pointer.worldY);
        this.session.updatePlacementPreview(tile);
        this.session.confirmPlacement();
        return;
      }

      this.dragStart = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      this.dragCurrent = this.dragStart.clone();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown() && this.cameraDragLast) {
        const deltaX = pointer.position.x - this.cameraDragLast.x;
        const deltaY = pointer.position.y - this.cameraDragLast.y;
        this.cameras.main.scrollX -= deltaX / this.cameras.main.zoom;
        this.cameras.main.scrollY -= deltaY / this.cameras.main.zoom;
        this.cameraDragLast = new Phaser.Math.Vector2(pointer.position.x, pointer.position.y);
      }

      if (this.session.state.render.commandMode === 'build') {
        this.session.updatePlacementPreview(this.worldToTile(pointer.worldX, pointer.worldY));
      }

      if (this.dragStart) {
        this.dragCurrent = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonReleased()) {
        this.cameraDragLast = undefined;
      }

      if (pointer.rightButtonReleased()) {
        this.handleContextCommand(pointer);
        return;
      }

      if (!pointer.leftButtonReleased() || !this.dragStart) {
        return;
      }

      const additive = pointer.event instanceof MouseEvent && pointer.event.shiftKey;
      const end = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      if (Phaser.Math.Distance.BetweenPoints(this.dragStart, end) >= this.session.config.tileSize * 0.5) {
        this.selectInRectangle(this.dragStart, end, additive);
      } else {
        this.selectAtPoint(end, additive);
      }

      this.dragStart = undefined;
      this.dragCurrent = undefined;
    });

    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.7, 1.8);
        this.cameras.main.setZoom(zoom);
      },
    );
  }

  private handleContextCommand(pointer: Phaser.Input.Pointer) {
    if (this.session.state.render.commandMode === 'build') {
      this.session.cancelModes();
      return;
    }

    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    const hit = this.hitEntity(pointer.worldX, pointer.worldY);

    if (!this.session.getSelection().units.length) {
      this.session.setSelectedBuildingRally(tile);
      return;
    }

    if (hit && hit.ownerId !== this.session.localPlayerId) {
      this.session.commandSelectedUnits(tile, hit.id);
      return;
    }

    this.session.commandSelectedUnits(tile);
  }

  private selectAtPoint(point: Phaser.Math.Vector2, additive: boolean) {
    const hit = this.hitEntity(point.x, point.y);
    if (!hit || hit.ownerId !== this.session.localPlayerId) {
      if (!additive) {
        this.session.setSelection([]);
      }
      return;
    }

    if (!additive) {
      this.session.setSelection([hit.id]);
      return;
    }

    const selectedIds = new Set(this.session.state.render.selectedIds);
    if (selectedIds.has(hit.id)) {
      selectedIds.delete(hit.id);
    } else {
      selectedIds.add(hit.id);
    }

    this.session.setSelection([...selectedIds]);
  }

  private selectInRectangle(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2, additive: boolean) {
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);

    const selectedIds = Object.values(this.session.state.sim.units)
      .filter(
        (unit) =>
          unit.ownerId === this.session.localPlayerId &&
          unit.x * this.session.config.tileSize >= left &&
          unit.x * this.session.config.tileSize <= right &&
          unit.y * this.session.config.tileSize >= top &&
          unit.y * this.session.config.tileSize <= bottom,
      )
      .map((unit) => unit.id);

    if (!additive) {
      this.session.setSelection(selectedIds);
      return;
    }

    const mergedIds = new Set([...this.session.state.render.selectedIds, ...selectedIds]);
    this.session.setSelection([...mergedIds]);
  }

  private getDefaultFocusPoint() {
    const playerHq = Object.values(this.session.state.sim.buildings).find(
      (building) => building.ownerId === this.session.localPlayerId && building.buildingTypeId === 'command-core',
    );

    if (!playerHq) {
      return {
        x: this.session.config.tileSize * 10,
        y: this.session.config.tileSize * 20,
      };
    }

    const buildingConfig = getBuildingConfig(this.session.config, playerHq.factionId, playerHq.buildingTypeId);
    return {
      x: (playerHq.tileX + buildingConfig.footprint.width / 2 + 4) * this.session.config.tileSize,
      y: (playerHq.tileY + buildingConfig.footprint.height / 2 - 2) * this.session.config.tileSize,
    };
  }

  private getSelectionFocusPoint() {
    const selection = this.session.getSelection();
    if (selection.units.length === 0 && selection.buildings.length === 0) {
      return null;
    }

    const points = [
      ...selection.units.map((unit) => ({
        x: unit.x * this.session.config.tileSize,
        y: unit.y * this.session.config.tileSize,
      })),
      ...selection.buildings.map((building) => {
        const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
        return {
          x: (building.tileX + buildingConfig.footprint.width / 2) * this.session.config.tileSize,
          y: (building.tileY + buildingConfig.footprint.height / 2) * this.session.config.tileSize,
        };
      }),
    ];

    const total = points.reduce(
      (sum, point) => ({
        x: sum.x + point.x,
        y: sum.y + point.y,
      }),
      { x: 0, y: 0 },
    );

    return {
      x: total.x / points.length,
      y: total.y / points.length,
    };
  }

  private handleCamera(delta: number) {
    if (!this.cursorKeys) {
      return;
    }

    const velocity = (0.45 * delta) / this.cameras.main.zoom;
    if (this.cursorKeys.left.isDown) {
      this.cameras.main.scrollX -= velocity;
    }
    if (this.cursorKeys.right.isDown) {
      this.cameras.main.scrollX += velocity;
    }
    if (this.cursorKeys.up.isDown) {
      this.cameras.main.scrollY -= velocity;
    }
    if (this.cursorKeys.down.isDown) {
      this.cameras.main.scrollY += velocity;
    }
  }

  private drawMap() {
    if (!this.mapGraphics) {
      return;
    }

    const graphics = this.mapGraphics;
    const tileSize = this.session.config.tileSize;
    graphics.clear();
    graphics.fillStyle(0x141b25, 1);
    graphics.fillRect(
      0,
      0,
      this.session.config.map.width * tileSize,
      this.session.config.map.height * tileSize,
    );

    for (let y = 0; y < this.session.config.map.height; y += 1) {
      for (let x = 0; x < this.session.config.map.width; x += 1) {
        const tint = (x + y) % 2 === 0 ? 0x1a2532 : 0x18212d;
        graphics.fillStyle(tint, 1);
        graphics.fillRect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1);
      }
    }

    graphics.fillStyle(0x263341, 1);
    this.session.config.map.obstacleAreas.forEach((area) => {
      graphics.fillRect(area.x * tileSize, area.y * tileSize, area.width * tileSize, area.height * tileSize);
    });

    Object.values(this.session.state.sim.resources).forEach((resource) => {
      const node = this.createResourceVisual(resource.x * tileSize + tileSize / 2, resource.y * tileSize + tileSize / 2);
      this.resourceVisuals.set(resource.id, node);
    });
  }

  private syncState(state: GameState) {
    const tileSize = this.session.config.tileSize;
    const selected = new Set(state.render.selectedIds);

    Object.values(state.sim.buildings).forEach((building) => {
      const bundle = this.visuals.get(building.id) ?? this.createBuildingVisual(building);
      const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
      bundle.container.setPosition(
        (building.tileX + buildingConfig.footprint.width / 2) * tileSize,
        (building.tileY + buildingConfig.footprint.height / 2) * tileSize,
      );
      this.applyEntityAppearance(bundle.base, building.ownerId === this.session.localPlayerId ? 0xffffff : 0xffb0b0, building.ownerId === this.session.localPlayerId ? buildingConfig.color : 0xff6b6b, building.constructionRemaining > 0 ? 0.6 : 0.95);
      bundle.frame.setStrokeStyle(3, 0x081019, 1);
      bundle.hp.width = Math.max(
        4,
        (building.hp / buildingConfig.maxHp) * (tileSize * buildingConfig.footprint.width - 6),
      );
      bundle.selection.setVisible(selected.has(building.id));
      this.visuals.set(building.id, bundle);
    });

    Object.values(state.sim.units).forEach((unit) => {
      const bundle = this.visuals.get(unit.id) ?? this.createUnitVisual(unit);
      const unitConfig = getUnitConfig(this.session.config, unit.factionId, unit.unitTypeId);
      if (unit.hp < bundle.lastHp) {
        bundle.flashUntil = this.time.now + 140;
      }
      bundle.container.setPosition(unit.x * tileSize, unit.y * tileSize);
      this.applyEntityAppearance(bundle.base, unit.ownerId === this.session.localPlayerId ? 0xffffff : 0xffb0b0, unit.ownerId === this.session.localPlayerId ? unitConfig.color : 0xff6b6b, 0.95);
      bundle.frame.setStrokeStyle(2, bundle.flashUntil > this.time.now ? 0xfef08a : 0x081019, 1);
      bundle.hp.width = Math.max(3, (unit.hp / unitConfig.maxHp) * (tileSize * 0.8));
      const cooldownRatio = unitConfig.attackCooldown > 0
        ? 1 - unit.cooldownRemaining / unitConfig.attackCooldown
        : 1;
      const showCooldown = selected.has(unit.id) || unit.order.kind === 'attack-target' || unit.cooldownRemaining > 0;
      bundle.cooldownBg.setVisible(showCooldown);
      bundle.cooldown.setVisible(showCooldown);
      bundle.cooldown.width = Math.max(2, (tileSize * 0.8) * Phaser.Math.Clamp(cooldownRatio, 0.08, 1));
      bundle.selection.setVisible(selected.has(unit.id));
      bundle.lastHp = unit.hp;
      this.visuals.set(unit.id, bundle);
    });

    Object.entries(state.sim.resources).forEach(([resourceId, resource]) => {
      const visual = this.resourceVisuals.get(resourceId);
      if (visual) {
        visual.setAlpha(resource.amount > 0 ? Math.max(0.18, resource.amount / 2800) : 0.08);
      }
    });

    [...this.visuals.keys()].forEach((id) => {
      if (!state.sim.units[id] && !state.sim.buildings[id]) {
        this.visuals.get(id)?.container.destroy();
        this.visuals.delete(id);
      }
    });

    this.drawPlacementPreview();
    this.drawCombatOverlays();
  }

  private createUnitVisual(unit: UnitState) {
    const tileSize = this.session.config.tileSize;
    const size = tileSize * 0.58;
    const container = this.add.container(unit.x * tileSize, unit.y * tileSize);
    const selection = this.add.rectangle(0, 0, size + 8, size + 8);
    selection.setStrokeStyle(2, 0xf8fafc, 0.95);
    selection.setFillStyle(0x000000, 0);
    selection.setVisible(false);

    const base = this.createUnitBaseVisual(unit, size);
    const frame = this.add.rectangle(0, 0, size, size);
    frame.setStrokeStyle(2, 0x081019, 1);
    frame.setFillStyle(0x000000, 0);

    const hpBg = this.add.rectangle(0, -size * 0.95, size, 4, 0x111827, 0.9);
    const hp = this.add.rectangle(-size / 2, -size * 0.95, size, 4, 0x86efac, 1).setOrigin(0, 0.5);
    const cooldownBg = this.add.rectangle(0, size * 0.86, size, 3, 0x111827, 0.84);
    cooldownBg.setVisible(false);
    const cooldown = this.add.rectangle(-size / 2, size * 0.86, size, 3, 0xf59e0b, 1).setOrigin(0, 0.5);
    cooldown.setVisible(false);

    container.add([selection, base, frame, hpBg, hp, cooldownBg, cooldown]);
    const bundle = { container, base, frame, hp, cooldown, cooldownBg, selection, lastHp: unit.hp, flashUntil: 0 };
    this.visuals.set(unit.id, bundle);
    return bundle;
  }

  private createBuildingVisual(building: BuildingState) {
    const tileSize = this.session.config.tileSize;
    const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
    const width = buildingConfig.footprint.width * tileSize - 6;
    const height = buildingConfig.footprint.height * tileSize - 6;
    const container = this.add.container(
      (building.tileX + buildingConfig.footprint.width / 2) * tileSize,
      (building.tileY + buildingConfig.footprint.height / 2) * tileSize,
    );

    const selection = this.add.rectangle(0, 0, width + 10, height + 10);
    selection.setStrokeStyle(2, 0xf8fafc, 0.95);
    selection.setFillStyle(0x000000, 0);
    selection.setVisible(false);

    const base = this.createBuildingBaseVisual(building, width, height);
    const frame = this.add.rectangle(0, 0, width, height);
    frame.setStrokeStyle(3, 0x081019, 1);
    frame.setFillStyle(0x000000, 0);

    const hpBg = this.add.rectangle(0, -height / 2 - 8, width, 5, 0x111827, 0.9);
    const hp = this.add.rectangle(-width / 2, -height / 2 - 8, width, 5, 0x86efac, 1).setOrigin(0, 0.5);
    const cooldownBg = this.add.rectangle(0, height / 2 + 8, width, 3, 0x111827, 0);
    cooldownBg.setVisible(false);
    const cooldown = this.add.rectangle(-width / 2, height / 2 + 8, width, 3, 0x111827, 0).setOrigin(0, 0.5);
    cooldown.setVisible(false);

    container.add([selection, base, frame, hpBg, hp, cooldownBg, cooldown]);
    const bundle = { container, base, frame, hp, cooldown, cooldownBg, selection, lastHp: building.hp, flashUntil: 0 };
    this.visuals.set(building.id, bundle);
    return bundle;
  }

  private createUnitBaseVisual(unit: UnitState, size: number): BaseVisual {
    const unitConfig = getUnitConfig(this.session.config, unit.factionId, unit.unitTypeId);
    const image = unitConfig.image;

    if (image && this.textures.exists(image.key)) {
      const sprite = this.add.image(0, 0, image.key);
      sprite.setDisplaySize(size, size);
      return sprite;
    }

    return this.add.rectangle(0, 0, size, size, unitConfig.color);
  }

  private createBuildingBaseVisual(building: BuildingState, width: number, height: number): BaseVisual {
    const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
    const image = buildingConfig.image;

    if (image && this.textures.exists(image.key)) {
      const sprite = this.add.image(0, 0, image.key);
      sprite.setDisplaySize(width, height);
      return sprite;
    }

    return this.add.rectangle(0, 0, width, height, buildingConfig.color);
  }

  private createResourceVisual(x: number, y: number): BaseVisual {
    const image = this.session.config.resourceNodeImage;

    if (this.textures.exists(image.key)) {
      const sprite = this.add.image(x, y, image.key);
      sprite.setDisplaySize(this.session.config.tileSize * 0.95, this.session.config.tileSize * 0.95);
      return sprite;
    }

    const node = this.add.rectangle(
      x,
      y,
      this.session.config.tileSize * 0.9,
      this.session.config.tileSize * 0.9,
      0x4ade80,
    );
    node.setAngle(45);
    node.setStrokeStyle(2, 0xa7f3d0, 0.9);
    return node;
  }

  private applyEntityAppearance(base: BaseVisual, imageTint: number, fallbackColor: number, alpha: number) {
    base.setAlpha(alpha);

    if (base instanceof Phaser.GameObjects.Image) {
      base.setTint(imageTint);
      return;
    }

    base.setFillStyle(fallbackColor, alpha);
  }

  private drawCombatOverlays() {
    if (!this.combatGraphics || !this.rangeGraphics) {
      return;
    }

    const combatGraphics = this.combatGraphics;
    const rangeGraphics = this.rangeGraphics;

    combatGraphics.clear();
    rangeGraphics.clear();

    const selectedUnits = this.session.getSelection().units;
    if (selectedUnits.length === 0) {
      return;
    }

    const tileSize = this.session.config.tileSize;

    selectedUnits.slice(0, 8).forEach((unit) => {
      const unitConfig = getUnitConfig(this.session.config, unit.factionId, unit.unitTypeId);
      rangeGraphics.lineStyle(1.5, 0x93c5fd, 0.28);
      rangeGraphics.strokeCircle(
        unit.x * tileSize,
        unit.y * tileSize,
        unitConfig.range * tileSize,
      );

      if (!unit.order.targetId) {
        return;
      }

      const target = this.session.state.sim.units[unit.order.targetId] ?? this.session.state.sim.buildings[unit.order.targetId];
      if (!target) {
        return;
      }

      const targetX = isBuildingState(target)
        ? (target.tileX + getBuildingConfig(this.session.config, target.factionId, target.buildingTypeId).footprint.width / 2) * tileSize
        : target.x * tileSize;
      const targetY = isBuildingState(target)
        ? (target.tileY + getBuildingConfig(this.session.config, target.factionId, target.buildingTypeId).footprint.height / 2) * tileSize
        : target.y * tileSize;
      const ready = unit.cooldownRemaining === 0;

      combatGraphics.lineStyle(ready ? 2.4 : 1.4, ready ? 0xf97316 : 0xfbbf24, ready ? 0.92 : 0.55);
      combatGraphics.lineBetween(unit.x * tileSize, unit.y * tileSize, targetX, targetY);
      combatGraphics.lineStyle(2, ready ? 0xfb7185 : 0xfda4af, 0.85);
      combatGraphics.strokeCircle(targetX, targetY, tileSize * 0.38);
    });
  }

  private drawSelectionBox() {
    if (!this.selectionBox) {
      return;
    }

    this.selectionBox.clear();
    if (!this.dragStart || !this.dragCurrent) {
      return;
    }

    this.selectionBox.lineStyle(1.5, 0xdbeafe, 0.95);
    this.selectionBox.fillStyle(0x60a5fa, 0.12);
    this.selectionBox.fillRect(
      this.dragStart.x,
      this.dragStart.y,
      this.dragCurrent.x - this.dragStart.x,
      this.dragCurrent.y - this.dragStart.y,
    );
    this.selectionBox.strokeRect(
      this.dragStart.x,
      this.dragStart.y,
      this.dragCurrent.x - this.dragStart.x,
      this.dragCurrent.y - this.dragStart.y,
    );
  }

  private drawPlacementPreview() {
    if (!this.previewGraphics) {
      return;
    }

    this.previewGraphics.clear();
    const preview = this.session.state.render.placementPreview;
    if (!preview) {
      return;
    }

    const buildingConfig = getBuildingConfig(
      this.session.config,
      this.session.state.sim.players.player.factionId,
      preview.buildingTypeId,
    );
    const tileSize = this.session.config.tileSize;

    this.previewGraphics.lineStyle(2, preview.valid ? 0x86efac : 0xf87171, 0.95);
    this.previewGraphics.fillStyle(preview.valid ? 0x4ade80 : 0xef4444, 0.18);
    this.previewGraphics.fillRect(
      preview.tileX * tileSize,
      preview.tileY * tileSize,
      buildingConfig.footprint.width * tileSize,
      buildingConfig.footprint.height * tileSize,
    );
    this.previewGraphics.strokeRect(
      preview.tileX * tileSize,
      preview.tileY * tileSize,
      buildingConfig.footprint.width * tileSize,
      buildingConfig.footprint.height * tileSize,
    );
  }

  private hitEntity(worldX: number, worldY: number) {
    const tileSize = this.session.config.tileSize;
    const point = new Phaser.Math.Vector2(worldX, worldY);

    const buildings = [...Object.values(this.session.state.sim.buildings)].reverse();
    for (const building of buildings) {
      const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
      const left = building.tileX * tileSize;
      const top = building.tileY * tileSize;
      const right = left + buildingConfig.footprint.width * tileSize;
      const bottom = top + buildingConfig.footprint.height * tileSize;

      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
        return building;
      }
    }

    const units = [...Object.values(this.session.state.sim.units)].reverse();
    for (const unit of units) {
      if (
        Phaser.Math.Distance.Between(point.x, point.y, unit.x * tileSize, unit.y * tileSize) <=
        tileSize * 0.45
      ) {
        return unit;
      }
    }

    return null;
  }

  private worldToTile(worldX: number, worldY: number): GridPoint {
    return {
      x: Math.floor(worldX / this.session.config.tileSize),
      y: Math.floor(worldY / this.session.config.tileSize),
    };
  }
}
