---
id: I-P9G8R-2
status: done
implements: FS-P9G8R
blocked_by: []
labels: [ready-for-agent]
title: "FS-P9G8R slice 2: consumed_item_ids on the extraction event, deleted by items-service"
---
Implements FS-P9G8R §B (Requirements 13, 17–22)

**Lane: agent** (common proto + items-service). Consumer side of persistence, testable on its
own by building events that carry consumed ids. The only slice that touches the proto.

## What to Build

- **Proto** (R13): in `game-server/common/api/proto/events/game.proto`, `PlayerItems` gains
  `repeated string consumed_item_ids = 5;` with a comment pointing at FS-P9G8R. Regenerate with
  `make gen` in `game-server/common/` and commit the regenerated `game.pb.go`; never hand-edit
  it. Check the regen diff touches only what this field explains (a protoc version drift would
  show as noise across every `.pb.go`; regenerate only `events/game.proto` if so, and say so in
  the PR).
- **Repository** (R17): a tx-taking method, e.g. `DeleteConsumedItemInstancesTx(ctx, tx,
  memberID, ids []uuid.UUID) (int64, error)`, running `DELETE FROM item_instances WHERE id =
  ANY($1) AND owner_member_id = $2` (`pq.Array`), wrapped with the repo's DB error wrapping.
  An empty list issues no query.
- **Service** (R17–R21): in `storeExtractedPlayerItems`, parse `GetConsumedItemIds()` up front
  (a non-UUID fails the event with `ErrUUIDCouldNotBeParsed`, like a malformed member id), and
  delete them as the member's **last** write: after the item upsert and after the loadout upsert;
  in the `loadout_unknown` branch, after the item upsert and before its early return. The service
  defines the method on its own `Repository` interface (consumer owns the interface). Log the
  deleted count at debug.
- No migration (R22).

## Acceptance Criteria

- [ ] `consumed_item_ids = 5` exists on `PlayerItems`; `game.pb.go` is regenerated; game-service
      and items-service both build.
- [ ] Given an event whose `PlayerItems` lists two of the member's instance ids, both rows are
      gone after `ProcessItemsExtracted`, inside the same transaction as the upsert.
- [ ] With `loadout_unknown` set, the consumed rows are deleted and the stored loadout's slot that
      pointed at one reads NULL afterwards (FK `ON DELETE SET NULL`); the rest of the loadout is
      untouched.
- [ ] An id already gone, or owned by another member, deletes nothing and does not fail.
- [ ] An empty list issues no delete.
- [ ] A redelivered event returns `ErrAlreadyProcessed` and deletes nothing more.
- [ ] A failure after the delete (e.g. a later player's write) rolls the delete back.
- [ ] A non-UUID consumed id fails the event as malformed.
- [ ] An event without the field applies exactly as before (existing extraction tests unchanged).
- [ ] `go test ./...` and lint pass in items-service (integration tests against the real DB for
      the repository method, as the existing repository tests do).

## Blocked By

None.

## Spec Reference

FS-P9G8R §B Requirements 13, 17–22; §Acceptance Criteria "Consumed items leave the stash"
(items-service rows); §Edge States (extraction failure / retry, unknown loadout, fenced items
assumption); User Stories 17, 20–24, 30.

## Files expected

- `game-server/common/api/proto/events/game.proto` **hotspot: only this slice edits it**
- `game-server/common/api/proto/events/game.pb.go` (regenerated)
- `game-server/items-service/internal/items/repository.go` (delete method)
- `game-server/items-service/internal/items/service.go` (`storeExtractedPlayerItems`, its `Repository` interface)
- `game-server/items-service/internal/items/process_extracted_test.go`, `extraction_test.go`, `repository_test.go`
- any items-service fake repositories implementing the widened interface

## TDD Approach

- RED: a `process_extracted_test.go` case whose event lists a seeded potion instance in
  `consumed_item_ids`, expecting the row gone after processing.
- GREEN: the proto field, the repository delete, the call as the member's last write; then the
  unknown-loadout, foreign-owner, empty and malformed cases.
