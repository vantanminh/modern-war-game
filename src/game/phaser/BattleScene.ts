import Phaser from 'phaser';

import {
  drawCargoTexture,
  drawCrystalTexture,
  drawGlowTexture,
  drawScorchTexture,
  drawShadowTexture,
  drawSmokeTexture,
} from '../art/effects';
import { teamColorNumber } from '../art/palette';
import { getBuildingSprites, getUnitSprites } from '../art/sprites';
import { BUILDING_PAD } from '../art/buildings';
import { renderTerrain } from '../art/terrain';
import { UNIT_DISPLAY_SCALE } from '../art/units';
import { getBuildingConfig, getPlayerSlot, getUnitConfig } from '../config';
import type { BattleSession } from '../controller';
import type { BuildingState, FactionId, GameState, GridPoint, UnitState } from '../types';
import { FxSystem, type ProjectileKind } from './fx';
import { Minimap } from './minimap';

export interface SceneNotice {
  text: string;
  kind: 'info' | 'success' | 'warning' | 'danger';
}

export interface BattleSceneHooks {
  minimapCanvas?: HTMLCanvasElement | null;
  notify?: (notice: SceneNotice) => void;
}

type Entity = UnitState | BuildingState;

interface EntityVisual {
  id: string;
  isBuilding: boolean;
  typeId: string;
  ownerId: string;
  factionId: FactionId;
  slot: number;
  root: Phaser.GameObjects.Container;
  shadow?: Phaser.GameObjects.Image;
  rot?: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  turret?: Phaser.GameObjects.Image;
  top?: Phaser.GameObjects.Image;
  cargo?: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  x: number;
  y: number;
  tx: number;
  ty: number;
  heading: number;
  aim: number;
  aimUntil: number;
  recoil: number;
  /** Half extents in px used for bars and selection art. */
  halfW: number;
  halfH: number;
  maxHp: number;
  hp: number;
  hpRatio: number;
  lastCooldown: number;
  lastCargo: number;
  lastConstruction: number;
  hitUntil: number;
  flashing: boolean;
  fxTimer: number;
  moving: boolean;
  pop: number;
}

const UNIT_DEPTH = 10;
const HIT_FLASH_MS = 90;
const WEAPON_BY_UNIT: Record<string, ProjectileKind> = {
  courier: 'bullet',
  vanguard: 'bullet',
  striker: 'shell',
  ember: 'artillery',
};

function isBuildingState(entity: Entity): entity is BuildingState {
  return 'buildingTypeId' in entity;
}

function angleDiff(a: number, b: number) {
  return Phaser.Math.Angle.Wrap(a - b);
}

function turnToward(current: number, target: number, amount: number) {
  return current + angleDiff(target, current) * amount;
}

export class BattleScene extends Phaser.Scene {
  private readonly session: BattleSession;
  private readonly hooks: BattleSceneHooks;
  private readonly visuals = new Map<string, EntityVisual>();
  private readonly resourceVisuals = new Map<string, { crystal: Phaser.GameObjects.Image; glint: Phaser.GameObjects.Image; base: number; max: number }>();
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly controlGroups = new Map<string, string[]>();

  private fx!: FxSystem;
  private minimap: Minimap | null = null;
  private terrainCanvas!: HTMLCanvasElement;
  private ringLayer!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private selectionBox!: Phaser.GameObjects.Graphics;
  private ghost?: Phaser.GameObjects.Image;
  private ghostKey = '';
  private placementLabel?: Phaser.GameObjects.Text;

  private dragStart?: Phaser.Math.Vector2;
  private dragCurrent?: Phaser.Math.Vector2;
  private cameraDragLast?: Phaser.Math.Vector2;
  private hoveredId: string | null = null;
  /** Edge scrolling must ignore the default (0,0) pointer until the mouse has really been over the canvas. */
  private pointerInside = false;
  private cursor = 'default';
  private cursorKeys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey?: Phaser.Input.Keyboard.Key;
  private centerKey?: Phaser.Input.Keyboard.Key;
  private pauseKey?: Phaser.Input.Keyboard.Key;
  private cancelKey?: Phaser.Input.Keyboard.Key;
  private unsubscribe?: () => void;

  private initialized = false;
  /** The canvas settles to its final size a moment after create(); keep the opening view on the player's base until then. */
  private initialFocusUntil = 1200;
  private lastMinimapDraw = 0;
  private lastAttackAlert = -100000;
  private lastClick = { id: '', time: 0 };
  private lastGroupRecall = { key: '', time: 0 };
  private knownLocalUnits = new Set<string>();

  constructor(session: BattleSession, hooks: BattleSceneHooks = {}) {
    super('battle');
    this.session = session;
    this.hooks = hooks;
  }

  // ─── lifecycle ────────────────────────────────────────────

  create() {
    const config = this.session.config;
    const worldWidth = config.map.width * config.tileSize;
    const worldHeight = config.map.height * config.tileSize;

    this.registerCommonTextures();
    this.terrainCanvas = renderTerrain(config);
    this.textures.addCanvas('terrain', this.terrainCanvas);
    this.add.image(0, 0, 'terrain').setOrigin(0, 0).setDisplaySize(worldWidth, worldHeight).setDepth(0);

    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBackgroundColor('#0a1118');
    this.input.mouse?.disableContextMenu();

    this.createResourceVisuals();
    this.ringLayer = this.add.graphics().setDepth(UNIT_DEPTH - 1);
    this.overlay = this.add.graphics().setDepth(40);
    this.selectionBox = this.add.graphics().setDepth(45);
    this.fx = new FxSystem(this);

    if (this.hooks.minimapCanvas) {
      this.minimap = new Minimap(this.hooks.minimapCanvas, config, this.terrainCanvas, {
        onNavigate: (x, y) => this.cameras.main.centerOn(x, y),
        onCommand: (x, y) => this.commandAtWorld(x, y),
      });
    }

    this.cursorKeys = this.input.keyboard?.createCursorKeys();
    this.attackKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.centerKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.pauseKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cancelKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.handleGroupKey(event));

    this.registerInput();

    this.scale.on('resize', () => {
      this.applyZoom(this.cameras.main.zoom);
      this.focusStartingBase();
    });
    this.applyZoom(1.15);
    this.focusStartingBase();

