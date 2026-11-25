---
id: I-28DDG-9
status: done
implements: FS-28DDG
blocked_by: []
labels: [ready-for-agent]
title: "FS-28DDG slice 9: the chapel's and the Inn's music, composed in code and played by place (game-client)"
---
Implements FS-28DDG §Change: The chapel's and the Inn's music

**Lane: agent.** `HubScene.ts` is a hotspot. Touch its music wiring only: `preload`,
`enterMusic`, `update`'s one line, and the new `musicPlace` getter.

## What to Build

- `tools/music/compose.mjs` + `tools/music/lib/synth.mjs`: the two tracks, rendered and encoded to
  `public/audio/music/chapel.m4a` and `inn.m4a` (M5).
- `audio/townMusic.ts`: `TOWN_TRACKS` (street → village, chapel, inn), `TownMusic` (enter, moveTo,
  setLevel, level, leave), `townMusic(stageOf, store)` (M1–M3, M6).
- `WorldMusic.wait()` (added silent, M3) and `WorldMusic.quiet()` (fade out, kept, M2).
- HubScene: preload all three tracks. `enterMusic` makes the town's music and enters it at the
  player's place. `update` moves it each frame. `musicPlace` reads `isChapel` / `isInn`.

## Acceptance Criteria

- [x] Every criterion in the section except the listening check (I-28DDG-10).
- [x] Tests pass: full vitest, tsc, lint, lint:fence.

## Spec Reference

FS-28DDG §Change: The chapel's and the Inn's music: M1–M6.
