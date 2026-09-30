import type { FactionId } from '../types';

export interface ArtPalette {
  hull: string;
  hullLight: string;
  hullDark: string;
  team: string;
  teamLight: string;
  teamDark: string;
  metal: string;
  glass: string;
}

/** Team colour per spawn slot, so four-way LAN matches stay readable. */
export const TEAM_COLORS = ['#3d9bff', '#ff5147', '#58d05e', '#ffb02e'] as const;

const HULLS: Record<FactionId, { hull: string; light: string; dark: string }> = {
  aurora: { hull: '#aab7c4', light: '#dbe5ee', dark: '#65727f' },
  obsidian: { hull: '#5a5f6b', light: '#8b92a1', dark: '#2c3038' },
};

export function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const r = Math.round(((value >> 16) & 255) * (1 - t) + target * t);
  const g = Math.round(((value >> 8) & 255) * (1 - t) + target * t);
  const b = Math.round((value & 255) * (1 - t) + target * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function getPalette(factionId: FactionId, slot: number): ArtPalette {
  const hull = HULLS[factionId];
  const team = TEAM_COLORS[((slot % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length];
  return {
    hull: hull.hull,
    hullLight: hull.light,
    hullDark: hull.dark,
    team,
    teamLight: shade(team, 0.35),
    teamDark: shade(team, -0.4),
    metal: '#39414c',
    glass: '#7fd3ff',
  };
}

export function teamColorNumber(slot: number): number {
  return parseInt(TEAM_COLORS[((slot % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length].slice(1), 16);
}
