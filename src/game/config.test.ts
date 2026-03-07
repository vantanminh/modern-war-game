import { describe, expect, it } from 'vitest';

import { defaultGameConfig, getDeclaredImageAssets } from './config';

describe('config assets', () => {
  it('declares image assets for each renderable entity and resource node', () => {
    const assets = getDeclaredImageAssets(defaultGameConfig);

    expect(assets).toHaveLength(10);
    expect(assets).toEqual(
      expect.arrayContaining([
        { key: 'units:courier', path: '/images/units/courier.webp' },
        { key: 'units:vanguard', path: '/images/units/vanguard.webp' },
        { key: 'units:striker', path: '/images/units/striker.webp' },
        { key: 'units:ember', path: '/images/units/ember.webp' },
        { key: 'buildings:command-core', path: '/images/buildings/command-core.webp' },
        { key: 'buildings:refinery', path: '/images/buildings/refinery.webp' },
        { key: 'buildings:barracks', path: '/images/buildings/barracks.webp' },
        { key: 'buildings:motor-pool', path: '/images/buildings/motor-pool.webp' },
        { key: 'buildings:sentry', path: '/images/buildings/sentry.webp' },
        { key: 'resources:resource-node', path: '/images/resources/resource-node.webp' },
      ]),
    );
  });
});