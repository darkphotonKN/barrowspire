---
id: I-1D6BX-2
status: done
implements: FS-1D6BX
blocked_by: []
labels: [ready-for-agent]
title: "FS-1D6BX slice 2: the client draws and opens sacks (placeholder prop)"
---
Implements FS-1D6BX §Requirements 12–14, 17 (placeholder only)

The client knows the `"sack"` kind. It draws a sack on the floor in a run and in a field world,
closed or open from `is_open`, and opens it exactly as a chest opens, into today's satchel view.
The prop is a code placeholder: the bake is slice 4. Face selection per kind is slice 3. In this
slice every kind still opens into the satchel.

## Files owned

- `game-client/src/types/gameState.ts` (`ContainerKind` gains `"sack"`)
- `game-client/src/render/world/sack.ts` (new: `SACK` sheet `"sack"`, placeholder keys `sack_closed` / `sack_open`, `sackFrame`, `paintSack`, in the shape of `render/world/chest.ts`)
- `game-client/src/scenes/BarrowspireScene.ts`: `updateContainers`, texture creation (`createChestTextures` neighbour), `showContainerFrame` if it is chest-specific. **Hotspot: touch only these.**
- `game-client/src/scenes/fieldPiles.ts` and `FieldScene.ts` (its stage: a `placeSack` beside `placeChest`)
- `game-client/src/render/world/runDressing.ts`, `forestDressing.ts` (a sack counts where a chest counts)
- the tests beside each

## What to Build

1. Widen `ContainerKind`. Add a helper (e.g. `placedKind(c)`) that maps an unknown kind to `"chest"` (R12, D2). Every kind switch goes through it.
2. Draw a sack with the sack placeholder texture, closed/open per state (R13, D3). Fall back to the baked `"sack"` sheet through the same art-library path the chest uses once it exists.
3. Treat a sack exactly as a chest in `fieldPiles`: reach, the open window, restock, never reserved.
4. Sacks count in light pooling (`poolInteractable`) and in run and Forest dressing keep-outs (R14).

## Acceptance Criteria

- [ ] `fieldPiles` tests: a sack is reached, opened on state, re-closes on restock, and is never reserved, exactly as a chest.
- [ ] A sack draws closed or open from `is_open`. An emptied sack stays drawn.
- [ ] An unknown kind is handled as a chest (unit test on the helper).
- [ ] Run and Forest dressing keep sacks clear as they do chests (tests where dressing has them).
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green in game-client.

## Blocked By

None. The client codes to the wire value `"sack"` defined in FS-1D6BX R2. Slice 1 can land in either order.

## Spec Reference

FS-1D6BX §Requirements 12–14, 17, User Stories 2, 4, 12, 13, 21, Edge States (unknown kind, bake not landed).

## TDD Approach

- RED: a `fieldPiles` test with a `kind: "sack"` container expecting it drawn and opened as a chest.
- GREEN: the sack branch and the kind helper.
