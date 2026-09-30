import type { FactionId, GameConfig } from '../types';
import { createCanvas, get2d, linear, roundRectPath } from './draw';
import { getBuildingSprites, getUnitSprites } from './sprites';
import { TEAM_COLORS } from './palette';

const ICON_SIZE = 96;
const iconCache = new Map<string, string>();

/** Renders a unit or building portrait to a data URL, used by the DOM HUD. */
export function getIconUrl(
  config: GameConfig,
  kind: 'unit' | 'building',
  id: string,
  factionId: FactionId,
  slot = 0,
): string {
  const key = `${kind}:${id}:${factionId}:${slot}`;
  const cached = iconCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = createCanvas(ICON_SIZE, ICON_SIZE);
  const ctx = get2d(canvas);
  roundRectPath(ctx, 1, 1, ICON_SIZE - 2, ICON_SIZE - 2, 14);
  ctx.fillStyle = linear(ctx, 0, 0, ICON_SIZE, ICON_SIZE, [
    [0, '#26384c'],
    [1, '#0f1a27'],
  ]);
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, 1, 1, ICON_SIZE - 2, ICON_SIZE - 2, 14);
  ctx.clip();
  ctx.fillStyle = TEAM_COLORS[slot % TEAM_COLORS.length];
  ctx.globalAlpha = 0.16;
  ctx.fillRect(0, ICON_SIZE * 0.62, ICON_SIZE, ICON_SIZE);
  ctx.globalAlpha = 1;

  if (kind === 'unit') {
    const sprites = getUnitSprites(id, factionId, slot);
    ctx.translate(ICON_SIZE / 2, ICON_SIZE / 2);
    ctx.rotate(-Math.PI / 8);
    ctx.drawImage(sprites.body, -ICON_SIZE / 2, -ICON_SIZE / 2);
    if (sprites.turret) {
      ctx.drawImage(sprites.turret, -ICON_SIZE / 2, -ICON_SIZE / 2);
    }
  } else {
    const footprint = config.buildings[id].footprint;
    const sprites = getBuildingSprites(id, footprint, factionId, slot);
    const scale = Math.min((ICON_SIZE - 6) / sprites.body.width, (ICON_SIZE - 6) / sprites.body.height);
    const w = sprites.body.width * scale;
    const h = sprites.body.height * scale;
    ctx.drawImage(sprites.body, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
    if (sprites.top) {
      const tw = sprites.top.width * scale;
      const th = sprites.top.height * scale;
      ctx.drawImage(
        sprites.top,
        ICON_SIZE / 2 + sprites.topOffset.x * scale - tw / 2,
        ICON_SIZE / 2 + sprites.topOffset.y * scale - th / 2,
        tw,
        th,
      );
    }
  }
  ctx.restore();
  roundRectPath(ctx, 1, 1, ICON_SIZE - 2, ICON_SIZE - 2, 14);
  ctx.strokeStyle = 'rgba(160,190,220,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const url = canvas.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}
