import { describe, expect, it } from 'vitest';

import { getPalette, shade, TEAM_COLORS, teamColorNumber } from './palette';

describe('art palette', () => {
  it('lightens and darkens hex colours', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#336699', 0)).toBe('#336699');
  });

  it('gives each spawn slot its own team colour and wraps around', () => {
    const colors = new Set(TEAM_COLORS.map((_, slot) => getPalette('aurora', slot).team));
    expect(colors.size).toBe(TEAM_COLORS.length);
    expect(getPalette('obsidian', TEAM_COLORS.length).team).toBe(getPalette('obsidian', 0).team);
    expect(teamColorNumber(1)).toBe(parseInt(TEAM_COLORS[1].slice(1), 16));
  });

  it('keeps faction hull tones distinct', () => {
    expect(getPalette('aurora', 0).hull).not.toBe(getPalette('obsidian', 0).hull);
  });
});
