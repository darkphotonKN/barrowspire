---
id: I-18Z5F-6
status: done
implements: FS-18Z5F
blocked_by: [I-18Z5F-4, I-18Z5F-5, I-VPD8Y-4]
labels: []
title: "FS-18Z5F slice 6: unsafe finds marked in the run overlay; in-run items locked in the hub overlay (game-client)"
---
Implements FS-18Z5F §H (Requirements 36–40)

**Author: agent.** Also blocked by I-VPD8Y-4 (the bag-only hub view in `HubGear.ts`).
Presentation only.

## What to Build

1. **Types** (R39): `ItemState` in `src/types/gameState.ts` gains `unsafe?: boolean`. The hub's
   `ItemInstance.status` gets `IN_RUN` from the regenerated client (slice 5), never a hand edit.
2. **Run marking** (R36, R37): in the gear overlay's bag cells and worn slots, an item with
   `unsafe` in a run world gets an oxblood inner edge from `canvasPalette` tokens (no raw hex),
   distinct from the rarity edge down the left side. The item tip (`itemTip.ts`, built from
   `itemView`) adds "Found this run: lost if you die before you escape." for an unsafe item in a
   run. Neither appears when `world_type` is `field` or in the hub.
3. **Hub lock** (R38): in `HubGear.ts`, an instance with `status === "IN_RUN"`, worn or in the
   bag, is drawn dimmed, its tip reads "Still in a delve.", and equip, unequip and move send no
   request for it.
4. **Guideline** (R40): `game-client/docs/design-guideline.md` records the unsafe inner edge and
   the in-run dim beside the rarity edge.

**Hard bounds:** no server change, no new WS message type, no new art pipeline.

## Acceptance Criteria

- [ ] In a run, an unsafe item in a bag cell and in a worn slot shows the oxblood inner edge; a safe item does not; the rarity edge is unchanged.
- [ ] An unsafe item's tip in a run includes "Found this run: lost if you die before you escape."
- [ ] In a field world, an unsafe item shows neither the edge nor the line.
- [ ] In the hub, an IN_RUN item is dimmed, its tip reads "Still in a delve.", and clicking or pressing `E` on it sends nothing.
- [ ] The token fence passes (no raw colours).
- [ ] The design guideline describes both treatments.
- [ ] `npm test`, `npm run lint`, `npm run typecheck` (or the repo's equivalents): no new failures.

## Files expected to touch

- `game-client/src/types/gameState.ts`
- `game-client/src/ui/GearOverlay.ts`, `itemTip.ts`, `HubGear.ts`, possibly `EquipmentHud.ts` (world type to the panel)
- `game-client/src/items/itemView.ts` (the tip line and the in-run note as presenter output)
- `game-client/src/utils/canvasPalette.ts` (a named token for the unsafe edge, if one is needed)
- `game-client/docs/design-guideline.md`
- Tests: `GearOverlay.test.ts`, `HubGear.test.ts`, `itemView.test.ts`

## Blocked By

- I-18Z5F-4: `unsafe` on the WS item state.
- I-18Z5F-5: `IN_RUN` in the generated client.
- I-VPD8Y-4: the bag-only hub view this slice adds the lock to.

## Spec Reference

FS-18Z5F §H R36–R40; User Stories 4, 5, 11, 13; Edge States "Back in the hub before settlement lands", "Pod crash mid-run".

## TDD Approach

- RED: `itemView` of an unsafe item in a run carries the note; in a field it does not.
- RED: HubGear with an IN_RUN bag item → equip sends no request.
- GREEN: the presenter flag, the edge, the hub guard.
