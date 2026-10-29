---
id: I-8AY7S-5
status: done
implements: FS-8AY7S
blocked_by: [I-8AY7S-4]
labels: [ready-for-agent]
title: "FS-8AY7S slice 5: an overhead health bar over each teammate"
---
Implements FS-8AY7S §Requirements 27–28

**Author: agent**

## What to Build

game-client only. Today teammates show no overhead bar (`updateOtherPlayers` clears
`otherPlayersHpMpGraphics`). In a run, draw a health-only overhead bar over each living teammate,
from `current_health` / `max_health`, at the teammate's marker base, in the existing overhead
style (`MARKER_BAR` backing, rim and hp fill; `MARKER_DEPTH.bar`), carrying the readability floor.
No resource bar over anyone. None over a dead teammate's corpse. None in the hub. Monsters'
bars unchanged. The old `drawOverheadHpMpBar` loses its MP half (or becomes a health-only
helper), since nothing draws MP overhead any more.

## Acceptance Criteria

- [ ] In a run, each living teammate has a health-only overhead bar following their figure.
- [ ] A teammate at 0 health has no bar; a teammate who leaves takes their bar with them (no
      stale graphics in `otherPlayersHpMpGraphics`).
- [ ] No overhead bars over anyone in the hub; monster bars unchanged.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` green.

## Blocked By

I-8AY7S-4 (it removes the own overhead bar and reworks the same draw helper).

## Spec Reference

FS-8AY7S §Requirements 27, 28; §User Stories 13; §Edge States "Death".

## TDD Approach

- RED: if the bar's base and visibility are pulled into a pure helper (alive, has a marker base,
  in a run), test it in `src/ui/resources.test.ts` or a sibling test; otherwise verify in the
  running client per the integration flow.
- GREEN: draw per teammate in `updateOtherPlayers` / `updateOtherPlayersSmooth`.

## Files expected to touch

`game-client/src/scenes/BarrowspireScene.ts`, `src/render/markers/markers.ts` (only if a helper or
constant is added), `src/ui/resources.ts` / `resources.test.ts` (if the visibility rule lands
there).
