---
id: I-R4MYX-15
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-14]
labels: []
title: "FS-R4MYX slice 15: draw the chapel's fixed window bays, matched inside and out, and hang the crucifix and murals"
---
Implements FS-R4MYX §Change: The chapel's windows match inside and out, and its west wall carries the crucifix (§W-A W1–W7, §W-C W12–W13, §W-D W14–W15)

**Lane: game-client code (agent), AFK.** Client only: if anything here seems to need a server
change, stop and say so (W15).

## Files it expects to touch

- `game-client/src/render/world/walls.ts` and `walls.test.ts`: the bay rule. It goes either on
  `CHAPEL_WALLS` or as a per-house bay rule the chapel's look names (developer's call, W1). It
  decides the outward kinds, where the inner lancets stand, and which west-wall pieces must be
  plain. It leaves the variant index hashed, and `TIMBER_WALLS` / `MASONRY_WALLS` unchanged.
- `game-client/src/render/world/buildingLooks.ts` and `buildingLooks.test.ts`: `planBuildings`
  hands the rule to `shared`, `interior` and `exterior` alike
- `game-client/src/render/world/scene.ts` (`addBuildings`) and `src/scenes/HubScene.ts`
  (`renderStructures`) only as far as passing the chapel's rule through
- `game-client/src/render/world/hubInteriors.ts` and `hubInteriors.test.ts`: `CHAPEL_LOOK` names
  the rule if it is per house; `HUB_INDOOR_DRESSING` gains the crucifix and the two murals, with
  a `chapel_crucifix` / `chapel_mural` helper beside `painting`

Not touched: `tools/bake`, `public/art` (I-R4MYX-14), `hubTown.golden.json`, `game-server/`.

## What to Build

- **Bays (W1–W7)**, over the piece grid `cut` already lays (40 px pieces from each wall rect's
  start, the last one trimmed):
  - **Where no lancet stands (W2):** no lancet on a trimmed piece, or on a piece whose span holds
    a post.
  - **South outward face (W3):** lancet and buttress alternate, with exactly one buttress between
    neighbouring lancets and a buttress outside the first and the last. The rest are plain. The
    pattern mirrors about x 1270 within 20 px. Indicative: lancets at x 1060–1460, every 80 px.
  - **North inner face (W4):** a `chapel_wall_back_lancet_x` at exactly each south lancet's x. The
    other pieces stay plain or pillar, hashed.
  - **East outward face (W5):** at least one lancet per segment, none adjoining another, mirrored
    about y 1320 within 20 px. The rest plain or buttress. Indicative: y 1200 and 1460. Prefer
    bays the belfry and the wayside cross leave clear on screen (see the FS's Edge States).
  - **West inner face (W6):** no lancet. The pieces behind the crucifix and the murals are plain.
  - **Cut-away pieces (W7):** the south and east front pieces carry no lancet.
  - **Other buildings (W7):** unchanged, piece for piece.
- **Dressing (W12, W13):**
  - Indicative spots: the crucifix at (982, 1320), 4 × 40; mural 0 at (982, 1210) and mural 1
    at (982, 1430), each 4 × 64.
  - The rules, as tests:
    - the crucifix within 10 px of y 1320;
    - one mural north and one south of it, 90–130 px from it along the wall;
    - all three inside y 1120–1520, with no overlap between them;
    - R15 holds;
    - on screen, no frame rect of the three overlaps a candelabra's or the lectern's frame rect
      (manifest frames at their points).
  - They hide under the chapel's roof like all indoor dressing.
- **No light (W14):** no new light source. The candelabra stay the chapel's only lights.

## Acceptance Criteria

- [ ] Vitest (W1): two seeds give the same outward kinds, the same inner lancets and the same plain
      pieces behind the hung dressing. Only indexes and open plain-or-pillar picks differ.
- [ ] Vitest (W2–W5): every rule above holds for the chapel's walls as the golden lays them out.
      North inner lancet x values equal south outward lancet x values, as a set.
- [ ] Vitest (W6, W7): no lancet on the west inner face or on any front piece. The Inn, the store
      and the smithy plan the same pieces (sheet and index) as before, for a fixed seed.
- [ ] Vitest (W12): the crucifix and murals sit in `HUB_INDOOR_DRESSING` under the rules above,
      with R15 and the screen-overlap check passing.
- [ ] Vitest (W13): they are hidden while the chapel's roof is on and shown while it is lifted.
- [ ] No new light. `hubTown.golden.json` and `game-server/` are untouched.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` pass.
- [ ] Final bay positions and dressing spots noted here if they differ from the indicative ones.

## Blocked By

I-R4MYX-14 (the inner lancet, crucifix and mural sheets)

## Spec Reference

FS-R4MYX §Change: The chapel's windows match inside and out, and its west wall carries the
crucifix. W1–W7 (bays), W12–W13 (dressing), W14–W15 (bounds); user stories 1–10.

## TDD Approach

- RED: a `walls.test.ts` case that plans the golden's chapel walls with two seeds and expects
  every south outward lancet x to have a north inner lancet at the same x. It fails today: the
  hash gives no inner lancet at all.
- GREEN: the bay rule, read by `planBuildings` for the chapel.
