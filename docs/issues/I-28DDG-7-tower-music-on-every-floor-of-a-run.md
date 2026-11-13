---
id: I-28DDG-7
status: done
implements: FS-28DDG
blocked_by: []
labels: [ready-for-agent]
title: "FS-28DDG slice 7: one world-music module, and the tower's music on every floor of a run (game-client)"
---
Implements FS-28DDG §Change: The tower's music on every floor of a run

**Lane: agent.** `BarrowspireScene.ts` is a hotspot. Touch its music wiring only: `preload`,
`create`, `resetRun`, and `openOptions`'s level control (W6, W11).

## What to Build

- `audio/hubMusic.ts` → `audio/worldMusic.ts`, `HubMusic` → `WorldMusic` (W1). A track is its
  key, its URLs and its trim. The village track is `["/audio/music/village.mp3"]`, and the tower
  track is `["/audio/music/tower.m4a", "/audio/music/tower.ogg"]`. Both trims are 1.0 and named.
  The module says which track each world plays: hub → village, run → tower, field → none.
- The target gain is `musicGain(level) × trim` (W5).
- `sceneMusicStage(scene, track)`: the given track's key. The "kept for the next visit" check reads
  the given scene's status (W2).
- HubScene: the new names only (W11).
- BarrowspireScene: `preload` queues the tower track after the art; `create` makes the run's
  `WorldMusic` once and enters it; `resetRun` leaves it; `openOptions` passes it as the level
  control (W6, W9, W11).
- `public/audio/music/tower.ogg` (the owner's, already in the tree) and `tower.m4a`
  (`afconvert -f m4af -d aac -b 96000 -q 127`) are committed with the feat (W8).

## Acceptance Criteria

- [x] Every criterion under *The module*, *The run*, *The town* and *Housekeeping* in the
      section, except the owner's listening check (I-28DDG-8).
- [x] Tests pass: full vitest, tsc, lint, lint:fence.

## Blocked By

None

## Spec Reference

FS-28DDG §Change: The tower's music on every floor of a run: W1–W11, the Acceptance Criteria
but the listening check.

## Files it expects to touch

- `game-client/src/audio/hubMusic.ts` → `worldMusic.ts`, `hubMusic.test.ts` → `worldMusic.test.ts`
- `game-client/src/audio/uiSounds.ts`, `uiSounds.test.ts` (comments naming `HubMusic` only)
- `game-client/src/scenes/HubScene.ts`, `HubScene.test.ts` (names only)
- `game-client/src/scenes/BarrowspireScene.ts`, `BarrowspireScene.test.ts` (music wiring only)
- `game-client/public/audio/music/tower.ogg`, `tower.m4a`

## TDD Approach

- RED: `WorldMusic` with a trim of 2 enters level 3 and ends its fade-in at `musicGain(3) × 2`;
  the run's preload queues the tower track with `[m4a, ogg]`; the run's create enters the music.
- GREEN: the module's track, trim and stage; the run's wiring.
