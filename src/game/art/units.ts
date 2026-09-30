import { circle, createCanvas, get2d, linear, panel, polygon, radial, roundRectPath, type Ctx } from './draw';
import type { ArtPalette } from './palette';

/** Units are drawn facing +x on a square canvas; turrets are separate sprites so they can aim independently. */
export const UNIT_CANVAS = 96;

/** Sprite size relative to one map tile. */
export const UNIT_DISPLAY_SCALE: Record<string, number> = {
  courier: 1.4,
  vanguard: 1.3,
  striker: 1.45,
  ember: 1.6,
};

const OUTLINE = 'rgba(6,10,16,0.9)';

function treads(ctx: Ctx, x: number, y: number, w: number, h: number) {
  roundRectPath(ctx, x, y, w, h, 5);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [
    [0, '#2b3038'],
    [0.5, '#171a20'],
    [1, '#22262d'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 1.4;
  for (let tx = x + 4; tx < x + w - 2; tx += 5) {
    ctx.beginPath();
    ctx.moveTo(tx, y + 2);
    ctx.lineTo(tx, y + h - 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#3d444f';
  [x + 7, x + w / 2, x + w - 7].forEach((wx) => {
    circle(ctx, wx, y + h / 2, h * 0.28);
    ctx.fill();
  });
}

function drawCourierBody(ctx: Ctx, p: ArtPalette) {
  // wheels
  ctx.fillStyle = '#14171c';
  [20, 38, 60].forEach((wx) => {
    roundRectPath(ctx, wx, 24, 13, 7, 2.5);
    ctx.fill();
    roundRectPath(ctx, wx, 65, 13, 7, 2.5);
    ctx.fill();
  });

  // chassis + open cargo bed
  panel(ctx, 9, 30, 50, 36, 5, p.hullLight, p.hullDark);
  roundRectPath(ctx, 13, 34, 42, 28, 3);
  ctx.fillStyle = linear(ctx, 13, 34, 13, 62, [
    [0, '#1a1f26'],
    [1, '#2b323b'],
  ]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.2;
  for (let rx = 21; rx < 54; rx += 8) {
    ctx.beginPath();
    ctx.moveTo(rx, 35);
    ctx.lineTo(rx, 61);
    ctx.stroke();
  }

  // cab
  panel(ctx, 58, 29, 28, 38, 7, p.hullLight, p.hullDark);
  ctx.fillStyle = p.team;
  roundRectPath(ctx, 60, 42, 24, 12, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRectPath(ctx, 61, 43, 22, 3, 1.5);
  ctx.fill();
  // windscreen
  roundRectPath(ctx, 66, 33, 9, 30, 3);
  ctx.fillStyle = linear(ctx, 66, 33, 75, 63, [
    [0, '#9fe0ff'],
    [1, '#2d5f86'],
  ]);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  // lamps + beacon
  ctx.fillStyle = '#fff1a8';
  circle(ctx, 85, 35, 2.4);
  ctx.fill();
  circle(ctx, 85, 61, 2.4);
  ctx.fill();
  ctx.fillStyle = '#ffb02e';
  circle(ctx, 62, 48, 2.6);
  ctx.fill();
  // team stripe along the bed rim
  ctx.fillStyle = p.team;
  roundRectPath(ctx, 10, 30, 47, 3, 1.5);
  ctx.fill();
  roundRectPath(ctx, 10, 63, 47, 3, 1.5);
  ctx.fill();
}

function drawVanguardBody(ctx: Ctx, p: ArtPalette) {
  // backpack
  ctx.fillStyle = p.hullDark;
  roundRectPath(ctx, 27, 39, 13, 18, 4);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // rifle
  ctx.fillStyle = '#1b1f26';
  roundRectPath(ctx, 48, 45, 38, 6, 2);
  ctx.fill();
  ctx.fillStyle = '#3a414c';
  roundRectPath(ctx, 52, 43, 14, 4, 1.5);
  ctx.fill();
  ctx.fillStyle = '#0d0f13';
  ctx.fillRect(84, 46.4, 5, 3.2);

  // arms
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(43, 35);
  ctx.lineTo(60, 44);
  ctx.moveTo(43, 61);
  ctx.lineTo(56, 51);
  ctx.stroke();
  ctx.strokeStyle = p.hull;
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(43, 35);
  ctx.lineTo(60, 44);
  ctx.moveTo(43, 61);
  ctx.lineTo(56, 51);
  ctx.stroke();
  ctx.fillStyle = '#2a2016';
  circle(ctx, 60, 44.4, 2.6);
  ctx.fill();
  circle(ctx, 56, 50.6, 2.6);
  ctx.fill();

  // torso
  ctx.save();
  ctx.translate(44, 48);
  ctx.scale(0.62, 1);
  circle(ctx, 0, 0, 17);
  ctx.restore();
  ctx.fillStyle = radial(ctx, 42, 42, 1, 20, [
    [0, p.hullLight],
    [1, p.hullDark],
  ]);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // team vest strap
  ctx.fillStyle = p.team;
  roundRectPath(ctx, 36, 33, 6, 30, 3);
  ctx.fill();

  // helmet
  circle(ctx, 47, 48, 8.2);
  ctx.fillStyle = radial(ctx, 47, 48, 1, 9, [
    [0, p.teamLight],
    [1, p.teamDark],
  ], 44.5, 45.5);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  circle(ctx, 44.5, 45, 2.4);
  ctx.fill();
}

function drawStrikerBody(ctx: Ctx, p: ArtPalette) {
  treads(ctx, 12, 19, 70, 17);
  treads(ctx, 12, 60, 70, 17);

  // hull
  polygon(ctx, [
    [16, 30],
    [66, 30],
    [85, 40],
    [85, 56],
    [66, 66],
    [16, 66],
  ]);
  ctx.fillStyle = linear(ctx, 16, 30, 60, 70, [
    [0, p.hullLight],
    [0.55, p.hull],
    [1, p.hullDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // glacis plate + team wedge
  polygon(ctx, [
    [66, 30],
    [85, 40],
    [85, 56],
    [66, 66],
    [72, 48],
  ]);
  ctx.fillStyle = p.team;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // engine deck
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  roundRectPath(ctx, 18, 36, 14, 24, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.2;
  for (let gy = 39; gy < 58; gy += 4) {
    ctx.beginPath();
    ctx.moveTo(20, gy);
    ctx.lineTo(30, gy);
    ctx.stroke();
  }
  // panel seams + rivets
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 31);
  ctx.lineTo(34, 65);
  ctx.moveTo(58, 31);
  ctx.lineTo(58, 65);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  [[22, 33], [22, 63], [52, 33], [52, 63]].forEach(([rx, ry]) => {
    circle(ctx, rx, ry, 1.1);
    ctx.fill();
  });
}

function drawStrikerTurret(ctx: Ctx, p: ArtPalette) {
  // barrel
  ctx.fillStyle = linear(ctx, 0, 44, 0, 52, [
    [0, '#5a626e'],
    [0.5, '#2b3037'],
    [1, '#1b1f25'],
  ]);
  roundRectPath(ctx, 54, 44, 34, 8, 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = '#12151a';
  roundRectPath(ctx, 82, 42.5, 9, 11, 2);
  ctx.fill();
  ctx.stroke();
  // mantlet
  panel(ctx, 50, 41, 10, 14, 3, '#69727f', '#2c3138');

  // turret body
  polygon(ctx, [
    [28, 34],
    [52, 34],
    [58, 42],
    [58, 54],
    [52, 62],
    [28, 62],
    [22, 54],
    [22, 42],
  ]);
  ctx.fillStyle = linear(ctx, 24, 34, 56, 62, [
    [0, p.hullLight],
    [0.6, p.hull],
    [1, p.hullDark],
  ]);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = p.team;
  roundRectPath(ctx, 24, 44, 20, 8, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRectPath(ctx, 25, 45, 18, 2.4, 1);
  ctx.fill();
  // hatch + optic
  circle(ctx, 36, 48, 4.8);
  ctx.fillStyle = radial(ctx, 36, 48, 0.5, 5.5, [
    [0, '#8a94a1'],
    [1, '#39414b'],
  ], 34.5, 46.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9fe0ff';
  ctx.fillRect(50, 39.5, 5, 2.2);
}

function drawEmberBody(ctx: Ctx, p: ArtPalette) {
  // stabiliser spades
  ctx.fillStyle = '#20252c';
  roundRectPath(ctx, 3, 17, 14, 8, 2);
  ctx.fill();
  roundRectPath(ctx, 3, 71, 14, 8, 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  treads(ctx, 10, 20, 78, 18);
  treads(ctx, 10, 58, 78, 18);

  // heavy chassis
  panel(ctx, 14, 28, 68, 40, 6, p.hullLight, p.hullDark);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRectPath(ctx, 66, 33, 13, 30, 3);
  ctx.fill();
  // cab window
  roundRectPath(ctx, 69, 36, 8, 24, 2.5);
  ctx.fillStyle = linear(ctx, 69, 36, 77, 60, [
    [0, '#ffd08a'],
    [1, '#a04e2a'],
  ]);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  // team livery
  ctx.fillStyle = p.team;
  roundRectPath(ctx, 16, 30, 24, 4, 2);
  ctx.fill();
  roundRectPath(ctx, 16, 62, 24, 4, 2);
  ctx.fill();
  // ammo hatches
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  [22, 34, 46].forEach((hx) => {
    roundRectPath(ctx, hx, 37, 8, 22, 2);
    ctx.fill();
  });
}

function drawEmberTurret(ctx: Ctx, p: ArtPalette) {
  // recoil cylinders
  ctx.fillStyle = '#7a8493';
  roundRectPath(ctx, 40, 38, 30, 4, 2);
  ctx.fill();
  roundRectPath(ctx, 40, 54, 30, 4, 2);
  ctx.fill();
  // barrel
  ctx.fillStyle = linear(ctx, 0, 42, 0, 54, [
    [0, '#6b7482'],
    [0.5, '#2f353d'],
    [1, '#1a1e24'],
  ]);
  roundRectPath(ctx, 40, 42, 52, 12, 3);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = p.team;
  ctx.fillRect(58, 42, 4, 12);
  ctx.fillRect(72, 42, 3, 12);
  ctx.fillStyle = '#0f1216';
  roundRectPath(ctx, 86, 40, 9, 16, 2);
  ctx.fill();
  ctx.stroke();

  // mount
  circle(ctx, 40, 48, 18);
  ctx.fillStyle = radial(ctx, 40, 48, 1, 19, [
    [0, p.hullLight],
    [1, p.hullDark],
  ], 35, 43);
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.stroke();
  circle(ctx, 40, 48, 11);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  circle(ctx, 40, 48, 6.5);
  ctx.fillStyle = radial(ctx, 40, 48, 0.5, 7, [
    [0, p.teamLight],
    [1, p.teamDark],
  ], 38, 46);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

export interface UnitSprites {
  body: HTMLCanvasElement;
  turret: HTMLCanvasElement | null;
}

export function drawUnitSprites(unitTypeId: string, p: ArtPalette): UnitSprites {
  const body = createCanvas(UNIT_CANVAS, UNIT_CANVAS);
  const bodyCtx = get2d(body);
  bodyCtx.lineJoin = 'round';

  switch (unitTypeId) {
    case 'courier':
      drawCourierBody(bodyCtx, p);
      return { body, turret: null };
    case 'vanguard':
      drawVanguardBody(bodyCtx, p);
      return { body, turret: null };
    case 'striker': {
      drawStrikerBody(bodyCtx, p);
      const turret = createCanvas(UNIT_CANVAS, UNIT_CANVAS);
      const turretCtx = get2d(turret);
      turretCtx.lineJoin = 'round';
      drawStrikerTurret(turretCtx, p);
      return { body, turret };
    }
    case 'ember': {
      drawEmberBody(bodyCtx, p);
      const turret = createCanvas(UNIT_CANVAS, UNIT_CANVAS);
      const turretCtx = get2d(turret);
      turretCtx.lineJoin = 'round';
      drawEmberTurret(turretCtx, p);
      return { body, turret };
    }
    default: {
      panel(bodyCtx, 22, 22, 52, 52, 8, p.hullLight, p.hullDark);
      return { body, turret: null };
    }
  }
}
