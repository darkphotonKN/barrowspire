---
id: I-9PN7X-3
status: done
implements: FS-9PN7X
blocked_by: [I-9PN7X-2]
labels: [ready-for-agent, blocked]
title: "FS-9PN7X slice 3: Spire rooms get the shared blackout, the hide rule and room-only lights"
---
Implements FS-9PN7X §C, §D

**Author: agent** (charter: agent lane, client). Needs no new art.

## What to Build

Inside a Spire room, the halls, open floor, perimeter and every other room go to
`palette.inkDeep`; nothing outside the room shows; the room's own lights are lit only while the
player is in it. From the halls, everything inside a room is hidden. The run scene's dormant
`indoorMask` is replaced by the shared blackout module from I-9PN7X-2.

1. **Replace the indoor mask** [charter default, §D.5]: remove `indoorMask` and
   `updateIndoorMask` (`BarrowspireScene.ts` ~489, 2680, 3615–3692); `checkBuildingStatus` uses
   `buildingAt` and the shared blackout for every world theme. The tower theme's flag in
   `worldTheme.ts` changes so a tower floor runs the blackout; the HUD position text keeps its
   tower behaviour (no "Indoor"/"Outdoor" suffix) and the exterior theme keeps its suffix (§D.7).
   Rename or split the `indoorMask` flag as needed; update `worldTheme.test.ts`.
2. **The hide rule on every world object** (§C.2): monsters, other players and party (bodies,
   name plates, HP bars, glowing eyes), containers, drop piles and sacks, projectiles, world
   effects, run dressing, stairs, the escape door and switch. Read each frame from eased
   positions where they move. Markers at depth ≥ 500 hidden explicitly. The player is never
   hidden.
3. **Room lights** [charter default, §D.6]: a room's sconces and any fixed light standing in it
   (interactable pools, FS-8RBQY §B.7) are lit only while the player is inside that room, by the
   same intensity/gate pattern the hub uses; hall lights unchanged. Today the tower draws every
   flame always (`roofed` false in the wall-light gate, ~2196): gate by the player's building
   instead of by roofs.
4. **Floor seam** (§D.8): the blackout is hidden and cleared at `leaveFloor` and rebuilt for the
   new floor; the player starts each floor outside every room until the inside test says
   otherwise.

**Interim look (accepted on the branch):** until I-9PN7X-6 closes the rooms, a room's contents
are hidden from the halls while its cut-away fronts still show its floor.

Hotspot: `src/scenes/BarrowspireScene.ts` (~4.65k lines) is owned by this slice until it lands;
I-9PN7X-6 edits it next, never in parallel.

## Files (expected)

- `game-client/src/scenes/BarrowspireScene.ts` (**hotspot**) +
  `game-client/src/scenes/BarrowspireScene.test.ts`
- `game-client/src/render/world/worldTheme.ts` + `worldTheme.test.ts` (the blackout flag only)
- `game-client/src/render/world/floorLights.ts` + test, only if the room gate belongs with the
  fixed-light budget
- `game-client/src/render/world/blackout.ts` / `indoors.ts` only for a bug fix found here (tell
  the coordinator; I-9PN7X-2 owns them)

Not touched: `HubScene.ts`, `walls.ts`, `scene.ts`, `occlusion.ts`, the bake, `game-server/**`.

## Acceptance Criteria

- [ ] `BarrowspireScene` has no `indoorMask` or `updateIndoorMask`; it uses the shared blackout.
- [ ] Inside a Spire room: everything outside it is `inkDeep` at depth 500; no monster, player
      (party included), container, floor item, projectile, effect or marker outside it shows.
- [ ] In the halls: nothing positioned inside a room shows.
- [ ] A room's sconces and interactable pools are lit only while the player is in that room; hall
      lights and the player's torch are unchanged; nothing glows through the blackout.
- [ ] A floor change clears the blackout and rebuilds it for the new floor (scene test).
- [ ] The tower HUD position text is unchanged; the exterior theme still shows its suffix.
- [ ] Screenshots: a Spire room from inside with the blackout (forced client state acceptable,
      §G.3). No backend started by the agent.
- [ ] On Node 22, `npm test`, `npm run lint`, `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.

## Blocked By

- I-9PN7X-2 (the shared blackout module and the hide rule)

## Spec Reference

FS-9PN7X §C.1–§C.4 (one rule, coverage, player never hidden, party included), §D.1–§D.8 (ink,
geometry, depth, shared module replacing `indoorMask`, room lights, both worlds, floor seam). User
stories 14, 15, 17, 18, 19, 20.

## TDD Approach

- RED: a scene test placing a monster in a room and the player in the hall (monster hidden), then
  the player in the room and a monster in the hall (monster hidden, blackout shown).
- GREEN: swap the mask for the shared module, apply `hidden` per entity kind, gate room lights.

## Review round 1

- **Spectating has no building** (FS-9PN7X edge state "player gone"): dead, escaped or watching a
  teammate, the player has no building, so the blackout is off and only the hide rule's indoors
  half applies. The watched teammate is not followed indoors.

## Evidence

Screenshots from forced client state (FS-9PN7X §G.3); no backend was started. Method: a
throwaway Vite page outside the repo (`/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/spireshot`: `main.ts`, `shoot.mjs`) mounts the real
scene and feeds it a fixed broadcast through `socketManager.handleGameStateUpdate` every 100 ms,
with the player's position taken from the page's own `?x=&y=` query (harness only, nothing
ships); `shoot.mjs` captures the canvas in headless Chrome (playwright-core, SwiftShader WebGL).

- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/spireshot/shots/`
- `/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/ab4cc32c-8ace-472e-b64e-79bd022d6104/scratchpad/r1/spire/`
