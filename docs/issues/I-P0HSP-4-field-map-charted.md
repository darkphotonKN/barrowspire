---
id: I-P0HSP-4
status: done
implements: FS-P0HSP
blocked_by: [I-P0HSP-1, I-P0HSP-2, I-P0HSP-3]
labels: [ready-for-agent]
title: "FS-P0HSP slice 4: a field's minimap, charted round the player as they walk, for the visit (game-client)"
---
Implements FS-P0HSP §D, §B, §C, §E, §F, §G

## Files it expects to touch

- New `game-client/src/ui/fieldChart.ts` + `fieldChart.test.ts` (name the implementer's call): the
  chart, a bitset over 40 px cells, charted within 480 world px of a position (`FIELD_CHART.cell`,
  `.radius`, `.redraw`), with merged runs for drawing. Pure, no Phaser.
- New field plan module + test: charted ground, the edge line along charted edge cells with the road
  home's gap, keep-outs over charted cells, the teleport mark once its gate's cell is charted.
- `game-client/src/scenes/FieldScene.ts` + `FieldScene.test.ts`: build the minimap with the first
  field state, chart on each state from the local player's position, redraw at most every 250 ms
  while new ground is charted, the party's dots, the column, M and the overlay as in the town.

## What to Build

In Gentle Meadows, the Forlorn Forest and the dev test room, the minimap in the corner: empty but for
its backing until charted; the ground within 480 world px of the player charted as they walk, alive
or fallen, never by a party member's position; charted ground in the one fill, the field's edge a
line only where charted and open at the road home, keep-outs solid over charted ground, the road
home's teleport mark once its cell is charted; the party's dots wherever they stand; M's three modes
on the run's stored key; nothing on the screen. Charting lives for the visit in this slice
(slice 5 keeps it).

## Acceptance Criteria

- [x] FS-P0HSP §Acceptance Criteria: the field's minimap (uncharted shows nothing, charting radius,
      merged runs, edge only where charted and open at the gap, keep-outs over charted cells only, the
      mark once charted, no line at the charted edge, party positions chart nothing).
- [x] Redraws at most 4 a second walking uncharted Forest at full speed (counted); a frame-time
      measurement against the field without the minimap reported in the issue.
- [x] M, the overlay and the corner as in the town (§F, §G) in a field.
- [x] No fog, veil or change on the screen in a field.
- [x] Typecheck, lint and the full vitest suite pass.

## Blocked By

I-P0HSP-1, I-P0HSP-2, I-P0HSP-3

## Spec Reference

FS-P0HSP §B.5–§B.7, §B.10, §B.12, §C.16, §D.21–§D.24, §D.27–§D.28, §E.29–§E.30, §F.31–§F.34,
§G.35–§G.37; User Stories 12, 15–18, 20, 28.

## TDD Approach

- RED: a 3120 × 2000 chart with the player at (200, 1000) charts the cells whose centres lie within
  480 px and no others; a second position adds only new cells; an ally's position adds none.
- GREEN: the chart, then the field plan, then the scene.

## Status

Done 2026-11-12. `ui/fieldChart.ts` (`FIELD_CHART` cell 40, radius 480, redraw 250 ms, save 2000 ms;
a bitset; `chartAround` scans the circle row by row only when the player has entered another cell,
so standing or walking inside a cell costs nothing; `runs()` merges row runs down), `ui/fieldMap.ts`
(charted ground, the edge line on charted edge cells less the road gap, keep-outs cut to the charted
runs, the teleport once its cell is charted). `FieldScene` builds the map with the first field state,
charts from `current_player` only, redraws through `drawFieldMap` (each frame and state: a number
compare, nothing built while nothing is new; at most once per 250 ms), M and the overlay as the town.

Measured: walking the uncharted Forest at 400 px/s with a state every 33 ms, the scene test counts
at most 13 redraws in 3 s (1 + 4 a second). Frame time, headless stand-in (Chrome, SwiftShader WebGL,
1080 x 720, 360 frames walking the uncharted Forest at 400 px/s, PRE_STEP to POST_RENDER): without
the minimap mean 0.09 / 0.08 ms, p95 0.20 ms; with it mean 0.15 / 0.14 ms, p95 0.20 ms, 26 to 27
map redraws in 6.5 s (4 a second). One existing field test helper (the arrival card's, which runs
create on stubs that cannot hold a canvas texture) now unsets the minimap's stage after create.
