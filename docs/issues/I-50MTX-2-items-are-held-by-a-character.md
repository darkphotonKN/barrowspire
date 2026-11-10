---
id: I-50MTX-2
status: done
implements: FS-50MTX
blocked_by: [I-50MTX-1]
labels: [ready-for-agent]
title: "FS-50MTX slice 2: items are held by a character, and every write respects it"
---
Implements FS-50MTX §The model, §Migration, §Loadout writes, §Moves, §Settlement, §Account-level flows

**Hotspot:** one writer at a time on `items-service/internal/items/{repository,service,handler}.go`.
I-50MTX-3 and I-50MTX-4 follow this one on the same files.

**Why this slice is this big (R9).** The migration drops `UNIQUE(member_id)` and adds the holder
check, so every writer of a loadout row or a `BAG` row has to change with it, or it fails at runtime:
the two `ON CONFLICT (member_id)` upserts, `UpdateLoadout`, `MoveItemInstance` and settlement.

## Files owned

- `game-server/items-service/migrations/000031_items_held_per_character.up.sql`, `.down.sql` (new)
- `game-server/items-service/internal/items/model.go`
- `game-server/items-service/internal/items/repository.go`: loadout slot and full-loadout upserts, placement reads, bag count, location and move writes, `insertItemColumns`/`insertItemArgs`, `applyRunItemQuery`/`ApplyRunItemsTx`
- `game-server/items-service/internal/items/service.go`: `UpdateLoadout`, `MoveItemInstance`, `storeExtractedPlayerItems`, `MapProtoEquipmentToItemInstances`, the `Repository` interface
- `game-server/items-service/internal/items/handler.go`: `UpdateLoadout`, `MoveItemInstance`
- Tests in `internal/items` whose fixtures write a loadout row or a `BAG` row, or that drive the writes above: `repository_test.go`, `service_test.go`, `handler_test.go`, `process_extracted_test.go`, `checkout_test.go`, `snapshot_test.go`, `grant_test.go`, `extraction_test.go`, `apply_settlement_test.go`

`grant.go` should not change: keep the account-wide stash count as it is and add a per-character bag
count beside it.

## What to Build

**Migration 000031 (R7, R8).** One file, in this order: delete `player_loadouts` rows with no
`character_id`; set `location = 'STASH'` on every instance with `location = 'BAG'` and no
`character_id`, whatever its status; drop the `member_id` unique constraint (created inline in
migration 000006, so check its generated name); make `character_id` `NOT NULL` and unique; add the R2
check (`character_id` set if and only if `location = 'BAG'`). No backfill.

No code has ever written either `character_id` column (migration 000019 added them, nothing since),
so a stash row with a holder cannot exist and the check applies cleanly.

**Down migration (charter default).** Clears `player_loadouts` and restores `UNIQUE(member_id)`, after
dropping the check, the `character_id` unique and its `NOT NULL`. It does not put old items back.

**The model (R1-R6).** `ItemInstance`, `ItemPlacement`, `UpdateLoadoutRequest`,
`MoveItemInstanceRequest` and `UpsertPlayerLoadoutRequest` gain the character. Every loadout read and
write filters by member and character (R4). The upserts conflict on `character_id` and the update
arm is guarded on the member, so one account can never overwrite another's row. The account lock
stays on every write that takes it (R6). The bag cap counts one character; the stash cap counts the
account (R5). `wornByOwner` stays account-wide.

**The constraint is per statement.** Any write that changes `location` writes `character_id` in the
same `UPDATE`, or R2 rejects it.

**`UpdateLoadout` (R14-R17).** Equipping sets the holder and `BAG` in the slot's transaction.
Absent, not owned, or held by another character answers `404 · NOT_FOUND` before the status check
(R15), closing today's gap where a nil placement passed. Not-AVAILABLE stays `ITEM_NOT_AVAILABLE`. A
displaced instance goes to this character's bag, and `BAG_FULL` measures this character. Map
`ErrNotFound` to `codes.NotFound` in the handler, which does not today.

**`MoveItemInstance` (R18-R21).** Stash to bag sets the holder, bag to stash clears it, still
conditional on owner and status. Held by another character is `404 · NOT_FOUND`, checked before
`ITEM_WORN`. A same-location move stays a no-op.

**Settlement (R30-R33, the consumer side).** With a `character_id`: finds are inserted held by it in
`BAG`, brought-in instances the run still owns stay or become held by it in `BAG`, and the loadout
write is keyed by it. Without one (R32): finds and applied instances go to the stash with no holder,
no loadout is written, a warning is logged, and it never fails on R2. `ApplyRunItemsTx` therefore
writes the holder outright rather than `COALESCE`-ing it, and an applied worn item with no event
character is forced to `STASH`. Consumed-item deletion and release by run id do not change (R33).

**Unchanged, pinned by test (R34, R35).** A purchase and a mailbox grant land in the stash with no
holder. A held item is refused for listing, with `ITEM_WORN` answering first.

The handlers refuse a missing or malformed `character_id` with `InvalidArgument`.

Not in this slice: reads and checkout stay per account until I-50MTX-3; the character-belongs-to-caller
check is I-50MTX-4.

## gRPC compile

**No caller breaks.** The fields already exist from I-50MTX-1, so this compiles everywhere. It makes
`character_id` required at runtime on `UpdateLoadout` and `MoveItemInstance`; their only caller is the
gateway, which sends it in I-50MTX-6, and its tests use a stub. `go test ./...` in `items-service`
stays green, including with `ITEMS_TEST_DSN` set against a migrated database (`docs/db-tests-guide.md`).

## Acceptance Criteria

- [ ] Migration up applies over data with old `BAG` rows and old loadouts: old items end in the stash with no holder; old loadouts are gone and their items survive.
- [ ] Down applies after up, including with two loadout rows for one member.
- [ ] A row with `location = 'BAG'` and no `character_id`, or `location = 'STASH'` with one, is rejected by the database.
- [ ] Two characters of one account hold different loadouts and bags; a write to one leaves the other unchanged.
- [ ] Equipping a stash item sets the holder and moves it to `BAG`; unequipping leaves it in that character's bag.
- [ ] Equipping an item held by another of the caller's characters, not owned, or absent answers `404 · NOT_FOUND`, nothing written.
- [ ] Stash to bag sets the holder, bag to stash clears it, a same-location move changes nothing, another character's item answers `404 · NOT_FOUND`.
- [ ] `BAG_FULL` is per character and `STASH_FULL` per account: 30 in one character's bag does not block another's.
- [ ] Settlement inserts finds held by the event's character and writes that character's loadout; another character's loadout is untouched.
- [ ] An event with no `character_id` settles: finds and applied items in the stash with no holder, no loadout written, a warning logged.
- [ ] A purchase and a mailbox grant land in the stash with no holder.
- [ ] `go test ./...` in `items-service` passes, with the database tests on.

## Blocked By

I-50MTX-1. Blocks I-50MTX-3.

## Spec Reference

FS-50MTX R1-R9, R14-R21, R30-R35 (R30's consumer side); user stories 1-5, 7, 8, 10, 12, 13, 16, 17, 21-25.

## TDD Approach

- RED: a database test that inserts a `BAG` row with no holder expects a check violation, and one that equips a stash item for character A expects `character_id = A` and `location = 'BAG'`.
- GREEN: the migration, then the keyed upserts and the holder-writing statements.
