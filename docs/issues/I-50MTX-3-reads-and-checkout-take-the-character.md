---
id: I-50MTX-3
status: done
implements: FS-50MTX
blocked_by: [I-50MTX-2]
labels: [ready-for-agent]
title: "FS-50MTX slice 3: gear reads and run checkout take the character"
---
Implements FS-50MTX §Reads, §Run and field checkout

**Hotspot:** one writer at a time on `items-service/internal/items/{repository,service,handler}.go`.

## Files owned

- `game-server/items-service/internal/items/model.go`
- `game-server/items-service/internal/items/repository.go`: `GetLoadout`, `ListItemInstances`, `LoadoutTx`, `CheckOutRunGearTx`, `runGear`, `ownedInstanceColumns`
- `game-server/items-service/internal/items/service.go`: `GetLoadout`, `GetLoadoutWithItems`, `ListItemInstances`, `CheckOutRunGear`
- `game-server/items-service/internal/items/handler.go`: `GetLoadout`, `GetLoadoutWithItems`, `ListItemInstances`, `CheckOutRunGear`, the `ItemInstance` proto mapping
- Tests: `internal/items/checkout_test.go`, `service_test.go`, `repository_test.go`, `handler_test.go`

## What to Build

**Loadout reads (R12, R22).** `GetLoadout` and `GetLoadoutWithItems` take the character and return
only that row, filtered by member and character. No row reads as an empty loadout, as today. A foreign
character reads as empty, so reads make no character-service call.

**Instance list (R23).** With a character: its held instances plus the account's stash. Without one:
the stash only. Another character's held instances are never returned.

**Wire (R24).** `ownedInstanceColumns` selects `ii.character_id`, and the mapper sets `character_id` on
`ItemInstance`, empty for a stash item.

**Checkout (R25-R27).** `CheckOutRunGear` takes the character. R3 makes its set simply that character's
held instances, so `runGear` becomes owner and `ii.character_id`, and the `OR wornByOwner` arm goes.
`LoadoutTx` reads that character's row. Idempotency and the response shape do not change (FS-18Z5F R10,
R11). Orphan reclaim stays per member: every `IN_RUN` instance of the account under another run id
re-tags to this run, the read seats only what this character holds, and the rest release at this run's
settlement through the unchanged release by run id. No character-service call: checkout is not
reachable from the gateway.

The handlers refuse a missing or malformed `character_id` with `InvalidArgument`, except
`ListItemInstances`, where absent is valid and only a malformed one is refused.

## gRPC compile

**No caller breaks.** The fields already exist from I-50MTX-1. This makes `character_id` required at
runtime on `GetLoadout`, `GetLoadoutWithItems` and `CheckOutRunGear`. Their callers are the gateway
(I-50MTX-6) and game-service (I-50MTX-5), both on this branch and both compiling either way.

## Acceptance Criteria

- [ ] Two characters' loadouts read separately; a new character reads an empty loadout, no error.
- [ ] A loadout read of a foreign character returns an empty loadout, with no character-service call.
- [ ] The instance list with a character returns that character's held instances plus the stash; without one, the stash only; another character's are never returned.
- [ ] `ItemInstance.character_id` is the holder, and empty for a stash item.
- [ ] Checkout moves only the named character's worn and bag instances to `IN_RUN`; another character's stay `AVAILABLE`.
- [ ] Checkout reclaims every `IN_RUN` instance of the member, whichever character holds it; those not held by the checked-out character are not seated and are released at that run's settlement.
- [ ] A repeat checkout under one run id writes nothing and returns the same set.
- [ ] `go test ./...` in `items-service` passes, with the database tests on.

## Blocked By

I-50MTX-2. Blocks I-50MTX-4.

## Spec Reference

FS-50MTX R12, R22-R27; user stories 3, 9, 11, 18.

## TDD Approach

- RED: with gear on characters A and B, `CheckOutRunGear` for A leaves B's items `AVAILABLE`, and the list for A has no item B holds.
- GREEN: `runGear` keyed by holder; the list's `WHERE` and the column list.
