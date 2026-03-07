# Modern War Workspace Instructions

## Project Overview

- Modern War is a browser RTS prototype built with Vite, TypeScript, Vitest, and Phaser 3.
- Keep gameplay rules deterministic and data-driven. Prefer changing simulation and config code before adding scene-specific behavior.

## Commands

- `npm run dev`: start the Vite dev server.
- `npm run build`: type-check with `tsc` and produce a production build with Vite.
- `npm test`: run the Vitest suite once.
- `npm run test:watch`: run Vitest in watch mode.

## Architecture

- `src/main.ts` builds the DOM shell, wires HUD controls, and dynamically imports Phaser plus `BattleScene` when a match starts.
- `src/game/config.ts` is the source of truth for unit stats, building stats, faction modifiers, map layout, and AI tuning. Prefer extending this file for balance/content work.
- `src/game/types.ts` defines the shared game model. Keep new state and command shapes here first.
- `src/game/simulation.ts` is the authoritative game rules layer: spawning, economy, combat, build placement, production, AI behavior, and tick advancement.
- `src/game/controller.ts` wraps the simulation in a `BattleSession`, manages selection and command modes, and derives HUD-friendly view models.
- `src/game/pathfinding.ts` contains pure grid/path helpers used by simulation and AI.
- `src/game/phaser/BattleScene.ts` is the Phaser adapter for rendering, camera control, selection, and translating input into session commands. Keep it focused on presentation and input.

## Conventions

- Keep `simulation.ts`, `pathfinding.ts`, `config.ts`, and `types.ts` free of Phaser or DOM dependencies so they stay easy to test in Node.
- Preserve the tick-based model. `BattleSession.update()` converts frame time into discrete simulation ticks using `config.tickRate`; avoid frame-dependent gameplay logic.
- Extend existing command and state shapes instead of introducing parallel ad hoc flags in scene code.
- Prefer config-driven content changes over hardcoded conditionals when adding units, buildings, map data, or faction differences.
- Tests are colocated under `src/game` as `*.test.ts`. Add or update tests alongside gameplay changes.
- Avoid hardcoding generated entity IDs in tests or features; simulation IDs are allocated internally.

## Testing Guidance

- Use `npm test` after gameplay logic changes.
- Add focused unit-style tests for simulation, AI, and pathfinding behavior before relying on manual Phaser verification.
- Keep tests compatible with the configured Vitest `node` environment; do not assume browser APIs in `src/**/*.test.ts`.

## Pitfalls

- `npm run build` is strict: `noUnusedLocals`, `noUnusedParameters`, and other TypeScript checks will fail on dead code or mismatched types.
- Phaser is dynamically imported from `src/main.ts`, and Vite is configured to split Phaser into a manual chunk. Do not convert that flow to eager imports without a clear reason.
- The HUD DOM in `src/main.ts` is wired by selector IDs and rendered from `BattleSession.getHudModel()`. If UI controls or IDs change, update both the markup and the session wiring.