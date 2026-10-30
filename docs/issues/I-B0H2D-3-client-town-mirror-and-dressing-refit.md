---
id: I-B0H2D-3
status: open
implements: FS-B0H2D
blocked_by: [I-B0H2D-1]
labels: [ready-for-agent]
title: "FS-B0H2D slice 3: game-client mirrors the new town and re-fits its outdoor dressing"
---
Implements FS-B0H2D §E Requirements 23–24

**Author: agent** (charter: agent lane)

## What to Build

The client's copy of the town follows the server's new layout, and every outdoor dressing spot,
fence run, path and gate approach still clears the keep-out rule K1–K8 against the new
footprints. Each door gap gets a short trodden path to the nearest path or approach.

- `hubKeepOut.ts`: K4's function NPC points (the Quartermaster's new place), K6's quarters, and
  any comment naming the old houses. `HUB_APPROACHES`' Forest trail no longer turns south around
  the old west house. `HUB_PATHS` gains one short spur per door gap (R24).
- Re-fit the outdoor spots (`HUB_STALLS`, `HUB_CARTS`, `HUB_CRATES`, `HUB_FENCES`,
  `HUB_DRESSING`, `HUB_WASHING_LINE`, `HUB_WELL`, gate dressing) that now fall inside a new house
  (K1) or that the old buildings were sheltering in ways that no longer read. Keep the town
  dressed; move, don't delete, where a spot can move.
- `hubKeepOut.test.ts`: its `HUB_BUILDINGS` / `HUB_WALLS` fixture becomes the three buildings
  walled as the server now does (south wall in two segments around the 50 px gap). Furnishings
  are not part of this slice.

Use I-B0H2D-1's committed coordinates. If I-B0H2D-1 moved anything from the FS's R3 table, the
server is the truth.

Expected files (owns `hubKeepOut.ts` for this FS; I-B0H2D-5 puts its new mirror data in a new
file so the two never collide):
- `game-client/src/render/world/hubKeepOut.ts`
- `game-client/src/render/world/hubKeepOut.test.ts`

Not touched: `src/scenes/HubScene.ts` (if a scene constant must move, stop and note it on
I-B0H2D-5 rather than edit the scene here), the server.

## Acceptance Criteria

- [ ] `hubKeepOut.test.ts` fixture equals the server's three buildings with door gaps.
- [ ] K1–K8 pass for every outdoor spot, fence run and path.
- [ ] K4 and K6 data equal I-B0H2D-1's Quartermaster point and quarters.
- [ ] Each door gap has a trodden path spur reaching an existing path or approach.
- [ ] vitest, lint and token fence green.
- [ ] Screenshot of the hub from above (Browser pane, client-only; no backend started by the
      agent) attached or described in the PR, if a running stack is available; otherwise note it.

## Blocked By

- I-B0H2D-1 (the coordinates)

May run in parallel with I-B0H2D-2 and I-B0H2D-4: disjoint files.

## Spec Reference

FS-B0H2D §E R23 (outdoor part), R24; user stories 1–3, 5, 26.

## TDD Approach

- RED: update the fixture to the new buildings; K1/K8 go red where old spots now sit in a house
  or on an approach.
- GREEN: move those spots; add the door path spurs.
