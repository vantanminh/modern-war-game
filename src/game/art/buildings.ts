import { circle, createCanvas, createRng, get2d, linear, panel, polygon, radial, regularPolygon, roundRectPath, type Ctx } from './draw';
import type { ArtPalette } from './palette';

export const TILE_PX = 80; // texture pixels per map tile
export const BUILDING_PAD = 20; // room around the footprint for the drop shadow

const OUTLINE = 'rgba(6,10,16,0.9)';

export interface BuildingSprites {
  body: HTMLCanvasElement;
  /** Optional animated part (radar dish, turret) that is rendered above the body. */
  top: HTMLCanvasElement | null;
  /** Offset of the top part's centre from the footprint centre, in body texture pixels. */
  topOffset: { x: number; y: number };
  /** Where production/activity glow should sit relative to footprint centre (texture px). */
  glowOffset: { x: number; y: number };
  glowSize: number;
}

function slab(ctx: Ctx, w: number, h: number, base: string, edge: string) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 9;
  roundRectPath(ctx, 0, 0, w, h, 12);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, 0, 0, w, h, 12);
  ctx.fillStyle = linear(ctx, 0, 0, w, h, [
    [0, edge],
    [1, base],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // pavement seams
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  for (let x = 40; x < w - 10; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, h - 6);
    ctx.stroke();
  }
  for (let y = 40; y < h - 10; y += 40) {
    ctx.beginPath();
    ctx.moveTo(6, y);
    ctx.lineTo(w - 6, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]].forEach(([bx, by]) => {
    circle(ctx, bx, by, 2.2);
    ctx.fill();
  });
}

