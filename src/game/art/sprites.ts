import type { FactionId } from '../types';
import { drawBuildingSprites, type BuildingSprites } from './buildings';
import { getPalette } from './palette';
import { drawUnitSprites, type UnitSprites } from './units';

const unitCache = new Map<string, UnitSprites>();
const buildingCache = new Map<string, BuildingSprites>();

export function getUnitSprites(unitTypeId: string, factionId: FactionId, slot: number): UnitSprites {
  const key = `${unitTypeId}:${factionId}:${slot}`;
  let sprites = unitCache.get(key);
  if (!sprites) {
    sprites = drawUnitSprites(unitTypeId, getPalette(factionId, slot));
    unitCache.set(key, sprites);
  }
  return sprites;
}

export function getBuildingSprites(
  buildingTypeId: string,
  footprint: { width: number; height: number },
  factionId: FactionId,
  slot: number,
): BuildingSprites {
  const key = `${buildingTypeId}:${factionId}:${slot}`;
  let sprites = buildingCache.get(key);
  if (!sprites) {
    sprites = drawBuildingSprites(buildingTypeId, footprint, getPalette(factionId, slot));
    buildingCache.set(key, sprites);
  }
  return sprites;
}
