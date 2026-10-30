---
id: I-HRH2J-1
status: done
implements: FS-HRH2J
blocked_by: []
labels: [ready-for-agent]
title: "FS-HRH2J slice 1: game-service refuses pickups and unequips into a full bag"
---
Implements FS-HRH2J §D Requirements 31–39

**Author: agent** (charter default: the bag cap is agent-built; no human-lane split)

## What to Build

game-service caps a body's bag at 30 items in runs and field worlds. A pickup or an unequip that
would grow a full bag is refused and nothing moves; an equip swap stays allowed at full; a bag
already over the cap loses nothing.

- `BagCapacity = 30`, one named constant (in `internal/game`, beside the equip code, or in
  `common/constants` if that reads better there; one place only).
- `ErrBagFull` sentinel in `internal/game/errors.go`.
- `moveItemToSatchel` (`internal/game/session.go`, the `satchel.ItemIDs = append(...)` site):
  check `len(satchel.ItemIDs) >= BagCapacity` **before** the container's list is touched; return
  `fmt.Errorf("pick up item %s: %w", itemID, ErrBagFull)`. `pickUpItem`'s existing error path
  releases the item from `containerInteractedCache`, as for out-of-range.
- `handleEquip` unequip branch (the `itemIDList.ItemIDs = append(...)` after `*worn.Holder(equipment) = nil`):
  check capacity **before** clearing the slot; return an error wrapping `ErrBagFull`; the item
  stays worn.
- The equip swap (`append(itemIDList.ItemIDs, **target.Holder(equipment))`) is net-zero and is
  **not** checked.
- No new reply message: do not add a `sendErrorToPlayer` / `sendRefusalToPlayer` call for this
  refusal (FS-HRH2J R37). No proto, WS payload, HTTP or items-service change.
- Run/field seating (`carried`) is not capped.

Use `bag` in new names, comments and test names (game-service/CONTEXT.md "Carried items"); the
existing `satchel` identifiers may stay.

## Acceptance Criteria

- [ ] `BagCapacity` (30) and `ErrBagFull` exist.
- [ ] Pickup at 29 → taken; bag 30, container no longer holds it.
- [ ] Pickup at 30 → error wraps `ErrBagFull`; container keeps the item at its index; bag unchanged.
- [ ] Unequip at 30 → error wraps `ErrBagFull`; item still worn; bag unchanged.
- [ ] Equip swap at 30 → allowed; bag stays 30 with the swapped-out item at the end.
- [ ] Equip into an empty slot at 30 → bag 29.
- [ ] A bag seeded at 31 → pickup refused, all 31 kept.
- [ ] Field-pile pickup is covered by the same guard (one test through the field path).
- [ ] No new outbound message on refusal.
- [ ] `go test ./...` and `golangci-lint run` pass for game-service.

## Blocked By

None

## Spec Reference

FS-HRH2J §D R31–39; Edge States "Bag exactly full", "Stale client state", "Over capacity at ship";
User Stories 28–29.

## Files expected

- `game-server/game-service/internal/game/session.go`
- `game-server/game-service/internal/game/errors.go`
- `game-server/game-service/internal/game/item_pickup_test.go`, `equip_ownership_test.go` (or a
  new `bag_capacity_test.go`), `field_drops_test.go`

## TDD Approach

- RED: table-driven test, pickup into a bag of 30 → `errors.Is(err, ErrBagFull)` and the
  container still holds the item.
- GREEN: the capacity check at the top of the move in `moveItemToSatchel`; then the unequip row.
