import { findPath, toTileKey } from '../pathfinding';
import type { GameConfig, GridPoint } from '../types';
import { circle, createCanvas, createRng, get2d, linear, polygon, radial, type Ctx } from './draw';

export const TERRAIN_SCALE = 1.5;

const cache = new Map<string, HTMLCanvasElement>();

function makeNoise(seed: number) {
  const lattice = (ix: number, iy: number) => {
    let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x: number, y: number, octaves = 4) => {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      total += value(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return total / norm;
  };
}

function mix(a: number[], b: number[], t: number) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function paintGround(config: GameConfig, scale: number) {
  const tile = config.tileSize;
  const worldW = config.map.width * tile;
  const worldH = config.map.height * tile;
  const cell = 8; // world px per noise texel
  const nw = Math.ceil(worldW / cell);
  const nh = Math.ceil(worldH / cell);
  const noise = makeNoise(913);
  const detail = makeNoise(41);
  const field = createCanvas(nw, nh);
  const fctx = get2d(field);
  const image = fctx.createImageData(nw, nh);

  const grass = [64, 86, 52];
  const grassDark = [46, 66, 42];
  const dry = [112, 106, 68];
  const dirt = [128, 102, 70];

  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      const wx = x * cell;
      const wy = y * cell;
      const big = noise(wx / 520, wy / 520, 3);
      const small = detail(wx / 90, wy / 90, 3);
      let color = mix(grassDark, grass, small);
      color = mix(color, dry, Math.min(1, Math.max(0, (big - 0.42) * 3.2)));
      color = mix(color, dirt, Math.min(1, Math.max(0, (big - 0.62) * 4)) * 0.85);
      const shade = 0.92 + detail(wx / 26, wy / 26, 2) * 0.16;
      const i = (y * nw + x) * 4;
      image.data[i] = Math.min(255, color[0] * shade);
      image.data[i + 1] = Math.min(255, color[1] * shade);
      image.data[i + 2] = Math.min(255, color[2] * shade);
      image.data[i + 3] = 255;
    }
  }
  fctx.putImageData(image, 0, 0);

  const canvas = createCanvas(worldW * scale, worldH * scale);
  const ctx = get2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(field, 0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  return { canvas, ctx, worldW, worldH };
}

function tileCenter(config: GameConfig, point: GridPoint): [number, number] {
  return [(point.x + 0.5) * config.tileSize, (point.y + 0.5) * config.tileSize];
}

function strokeSpline(ctx: Ctx, points: Array<[number, number]>) {
  if (points.length < 2) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    );
  }
  ctx.stroke();
}

function paintRoads(ctx: Ctx, config: GameConfig) {
  const spawns = config.map.spawns;
  if (spawns.length < 2) {
    return;
  }
  const blocked = new Set(config.map.terrainBlocked.map((p) => toTileKey(p.x, p.y)));
  const links: Array<[number, number]> = spawns.length === 2 ? [[0, 1]] : spawns.map((_, i) => [i, (i + 1) % spawns.length]);
  const rng = createRng(5);

  links.forEach(([a, b]) => {
    const path = findPath(config, blocked, spawns[a].rally, spawns[b].rally);
    if (path.length < 2) {
      return;
    }
    const sampled: Array<[number, number]> = [];
    path.forEach((point, index) => {
      if (index % 3 === 0 || index === path.length - 1) {
        const [x, y] = tileCenter(config, point);
        sampled.push([x + (rng() - 0.5) * 8, y + (rng() - 0.5) * 8]);
      }
    });
    const from = tileCenter(config, spawns[a].hq);
    const to = tileCenter(config, spawns[b].hq);
    sampled.unshift([from[0] + config.tileSize, from[1] + config.tileSize]);
    sampled.push([to[0] + config.tileSize, to[1] + config.tileSize]);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(70,52,34,0.18)';
    ctx.lineWidth = config.tileSize * 2.2;
    strokeSpline(ctx, sampled);
    ctx.strokeStyle = 'rgba(146,118,82,0.55)';
    ctx.lineWidth = config.tileSize * 1.5;
    strokeSpline(ctx, sampled);
    ctx.strokeStyle = 'rgba(176,148,104,0.4)';
    ctx.lineWidth = config.tileSize * 0.9;
    strokeSpline(ctx, sampled);
    // wheel ruts
    ctx.strokeStyle = 'rgba(60,44,28,0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    strokeSpline(ctx, sampled.map(([x, y]) => [x - config.tileSize * 0.28, y - config.tileSize * 0.1]));
    strokeSpline(ctx, sampled.map(([x, y]) => [x + config.tileSize * 0.28, y + config.tileSize * 0.1]));
    ctx.setLineDash([]);
  });
}

