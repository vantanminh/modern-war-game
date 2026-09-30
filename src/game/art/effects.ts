import { circle, createCanvas, createRng, get2d, linear, polygon, radial } from './draw';

/** Soft round sprites reused by every particle effect. */
export function drawGlowTexture(size = 64) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  ctx.fillStyle = radial(ctx, size / 2, size / 2, 0, size / 2, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function drawSmokeTexture(size = 64) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  const rng = createRng(9);
  for (let i = 0; i < 6; i += 1) {
    const x = size / 2 + (rng() - 0.5) * size * 0.3;
    const y = size / 2 + (rng() - 0.5) * size * 0.3;
    const r = size * (0.22 + rng() * 0.12);
    ctx.fillStyle = radial(ctx, x, y, 0, r, [
      [0, 'rgba(255,255,255,0.55)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}

export function drawShadowTexture(size = 64) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  ctx.fillStyle = radial(ctx, size / 2, size / 2, size * 0.12, size / 2, [
    [0, 'rgba(0,0,0,0.6)'],
    [0.7, 'rgba(0,0,0,0.3)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function drawScorchTexture(size = 96) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  const rng = createRng(31);
  ctx.fillStyle = radial(ctx, size / 2, size / 2, size * 0.05, size / 2, [
    [0, 'rgba(8,6,4,0.85)'],
    [0.5, 'rgba(18,14,10,0.5)'],
    [1, 'rgba(18,14,10,0)'],
  ]);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 14; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = size * (0.18 + rng() * 0.22);
    ctx.fillStyle = 'rgba(10,8,6,0.45)';
    circle(ctx, size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 2 + rng() * 5);
    ctx.fill();
  }
  return canvas;
}

/** Ore crystal cluster, 3 variants. */
export function drawCrystalTexture(variant: number, size = 128) {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  const rng = createRng(500 + variant * 17);
  ctx.translate(size / 2, size / 2);

  ctx.fillStyle = radial(ctx, 0, 8, 4, size * 0.45, [
    [0, 'rgba(90,255,170,0.45)'],
    [1, 'rgba(90,255,170,0)'],
  ]);
  ctx.fillRect(-size / 2, -size / 2, size, size);

  const count = 7 + (variant % 3);
  const shards: Array<{ x: number; y: number; h: number; w: number; tilt: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const ring = i === 0 ? 0 : 0.18 + rng() * 0.26;
    const a = rng() * Math.PI * 2;
    shards.push({
      x: Math.cos(a) * ring * size,
      y: Math.sin(a) * ring * size * 0.8,
      h: size * (i === 0 ? 0.34 : 0.14 + rng() * 0.16),
      w: size * (i === 0 ? 0.11 : 0.05 + rng() * 0.05),
      tilt: (rng() - 0.5) * 0.7,
    });
  }
  shards.sort((a, b) => a.y - b.y);

  shards.forEach((shard) => {
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(shard.tilt);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(shard.w * 0.8, 2, shard.w * 1.3, shard.w * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // faceted prism
    polygon(ctx, [
      [0, -shard.h],
      [shard.w, -shard.h * 0.35],
      [shard.w * 0.8, 0],
      [-shard.w * 0.8, 0],
      [-shard.w, -shard.h * 0.35],
    ]);
    ctx.fillStyle = linear(ctx, -shard.w, -shard.h, shard.w, 0, [
      [0, '#c8ffe2'],
      [0.45, '#37d98a'],
      [1, '#0b6b45'],
    ]);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(2,40,26,0.85)';
    ctx.stroke();
    // lit facet
    polygon(ctx, [
      [0, -shard.h],
      [-shard.w, -shard.h * 0.35],
      [-shard.w * 0.8, 0],
      [0, -shard.h * 0.2],
    ]);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fill();
    ctx.restore();
  });
  return canvas;
}

export function drawCargoTexture() {
  const canvas = createCanvas(48, 26);
  const ctx = get2d(canvas);
  const rng = createRng(12);
  for (let i = 0; i < 8; i += 1) {
    const x = 5 + rng() * 38;
    const y = 5 + rng() * 16;
    const s = 3.5 + rng() * 3;
    polygon(ctx, [
      [x, y - s],
      [x + s * 0.8, y],
      [x, y + s],
      [x - s * 0.8, y],
    ]);
    ctx.fillStyle = i % 2 ? '#6bffb0' : '#2fd483';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,50,30,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  return canvas;
}
