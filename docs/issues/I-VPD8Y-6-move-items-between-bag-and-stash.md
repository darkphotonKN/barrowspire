---
id: I-VPD8Y-6
status: done
implements: FS-VPD8Y
blocked_by: [I-VPD8Y-2, I-VPD8Y-5]
labels: []
title: "FS-VPD8Y slice 6: right-click or E moves items between bag and stash in the hub"
---
Implements FS-VPD8Y §F Requirements 38–42, §API surface (`move-item-instance`, client side)

**Author: agent** (charter default)

## What to Build

Sorting, end to end from the overlay to the new endpoint.

- `apiClient.moveItemInstance(id, location)` in `game-client/src/utils/api.ts` via the generated
  client (`PUT /api/items/instances/{id}/location`).
- Stash-mode gestures (R38): right-click or `E` on a hovered bag item → stash; on a stash item →
  bag; on a worn slot → unequip to the bag (existing `updateLoadout`). Equip never sent in stash
  mode. Left-click nothing, no drag.
- Pre-checks (R39), hub notice, nothing sent: into the bag (or unequip) at 30+ → "Your bag is
  full."; into the stash at 60+ → "Your stash is full."; status not `AVAILABLE` → "That item is not
  free to move.". Non-`AVAILABLE` items draw dimmed in both grids (R40).
- One request at a time, optimistic (R41): the item moves to the end of its destination grid; busy
  state; overlay input ignored while in flight; walk keys not blocked.
- Refusals (R42), switching on `ApiError.code`: `BAG_FULL` / `STASH_FULL` / (`ITEM_NOT_AVAILABLE`,
  `ITEM_WORN`, `NOT_FOUND`) → the three toasts; anything else → "Could not change your gear.";
  then reload gear, bag and stash.

## Acceptance Criteria

- [ ] In stash mode, right-click / `E` on a bag item moves it to the stash, on a stash item to the bag, on a worn slot unequips to the bag; equip is never sent.
- [ ] Each pre-check shows its toast and sends nothing; non-`AVAILABLE` items are dimmed.
- [ ] One move in flight at a time, applied optimistically; a refusal shows the toast for its `code` and reloads.
- [ ] Tests cover each gesture, pre-check and refusal code; the client suite passes.

## Blocked By

I-VPD8Y-2 (the endpoint and its generated client method), I-VPD8Y-5 (stash mode)

## Spec Reference

FS-VPD8Y §F R38–R42; §API surface row `move-item-instance` (consumer); §Edge States (stale client, item gone, in flight on close). User stories 10–18, 21.

## TDD Approach

- RED: HubGear test — in stash mode, `E` on a bag item calls `moveItemInstance(id, "stash")` once and moves it locally; a `STASH_FULL` refusal notices "Your stash is full." and reloads.
- GREEN: stash-mode action routing in HubGear/GearOverlay, api method, code switch.

## Files it expects to touch

`game-client/src/utils/api.ts`, `game-client/src/ui/{HubGear,GearOverlay}.ts` (+ tests), `game-client/src/scenes/HubScene.ts` (if input routing lives there)
