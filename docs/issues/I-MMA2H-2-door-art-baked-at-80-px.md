---
id: I-MMA2H-2
status: done
implements: FS-MMA2H
blocked_by: []
labels: [ready-for-agent]
title: "FS-MMA2H slice 2: the door, its frame and its heads are baked 80 px wide and a run house draws them (game-client)"
---
Implements FS-MMA2H §B, §E

**Lane: agent (AFK), with a look at the review sheet at the end (Nick).** Ships on one branch with
I-MMA2H-1: art at 80 with the server at 50 paints the door 15 px over each wall.

The bake runs in this repo: `npm run bake -- --check` took about 2 minutes here (installed Google
Chrome on SwiftShader, `node_modules` linked into the worktree). Bake with `npm run bake`, commit
the atlases and `manifest.json` with the model change.

## Files owned

- `game-client/tools/bake/page/models/interactables.js` (`door`: `DOOR_W` and what hangs off it)
- `game-client/tools/bake/page/models/building.js` (`GAP_W`, `doorHead`, its comment)
- `game-client/tools/bake/lib/building.mjs` (the review mock's doorway)
- `game-client/public/art/` (the atlases holding the door sheets and the heads, `manifest.json`)
- `game-client/src/render/iso/projection.ts` (the calibration comment only)
- Run-house fixtures that wall a 50 px gap: `src/render/world/{walls,houses,buildingLooks,runDressing,scene,worldTheme}.test.ts`

Not `hubKeepOut.test.ts`, `hubInteriors.test.ts`, `hubStash.test.ts` or the golden: those are
I-MMA2H-4's.

## What to Build

- `door_x` / `door_y` (all four states) for an 80 px gap: the leaf and the frame each 0.75 tile
  wider, the same clearance to the jambs as today, one leaf hinged as today, more planks rather
  than wider ones (R17-R19).
- `door_head_{x,y}` and `tower_door_head_{x,y}` exactly the gap's width (R17, R18).
- The review mock with a two-tile doorway (R20).
- Run-house fixtures at 80: the client code already finds the gap from the walls, so expect no
  production change in `src/render/world`; if one is needed, it is in scope (R8).

## Acceptance Criteria

- [ ] The four door states and the four heads are baked for an 80 px gap; a shut door in an 80 px
      gap leaves the clearance to each jamb that today's leaves in a 50 px gap.
- [ ] A run house walled with an 80 px gap draws the door at the gap's centre, a post at each jamb,
      a head over the gap and no piece in the gap, in the exterior and the interior look.
- [ ] `npm run bake -- --check` passes; no manifest entry other than the door sheets and the heads
      changed.
- [ ] No run-house fixture or comment holds 50 as a door width.
- [ ] `npm test` and `npm run lint` in game-client pass.
- [ ] By eye (Nick): the review sheet's mock building, both looks.

## Blocked By

None. Blocks I-MMA2H-4.

## Spec Reference

FS-MMA2H §B R8, §E R17-R22; user stories 7, 8, 14.

## TDD Approach

- RED: the run-house fixtures cut an 80 px gap and assert the door's place, the jamb posts and the
  head's width.
- GREEN: fixtures first (the drawing is already gap-driven), then the bake.
