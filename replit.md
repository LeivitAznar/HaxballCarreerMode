# Futbol Carrera

A 2D arcade football game with offline career mode — top-down Haxball-style gameplay in Phaser 3, with React menus, division standings, player progression, and seasonal transfers. All data persists in localStorage; no backend required.

## Run & Operate

- `pnpm --filter @workspace/football-game run dev` — run the game (workflow: `artifacts/football-game: web`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/football-game run typecheck` — typecheck just the game

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Game engine: Phaser 3 (`phaser@3`)
- Frontend shell: React 18 + Vite + TailwindCSS
- Persistence: localStorage (no backend)
- Animations: Framer Motion

## Where things live

```
artifacts/football-game/src/
  App.tsx                  — screen state machine (AppScreen enum)
  game/
    PhaserGame.tsx         — React wrapper that mounts/destroys Phaser.Game once
    config.ts              — Phaser.GameConfig (900×580, arcade physics)
    scenes/
      BootScene.ts         — generates textures
      MatchScene.ts        — main gameplay: pitch, ball, players, goals, timer
      HalfTimeScene.ts     — 3-second halftime overlay
      MatchEndScene.ts     — full-time overlay, fires match_end event
    ai.ts                  — AI state machine (GK/DEF/MID/FWD behaviors)
    physics.ts             — ball drag, bump-on-collision, shoot helpers
    formation.ts           — 6-a-side slot positions
  career/
    types.ts               — all interfaces (Player, Team, Fixture, CareerState…)
    storage.ts             — loadCareer/saveCareer via localStorage JSON
    engine.ts              — fixture gen, standings update, stat progression, promotions
    teams.ts               — 16 hard-coded teams across 2 divisions
  screens/                 — one React component per app screen
  components/              — StandingsTable, PlayerStatCard, FixtureCard
```

## Architecture decisions

- **Phaser/React bridge via game.events**: `MatchScene` emits `match_event` on `game.events`; `PhaserGame.tsx` listens with a stable ref wrapper, so score/clock re-renders in React never destroy/recreate the Phaser instance.
- **matchData frozen at game creation**: passed once via `game.registry` in `preBoot`; the registry value never changes mid-match.
- **PhaserGame mounts once**: empty useEffect deps + onMatchEvent ref prevents game destruction on every tick. matchData in MatchScreen is memoized on team IDs.
- **Shallow career state**: `simulateMatchday` mutates fixture results in-place before spreading — works in practice but worth refactoring if career state grows.
- **AI throttled to every 6 frames**: uses `time % 6 < 2` — frame-rate dependent but acceptable for arcade feel.

## Product

- Two divisions, 16 teams, round-robin fixture calendar per season
- User controls one player (FWD by default); teammates + opponents run AI
- Ball physics: drag per frame, bump-on-overlap impulse, fixed-force shoot (SPACE)
- Career hub: standings table, fixture list, player stat bars, career history
- Season end: promotion/relegation, transfer window, stat progression

## Gotchas

- Phaser 3 must be `phaser@3` — `pnpm add phaser` installs v4 which has breaking API changes
- Do NOT add `matchData` or `onMatchEvent` to PhaserGame's useEffect deps — the game must mount once only
- `simulateMatchday` uses a shallow `...state` spread; nested fixture objects are mutated directly

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
