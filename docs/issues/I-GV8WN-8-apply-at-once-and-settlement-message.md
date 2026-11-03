---
id: I-GV8WN-8
status: in-progress
implements: FS-GV8WN
blocked_by: [I-GV8WN-3, I-GV8WN-5]
labels: []
title: "FS-GV8WN slice 8: settlements applied at once; the player is sent their settlement record"
---
Implements FS-GV8WN §D Requirement 13, §G Requirements 19–20

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

- After a settlement's outbox commit, the session calls items-service `ApplySettlement` with the
  same payload and id (slice 3). On failure it retries with backoff while the session holds it;
  giving up at session end is safe (the async copy is durable).
- On settling, send the player a new server→client action `settlement` (only to them):
  - `outcome`: `escaped` | `died`;
  - `carried`: items, each with `found` (a find from this run);
  - `lost`: items, each with a `reason`: `unsafe` | `consumed`;
  - `experience_gained`, `level_before`, `level_after`, `kills`, `seconds_in_run`;
  - `status`: `pending`.

  Items use the existing WS item shape. The record is built from the settlement snapshot.
- When `ApplySettlement` succeeds, send `settlement` again with the same content and `status: confirmed`.
- A removed player (not connected) is sent nothing.
- Add the action and payload to the client wire types (`assets/types`) so slice 9 builds against them.

## Acceptance Criteria

- [ ] After commit, `ApplySettlement` is called once with the committed payload and id.
- [ ] A failing `ApplySettlement` is retried; the tick is never blocked.
- [ ] The settled player receives `settlement` with `status: pending` and the full content; teammates receive nothing.
- [ ] On success the player receives `settlement` with `status: confirmed`.
- [ ] Dead outcome lists unsafe finds as `lost: unsafe`; drunk potions appear as `lost: consumed` in both outcomes.
- [ ] `go test ./...` passes in game-service.

## Blocked By

I-GV8WN-3 (ApplySettlement), I-GV8WN-5 (settle on escape); death settles once I-GV8WN-6 lands

## Spec Reference

FS-GV8WN §D R13, §G R19–R20; user stories 5, 6, 9, 20.

## TDD Approach

- RED: session test with a fake items client: escape → expect `ApplySettlement` called, then `settlement` pending then confirmed sent to that player.
- GREEN: apply-after-commit in the pending settlement; message built from the snapshot.

## Notes from earlier slices (2026-11-03)

- From I-GV8WN-1: `ApplySettlement` must carry the **outbox row id** (the derived id, `newSettlementIDs`), not the payload's `ItemsExtractedEvent.EventId`, which is still random per `formatMatchData` call. Consumers dedup on the row id (MessageId).
- From I-GV8WN-9: the client reads `found` and `reason` **inline on each item** (`{...ItemState, found: true}`, `{...ItemState, reason: "unsafe"|"consumed"}`), not wrapped. Send `settlement` **before** `end_game` / `world_entered(hub)` on the same tick (solo or last to resolve), or the scene stops before the record shows. Only the first `settlement` opens the record; a later `confirmed` copy updates it without reopening.
- Security: `ApplySettlement` is tokenless until **I-GV8WN-11** lands. Building against it locally is fine; **do not deploy this slice to GKE before I-GV8WN-11**. Once 11 lands, the call presents the service credential.
- From code review: the handler maps missing-reference and lock-contention failures to Unavailable, so retry on Unavailable.
- From I-GV8WN-4 (D1): the session no longer holds settlements; the service's `settlementWriter` does. It has **no on-commit hook yet**. Add one here, e.g. `settle(..., onRecorded func())`, called once after the commit. That callback is where `ApplySettlement` and the `settlement` (pending → confirmed) send go. Retries of `ApplySettlement` belong to the writer's goroutine too, not to a session. Read "while the session holds it" above as "while the writer holds it".

## Implementation notes (2026-11-04, /develop; Nick approved the plan)

- **Writer (`settlement_writer.go`)** records the settlement, then applies it, then confirms it. Each step retries with backoff, all held on the writer's goroutine. `NewService(..., retry, applier)` takes a consumer-owned `SettlementApplier`; `config/routes.go` passes the items gRPC client, which gains `ApplySettlement`.
  - The apply carries the items.extracted **row id** and the committed payload (decoded from the formatted pair).
  - Every settlement is applied: a player's own, a run's end, and a sweep. Field visits are not.
  - Logging: a failed first record is ERROR. Retries and apply failures are WARN, since the recorded copy still lands. Giving up is ERROR.