function hazardStripe(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 2);
  ctx.clip();
  ctx.fillStyle = '#e8b400';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#16191f';
  for (let sx = x - h; sx < x + w + h; sx += h * 1.1) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h * 0.55, y + h);
    ctx.lineTo(sx + h * 1.55, y);
    ctx.lineTo(sx + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function sandbags(ctx: Ctx, x: number, y: number, count: number, dx: number, dy: number, size = 11) {
  for (let i = 0; i < count; i += 1) {
    ctx.save();
    ctx.translate(x + dx * i, y + dy * i);
    ctx.rotate(dx === 0 ? Math.PI / 2 : 0);
    roundRectPath(ctx, -size, -size * 0.55, size * 2, size * 1.1, size * 0.5);
    ctx.fillStyle = linear(ctx, 0, -size * 0.55, 0, size * 0.55, [
      [0, '#b7a274'],
      [1, '#7d6c47'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,8,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

function barrel(ctx: Ctx, x: number, y: number, color: string) {
  circle(ctx, x, y, 7);
  ctx.fillStyle = radial(ctx, x, y, 0.5, 8, [
    [0, color],
    [1, '#1a1c20'],
  ], x - 2, y - 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  circle(ctx, x, y, 3.4);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.stroke();
}

function drawCommandCore(ctx: Ctx, w: number, h: number, p: ArtPalette) {
  slab(ctx, w, h, '#3b424b', '#5c6570');
  const cx = w / 2;
  const cy = h / 2;

  // landing markings
  ctx.strokeStyle = 'rgba(232,180,0,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  roundRectPath(ctx, 14, 14, w - 28, h - 28, 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // side wings with solar arrays
  [[16, cy - 34], [w - 16 - 46, cy - 34]].forEach(([wx, wy]) => {
    panel(ctx, wx, wy, 46, 68, 5, '#7c8794', '#3f4751');
    ctx.fillStyle = linear(ctx, wx, wy, wx + 46, wy + 68, [
      [0, '#2c5fa0'],
      [1, '#122a4d'],
    ]);
    roundRectPath(ctx, wx + 5, wy + 6, 36, 56, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(wx + 5 + i * 9, wy + 6);
      ctx.lineTo(wx + 5 + i * 9, wy + 62);
      ctx.stroke();
    }
    for (let i = 1; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(wx + 5, wy + 6 + i * 11.2);
      ctx.lineTo(wx + 41, wy + 6 + i * 11.2);
      ctx.stroke();
    }
  });

  // north / south modules
  [[cx - 30, 12], [cx - 30, h - 12 - 36]].forEach(([mx, my]) => {
    panel(ctx, mx, my, 60, 36, 5, p.hullLight, p.hullDark);
    ctx.fillStyle = p.team;
    roundRectPath(ctx, mx + 6, my + 14, 48, 8, 3);
    ctx.fill();
  });

  // main body
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  regularPolygon(ctx, cx, cy, 76, 8, Math.PI / 8);
  ctx.fillStyle = p.hull;
  ctx.fill();
  ctx.restore();
  regularPolygon(ctx, cx, cy, 76, 8, Math.PI / 8);
  ctx.fillStyle = linear(ctx, cx - 76, cy - 76, cx + 76, cy + 76, [
    [0, p.hullLight],
    [0.55, p.hull],
    [1, p.hullDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  regularPolygon(ctx, cx, cy, 62, 8, Math.PI / 8);
  ctx.lineWidth = 7;
  ctx.strokeStyle = p.team;
  ctx.stroke();
  regularPolygon(ctx, cx, cy, 58, 8, Math.PI / 8);
  ctx.fillStyle = linear(ctx, cx, cy - 58, cx, cy + 58, [
    [0, '#39414c'],
    [1, '#1f242b'],
  ]);
  ctx.fill();

  // roof plating
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34);
    ctx.lineTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56);
    ctx.stroke();
  }

  // command dome
  circle(ctx, cx, cy, 34);
  ctx.fillStyle = radial(ctx, cx, cy, 2, 36, [
    [0, '#dff6ff'],
    [0.35, p.glass],
    [0.8, '#1d5a86'],
    [1, '#0d2a44'],
  ], cx - 10, cy - 12);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(220,240,255,0.7)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 24, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  circle(ctx, cx, cy, 10);
  ctx.fillStyle = p.teamLight;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;

  // corner masts
  [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]].forEach(([mx, my]) => {
    circle(ctx, mx, my, 7);
    ctx.fillStyle = '#2b3138';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    circle(ctx, mx, my, 3);
    ctx.fillStyle = '#ff4d3d';
    ctx.fill();
  });
}

function drawRadar(p: ArtPalette) {
  const canvas = createCanvas(76, 76);
  const ctx = get2d(canvas);
  ctx.translate(38, 38);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8a95a3';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 30, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0, 0, 2, 32, [
    [0, '#f2f6fa'],
    [1, '#7d8895'],
  ], -4, -8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 21, 0, 0, Math.PI * 2);
  ctx.stroke();
  // feed arm
  ctx.strokeStyle = '#2b3138';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(28, 0);
  ctx.stroke();
  circle(ctx, 28, 0, 4);
  ctx.fillStyle = p.team;
  ctx.fill();
  circle(ctx, 0, 0, 5);
  ctx.fillStyle = '#2b3138';
  ctx.fill();
  return canvas;
}

function drawRefinery(ctx: Ctx, w: number, h: number, p: ArtPalette) {
  slab(ctx, w, h, '#3e444c', '#5d6670');

  // pipes
  ctx.lineCap = 'round';
  const pipe = (points: Array<[number, number]>) => {
    ctx.strokeStyle = '#151a20';
    ctx.lineWidth = 11;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = '#c99a1a';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  };
  pipe([[76, 42], [104, 42], [104, 56], [128, 56]]);
  pipe([[76, 118], [104, 118], [104, 104], [128, 104]]);

  // storage tanks
  [[58, 44], [58, 116]].forEach(([tx, ty]) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 5;
    circle(ctx, tx, ty, 34);
    ctx.fillStyle = '#9aa5b1';
    ctx.fill();
    ctx.restore();
    circle(ctx, tx, ty, 34);
    ctx.fillStyle = radial(ctx, tx, ty, 2, 36, [
      [0, '#f3f7fa'],
      [0.6, p.hull],
      [1, p.hullDark],
    ], tx - 11, ty - 12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    circle(ctx, tx, ty, 27);
    ctx.lineWidth = 5;
    ctx.strokeStyle = p.team;
    ctx.stroke();
    circle(ctx, tx, ty, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // valve wheel
    ctx.strokeStyle = '#d63c2f';
    ctx.lineWidth = 2;
    circle(ctx, tx + 4, ty + 4, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 2, ty + 4);
    ctx.lineTo(tx + 10, ty + 4);
    ctx.moveTo(tx + 4, ty - 2);
    ctx.lineTo(tx + 4, ty + 10);
    ctx.stroke();
  });

  // processing block
  panel(ctx, 126, 16, 72, 128, 6, p.hullLight, p.hullDark);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRectPath(ctx, 133, 24, 58, 112, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1.2;
  for (let y = 32; y < 132; y += 10) {
    ctx.beginPath();
    ctx.moveTo(136, y);
    ctx.lineTo(188, y);
    ctx.stroke();
  }
  ctx.fillStyle = p.team;
  roundRectPath(ctx, 126, 68, 72, 10, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRectPath(ctx, 128, 69, 68, 2.6, 1);
  ctx.fill();
  // vents
  [[152, 42], [152, 112], [176, 42], [176, 112]].forEach(([vx, vy]) => {
    circle(ctx, vx, vy, 9);
    ctx.fillStyle = '#1a1e24';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vx - 6, vy);
    ctx.lineTo(vx + 6, vy);
    ctx.moveTo(vx, vy - 6);
    ctx.lineTo(vx, vy + 6);
    ctx.stroke();
  });

  // ore receiving bay
  panel(ctx, 204, 26, 28, 108, 5, '#2a3038', '#14171c');
  ctx.strokeStyle = 'rgba(232,180,0,0.65)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(209, 32, 18, 96);
  ctx.setLineDash([]);
  const rng = createRng(77);
  for (let i = 0; i < 9; i += 1) {
    const sx = 210 + rng() * 14;
    const sy = 38 + rng() * 84;
    const s = 4 + rng() * 5;
    polygon(ctx, [
      [sx, sy - s],
      [sx + s * 0.7, sy],
      [sx, sy + s],
      [sx - s * 0.7, sy],
    ]);
    ctx.fillStyle = i % 2 ? '#5ff0a0' : '#2fbf76';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,40,20,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // arrow markings
  ctx.fillStyle = 'rgba(232,180,0,0.85)';
  polygon(ctx, [[218, 140], [226, 128], [210, 128]]);
  ctx.fill();
}

function drawBarracks(ctx: Ctx, w: number, h: number, p: ArtPalette) {
  slab(ctx, w, h, '#40474f', '#5e6771');

  // sandbags
  sandbags(ctx, 60, h - 14, 4, 22, 0);
  sandbags(ctx, w - 60 - 66, h - 14, 4, 22, 0);
  barrel(ctx, w - 18, 26, '#d0521f');
  barrel(ctx, w - 18, 44, '#2f6fc0');

  // gabled roof
  const rx = 18;
  const ry = 12;
  const rw = w - 36;
  const rh = 104;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 7;
  roundRectPath(ctx, rx, ry, rw, rh, 6);
  ctx.fillStyle = p.hullDark;
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, rx, ry, rw, rh, 6);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0, ry, 0, ry + rh / 2, [
    [0, p.hullLight],
    [1, p.hull],
  ]);
  ctx.fillRect(rx, ry, rw, rh / 2);
  ctx.fillStyle = linear(ctx, 0, ry + rh / 2, 0, ry + rh, [
    [0, p.hull],
    [1, p.hullDark],
  ]);
  ctx.fillRect(rx, ry + rh / 2, rw, rh / 2);
  // roof ribs
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1.4;
  for (let x = rx + 12; x < rx + rw; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x, ry + rh);
    ctx.stroke();
  }
  // ridge
  ctx.fillStyle = p.team;
  ctx.fillRect(rx, ry + rh / 2 - 6, rw, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(rx, ry + rh / 2 - 6, rw, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let x = rx + 10; x < rx + rw - 8; x += 26) {
    polygon(ctx, [[x, ry + rh / 2 - 4], [x + 9, ry + rh / 2], [x, ry + rh / 2 + 4]]);
    ctx.fill();
  }
  ctx.restore();
  roundRectPath(ctx, rx, ry, rw, rh, 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // roof vents
  [[rx + 40, ry + 24], [rx + rw - 40, ry + 24], [rx + 40, ry + rh - 24], [rx + rw - 40, ry + rh - 24]].forEach(([vx, vy]) => {
    panel(ctx, vx - 10, vy - 8, 20, 16, 3, '#59626e', '#2a2f36');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i += 4) {
      ctx.beginPath();
      ctx.moveTo(vx - 8, vy + i);
      ctx.lineTo(vx + 8, vy + i);
      ctx.stroke();
    }
  });

  // entrance
  panel(ctx, w / 2 - 34, ry + rh - 2, 68, 30, 4, '#242a31', '#101318');
  hazardStripe(ctx, w / 2 - 34, ry + rh + 26, 68, 8);
  ctx.fillStyle = p.team;
  ctx.fillRect(w / 2 - 34, ry + rh - 2, 68, 3);
  // flag
  ctx.strokeStyle = '#1b1f25';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(22, h - 14);
  ctx.lineTo(22, h - 42);
  ctx.stroke();
  polygon(ctx, [[22, h - 42], [40, h - 37], [22, h - 30]]);
  ctx.fillStyle = p.team;
  ctx.fill();
}

function drawGear(ctx: Ctx, cx: number, cy: number, r: number, teeth: number) {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i += 1) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.78;
    ctx.lineTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
    ctx.lineTo(cx + Math.cos(a1 - 0.02) * rr, cy + Math.sin(a1 - 0.02) * rr);
  }
  ctx.closePath();
}

function drawMotorPool(ctx: Ctx, w: number, h: number, p: ArtPalette) {
  slab(ctx, w, h, '#3d434b', '#5b646e');

  // hangar
  const hx = 16;
  const hy = 14;
  const hw = w - 32;
  const hh = 146;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 7;
  roundRectPath(ctx, hx, hy, hw, hh, 7);
  ctx.fillStyle = p.hullDark;
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, hx, hy, hw, hh, 7);
  ctx.fillStyle = linear(ctx, hx, hy, hx + hw, hy + hh, [
    [0, p.hullLight],
    [0.6, p.hull],
    [1, p.hullDark],
  ]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.17)';
  ctx.lineWidth = 1.6;
  for (let x = hx + 9; x < hx + hw; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, hy);
    ctx.lineTo(x, hy + hh);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (let x = hx + 4; x < hx + hw; x += 18) {
    ctx.fillRect(x, hy, 2, hh);
  }
  ctx.fillStyle = p.team;
  ctx.fillRect(hx, hy + 8, hw, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(hx, hy + 8, hw, 3);
  ctx.restore();
  roundRectPath(ctx, hx, hy, hw, hh, 7);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // skylights
  [hx + 26, hx + hw / 2 - 26, hx + hw - 78].forEach((sx) => {
    roundRectPath(ctx, sx, hy + 40, 52, 28, 3);
    ctx.fillStyle = linear(ctx, sx, hy + 40, sx + 52, hy + 68, [
      [0, '#bfeaff'],
      [1, '#2f6a94'],
    ]);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(sx + 26, hy + 40);
    ctx.lineTo(sx + 26, hy + 68);
    ctx.stroke();
  });

  // gear emblem
  drawGear(ctx, hx + hw / 2, hy + 106, 24, 10);
  ctx.fillStyle = 'rgba(20,24,30,0.55)';
  ctx.fill();
  drawGear(ctx, hx + hw / 2 - 1, hy + 105, 22, 10);
  ctx.fillStyle = p.team;
  ctx.fill();
  circle(ctx, hx + hw / 2 - 1, hy + 105, 8);
  ctx.fillStyle = p.hullDark;
  ctx.fill();

  // bay doors
  [hx + 12, hx + hw / 2 - 30, hx + hw - 72].forEach((dx) => {
    panel(ctx, dx, hy + hh - 6, 60, 36, 4, '#252b32', '#0f1216');
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(dx + 4, hy + hh - 6 + i * 7);
      ctx.lineTo(dx + 56, hy + hh - 6 + i * 7);
      ctx.stroke();
    }
  });
  hazardStripe(ctx, hx + 8, hy + hh + 30, hw - 16, 8);

  // tyres and crates
  [[w - 26, h - 14], [w - 42, h - 12], [26, h - 14]].forEach(([tx, ty]) => {
    circle(ctx, tx, ty, 8);
    ctx.fillStyle = '#16181c';
    ctx.fill();
    circle(ctx, tx, ty, 3.4);
    ctx.fillStyle = '#4a515c';
    ctx.fill();
  });
}

function drawSentryBase(ctx: Ctx, w: number, h: number, p: ArtPalette) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 8;
  regularPolygon(ctx, cx, cy, 78, 8, Math.PI / 8);
  ctx.fillStyle = '#48505a';
  ctx.fill();
  ctx.restore();
  regularPolygon(ctx, cx, cy, 78, 8, Math.PI / 8);
  ctx.fillStyle = linear(ctx, 0, 0, w, h, [
    [0, '#6a7480'],
    [1, '#363d46'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // sandbag ring
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * 66, cy + Math.sin(a) * 66);
    ctx.rotate(a + Math.PI / 2);
    roundRectPath(ctx, -12, -6, 24, 12, 6);
    ctx.fillStyle = linear(ctx, 0, -6, 0, 6, [
      [0, '#bda978'],
      [1, '#7d6c47'],
    ]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,8,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  circle(ctx, cx, cy, 48);
  ctx.fillStyle = linear(ctx, cx - 40, cy - 40, cx + 40, cy + 40, [
    [0, '#59626e'],
    [1, '#2a3038'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  circle(ctx, cx, cy, 40);
  ctx.lineWidth = 5;
  ctx.strokeStyle = p.team;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
    ctx.lineTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38);
    ctx.stroke();
  }
  barrel(ctx, 20, 22, '#c9a227');
  barrel(ctx, w - 20, h - 22, '#c9a227');
}

function drawSentryTurret(p: ArtPalette) {
  const canvas = createCanvas(112, 112);
  const ctx = get2d(canvas);
  ctx.lineJoin = 'round';
  // twin barrels
  [-9, 9].forEach((oy) => {
    ctx.fillStyle = linear(ctx, 0, 56 + oy - 4, 0, 56 + oy + 4, [
      [0, '#79828f'],
      [0.5, '#2f353d'],
      [1, '#181b20'],
    ]);
    roundRectPath(ctx, 56, 56 + oy - 4, 50, 8, 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = p.teamLight;
    ctx.fillRect(98, 56 + oy - 3, 6, 6);
  });
  // shield
  polygon(ctx, [[34, 36], [62, 30], [70, 44], [70, 68], [62, 82], [34, 76], [26, 66], [26, 46]]);
  ctx.fillStyle = linear(ctx, 26, 30, 70, 82, [
    [0, p.hullLight],
    [0.6, p.hull],
    [1, p.hullDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  circle(ctx, 46, 56, 13);
  ctx.fillStyle = radial(ctx, 46, 56, 1, 14, [
    [0, '#ffffff'],
    [0.4, p.teamLight],
    [1, p.teamDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  circle(ctx, 42, 51, 3.4);
  ctx.fill();
  return canvas;
}

export function buildingCanvasSize(footprint: { width: number; height: number }) {
  return {
    width: footprint.width * TILE_PX + BUILDING_PAD * 2,
    height: footprint.height * TILE_PX + BUILDING_PAD * 2,
  };
}

export function drawBuildingSprites(
  buildingTypeId: string,
  footprint: { width: number; height: number },
  p: ArtPalette,
): BuildingSprites {
  const size = buildingCanvasSize(footprint);
  const body = createCanvas(size.width, size.height);
  const ctx = get2d(body);
  ctx.lineJoin = 'round';
  ctx.translate(BUILDING_PAD, BUILDING_PAD);
  const w = footprint.width * TILE_PX;
  const h = footprint.height * TILE_PX;

  switch (buildingTypeId) {
    case 'command-core':
      drawCommandCore(ctx, w, h, p);
      return {
        body,
        top: drawRadar(p),
        topOffset: { x: 0, y: 0 },
        glowOffset: { x: 0, y: 0 },
        glowSize: 130,
      };
    case 'refinery':
      drawRefinery(ctx, w, h, p);
      return { body, top: null, topOffset: { x: 0, y: 0 }, glowOffset: { x: 56, y: 0 }, glowSize: 90 };
    case 'barracks':
      drawBarracks(ctx, w, h, p);
      return { body, top: null, topOffset: { x: 0, y: 0 }, glowOffset: { x: 0, y: h / 2 - 22 }, glowSize: 80 };
    case 'motor-pool':
      drawMotorPool(ctx, w, h, p);
      return { body, top: null, topOffset: { x: 0, y: 0 }, glowOffset: { x: 0, y: h / 2 - 40 }, glowSize: 120 };
    case 'sentry':
      drawSentryBase(ctx, w, h, p);
      return {
        body,
        top: drawSentryTurret(p),
        topOffset: { x: 0, y: 0 },
        glowOffset: { x: 0, y: 0 },
        glowSize: 60,
      };
    default:
      slab(ctx, w, h, '#3d434b', '#5b646e');
      return { body, top: null, topOffset: { x: 0, y: 0 }, glowOffset: { x: 0, y: 0 }, glowSize: 60 };
  }
}