function paintBasePads(ctx: Ctx, config: GameConfig) {
  const tile = config.tileSize;
  config.map.spawns.forEach((spawn) => {
    const x = (spawn.hq.x - 2) * tile;
    const y = (spawn.hq.y - 2) * tile;
    const size = 7 * tile;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(80,88,96,0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, tile * 0.6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = linear(ctx, x, y, x + size, y + size, [
      [0, 'rgba(120,128,136,0.55)'],
      [1, 'rgba(64,70,78,0.55)'],
    ]);
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, tile * 0.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 7; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * tile, y + 4);
      ctx.lineTo(x + i * tile, y + size - 4);
      ctx.moveTo(x + 4, y + i * tile);
      ctx.lineTo(x + size - 4, y + i * tile);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,180,0,0.45)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 6, size - 12, size - 12, tile * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function paintOrePatches(ctx: Ctx, config: GameConfig) {
  const tile = config.tileSize;
  const rng = createRng(21);
  config.map.resourceNodes.forEach((node) => {
    const cx = (node.x + 0.5) * tile;
    const cy = (node.y + 0.5) * tile;
    ctx.fillStyle = radial(ctx, cx, cy, tile * 0.3, tile * 2.4, [
      [0, 'rgba(24,52,40,0.75)'],
      [0.6, 'rgba(38,70,52,0.35)'],
      [1, 'rgba(38,70,52,0)'],
    ]);
    circle(ctx, cx, cy, tile * 2.4);
    ctx.fill();
    for (let i = 0; i < 26; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = tile * (0.7 + rng() * 1.5);
      ctx.fillStyle = `rgba(${40 + rng() * 30},${90 + rng() * 60},${70 + rng() * 40},${0.25 + rng() * 0.3})`;
      circle(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + rng() * 2.2);
      ctx.fill();
    }
  });
}

function paintDecor(ctx: Ctx, config: GameConfig, worldW: number, worldH: number) {
  const rng = createRng(1337);
  const tile = config.tileSize;
  const blocked = new Set(config.map.terrainBlocked.map((p) => toTileKey(p.x, p.y)));
  const isOpen = (x: number, y: number) => !blocked.has(toTileKey(Math.floor(x / tile), Math.floor(y / tile)));

  // craters
  for (let i = 0; i < 16; i += 1) {
    const x = rng() * worldW;
    const y = rng() * worldH;
    if (!isOpen(x, y)) {
      continue;
    }
    const r = tile * (0.4 + rng() * 0.6);
    ctx.fillStyle = radial(ctx, x, y, r * 0.2, r * 1.5, [
      [0, 'rgba(20,16,10,0.55)'],
      [0.55, 'rgba(40,32,20,0.35)'],
      [1, 'rgba(40,32,20,0)'],
    ]);
    circle(ctx, x, y, r * 1.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,160,110,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 1, y - 1, r * 0.95, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
  }

  // grass tufts
  for (let i = 0; i < 1400; i += 1) {
    const x = rng() * worldW;
    const y = rng() * worldH;
    if (!isOpen(x, y)) {
      continue;
    }
    const h = 3 + rng() * 5;
    const tint = rng();
    ctx.strokeStyle = tint > 0.5 ? 'rgba(112,150,80,0.55)' : 'rgba(34,54,30,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 2, y);
    ctx.lineTo(x - 3 + rng() * 2, y - h);
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 2, y - h * 1.2);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 3 - rng() * 2, y - h);
    ctx.stroke();
  }

  // pebbles
  for (let i = 0; i < 520; i += 1) {
    const x = rng() * worldW;
    const y = rng() * worldH;
    if (!isOpen(x, y)) {
      continue;
    }
    const r = 1 + rng() * 2.4;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 1.2, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgb(${120 + rng() * 40},${112 + rng() * 36},${98 + rng() * 30})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintObstacles(ctx: Ctx, config: GameConfig) {
  const tile = config.tileSize;
  const rng = createRng(4242);

  const outline = (area: { x: number; y: number; width: number; height: number }) => {
    const points: Array<[number, number]> = [];
    const x0 = area.x * tile;
    const y0 = area.y * tile;
    const x1 = (area.x + area.width) * tile;
    const y1 = (area.y + area.height) * tile;
    const step = tile * 0.55;
    const jitter = () => (rng() - 0.5) * tile * 0.34;
    for (let x = x0; x < x1; x += step) points.push([x + jitter(), y0 + jitter()]);
    for (let y = y0; y < y1; y += step) points.push([x1 + jitter(), y + jitter()]);
    for (let x = x1; x > x0; x -= step) points.push([x + jitter(), y1 + jitter()]);
    for (let y = y1; y > y0; y -= step) points.push([x0 + jitter(), y + jitter()]);
    return points;
  };

  config.map.obstacleAreas.forEach((area) => {
    const shape = outline(area);
    const x0 = area.x * tile;
    const y0 = area.y * tile;
    const w = area.width * tile;
    const h = area.height * tile;

    // cast shadow
    ctx.save();
    ctx.translate(tile * 0.22, tile * 0.3);
    polygon(ctx, shape);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();

    // rock mass
    polygon(ctx, shape);
    ctx.fillStyle = linear(ctx, x0, y0, x0 + w, y0 + h, [
      [0, '#7d766d'],
      [0.5, '#5b554f'],
      [1, '#3c3835'],
    ]);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#26221f';
    ctx.stroke();

    ctx.save();
    polygon(ctx, shape);
    ctx.clip();

    // faceted boulders
    const count = Math.ceil((area.width * area.height) * 2.6);
    for (let i = 0; i < count; i += 1) {
      const bx = x0 + rng() * w;
      const by = y0 + rng() * h;
      const br = tile * (0.35 + rng() * 0.55);
      const sides = 5 + Math.floor(rng() * 3);
      const pts: Array<[number, number]> = [];
      for (let s = 0; s < sides; s += 1) {
        const a = (s / sides) * Math.PI * 2 + rng() * 0.5;
        const rr = br * (0.75 + rng() * 0.4);
        pts.push([bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.86]);
      }
      polygon(ctx, pts);
      const tone = 0.85 + rng() * 0.3;
      ctx.fillStyle = linear(ctx, bx - br, by - br, bx + br, by + br, [
        [0, `rgb(${Math.min(255, 150 * tone)},${Math.min(255, 142 * tone)},${Math.min(255, 132 * tone)})`],
        [1, `rgb(${68 * tone},${62 * tone},${58 * tone})`],
      ]);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(20,16,12,0.7)';
      ctx.stroke();
      // highlight ridge
      ctx.strokeStyle = 'rgba(255,245,225,0.28)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.stroke();
    }

    // moss on the north-west lip
    ctx.strokeStyle = 'rgba(96,130,70,0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + h * 0.4);
    ctx.lineTo(x0 + 4, y0 + 4);
    ctx.lineTo(x0 + w * 0.6, y0 + 4);
    ctx.stroke();
    ctx.restore();
  });
}

function paintVignette(ctx: Ctx, worldW: number, worldH: number) {
  ctx.fillStyle = radial(ctx, worldW / 2, worldH / 2, Math.min(worldW, worldH) * 0.45, Math.max(worldW, worldH) * 0.72, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.5)'],
  ]);
  ctx.fillRect(0, 0, worldW, worldH);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, worldW, worldH);
}

/** Paints the whole battlefield once; the scene and the minimap both reuse the result. */
export function renderTerrain(config: GameConfig, scale = TERRAIN_SCALE): HTMLCanvasElement {
  const key = `${config.map.id}:${config.tileSize}:${config.map.spawns.map((s) => s.playerId).join(',')}:${scale}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const { canvas, ctx, worldW, worldH } = paintGround(config, scale);
  ctx.lineJoin = 'round';
  paintRoads(ctx, config);
  paintBasePads(ctx, config);
  paintOrePatches(ctx, config);
  paintDecor(ctx, config, worldW, worldH);
  paintObstacles(ctx, config);
  paintVignette(ctx, worldW, worldH);

  cache.set(key, canvas);
  return canvas;
}
