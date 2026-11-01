---
id: I-18Z5F-2
status: done
implements: FS-18Z5F
blocked_by: [I-18Z5F-1]
labels: []
title: "FS-18Z5F slice 2: extraction settlement is fenced by run id and releases every item tagged with it (items-service)"
---
Implements FS-18Z5F §F (Requirements 26–31)

**Author: agent.** Needs I-VPD8Y-1's `location` column (BAG on insert and on extracted bag
items); it comes through I-18Z5F-1.

## What to Build

Inside `ProcessItemsExtracted`'s existing transaction (behind the FS-BVM9H inbox), with the run
id = the event's `session_id`:

1. **Apply only what the run still owns** (R27), in `storeExtractedPlayerItems`:
   - an item with no `instance_id` is inserted `AVAILABLE`, `run_id` NULL, location BAG;
   - an item whose `instance_id` is `IN_RUN` under this run id gets today's conflict update
     (owner, source, rarity and roll still fixed), then `AVAILABLE`, `run_id` NULL; inventory
     items get location BAG, equipment items keep theirs;
   - any other `instance_id` is skipped and logged (info), nothing written.
   Today's `BatchUpsertItemInstances` conflict clause must not be the path for existing rows any
   more, or it would write a skipped row: split inserts from fenced updates.
2. **Loadout** (R28): written as today unless `loadout_unknown`, or unless any of that member's
   brought-in instances was skipped by the fence.
3. **Release** (R29): after every member is stored, one update sets every instance still
   `IN_RUN` with `run_id` = the event's `session_id` (any member) to `AVAILABLE`, `run_id` NULL,
   location unchanged.
4. **Nothing is deleted** (R30). Run and field events settle alike (R26).

**Merge overlap:** FS-P9G8R (concurrent) also changes `ProcessItemsExtracted` /
`storeExtractedPlayerItems` and the extraction proto. Do not build its part. If it lands first,
rebase and keep its deletes before the release step (FS §Merge overlap).

**Hard bounds:** no proto change, no game-service change.

## Acceptance Criteria

- [ ] A find is inserted AVAILABLE in the BAG with no run id.
- [ ] A brought-in item IN_RUN under the event's run id comes back AVAILABLE, run id cleared; a bag one is in the BAG.
- [ ] A brought-in item re-tagged to another run id is skipped; its row is unchanged (still IN_RUN under the newer id).
- [ ] A member with a skipped item keeps their stored loadout; a member with `loadout_unknown` keeps it, as today.
- [ ] After settlement no instance carries the event's run id; items of a member absent from the event are AVAILABLE with location unchanged.
- [ ] A redelivered event is dropped by the inbox; re-running the store on a settled run writes nothing.
- [ ] A field-world event settles the same way.
- [ ] No row is deleted.
- [ ] Existing extraction tests (`extraction_test.go`, `process_extracted_test.go`) updated for the fence and green; `go test ./...`, `golangci-lint run`: no new failures.

## Files expected to touch

- `game-server/items-service/internal/items/service.go` (`ProcessItemsExtracted`, `storeExtractedPlayerItems`, the mappers)
- `game-server/items-service/internal/items/repository.go` (insert-only batch, fenced update, release by run id)
- Tests: `extraction_test.go`, `process_extracted_test.go`, `repository_test.go`

## Blocked By

- I-18Z5F-1: the `IN_RUN` status and `run_id` column.

## Spec Reference

FS-18Z5F §F R26–R31, §Merge overlap; User Stories 3, 6, 12, 16, 20, 21, 22; Edge States "Checkout commits, reply lost", "Next world entered before the last one settled", "Two settlements out of order", "Extraction carries an instance id owned by someone else", "Field visit settles".

## TDD Approach

- RED: event for run A with one find and one brought-in sword IN_RUN under A → find inserted, sword AVAILABLE.
- RED: sword IN_RUN under B, event for A → sword untouched, loadout untouched.
- RED: member C absent from the event, C's ring IN_RUN under A → ring AVAILABLE after settlement.
- GREEN: the split write path and the release update.