    this.unsubscribe = this.session.subscribe((state) => this.syncState(state));
    this.initialized = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.minimap?.destroy();
      this.fx.destroy();
    });
  }

  update(_time: number, delta: number) {
    if (this.time.now > this.initialFocusUntil) {
      this.initialFocusUntil = 0;
    }
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

    this.updateVisuals(delta);
    this.fx.update(delta);
    this.drawOverlays();
    this.updateCursor();

    if (this.minimap && this.time.now - this.lastMinimapDraw > 90) {
      this.lastMinimapDraw = this.time.now;
      const view = this.cameras.main.worldView;
      this.minimap.render(
        this.session.state,
        { x: view.x, y: view.y, width: view.width, height: view.height },
        this.session.localPlayerId,
      );
    }
  }

  // ─── textures ─────────────────────────────────────────────

  private registerCommonTextures() {
    this.textures.addCanvas('fx:glow', drawGlowTexture());
    this.textures.addCanvas('fx:smoke', drawSmokeTexture());
    this.textures.addCanvas('fx:shadow', drawShadowTexture());
    this.textures.addCanvas('fx:scorch', drawScorchTexture());
    this.textures.addCanvas('fx:cargo', drawCargoTexture());
    for (let i = 0; i < 3; i += 1) {
      this.textures.addCanvas(`ore:${i}`, drawCrystalTexture(i));
    }
  }

  private unitTextureKeys(unitTypeId: string, factionId: FactionId, slot: number) {
    const bodyKey = `unit:${unitTypeId}:${factionId}:${slot}`;
    const turretKey = `${bodyKey}:turret`;
    if (!this.textures.exists(bodyKey)) {
      const sprites = getUnitSprites(unitTypeId, factionId, slot);
      this.textures.addCanvas(bodyKey, sprites.body);
      if (sprites.turret) {
        this.textures.addCanvas(turretKey, sprites.turret);
      }
    }
    return { bodyKey, turretKey: this.textures.exists(turretKey) ? turretKey : null };
  }

  private buildingTextureKeys(buildingTypeId: string, factionId: FactionId, slot: number) {
    const bodyKey = `building:${buildingTypeId}:${factionId}:${slot}`;
    const topKey = `${bodyKey}:top`;
    const footprint = this.session.config.buildings[buildingTypeId].footprint;
    const sprites = getBuildingSprites(buildingTypeId, footprint, factionId, slot);
    if (!this.textures.exists(bodyKey)) {
      this.textures.addCanvas(bodyKey, sprites.body);
      if (sprites.top) {
        this.textures.addCanvas(topKey, sprites.top);
      }
    }
    return { bodyKey, topKey: sprites.top ? topKey : null, sprites };
  }

  // ─── entities ─────────────────────────────────────────────

  private createResourceVisuals() {
    const tile = this.session.config.tileSize;
    Object.values(this.session.state.sim.resources).forEach((resource, index) => {
      const cx = (resource.x + 0.5) * tile;
      const cy = (resource.y + 0.5) * tile;
      const base = (tile * 2.1) / 128;
      const crystal = this.add.image(cx, cy - tile * 0.1, `ore:${index % 3}`).setDepth(2).setScale(base);
      const glint = this.add
        .image(cx, cy, 'fx:glow')
        .setDepth(2.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x5cffb0)
        .setScale((tile * 3) / 64)
        .setAlpha(0.3);
      this.resourceVisuals.set(resource.id, { crystal, glint, base, max: Math.max(1, resource.amount) });
    });
  }

  private createUnitVisual(unit: UnitState): EntityVisual {
    const tile = this.session.config.tileSize;
    const slot = getPlayerSlot(this.session.config, unit.ownerId);
    const { bodyKey, turretKey } = this.unitTextureKeys(unit.unitTypeId, unit.factionId, slot);
    const size = tile * (UNIT_DISPLAY_SCALE[unit.unitTypeId] ?? 1);
    const unitConfig = getUnitConfig(this.session.config, unit.factionId, unit.unitTypeId);

    const root = this.add.container(unit.x * tile, unit.y * tile).setDepth(UNIT_DEPTH);
    const shadow = this.add.image(size * 0.06, size * 0.1, 'fx:shadow').setDisplaySize(size * 1.15, size * 0.85).setAlpha(0.8);
    const rot = this.add.container(0, 0);
    const body = this.add.image(0, 0, bodyKey).setDisplaySize(size, size);
    rot.add(body);
    let turret: Phaser.GameObjects.Image | undefined;
    if (turretKey) {
      turret = this.add.image(0, 0, turretKey).setDisplaySize(size, size);
      rot.add(turret);
    }
    let cargo: Phaser.GameObjects.Image | undefined;
    if (unitConfig.role === 'worker') {
      cargo = this.add.image(-size * 0.2, 0, 'fx:cargo').setDisplaySize(size * 0.44, size * 0.27).setVisible(false);
      rot.add(cargo);
    }
    root.add([shadow, rot]);

    const visual: EntityVisual = {
      id: unit.id,
      isBuilding: false,
      typeId: unit.unitTypeId,
      ownerId: unit.ownerId,
      factionId: unit.factionId,
      slot,
      root,
      shadow,
      rot,
      body,
      turret,
      cargo,
      x: unit.x * tile,
      y: unit.y * tile,
      tx: unit.x * tile,
      ty: unit.y * tile,
      heading: unit.ownerId === this.session.localPlayerId ? -Math.PI / 4 : Math.PI * 0.75,
      aim: 0,
      aimUntil: 0,
      recoil: 0,
      halfW: size * 0.42,
      halfH: size * 0.42,
      maxHp: unitConfig.maxHp,
      hp: unit.hp,
      hpRatio: 1,
      lastCooldown: unit.cooldownRemaining,
      lastCargo: unit.cargo,
      lastConstruction: 0,
      hitUntil: 0,
      flashing: false,
      fxTimer: 0,
      moving: false,
      pop: 0,
    };
    visual.aim = visual.heading;
    rot.setRotation(visual.heading);
    this.visuals.set(unit.id, visual);
    return visual;
  }

  private createBuildingVisual(building: BuildingState): EntityVisual {
    const config = this.session.config;
    const tile = config.tileSize;
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    const slot = getPlayerSlot(config, building.ownerId);
    const { bodyKey, topKey, sprites } = this.buildingTextureKeys(building.buildingTypeId, building.factionId, slot);
    const fw = buildingConfig.footprint.width * tile;
    const fh = buildingConfig.footprint.height * tile;
    const scale = tile / 80;
    const pad = BUILDING_PAD * scale;

    const root = this.add
      .container((building.tileX + buildingConfig.footprint.width / 2) * tile, (building.tileY + buildingConfig.footprint.height / 2) * tile)
      .setDepth(5);
    const body = this.add.image(0, 0, bodyKey).setDisplaySize(fw + pad * 2, fh + pad * 2);
    root.add(body);
    let top: Phaser.GameObjects.Image | undefined;
    if (topKey) {
      top = this.add
        .image(sprites.topOffset.x * scale, sprites.topOffset.y * scale, topKey)
        .setDisplaySize(sprites.top!.width * scale, sprites.top!.height * scale);
      root.add(top);
    }
    const glow = this.add
      .image(sprites.glowOffset.x * scale, sprites.glowOffset.y * scale, 'fx:glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(teamColorNumber(slot))
      .setDisplaySize(sprites.glowSize * scale * 1.6, sprites.glowSize * scale * 1.6)
      .setAlpha(0);
    root.add(glow);

    const visual: EntityVisual = {
      id: building.id,
      isBuilding: true,
      typeId: building.buildingTypeId,
      ownerId: building.ownerId,
      factionId: building.factionId,
      slot,
      root,
      body,
      top,
      glow,
      x: root.x,
      y: root.y,
      tx: root.x,
      ty: root.y,
      heading: 0,
      aim: -Math.PI / 2 + (building.ownerId === this.session.localPlayerId ? 0.6 : 2.5),
      aimUntil: 0,
      recoil: 0,
      halfW: fw / 2,
      halfH: fh / 2,
      maxHp: buildingConfig.maxHp,
      hp: building.hp,
      hpRatio: 1,
      lastCooldown: building.cooldownRemaining,
      lastCargo: 0,
      lastConstruction: building.constructionRemaining,
      hitUntil: 0,
      flashing: false,
      fxTimer: 0,
      moving: false,
      pop: 0,
    };
    this.visuals.set(building.id, visual);
    return visual;
  }

  // ─── state sync (runs whenever the session emits) ─────────

  private syncState(state: GameState) {
    const config = this.session.config;
    const tile = config.tileSize;
    const local = this.session.localPlayerId;
    const seen = new Set<string>();

    Object.values(state.sim.buildings).forEach((building) => {
      seen.add(building.id);
      const isNew = !this.visuals.has(building.id);
      const visual = this.visuals.get(building.id) ?? this.createBuildingVisual(building);
      const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);

      if (isNew && this.initialized && building.ownerId === local) {
        this.fx.ring(visual.x, visual.y, teamColorNumber(visual.slot), tile * 2.2, 800);
      }

      if (this.initialized && !isNew && building.hp < visual.hp) {
        visual.hitUntil = this.time.now + HIT_FLASH_MS;
        this.noteDamage(building.ownerId, visual.x, visual.y);
      }
      if (visual.lastConstruction > 0 && building.constructionRemaining === 0 && !isNew) {
        visual.pop = 1;
        this.fx.ring(visual.x, visual.y, 0xffffff, Math.max(visual.halfW, visual.halfH) * 1.3, 700);
        if (building.ownerId === local) {
          this.notify(`${buildingConfig.name} completed`, 'success');
        }
      }
      visual.lastConstruction = building.constructionRemaining;

      if (building.cooldownRemaining > visual.lastCooldown) {
        this.buildingFired(building, visual);
      }
      visual.lastCooldown = building.cooldownRemaining;
      visual.hp = building.hp;
      visual.maxHp = buildingConfig.maxHp;
      visual.hpRatio = Phaser.Math.Clamp(building.hp / buildingConfig.maxHp, 0, 1);
    });

    Object.values(state.sim.units).forEach((unit) => {
      seen.add(unit.id);
      const isNew = !this.visuals.has(unit.id);
      const visual = this.visuals.get(unit.id) ?? this.createUnitVisual(unit);
      visual.tx = unit.x * tile;
      visual.ty = unit.y * tile;

      if (isNew && this.initialized && unit.ownerId === local && !this.knownLocalUnits.has(unit.id)) {
        const name = getUnitConfig(config, unit.factionId, unit.unitTypeId).name;
        this.notify(`${name} ready`, 'info');
        this.fx.ring(visual.x, visual.y, teamColorNumber(visual.slot), tile * 0.9, 500);
      }
      if (unit.ownerId === local) {
        this.knownLocalUnits.add(unit.id);
      }

      if (this.initialized && !isNew && unit.hp < visual.hp) {
        visual.hitUntil = this.time.now + HIT_FLASH_MS;
        this.noteDamage(unit.ownerId, visual.x, visual.y);
      }
      if (unit.cooldownRemaining > visual.lastCooldown) {
        this.unitFired(unit, visual);
      }
      visual.lastCooldown = unit.cooldownRemaining;
      visual.hp = unit.hp;
      visual.hpRatio = Phaser.Math.Clamp(unit.hp / visual.maxHp, 0, 1);

      if (visual.cargo) {
        visual.cargo.setVisible(unit.cargo > 0);
        visual.cargo.setAlpha(0.45 + Math.min(1, unit.cargo / 70) * 0.55);
      }
      if (unit.cargo > visual.lastCargo) {
        this.fx.sparkle(visual.x, visual.y - 4);
      }
      visual.lastCargo = unit.cargo;
    });

    [...this.visuals.keys()].forEach((id) => {
      if (!seen.has(id)) {
        this.destroyVisual(id);
      }
    });

    Object.entries(state.sim.resources).forEach(([id, resource]) => {
      const node = this.resourceVisuals.get(id);
      if (!node) {
        return;
      }
      const ratio = Phaser.Math.Clamp(resource.amount / node.max, 0, 1);
      node.crystal.setScale(node.base * (resource.amount > 0 ? 0.55 + 0.5 * ratio : 0.5));
      node.crystal.setAlpha(resource.amount > 0 ? 1 : 0.22);
      node.glint.setVisible(resource.amount > 0);
    });
  }

  private noteDamage(ownerId: string, x: number, y: number) {
    if (ownerId !== this.session.localPlayerId) {
      return;
    }
    if (this.time.now - this.lastAttackAlert > 9000) {
      this.lastAttackAlert = this.time.now;
      this.notify('Your forces are under attack!', 'danger');
      this.minimap?.ping(x, y, '#ff5147');
    }
  }

  private notify(text: string, kind: SceneNotice['kind']) {
    this.hooks.notify?.({ text, kind });
  }

  private destroyVisual(id: string) {
    const visual = this.visuals.get(id);
    if (!visual) {
      return;
    }
    if (visual.isBuilding) {
      const spread = Math.max(visual.halfW, visual.halfH) * 0.7;
      for (let i = 0; i < 5; i += 1) {
        this.time.delayedCall(i * 130, () => {
          this.fx.explosion(visual.x + Phaser.Math.Between(-spread, spread), visual.y + Phaser.Math.Between(-spread, spread), 1.4);
        });
      }
      this.addDecal(visual.x, visual.y, (Math.max(visual.halfW, visual.halfH) * 2.6) / 96, 0.8);
      this.cameras.main.shake(260, 0.004);
    } else {
      const heavy = visual.typeId === 'striker' || visual.typeId === 'ember';
      this.fx.explosion(visual.x, visual.y, heavy ? 0.95 : 0.6);
      this.addDecal(visual.x, visual.y, (this.session.config.tileSize * (heavy ? 1.6 : 1.1)) / 96, 0.55);
    }
    visual.root.destroy();
    this.visuals.delete(id);
  }

  private addDecal(x: number, y: number, scale: number, alpha: number) {
    const decal = this.add.image(x, y, 'fx:scorch').setDepth(1).setScale(scale).setAlpha(alpha).setRotation(Math.random() * 6);
    this.decals.push(decal);
    if (this.decals.length > 60) {
      this.decals.shift()?.destroy();
    }
  }

  // ─── combat visuals ───────────────────────────────────────

  private entityCenter(entity: Entity) {
    const tile = this.session.config.tileSize;
    if (isBuildingState(entity)) {
      const footprint = getBuildingConfig(this.session.config, entity.factionId, entity.buildingTypeId).footprint;
      return { x: (entity.tileX + footprint.width / 2) * tile, y: (entity.tileY + footprint.height / 2) * tile };
    }
    const visual = this.visuals.get(entity.id);
    return visual ? { x: visual.x, y: visual.y } : { x: entity.x * tile, y: entity.y * tile };
  }

  private findShotTarget(ownerId: string, x: number, y: number, rangeTiles: number, preferredId?: string): Entity | null {
    const sim = this.session.state.sim;
    const tile = this.session.config.tileSize;
    if (preferredId) {
      const preferred = sim.units[preferredId] ?? sim.buildings[preferredId];
      if (preferred && preferred.ownerId !== ownerId) {
        return preferred;
      }
    }

    let best: Entity | null = null;
    let bestDistance = (rangeTiles + 1.8) * tile;
    const consider = (entity: Entity) => {
      if (entity.ownerId === ownerId) {
        return;
      }
      const center = this.entityCenter(entity);
      const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    };
    Object.values(sim.units).forEach(consider);
    Object.values(sim.buildings).forEach(consider);
    return best;
  }

  private unitFired(unit: UnitState, visual: EntityVisual) {
    const config = this.session.config;
    const unitConfig = getUnitConfig(config, unit.factionId, unit.unitTypeId);
    const target = this.findShotTarget(unit.ownerId, visual.x, visual.y, unitConfig.range, unit.order.targetId);
    if (!target) {
      return;
    }

    const center = this.entityCenter(target);
    const angle = Math.atan2(center.y - visual.y, center.x - visual.x);
    visual.aim = angle;
    visual.aimUntil = this.time.now + 1600;
    if (!visual.turret) {
      visual.heading = angle;
    }
    visual.recoil = unit.unitTypeId === 'ember' ? 7 : 4;

    const kind = WEAPON_BY_UNIT[unit.unitTypeId] ?? 'bullet';
    const tile = config.tileSize;
    const muzzle = {
      x: visual.x + Math.cos(angle) * tile * (unit.unitTypeId === 'vanguard' ? 0.45 : 0.62),
      y: visual.y + Math.sin(angle) * tile * (unit.unitTypeId === 'vanguard' ? 0.45 : 0.62),
    };
    const jitter = isBuildingState(target) ? tile * 0.5 : tile * 0.12;
    const aimPoint = { x: center.x + Phaser.Math.FloatBetween(-jitter, jitter), y: center.y + Phaser.Math.FloatBetween(-jitter, jitter) };
    const flashSize = kind === 'artillery' ? 1.6 : kind === 'shell' ? 1.2 : 0.75;
    this.fx.muzzleFlash(muzzle.x, muzzle.y, angle, flashSize, kind === 'artillery' ? 0xffa14a : 0xffd27a);
    if (kind === 'artillery') {
      this.fx.smokePuff(muzzle.x, muzzle.y, 1.2, 0x6a625a);
    }
    this.fx.fireProjectile(kind, muzzle, aimPoint, teamColorNumber(visual.slot), () => {
      this.fx.impact(aimPoint.x, aimPoint.y, kind);
      const targetVisual = this.visuals.get(target.id);
      if (targetVisual) {
        targetVisual.hitUntil = this.time.now + HIT_FLASH_MS;
      }
      if (kind === 'artillery') {
        this.addDecal(aimPoint.x, aimPoint.y, 0.32, 0.5);
      }
    });
  }

  private buildingFired(building: BuildingState, visual: EntityVisual) {
    const config = this.session.config;
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    if (!buildingConfig.attackRange) {
      return;
    }
    const target = this.findShotTarget(building.ownerId, visual.x, visual.y, buildingConfig.attackRange);
    if (!target) {
      return;
    }
    const center = this.entityCenter(target);
    const angle = Math.atan2(center.y - visual.y, center.x - visual.x);
    visual.aim = angle;
    visual.aimUntil = this.time.now + 1800;
    visual.recoil = 5;
    const muzzle = { x: visual.x + Math.cos(angle) * config.tileSize * 0.9, y: visual.y + Math.sin(angle) * config.tileSize * 0.9 };
    const color = teamColorNumber(visual.slot);
    this.fx.muzzleFlash(muzzle.x, muzzle.y, angle, 1, color);
    this.fx.fireProjectile('bolt', muzzle, center, color, () => {
      this.fx.impact(center.x, center.y, 'bolt', color);
      const targetVisual = this.visuals.get(target.id);
      if (targetVisual) {
        targetVisual.hitUntil = this.time.now + HIT_FLASH_MS;
      }
    });
  }

  // ─── per-frame visual update ──────────────────────────────

  private updateVisuals(delta: number) {
    const now = this.time.now;
    const dt = Math.min(delta, 64);
    const posK = 1 - Math.exp(-dt / 70);
    const turnK = 1 - Math.exp(-dt / 85);
    const tile = this.session.config.tileSize;
    const sim = this.session.state.sim;

    this.visuals.forEach((visual) => {
      const flashNow = now < visual.hitUntil;
      if (flashNow !== visual.flashing) {
        visual.flashing = flashNow;
        if (flashNow) {
          visual.body.setTintFill(0xffffff);
          visual.turret?.setTintFill(0xffffff);
        } else {
          visual.body.clearTint();
          visual.turret?.clearTint();
        }
      }
      visual.recoil = Math.max(0, visual.recoil - dt * 0.03);

      if (visual.isBuilding) {
        this.updateBuildingVisual(visual, dt, now);
        return;
      }

      const dx = visual.tx - visual.x;
      const dy = visual.ty - visual.y;
      const distance = Math.hypot(dx, dy);
      visual.moving = distance > 0.6;
      visual.x += dx * posK;
      visual.y += dy * posK;

      const unit = sim.units[visual.id];
      if (visual.moving && distance > 1.2) {
        visual.heading = turnToward(visual.heading, Math.atan2(dy, dx), turnK);
        visual.fxTimer -= dt;
        if (visual.fxTimer <= 0 && (visual.typeId === 'striker' || visual.typeId === 'ember' || visual.typeId === 'courier')) {
          visual.fxTimer = 130;
          this.fx.dust(visual.x - Math.cos(visual.heading) * tile * 0.35, visual.y - Math.sin(visual.heading) * tile * 0.35, 1);
        }
      }

      const aiming = now < visual.aimUntil;
      let aimAngle = visual.heading;
      if (aiming) {
        aimAngle = visual.aim;
      } else if (unit?.order.targetId) {
        const target = sim.units[unit.order.targetId] ?? sim.buildings[unit.order.targetId];
        if (target && target.ownerId !== visual.ownerId) {
          const center = this.entityCenter(target);
          aimAngle = Math.atan2(center.y - visual.y, center.x - visual.x);
        }
      }
      if (visual.turret) {
        visual.aim = turnToward(visual.aim, aimAngle, turnK * 1.4);
        const local = visual.aim - visual.heading;
        visual.turret.setRotation(local);
        visual.turret.setPosition(-Math.cos(local) * visual.recoil * 0.5, -Math.sin(local) * visual.recoil * 0.5);
      } else if (!visual.moving && aiming) {
        visual.heading = turnToward(visual.heading, visual.aim, turnK * 1.4);
      }

      visual.rot!.setRotation(visual.heading);
      visual.root.setPosition(visual.x, visual.y);
      visual.root.setDepth(UNIT_DEPTH + visual.y * 0.0001);

      if (visual.hpRatio < 0.4) {
        if (Math.random() < dt / 380) {
          this.fx.smokePuff(visual.x, visual.y - 4, 0.6);
        }
        if (visual.hpRatio < 0.22 && Math.random() < dt / 520) {
          this.fx.fireLick(visual.x, visual.y - 2, 0.7);
        }
      }
    });

    this.resourceVisuals.forEach((node, id) => {
      if ((sim.resources[id]?.amount ?? 0) > 0) {
        node.glint.setAlpha(0.22 + Math.sin(now / 520 + node.max) * 0.1);
      }
    });
  }

  private updateBuildingVisual(visual: EntityVisual, dt: number, now: number) {
    const sim = this.session.state.sim;
    const building = sim.buildings[visual.id];
    if (!building) {
      return;
    }
    const config = this.session.config;
    const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
    const constructing = building.constructionRemaining > 0;
    const progress = constructing
      ? Phaser.Math.Clamp(1 - building.constructionRemaining / Math.max(1, buildingConfig.buildTime), 0.04, 1)
      : 1;

    // construction reveal
    const texture = visual.body.texture.getSourceImage() as HTMLCanvasElement;
    if (constructing) {
      visual.body.setCrop(0, texture.height * (1 - progress), texture.width, texture.height * progress);
      visual.body.setAlpha(0.55 + progress * 0.4);
      visual.top?.setVisible(false);
      visual.fxTimer -= dt;
      if (visual.fxTimer <= 0) {
        visual.fxTimer = 90;
        const w = visual.halfW;
        this.fx.constructionSpark(visual.x + Phaser.Math.FloatBetween(-w, w), visual.y + visual.halfH - progress * visual.halfH * 2);
      }
    } else {
      visual.body.setCrop();
      visual.body.setAlpha(1);
      visual.top?.setVisible(true);
    }

    // completion pop
    if (visual.pop > 0) {
      visual.pop = Math.max(0, visual.pop - dt / 320);
      const s = 1 + Math.sin(visual.pop * Math.PI) * 0.06;
      visual.root.setScale(s);
    }

    // animated parts
    if (visual.top) {
      if (visual.typeId === 'command-core') {
        visual.top.rotation += dt * 0.0011;
      } else if (visual.typeId === 'sentry') {
        visual.top.rotation = turnToward(visual.top.rotation, visual.aim, 1 - Math.exp(-dt / 70));
        visual.top.setPosition(-Math.cos(visual.top.rotation) * visual.recoil * 0.5, -Math.sin(visual.top.rotation) * visual.recoil * 0.5);
      }
    }

    // activity glow: producing units / harvesting refinery
    if (visual.glow) {
      const active = !constructing && (building.queue.length > 0 || (visual.typeId === 'refinery' && this.hasDockedCourier(building)));
      const target = active ? 0.35 + Math.sin(now / 180) * 0.15 : 0;
      visual.glow.setAlpha(Phaser.Math.Linear(visual.glow.alpha, target, 0.15));
    }

    // idle smoke from refinery chimney, ambient radar blink is baked into the sprite
    if (!constructing && visual.typeId === 'refinery' && Math.random() < dt / 700) {
      this.fx.smokePuff(visual.x - visual.halfW * 0.2, visual.y - visual.halfH * 0.55, 0.9, 0x6b6660);
    }

    // battle damage
    if (visual.hpRatio < 0.5) {
      if (Math.random() < dt / 260) {
        this.fx.smokePuff(
          visual.x + Phaser.Math.FloatBetween(-visual.halfW, visual.halfW) * 0.7,
          visual.y + Phaser.Math.FloatBetween(-visual.halfH, visual.halfH) * 0.7,
          1.3,
        );
      }
      if (visual.hpRatio < 0.28 && Math.random() < dt / 220) {
        this.fx.fireLick(
          visual.x + Phaser.Math.FloatBetween(-visual.halfW, visual.halfW) * 0.7,
          visual.y + Phaser.Math.FloatBetween(-visual.halfH, visual.halfH) * 0.7,
          1.4,
        );
      }
    }
  }

  private hasDockedCourier(building: BuildingState) {
    const tile = this.session.config.tileSize;
    const center = this.entityCenter(building);
    return Object.values(this.session.state.sim.units).some(
      (unit) =>
        unit.ownerId === building.ownerId &&
        unit.order.refineryId === building.id &&
        Math.hypot(unit.x * tile - center.x, unit.y * tile - center.y) < tile * 3.4,
    );
  }

  // ─── overlays: selection, bars, orders, placement ─────────

  private drawOverlays() {
    const g = this.overlay;
    const rings = this.ringLayer;
    g.clear();
    rings.clear();
    const state = this.session.state;
    const config = this.session.config;
    const tile = config.tileSize;
    const selected = new Set(state.render.selectedIds);
    const now = this.time.now;
    const pulse = 0.65 + Math.sin(now / 240) * 0.35;

    this.visuals.forEach((visual) => {
      const isSelected = selected.has(visual.id);
      const isHovered = this.hoveredId === visual.id;
      const own = visual.ownerId === this.session.localPlayerId;

      if (isSelected || isHovered) {
        const color = isSelected ? 0x8dffb0 : own ? 0xffffff : 0xff6b5d;
        if (visual.isBuilding) {
          this.drawBrackets(rings, visual, color, isSelected ? 0.95 : 0.6);
        } else {
          const radius = visual.halfW * 1.05;
          rings.lineStyle(4, 0x000000, 0.35);
          rings.strokeEllipse(visual.x, visual.y + 2, radius * 2.1, radius * 1.55);
          rings.lineStyle(2, color, isSelected ? 0.6 + pulse * 0.4 : 0.6);
          rings.strokeEllipse(visual.x, visual.y + 2, radius * 2.1, radius * 1.55);
        }
      }

      const damaged = visual.hpRatio < 0.999;
      if (isSelected || isHovered || damaged) {
        this.drawHealthBar(g, visual, own);
      }

      if (visual.isBuilding) {
        const building = state.sim.buildings[visual.id];
        if (building) {
          this.drawBuildingStatus(g, visual, building, now);
        }
      }
    });

    this.drawOrderLines(g, selected);
    this.drawRangeRings(g, selected);
    this.drawRally(g);
    this.drawPlacementPreview(g, tile);
    this.drawSelectionBox();
  }

  private drawBrackets(g: Phaser.GameObjects.Graphics, visual: EntityVisual, color: number, alpha: number) {
    const pad = 5;
    const x0 = visual.x - visual.halfW - pad;
    const x1 = visual.x + visual.halfW + pad;
    const y0 = visual.y - visual.halfH - pad;
    const y1 = visual.y + visual.halfH + pad;
    const len = Math.min(visual.halfW, visual.halfH) * 0.5;
    [3.5, 1.8].forEach((width, index) => {
      g.lineStyle(width, index === 0 ? 0x000000 : color, index === 0 ? 0.4 : alpha);
      g.beginPath();
      g.moveTo(x0, y0 + len);
      g.lineTo(x0, y0);
      g.lineTo(x0 + len, y0);
      g.moveTo(x1 - len, y0);
      g.lineTo(x1, y0);
      g.lineTo(x1, y0 + len);
      g.moveTo(x1, y1 - len);
      g.lineTo(x1, y1);
      g.lineTo(x1 - len, y1);
      g.moveTo(x0 + len, y1);
      g.lineTo(x0, y1);
      g.lineTo(x0, y1 - len);
      g.strokePath();
    });
  }

  private drawHealthBar(g: Phaser.GameObjects.Graphics, visual: EntityVisual, own: boolean) {
    const width = visual.isBuilding ? Math.min(visual.halfW * 2 * 0.8, 120) : visual.halfW * 2.1;
    const height = visual.isBuilding ? 6 : 4;
    const x = visual.x - width / 2;
    const y = visual.y - visual.halfH - (visual.isBuilding ? 14 : 10);
    const ratio = visual.hpRatio;
    const color = ratio > 0.6 ? 0x5df08b : ratio > 0.3 ? 0xffc93c : 0xff5147;
    g.fillStyle(0x05080c, 0.8);
    g.fillRect(x - 1.5, y - 1.5, width + 3, height + 3);
    g.fillStyle(0x27303b, 1);
    g.fillRect(x, y, width, height);
    g.fillStyle(color, 1);
    g.fillRect(x, y, width * ratio, height);
    g.fillStyle(0xffffff, 0.28);
    g.fillRect(x, y, width * ratio, Math.max(1, height * 0.35));
    if (!own) {
      g.lineStyle(1.2, 0xff5147, 0.8);
      g.strokeRect(x - 1.5, y - 1.5, width + 3, height + 3);
    }
  }

  private drawBuildingStatus(g: Phaser.GameObjects.Graphics, visual: EntityVisual, building: BuildingState, now: number) {
    const config = this.session.config;
    const own = building.ownerId === this.session.localPlayerId;
    const width = Math.min(visual.halfW * 2 * 0.8, 120);
    const x = visual.x - width / 2;
    const y = visual.y + visual.halfH + 8;

    if (building.constructionRemaining > 0) {
      const buildingConfig = getBuildingConfig(config, building.factionId, building.buildingTypeId);
      const progress = 1 - building.constructionRemaining / Math.max(1, buildingConfig.buildTime);
      g.fillStyle(0x05080c, 0.8);
      g.fillRect(x - 1.5, y - 1.5, width + 3, 8);
      g.fillStyle(0x1f2b38, 1);
      g.fillRect(x, y, width, 5);
      g.fillStyle(0xffb02e, 1);
      g.fillRect(x, y, width * progress, 5);
      // scaffold outline
      g.lineStyle(2, 0xffb02e, 0.55 + Math.sin(now / 160) * 0.25);
      g.strokeRect(visual.x - visual.halfW, visual.y - visual.halfH, visual.halfW * 2, visual.halfH * 2);
      g.lineStyle(1, 0xffb02e, 0.3);
      g.lineBetween(visual.x - visual.halfW, visual.y - visual.halfH, visual.x + visual.halfW, visual.y + visual.halfH);
      g.lineBetween(visual.x + visual.halfW, visual.y - visual.halfH, visual.x - visual.halfW, visual.y + visual.halfH);
      return;
    }

    if (own && building.queue.length > 0) {
      const item = building.queue[0];
      const unitConfig = getUnitConfig(config, building.factionId, item.unitTypeId);
      const progress = 1 - item.remainingTicks / Math.max(1, unitConfig.buildTime);
      g.fillStyle(0x05080c, 0.8);
      g.fillRect(x - 1.5, y - 1.5, width + 3, 8);
      g.fillStyle(0x1f2b38, 1);
      g.fillRect(x, y, width, 5);
      g.fillStyle(teamColorNumber(visual.slot), 1);
      g.fillRect(x, y, width * progress, 5);
      for (let i = 0; i < Math.min(5, building.queue.length); i += 1) {
        g.fillStyle(i === 0 ? 0xffffff : 0x9fb8d0, 1);
        g.fillCircle(x + 4 + i * 8, y + 13, 2.6);
      }
    }
  }

  private drawOrderLines(g: Phaser.GameObjects.Graphics, selected: Set<string>) {
    const sim = this.session.state.sim;
    const tile = this.session.config.tileSize;
    let drawn = 0;
    selected.forEach((id) => {
      const unit = sim.units[id];
      const visual = this.visuals.get(id);
      if (!unit || !visual || unit.ownerId !== this.session.localPlayerId || drawn >= 24) {
        return;
      }

      let destX: number | null = null;
      let destY: number | null = null;
      let color = 0x7dffa8;
      if (unit.order.targetId) {
        const target = sim.units[unit.order.targetId] ?? sim.buildings[unit.order.targetId];
        if (target) {
          const center = this.entityCenter(target);
          destX = center.x;
          destY = center.y;
          color = 0xff5c4d;
        }
      } else if (unit.order.target && (unit.order.kind === 'move' || unit.order.kind === 'attack-move')) {
        destX = (unit.order.target.x + 0.5) * tile;
        destY = (unit.order.target.y + 0.5) * tile;
        color = unit.order.kind === 'attack-move' ? 0xffb02e : 0x7dffa8;
      }
      if (destX === null || destY === null) {
        return;
      }
      drawn += 1;
      this.dashedLine(g, visual.x, visual.y, destX, destY, color, 0.55);
      g.fillStyle(color, 0.85);
      g.fillCircle(destX, destY, 3);
    });
  }

  private dashedLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 4) {
      return;
    }
    const ux = (x1 - x0) / length;
    const uy = (y1 - y0) / length;
    const offset = (this.time.now / 40) % 12;
    g.lineStyle(1.8, color, alpha);
    for (let d = -offset; d < length; d += 12) {
      const a = Math.max(0, d);
      const b = Math.min(length, d + 6);
      if (b <= a) {
        continue;
      }
      g.lineBetween(x0 + ux * a, y0 + uy * a, x0 + ux * b, y0 + uy * b);
    }
  }

  private drawRangeRings(g: Phaser.GameObjects.Graphics, selected: Set<string>) {
    const sim = this.session.state.sim;
    const tile = this.session.config.tileSize;
    if (selected.size > 3) {
      return;
    }
    selected.forEach((id) => {
      const visual = this.visuals.get(id);
      if (!visual) {
        return;
      }
      let range = 0;
      const unit = sim.units[id];
      const building = sim.buildings[id];
      if (unit) {
        range = getUnitConfig(this.session.config, unit.factionId, unit.unitTypeId).range;
      } else if (building) {
        range = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId).attackRange ?? 0;
      }
      if (range <= 0) {
        return;
      }
      g.lineStyle(1.5, 0x9cc9ff, 0.3);
      g.strokeCircle(visual.x, visual.y, range * tile);
      g.fillStyle(0x9cc9ff, 0.035);
      g.fillCircle(visual.x, visual.y, range * tile);
    });
  }

  private drawRally(g: Phaser.GameObjects.Graphics) {
    const selection = this.session.getSelection();
    if (selection.buildings.length !== 1 || selection.units.length > 0) {
      return;
    }
    const building = selection.buildings[0];
    if (building.ownerId !== this.session.localPlayerId) {
      return;
    }
    const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
    if (!buildingConfig.producesUnitIds?.length) {
      return;
    }
    const tile = this.session.config.tileSize;
    const visual = this.visuals.get(building.id);
    if (!visual) {
      return;
    }
    const rx = (building.rallyPoint.x + 0.5) * tile;
    const ry = (building.rallyPoint.y + 0.5) * tile;
    const color = teamColorNumber(visual.slot);
    this.dashedLine(g, visual.x, visual.y, rx, ry, color, 0.6);
    g.lineStyle(2.5, 0x11151a, 1);
    g.lineBetween(rx, ry, rx, ry - 26);
    g.fillStyle(color, 1);
    g.fillTriangle(rx, ry - 26, rx + 18, ry - 20, rx, ry - 13);
    g.lineStyle(1.5, 0x000000, 0.8);
    g.strokeTriangle(rx, ry - 26, rx + 18, ry - 20, rx, ry - 13);
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(rx, ry, 12, 6);
  }

  private drawPlacementPreview(g: Phaser.GameObjects.Graphics, tile: number) {
    const preview = this.session.state.render.placementPreview;
    if (!preview) {
      this.ghost?.setVisible(false);
      this.placementLabel?.setVisible(false);
      return;
    }
    const player = this.session.state.sim.players[this.session.localPlayerId];
    if (!player) {
      return;
    }
    const buildingConfig = getBuildingConfig(this.session.config, player.factionId, preview.buildingTypeId);
    const slot = getPlayerSlot(this.session.config, player.id);
    const { bodyKey } = this.buildingTextureKeys(preview.buildingTypeId, player.factionId, slot);
    const fw = buildingConfig.footprint.width * tile;
    const fh = buildingConfig.footprint.height * tile;
    const x = preview.tileX * tile;
    const y = preview.tileY * tile;

    // tile grid around the cursor makes precise placement easier
    g.lineStyle(1, 0xffffff, 0.09);
    for (let gx = -4; gx <= buildingConfig.footprint.width + 4; gx += 1) {
      g.lineBetween(x + gx * tile, y - 4 * tile, x + gx * tile, y + (buildingConfig.footprint.height + 4) * tile);
    }
    for (let gy = -4; gy <= buildingConfig.footprint.height + 4; gy += 1) {
      g.lineBetween(x - 4 * tile, y + gy * tile, x + (buildingConfig.footprint.width + 4) * tile, y + gy * tile);
    }

    const color = preview.valid ? 0x6dffa0 : 0xff5c4d;
    g.fillStyle(color, 0.2);
    g.fillRect(x, y, fw, fh);
    g.lineStyle(2.5, color, 0.95);
    g.strokeRect(x, y, fw, fh);

    if (!this.ghost || this.ghostKey !== bodyKey) {
      this.ghost?.destroy();
      this.ghost = this.add.image(0, 0, bodyKey).setDepth(35).setAlpha(0.62);
      this.ghostKey = bodyKey;
    }
    const scale = tile / 80;
    this.ghost
      .setVisible(true)
      .setPosition(x + fw / 2, y + fh / 2)
      .setDisplaySize(fw + BUILDING_PAD * 2 * scale, fh + BUILDING_PAD * 2 * scale);
    if (preview.valid) {
      this.ghost.clearTint();
    } else {
      this.ghost.setTint(0xff8f86);
    }

    if (buildingConfig.attackRange) {
      g.lineStyle(1.5, color, 0.5);
      g.strokeCircle(x + fw / 2, y + fh / 2, buildingConfig.attackRange * tile);
    }

    if (!this.placementLabel) {
      this.placementLabel = this.add
        .text(0, 0, '', {
          fontFamily: 'Bahnschrift, Arial, sans-serif',
          fontSize: '13px',
          color: '#ffe3df',
          backgroundColor: 'rgba(60,12,10,0.88)',
          padding: { x: 7, y: 4 },
        })
        .setDepth(50)
        .setOrigin(0.5, 1);
    }
    if (!preview.valid && preview.reason) {
      this.placementLabel
        .setVisible(true)
        .setText(preview.reason)
        .setScale(1 / this.cameras.main.zoom)
        .setPosition(x + fw / 2, y - 8);
    } else {
      this.placementLabel.setVisible(false);
    }
  }

  private drawSelectionBox() {
    const box = this.selectionBox;
    box.clear();
    if (!this.dragStart || !this.dragCurrent) {
      return;
    }
    const w = this.dragCurrent.x - this.dragStart.x;
    const h = this.dragCurrent.y - this.dragStart.y;
    if (Math.abs(w) < 4 && Math.abs(h) < 4) {
      return;
    }
    box.fillStyle(0x6db8ff, 0.13);
    box.fillRect(this.dragStart.x, this.dragStart.y, w, h);
    box.lineStyle(1.6, 0xcfe6ff, 0.95);
    box.strokeRect(this.dragStart.x, this.dragStart.y, w, h);
  }

  // ─── input ────────────────────────────────────────────────

  private registerInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        this.cameraDragLast = new Phaser.Math.Vector2(pointer.position.x, pointer.position.y);
        return;
      }
      if (!pointer.leftButtonDown()) {
        return;
      }

      const mode = this.session.state.render.commandMode;
      if (mode === 'build') {
        this.session.updatePlacementPreview(this.worldToTile(pointer.worldX, pointer.worldY));
        if (this.session.confirmPlacement()) {
          this.fx.ring(pointer.worldX, pointer.worldY, 0x6dffa0, 30, 500);
        }
        return;
      }
      if (mode === 'attack-move') {
        this.handleContextCommand(pointer);
        return;
      }

      this.dragStart = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      this.dragCurrent = this.dragStart.clone();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown() && this.cameraDragLast) {
        const camera = this.cameras.main;
        camera.scrollX -= (pointer.position.x - this.cameraDragLast.x) / camera.zoom;
        camera.scrollY -= (pointer.position.y - this.cameraDragLast.y) / camera.zoom;
        this.cameraDragLast = new Phaser.Math.Vector2(pointer.position.x, pointer.position.y);
      }
      if (this.session.state.render.commandMode === 'build') {
        this.session.updatePlacementPreview(this.worldToTile(pointer.worldX, pointer.worldY));
      }
      if (this.dragStart) {
        this.dragCurrent = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      }
      this.hoveredId = this.hitEntity(pointer.worldX, pointer.worldY)?.id ?? null;
      this.pointerInside = true;
    });
    this.input.on('gameout', () => {
      this.pointerInside = false;
      this.hoveredId = null;
    });

    const release = (pointer: Phaser.Input.Pointer) => {
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
      if (Phaser.Math.Distance.BetweenPoints(this.dragStart, end) >= this.session.config.tileSize * 0.3) {
        this.selectInRectangle(this.dragStart, end, additive);
      } else {
        this.selectAtPoint(end, additive);
      }
      this.dragStart = undefined;
      this.dragCurrent = undefined;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      const camera = this.cameras.main;
      const before = camera.zoom;
      const after = Phaser.Math.Clamp(before * Math.exp(-dy * 0.0012), this.minZoom(), 2.4);
      if (after === before) {
        return;
      }
      // keep the world point under the cursor fixed
      const cx = camera.scrollX + camera.width / 2;
      const cy = camera.scrollY + camera.height / 2;
      const wx = cx + (pointer.x - camera.width / 2) / before;
      const wy = cy + (pointer.y - camera.height / 2) / before;
      camera.setZoom(after);
      camera.scrollX = wx - (pointer.x - camera.width / 2) / after - camera.width / 2;
      camera.scrollY = wy - (pointer.y - camera.height / 2) / after - camera.height / 2;
    });
  }

  private minZoom() {
    const config = this.session.config;
    const camera = this.cameras.main;
    const worldWidth = config.map.width * config.tileSize;
    const worldHeight = config.map.height * config.tileSize;
    return Math.max(0.35, camera.width / worldWidth, camera.height / worldHeight);
  }

  private applyZoom(zoom: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, this.minZoom(), 2.4));
  }

  private handleGroupKey(event: KeyboardEvent) {
    const match = /^Digit([1-9])$/.exec(event.code);
    if (!match) {
      return;
    }
    const key = match[1];
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      const ids = this.session.state.render.selectedIds.filter((id) => this.visuals.get(id)?.ownerId === this.session.localPlayerId);
      if (ids.length > 0) {
        this.controlGroups.set(key, [...ids]);
        this.notify(`Group ${key} set (${ids.length})`, 'info');
      }
      return;
    }

    const ids = (this.controlGroups.get(key) ?? []).filter((id) => this.visuals.has(id));
    if (ids.length === 0) {
      return;
    }
    this.controlGroups.set(key, ids);
    this.session.setSelection(ids);
    const now = this.time.now;
    if (this.lastGroupRecall.key === key && now - this.lastGroupRecall.time < 400) {
      const focus = this.getSelectionFocusPoint();
      if (focus) {
        this.cameras.main.pan(focus.x, focus.y, 200, 'Sine.easeOut');
      }
    }
    this.lastGroupRecall = { key, time: now };
  }

  private commandAtWorld(worldX: number, worldY: number) {
    if (!this.session.getSelection().units.length) {
      return;
    }
    this.session.commandSelectedUnits(this.worldToTile(worldX, worldY));
    this.fx.commandMarker(worldX, worldY, 'move');
  }

  private handleContextCommand(pointer: Phaser.Input.Pointer) {
    if (this.session.state.render.commandMode === 'build') {
      this.session.cancelModes();
      return;
    }

    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    const hit = this.hitEntity(pointer.worldX, pointer.worldY);

    if (!this.session.getSelection().units.length) {
      if (this.session.getSelection().buildings.length === 1) {
        this.session.setSelectedBuildingRally(tile);
        this.fx.commandMarker(pointer.worldX, pointer.worldY, 'move');
      }
      return;
    }

    const attackMove = this.session.state.render.commandMode === 'attack-move';
    if (hit && hit.ownerId !== this.session.localPlayerId) {
      this.session.commandSelectedUnits(tile, hit.id);
      const center = this.entityCenter(hit);
      this.fx.commandMarker(center.x, center.y, 'attack');
      return;
    }

    this.session.commandSelectedUnits(tile);
    this.fx.commandMarker(pointer.worldX, pointer.worldY, attackMove ? 'attack' : 'move');
  }

  private selectAtPoint(point: Phaser.Math.Vector2, additive: boolean) {
    const hit = this.hitEntity(point.x, point.y);
    if (!hit || hit.ownerId !== this.session.localPlayerId) {
      if (!additive) {
        this.session.setSelection([]);
      }
      return;
    }

    const now = this.time.now;
    const doubleClick = this.lastClick.id === hit.id && now - this.lastClick.time < 340;
    this.lastClick = { id: hit.id, time: now };

    if (doubleClick && !isBuildingState(hit)) {
      const view = this.cameras.main.worldView;
      const tile = this.session.config.tileSize;
      const sameType = Object.values(this.session.state.sim.units)
        .filter(
          (unit) =>
            unit.ownerId === hit.ownerId &&
            unit.unitTypeId === hit.unitTypeId &&
            view.contains(unit.x * tile, unit.y * tile),
        )
        .map((unit) => unit.id);
      this.session.setSelection(sameType);
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
    const tile = this.session.config.tileSize;
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);

    let selectedIds = Object.values(this.session.state.sim.units)
      .filter(
        (unit) =>
          unit.ownerId === this.session.localPlayerId &&
          unit.x * tile >= left &&
          unit.x * tile <= right &&
          unit.y * tile >= top &&
          unit.y * tile <= bottom,
      )
      .map((unit) => unit.id);

    if (selectedIds.length === 0) {
      const building = Object.values(this.session.state.sim.buildings).find((candidate) => {
        if (candidate.ownerId !== this.session.localPlayerId) {
          return false;
        }
        const center = this.entityCenter(candidate);
        return center.x >= left && center.x <= right && center.y >= top && center.y <= bottom;
      });
      selectedIds = building ? [building.id] : [];
    }

    if (!additive) {
      this.session.setSelection(selectedIds);
      return;
    }
    this.session.setSelection([...new Set([...this.session.state.render.selectedIds, ...selectedIds])]);
  }

  private updateCursor() {
    const mode = this.session.state.render.commandMode;
    let next = 'default';
    if (mode === 'attack-move') {
      next = 'crosshair';
    } else if (mode === 'build') {
      next = 'cell';
    } else if (this.hoveredId) {
      const visual = this.visuals.get(this.hoveredId);
      if (visual && visual.ownerId !== this.session.localPlayerId && this.session.getSelection().units.length > 0) {
        next = 'crosshair';
      } else if (visual) {
        next = 'pointer';
      }
    }
    if (next !== this.cursor) {
      this.cursor = next;
      this.input.setDefaultCursor(next);
    }
  }

  // ─── camera / helpers ─────────────────────────────────────

  private focusStartingBase() {
    if (this.initialFocusUntil === 0) {
      return;
    }
    const focus = this.getDefaultFocusPoint();
    this.cameras.main.centerOn(focus.x, focus.y);
  }

  private handleCamera(delta: number) {
    const camera = this.cameras.main;
    const velocity = (0.6 * delta) / camera.zoom;
    let dx = 0;
    let dy = 0;

    if (this.cursorKeys) {
      dx += (this.cursorKeys.right.isDown ? 1 : 0) - (this.cursorKeys.left.isDown ? 1 : 0);
      dy += (this.cursorKeys.down.isDown ? 1 : 0) - (this.cursorKeys.up.isDown ? 1 : 0);
    }

    const pointer = this.input.activePointer;
    if (this.pointerInside && !pointer.middleButtonDown()) {
      const margin = 8;
      if (pointer.x <= margin) dx -= 1;
      else if (pointer.x >= camera.width - margin) dx += 1;
      if (pointer.y <= margin) dy -= 1;
      else if (pointer.y >= camera.height - margin) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      camera.scrollX += dx * velocity;
      camera.scrollY += dy * velocity;
      if (this.dragStart) {
        this.dragCurrent = new Phaser.Math.Vector2(pointer.worldX + dx * velocity, pointer.worldY + dy * velocity);
      }
    }
  }

  private getDefaultFocusPoint() {
    const tile = this.session.config.tileSize;
    const playerHq = Object.values(this.session.state.sim.buildings).find(
      (building) => building.ownerId === this.session.localPlayerId && building.buildingTypeId === 'command-core',
    );

    if (!playerHq) {
      return { x: tile * 10, y: tile * 20 };
    }

    const buildingConfig = getBuildingConfig(this.session.config, playerHq.factionId, playerHq.buildingTypeId);
    return {
      x: (playerHq.tileX + buildingConfig.footprint.width / 2 + 3) * tile,
      y: (playerHq.tileY + buildingConfig.footprint.height / 2 - 1) * tile,
    };
  }

  private getSelectionFocusPoint() {
    const selection = this.session.getSelection();
    const entities: Entity[] = [...selection.units, ...selection.buildings];
    if (entities.length === 0) {
      return null;
    }
    const points = entities.map((entity) => this.entityCenter(entity));
    const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  private hitEntity(worldX: number, worldY: number): Entity | null {
    const tile = this.session.config.tileSize;
    const sim = this.session.state.sim;

    const units = Object.values(sim.units).reverse();
    for (const unit of units) {
      const center = this.entityCenter(unit);
      if (Phaser.Math.Distance.Between(worldX, worldY, center.x, center.y) <= tile * 0.55) {
        return unit;
      }
    }

    const buildings = Object.values(sim.buildings).reverse();
    for (const building of buildings) {
      const buildingConfig = getBuildingConfig(this.session.config, building.factionId, building.buildingTypeId);
      const left = building.tileX * tile;
      const top = building.tileY * tile;
      if (
        worldX >= left &&
        worldX <= left + buildingConfig.footprint.width * tile &&
        worldY >= top &&
        worldY <= top + buildingConfig.footprint.height * tile
      ) {
        return building;
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