- `EventEmitter.PublishSettlement(ctx, settlement, onConfirmed)`. The session's `handOff` sends `settlement` **pending** at once (on the tick, so before anything the run's end sends), and **confirmed** from `onConfirmed` once applied.
- **Record content** (`settlementRecordOf`, read under the lock with the snapshot):
  - **carried**: every item worn or carried that is taken out, with `found` set for an unsafe find;
  - **lost**: items not taken out (`reason: unsafe`) plus the stored potions drunk (`reason: consumed`, from the new `PotionComponent.Consumed`, a copy kept at drink time because the entity is removed);
  - `level_before` (the new `PlayerComponent.SeatedLevel`), `level_after`, `experience_gained`, `kills`, `seconds_in_run` (from the new `Session.startedAt`, 0 for a world never started).
- Items use `serializer.ItemStateOf`, extracted from the serializer's own conversion so there is one. `found` and `reason` sit inline (`SettlementCarriedItem` and `SettlementLostItem` embed `ItemState`), as the client reads them.
- **Not for GKE yet:** `ApplySettlement` is tokenless until I-GV8WN-11.
- **Watch:** the confirmed record is sent from the writer's goroutine, one more sender exposed to the known `send on closed channel` flake (I-UNANCHORED-3, seen once in this run's suite, then green twice). That issue is worth fixing before this ships.

## Acceptance walk

- After commit, `ApplySettlement` is called once with the committed payload and id: MET, `TestSettlementWriter_Committed_AppliedUnderItsRowIDThenConfirmed`, `TestPublishSettlement_Recorded_AppliedThenConfirmed`, `TestPublishMatchComplete_Recorded_Applied`.
- A failing `ApplySettlement` is retried and the tick is never blocked: MET. The first test fails once and retries. Every apply runs on the writer's goroutine.
- The settled player receives `settlement` pending with the full content, and teammates receive nothing: MET, `TestSettlementRecord_Escape_SentPendingWithEverythingCarried` and `…CarriesLevelsExperienceKillsAndTime`. The message is sent only to that member.
- On success the player receives `settlement` confirmed: MET, `TestSettlementRecord_Confirmed_SentAgainOnceApplied`.
- Unsafe finds are lost as `unsafe` on death, and drunk potions as `consumed`: MET, `TestSettlementRecord_Death_ListsLostFindsAndWhatTheyDrank`, `TestDrink_StoredPotion_KeptForTheRecord`.
- Wire shape matches the client: MET, `TestSettlementItems_JSON_FoundAndReasonInline`.
- `go test ./...` passes in game-service: MET. gameserver hit the I-UNANCHORED-3 flake once, then passed twice. `-race` on internal/game is clean, and vet and golangci-lint are clean.

## Code review outcome (2026-11-04; Nick: 好)

- Writer:
  - a pending settlement decodes its items.extracted once (`newPendingSettlement`); one that won't decode is recorded but never applied (Error log);
  - only Unavailable or DeadlineExceeded is retried, and any other answer is a refusal, logged as Error, not retried, never confirmed;
  - logs carry `event_id`;
  - a nil applier is documented as "never confirmed".
- Session:
  - the confirmed callback captures only the sender, run id, member and record, never the `*Session`, so a torn-down world is not held through an outage;
  - `sendSettlementRecord` is a plain function that no-ops with no sender (`newSession` leaves a nil sender as a nil interface), and the test-fixture workaround is reverted;
  - a confirmed record not delivered logs at Info.
- ECS: `PotionComponent.Consumed []ConsumedItem{InstanceID, Item}` replaces the two parallel slices, and `ConsumedItemIDs` is derived for extraction. The item is a deep copy (`ownCopy`: InstanceID and Affixes not shared with the removed entity).
- The record carries `run_id`. The client ignores a `settlement` for another run, so a late confirmation of an earlier run never opens in a new one.
- New tests:
  - the apply is refused and neither retried nor confirmed;
  - only the settled player is sent the record;
  - a solo escape's record arrives before `end_game`;
  - the record names its run;
  - client: a settlement for another run is ignored.
- FS Edge States added:
  - run-end-settled members get no record;
  - a found-and-drunk potion is not listed;
  - the `run_id` scope.
- Not done, by judgement:
  - `ItemStateOf` stays in `serializer`, since moving it to `types` would cycle (`components` imports `types`);
  - the payload stays a `map[string]interface{}`, because `types.Message.Payload` is that type;
  - `SeatedLevel` stays on `PlayerComponent`;
  - `NewService` keeps 5 parameters.
- A removed player is not sent a record because the connection's writer stops before `RemovePlayer` (gameserver). No session-level test can show that.
