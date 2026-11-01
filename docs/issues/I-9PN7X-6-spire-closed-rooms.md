---
id: I-9PN7X-6
status: done
implements: FS-9PN7X
blocked_by: [I-9PN7X-1, I-9PN7X-3, I-9PN7X-4]
labels: [ready-for-agent, blocked]
title: "FS-9PN7X slice 6: Spire rooms are closed stone blocks under a cap, with dark openings and a silhouette"
---
Implements FS-9PN7X §B, §E, §G.2–§G.4

**Author: agent** (charter: agent lane, client). **Starts only after the owner has approved
I-9PN7X-1's contact sheet.**

## What to Build

From the halls, each Spire room is four full-height masonry walls under one stone cap that never
fades. An open door shows a dark opening; a closed or locked door draws as a door, as today. Step
in and the room snaps to today's cut-away look under the blackout from I-9PN7X-3. Behind a room,
the player shows as a silhouette.

1. Wall building (`updateWalls` / the server-buildings block, ~2185–2310) draws each room's
   exterior and interior parts with I-9PN7X-4's helpers on the floor's `look.walls` (masonry in
   every band; timber in the exterior theme for free): exterior south/east pieces and back posts,
   the `tower_cap` (a theme without roofs gets the cap; the exterior theme keeps its roof).
2. **Doors** (`updateDoors`, §B.5): while the player is outside the door's room, an open door draws
   as `tower_door_dark_*` in place of its open frame; a closed door draws as today. Swap on state
   change and on the inside change.
3. On the frame the player's room changes (beside the blackout's `checkBuildingStatus`), toggle
   that room's exterior parts and cap off and its interior parts on; every other room to its
   exterior (§A.4, §B.6).
4. **Buildings leave the occluder fade** (§E.4): no wall piece with a `house_id`, post, cap piece,
   dark opening or door in a room wall goes into `Occluders`; the perimeter, walls with no
   `house_id`, stairs and tall dressing keep the fade.
5. **Silhouette, player only** (§E.1–§E.2, §E.5), as in the hub.
6. Built and torn down at the per-floor seam (`leaveFloor`) with the rest of the floor.
7. Nothing of the inside shows over the cap from outside (§B.8): verify the spiral stair, sconce
   flames and banners against the cap in screenshots; a room's lights are already off from outside
   (I-9PN7X-3).

Hotspot: `src/scenes/BarrowspireScene.ts` (~4.65k lines), after I-9PN7X-3 has landed, never in
parallel with it. Runs in parallel with I-9PN7X-5 (different scene).

## Files (expected)

- `game-client/src/scenes/BarrowspireScene.ts` (**hotspot**) +
  `game-client/src/scenes/BarrowspireScene.test.ts`

Not touched: `HubScene.ts`, `worldTheme.ts` (the cap comes through `WallSheets`), the bake,
`game-server/**`; I-9PN7X-4's modules only for a bug fix (tell the coordinator).

## Acceptance Criteria

- [ ] From the halls, on every floor band: four full-height masonry walls (south and east
      `tower_wall_exterior_*`) under `tower_cap`; the cap never fades; nothing of the room shows.
- [ ] An open door from outside shows `tower_door_dark_*`; a closed or locked door shows the door
      as today; a door opening or closing swaps correctly.
- [ ] Inside: today's cut-away look, the cap hidden, the open door's own frame; other rooms keep
      their exterior under the blackout.
- [ ] The swap happens in the same frame as the inside test changes (scene test).
- [ ] No building piece or room door is in `Occluders`; perimeter, tall dressing and stairs still
      fade.
- [ ] Behind a room, the player's silhouette shows; no one else silhouettes.
- [ ] A floor change rebuilds rooms, caps and openings with the floor (scene test).
- [ ] Screenshots: a room from the halls, from behind (silhouette), an open door and a closed door
      from outside, and from inside with the blackout, on at least two floor bands. Forced client
      state is acceptable (§G.3). No backend started by the agent.
- [ ] On Node 22, `npm test`, `npm run lint`, `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.

## Blocked By

- I-9PN7X-1 (the masonry exterior pieces, stone cap and dark openings, **owner-approved**)
- I-9PN7X-3 (Spire blackout, hide rule, room lights; BarrowspireScene hotspot sequencing)
- I-9PN7X-4 (exterior plans, draw helpers, silhouette)

## Spec Reference

FS-9PN7X §B.1–§B.8 (masonry exterior, one cap, dark openings and closed doors, interior look,
placeholders, nothing over the top), §E.1–§E.5 (silhouette, buildings leave the fade), §G.2–§G.4.
User stories 13, 16, 21, 26, 28.

## TDD Approach

- RED: a scene test with one room and an open door: player in the hall → exterior parts, cap and
  dark opening visible, no room piece in `Occluders`; player in the room → swapped; door closed →
  door frame from outside.
- GREEN: wire the helpers into the wall and door updates and the inside-change seam, then the
  silhouette.

## Owner-approved deviations

- **Headroom 2 px, trimmed from 24 px** (as I-9PN7X-2): the blackout hole stands 2 screen px over
  the back walls' coping.
- **Scenery and lights hide by footprint**, superseding FS §D.6 "hall lights unchanged": inside a
  room, every other room, door, hall wall and the perimeter hide, and every light outside the
  room (hall-wall sconces, braziers, the stairs and interactable pools, perimeter slits) goes
  dark, pool and halo (the owner's addition 1; the lights carried over in review round 1).

## Evidence

Screenshots from forced client state (FS-9PN7X §G.3); no backend was started. Method: a
throwaway Vite page outside the repo (`/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/spireshot`: `main.ts`, `shoot.mjs`) mounts the real
scene and feeds it a fixed broadcast through `socketManager.handleGameStateUpdate` every 100 ms,
with the player's position taken from the page's own `?x=&y=` query (harness only, nothing
ships); `shoot.mjs` captures the canvas in headless Chrome (playwright-core, SwiftShader WebGL).

- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/spireshot/shots6/`
- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/i5/spire/`
- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/r1/spire/`
