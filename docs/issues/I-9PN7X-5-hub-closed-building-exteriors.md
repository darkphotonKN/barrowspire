---
id: I-9PN7X-5
status: done
implements: FS-9PN7X
blocked_by: [I-9PN7X-1, I-9PN7X-2, I-9PN7X-4]
labels: [ready-for-agent, blocked]
title: "FS-9PN7X slice 5: hub town buildings are closed blocks from outside, with a silhouette behind them"
---
Implements FS-9PN7X §B, §E, §G.2–§G.4

**Author: agent** (charter: agent lane, client). **Starts only after the owner has approved
I-9PN7X-1's contact sheet.**

## What to Build

From the street, each town building is four full-height timber walls under a roof that never
fades, with a dark opening in its door gap. Step in and it snaps to today's interior look (roof
lifted, cut-away fronts, furnished, lit) under the blackout from I-9PN7X-2. Behind a building, the
player shows as a silhouette.

1. `renderStructures` draws each building's exterior and interior parts with I-9PN7X-4's helpers
   on the timber sheets: exterior south/east pieces and back posts, the roof, the door gap's
   `door_dark_x`; the cut-away front pieces and front posts as the interior look.
2. On the frame the player's building changes (the `hideRoofOverhead` seam, beside the blackout),
   toggle that building's exterior parts off and interior parts on, and every other building to
   its exterior (§A.4, §B.6).
3. **Buildings leave the occluder fade** (§E.4): no wall piece, post or roof piece of a building
   goes into `Occluders`; trees and tall props keep it.
4. **Silhouette, player only** (§E.1–§E.2, §E.5): each frame, while the player is outside every
   building and `coveredBy` any piece of a building exterior, show the silhouette of the player's
   body; hide it otherwise. Others never silhouette.
5. Placeholders without art (§B.7) still close the building.

Hotspot: `src/scenes/HubScene.ts` (~2.4k lines), after I-9PN7X-2 has landed, never in parallel
with it. Runs in parallel with I-9PN7X-6 (different scene); neither edits `scene.ts`/`walls.ts`
(I-9PN7X-4's) without sequencing.

## Files (expected)

- `game-client/src/scenes/HubScene.ts` (**hotspot**) + `game-client/src/scenes/HubScene.test.ts`

Not touched: `BarrowspireScene.ts`, the bake, `game-server/**`; I-9PN7X-4's modules only for a bug
fix (tell the coordinator).

## Acceptance Criteria

- [ ] From outside: four full-height timber walls (south and east `wall_exterior_*`), the roof
      never fades, the door gap shows `door_dark_x`; nothing of the room shows.
- [ ] Inside: today's interior look (roof lifted, cut-away fronts, furnishings, hearth/forge lit);
      other buildings keep their exterior under the blackout.
- [ ] The swap happens in the same frame as the inside test changes (scene test).
- [ ] No building piece is in `Occluders`; trees and tall props still fade to `FADED_ALPHA`.
- [ ] Behind a building, the player's silhouette shows; no NPC or other player silhouettes; it
      hides the moment nothing covers the player.
- [ ] A building with no door gap (the owner's running hub may have none) draws closed with no
      dark opening.
- [ ] Screenshots: a building from the front, from behind (silhouette), its doorway from outside,
      and from inside with the blackout. Forced client state is acceptable (§G.3); say which was
      used. No backend started by the agent.
- [ ] On Node 22, `npm test`, `npm run lint`, `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.

## Blocked By

- I-9PN7X-1 (the timber exterior pieces and dark opening, **owner-approved**)
- I-9PN7X-2 (hub blackout and hide rule; HubScene hotspot sequencing)
- I-9PN7X-4 (exterior plans, draw helpers, silhouette)

## Spec Reference

FS-9PN7X §B.1–§B.3, §B.5–§B.8 (timber exterior, roof never fades, dark opening, interior look,
placeholders, nothing over the top), §E.1–§E.5 (silhouette, player only, buildings leave the fade),
§G.2–§G.4 (screenshots, forced state, no backend). User stories 1, 2, 5, 6, 7, 8, 28.

## TDD Approach

- RED: a scene test: player outside → exterior parts visible, interior parts hidden, no building
  piece in `Occluders`; player inside → swapped; player behind → silhouette visible.
- GREEN: wire the helpers into `renderStructures` and the inside-change seam, then the silhouette
  in the per-frame update.

## Owner-approved deviations

- **Scenery and lights hide by footprint**, superseding FS §D.6 "street lights unchanged": while
  the player is inside a building, every scenery object and street light whose footprint is
  outside it hides or goes dark, pool and halo (the owner's addition 1, 2026-11-01).
- **Gables.** Timber roofs are closed at both ends by baked gables (I-9PN7X-1), which are part of
  the roof: shown and hidden with it, never faded, and cover for the silhouette.

## Evidence

Screenshots from forced client state (FS-9PN7X §G.3); no backend was started. Method: a
throwaway Vite page outside the repo (`/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/hubshot`: `main.ts`, `shoot.mjs`) mounts the real
scene and feeds it a fixed broadcast through `socketManager.handleGameStateUpdate` every 100 ms,
with the player's position taken from the page's own `?x=&y=` query (harness only, nothing
ships); `shoot.mjs` captures the canvas in headless Chrome (playwright-core, SwiftShader WebGL).

- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/i5/hub/`
- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/r1/hub/`
