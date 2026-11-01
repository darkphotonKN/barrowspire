---
id: I-9PN7X-2
status: done
implements: FS-9PN7X
blocked_by: []
labels: [ready-for-agent]
title: "FS-9PN7X slice 2: shared indoor blackout module and the one hide rule, wired into the hub"
---
Implements FS-9PN7X §A, §C, §D, §G.1

**Author: agent** (charter: agent lane, client). Needs no new art: runs in parallel with
I-9PN7X-1.

## What to Build

Inside a hub town building, everything outside it goes to `palette.inkDeep` and everyone outside
is hidden; from the street, everyone inside a building is hidden except function-NPC markers. One
pure rule, one shared blackout module that the run scene adopts next (I-9PN7X-3).

1. **Pure building state** (new `src/render/world/indoors.ts` + test):
   - `buildingAt(pos, houses)`: the player's building by `insideHouse` (edges inclusive, first in
     `housesFrom` order wins), or undefined. **No hysteresis** [charter default, §A.3].
   - `hidden(pos, houses, playerBuilding)`: true when `pos` is inside a building that is not the
     player's, or the player is inside a building and `pos` is not inside it (§C.1).
   - `markerShown(pos, houses, playerBuilding)`: a function NPC's / the stash chest's plate and
     sigil show unless the player is inside a different building (§C.5).
   - `hiddenIndoors` (`hubInteriors.ts:196`) is replaced by or rebuilt on `hidden`; its existing
     tests keep passing or move to `indoors.test.ts`.
2. **Blackout geometry, pure** (§D.2): the spike's hexagon (`projectRect` grown 5 world px,
   `raise` by wall top + 24 px headroom) and `outsideConvex(hole, reach)`, as a tested function
   of `(house, wallTop, reach)`. Reference: spike `6aa8f625` (`spikeDrawMask`) and
   `BarrowspireScene.updateIndoorMask`; cite, do not merge the spike.
3. **Shared blackout module** (new `src/render/world/blackout.ts`): owns one Graphics at depth 500
   (`palette.inkDeep`, alpha 1), `show(house | undefined)` that redraws only on change and hides
   when undefined, and `destroy()`/clear for scene shutdown and floor teardown. Scene-agnostic:
   takes the wall top and reach from its caller.
4. **Hub wiring** (`HubScene.ts`): on the frame the player's building changes (the existing
   `hideRoofOverhead` seam), show the blackout around it; replace `hideWhoIsIndoors` with the one
   rule for NPCs (body, plate, sigil, with `markerShown` for function NPCs) and other players
   (body, legs, plate), party included; the stash chest's "Stash" marker follows `markerShown`.
   Hub lights already follow the roof (`showInteriors`, under-roof gate); verify they still do.
   The snap is same-frame (§A.4). Clear the blackout reference on shutdown.

Hotspot: `src/scenes/HubScene.ts` (~2.4k lines) is owned by this slice until it lands;
I-9PN7X-5 edits it next, never in parallel.

## Files (expected)

- `game-client/src/render/world/indoors.ts` (new) + `indoors.test.ts` (new)
- `game-client/src/render/world/blackout.ts` (new) + `blackout.test.ts` (new, the pure geometry)
- `game-client/src/render/world/hubInteriors.ts` + `hubInteriors.test.ts` (`hiddenIndoors` only)
- `game-client/src/render/world/index.ts` (barrel exports)
- `game-client/src/scenes/HubScene.ts` (**hotspot**) + `game-client/src/scenes/HubScene.test.ts`

Not touched: `BarrowspireScene.ts` (I-9PN7X-3), `walls.ts`, `scene.ts`, `occlusion.ts`
(I-9PN7X-4), the bake, `game-server/**`.

## Acceptance Criteria

- [ ] `buildingAt`, `hidden` and `markerShown` unit-tested (table-driven): outside/inside, door-gap
      threshold inside, two overlapping rects pick the first, player absent hides nothing.
- [ ] Blackout geometry unit-tested: the hole contains the grown floor and the raised wall band;
      the quads cover the map reach and never the hole.
- [ ] In the hub, inside a building: everything outside is `inkDeep` at depth 500, over the
      light-map and halos, under the vignette; no body or name plate of anyone outside shows,
      teammates included; the Quartermaster's and Stash markers hide when in a different building.
- [ ] In the hub, outside: everyone inside a building is hidden; function-NPC and Stash markers
      stay over their building.
- [ ] The blackout snaps on and off in the frame the inside test changes (scene test).
- [ ] Screenshots: a hub building from inside with the blackout. Forcing the inside state
      client-side is acceptable if the running hub has no door gaps (§G.3); say which was used.
      No backend started by the agent.
- [ ] On Node 22, `npm test`, `npm run lint`, `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.

## Blocked By

None.

## Spec Reference

FS-9PN7X §A.1–§A.4 (building, inside test, no hysteresis, snap), §C.1–§C.5 (one hide rule,
coverage, party included, function-NPC markers), §D.1–§D.5 (ink, geometry, depth, off outside,
shared module), §G.1 (unit tests). User stories 3, 4, 9, 10, 11, 12, 24, 25.

## TDD Approach

- RED: `indoors.test.ts` for `hidden` and `markerShown` against two fixture buildings;
  `blackout.test.ts` for the hole and quads.
- GREEN: the pure modules, then the blackout module, then the HubScene wiring under a scene test
  that drives the player in and out.

## Owner-approved deviations

- **Headroom 2 px, trimmed from 24 px.** The blackout hole stands 2 screen px over the back walls'
  coping (`BLACKOUT.headroom`), not FS §D.2's 24 px, so nothing beyond the walls shows above them
  (the owner's trim, 2026-11-01).

## Evidence

Screenshots from forced client state (FS-9PN7X §G.3); no backend was started. Method: a
throwaway Vite page outside the repo (`/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/hubshot`: `main.ts`, `shoot.mjs`) mounts the real
scene and feeds it a fixed broadcast through `socketManager.handleGameStateUpdate` every 100 ms,
with the player's position taken from the page's own `?x=&y=` query (harness only, nothing
ships); `shoot.mjs` captures the canvas in headless Chrome (playwright-core, SwiftShader WebGL).

- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/hubshot/shots/`
- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/r1/hub/`
