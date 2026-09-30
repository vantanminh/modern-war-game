import { getBuildingConfig, getPlayerSlot } from '../config';
import { TEAM_COLORS } from '../art/palette';
import type { GameConfig, GameState, PlayerId } from '../types';

export interface MinimapView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapCallbacks {
  onNavigate: (worldX: number, worldY: number) => void;
  onCommand: (worldX: number, worldY: number) => void;
}

interface Ping {
  x: number;
  y: number;
  color: string;
  born: number;
}

const PING_MS = 2400;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly config: GameConfig;
  private readonly terrain: HTMLCanvasElement;
  private readonly callbacks: MinimapCallbacks;
  private readonly pings: Ping[] = [];
  private dragging = false;
  private readonly listeners: Array<[string, EventListener]> = [];

  constructor(canvas: HTMLCanvasElement, config: GameConfig, terrain: HTMLCanvasElement, callbacks: MinimapCallbacks) {
    this.canvas = canvas;
    this.config = config;
    this.terrain = terrain;
    this.callbacks = callbacks;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssWidth = canvas.clientWidth || 220;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(((cssWidth * config.map.height) / config.map.width) * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas is not available');
    }
    this.ctx = ctx;

    this.listen('pointerdown', (event) => {
      const pointer = event as PointerEvent;
      pointer.preventDefault();
      if (pointer.button === 2) {
        const world = this.toWorld(pointer);
        this.callbacks.onCommand(world.x, world.y);
        return;
      }
      if (pointer.button !== 0) {
        return;
      }
      this.dragging = true;
      this.canvas.setPointerCapture(pointer.pointerId);
      const world = this.toWorld(pointer);
      this.callbacks.onNavigate(world.x, world.y);
    });
    this.listen('pointermove', (event) => {
      if (!this.dragging) {
        return;
      }
      const world = this.toWorld(event as PointerEvent);
      this.callbacks.onNavigate(world.x, world.y);
    });
    this.listen('pointerup', () => {
      this.dragging = false;
    });
    this.listen('contextmenu', (event) => event.preventDefault());
  }

  private listen(type: string, handler: EventListener) {
    this.canvas.addEventListener(type, handler);
    this.listeners.push([type, handler]);
  }

  destroy() {
    this.listeners.forEach(([type, handler]) => this.canvas.removeEventListener(type, handler));
    this.listeners.length = 0;
  }

  ping(worldX: number, worldY: number, color = '#ff5147') {
    this.pings.push({ x: worldX, y: worldY, color, born: performance.now() });
  }

  private toWorld(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return {
      x: nx * this.config.map.width * this.config.tileSize,
      y: ny * this.config.map.height * this.config.tileSize,
    };
  }

  render(state: GameState, view: MinimapView, localPlayerId: PlayerId) {
    const { ctx, canvas } = this;
    const sx = canvas.width / (this.config.map.width * this.config.tileSize);
    const sy = canvas.height / (this.config.map.height * this.config.tileSize);
    const tile = this.config.tileSize;
    const selected = new Set(state.render.selectedIds);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.terrain, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(6,12,20,0.28)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    Object.values(state.sim.resources).forEach((resource) => {
      if (resource.amount <= 0) {
        return;
      }
      ctx.fillStyle = '#5ff0a0';
      ctx.beginPath();
      ctx.arc((resource.x + 0.5) * tile * sx, (resource.y + 0.5) * tile * sy, Math.max(2, canvas.width / 90), 0, Math.PI * 2);
      ctx.fill();
    });

    Object.values(state.sim.buildings).forEach((building) => {
      const footprint = getBuildingConfig(this.config, building.factionId, building.buildingTypeId).footprint;
      ctx.fillStyle = TEAM_COLORS[getPlayerSlot(this.config, building.ownerId) % TEAM_COLORS.length];
      ctx.globalAlpha = building.constructionRemaining > 0 ? 0.55 : 1;
      ctx.fillRect(building.tileX * tile * sx, building.tileY * tile * sy, footprint.width * tile * sx, footprint.height * tile * sy);
      if (selected.has(building.id)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(building.tileX * tile * sx, building.tileY * tile * sy, footprint.width * tile * sx, footprint.height * tile * sy);
      }
      ctx.globalAlpha = 1;
    });

    const dot = Math.max(2.2, canvas.width / 105);
    Object.values(state.sim.units).forEach((unit) => {
      ctx.fillStyle = TEAM_COLORS[getPlayerSlot(this.config, unit.ownerId) % TEAM_COLORS.length];
      ctx.beginPath();
      ctx.arc(unit.x * tile * sx, unit.y * tile * sy, unit.ownerId === localPlayerId ? dot : dot * 0.85, 0, Math.PI * 2);
      ctx.fill();
      if (selected.has(unit.id)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    const now = performance.now();
    for (let i = this.pings.length - 1; i >= 0; i -= 1) {
      const ping = this.pings[i];
      const t = (now - ping.born) / PING_MS;
      if (t >= 1) {
        this.pings.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = ping.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ping.x * sx, ping.y * sy, 4 + ((t * 3) % 1) * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy);
  }
}
