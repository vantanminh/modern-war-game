import type { GameConfig } from '../types';
import { circle, createCanvas, get2d, radial } from './draw';
import { getUnitSprites } from './sprites';
import { renderTerrain, TERRAIN_SCALE } from './terrain';

const WIDTH = 1280;
const HEIGHT = 720;

function drawUnit(
  ctx: CanvasRenderingContext2D,
  unitTypeId: string,
  factionId: 'aurora' | 'obsidian',
  slot: number,
  x: number,
  y: number,
  angle: number,
  scale: number,
  aim = angle,
) {
  const sprites = getUnitSprites(unitTypeId, factionId, slot);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(6 * scale, 8 * scale, 44 * scale, 30 * scale, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.drawImage(sprites.body, -48, -48);
  if (sprites.turret) {
    ctx.rotate(aim - angle);
    ctx.drawImage(sprites.turret, -48, -48);
  }
  ctx.restore();
}

function tracer(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = '#fff6d0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = radial(ctx, x, y, 0, r, [
    [0, color],
    [1, 'rgba(255,140,40,0)'],
  ]);
  circle(ctx, x, y, r);
  ctx.fill();
}

/** Paints the title-screen skirmish illustration entirely from the procedural sprite set. */
export function renderMenuBackdrop(config: GameConfig): HTMLCanvasElement {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = get2d(canvas);
  const terrain = renderTerrain(config);
  const scale = TERRAIN_SCALE;
  const cx = 24 * config.tileSize * scale;
  const cy = 12 * config.tileSize * scale;
  ctx.drawImage(terrain, cx - WIDTH / 2, cy - HEIGHT / 2, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);

  // blue force, lower left
  drawUnit(ctx, 'striker', 'aurora', 0, 250, 520, -0.35, 1.5, -0.2);
  drawUnit(ctx, 'striker', 'aurora', 0, 380, 600, -0.3, 1.5, -0.25);
  drawUnit(ctx, 'ember', 'aurora', 0, 170, 610, -0.4, 1.6, -0.3);
  [[330, 470], [430, 520], [480, 590], [310, 560]].forEach(([x, y], i) => drawUnit(ctx, 'vanguard', 'aurora', 0, x, y, -0.35 + i * 0.05, 1.5));

  // red force, upper right
  drawUnit(ctx, 'striker', 'obsidian', 1, 1010, 230, Math.PI - 0.35, 1.5, Math.PI - 0.2);
  drawUnit(ctx, 'striker', 'obsidian', 1, 900, 150, Math.PI - 0.3, 1.5, Math.PI - 0.25);
  drawUnit(ctx, 'ember', 'obsidian', 1, 1110, 160, Math.PI - 0.4, 1.6, Math.PI - 0.3);
  [[860, 260], [780, 210], [950, 310], [820, 330]].forEach(([x, y], i) => drawUnit(ctx, 'vanguard', 'obsidian', 1, x, y, Math.PI - 0.35 + i * 0.05, 1.5));

  // crossfire
  tracer(ctx, 330, 500, 760, 262, 'rgba(120,190,255,0.9)');
  tracer(ctx, 470, 555, 830, 300, 'rgba(120,190,255,0.9)');
  tracer(ctx, 880, 190, 470, 470, 'rgba(255,110,90,0.9)');
  tracer(ctx, 780, 240, 380, 520, 'rgba(255,110,90,0.9)');
  glow(ctx, 640, 360, 150, 'rgba(255,190,90,0.55)');
  glow(ctx, 820, 290, 60, 'rgba(255,240,200,0.7)');
  glow(ctx, 470, 500, 50, 'rgba(255,240,200,0.6)');

  // smoke haze + vignette so the menu card stays legible
  ctx.fillStyle = radial(ctx, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.25, WIDTH * 0.7, [
    [0, 'rgba(6,12,20,0.1)'],
    [1, 'rgba(4,8,14,0.85)'],
  ]);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  return canvas;
}
