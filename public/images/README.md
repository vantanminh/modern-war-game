# Image asset manifest

Drop source PNG files into the folders below with these exact names:

- `units/courier.png`
- `units/vanguard.png`
- `units/striker.png`
- `units/ember.png`
- `buildings/command-core.png`
- `buildings/refinery.png`
- `buildings/barracks.png`
- `buildings/motor-pool.png`
- `buildings/sentry.png`
- `resources/resource-node.png`

Then run:

```bash
npm run images:convert
```

The script scans `public/images` recursively, converts every `.png` to a sibling `.webp`, and keeps the folder structure unchanged.

The game loads the generated `.webp` files from `/images/...` and falls back to simple shapes if a file is still missing.
