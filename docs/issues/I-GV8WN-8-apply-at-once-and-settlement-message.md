---
id: I-GV8WN-8
status: open
implements: FS-GV8WN
blocked_by: [I-GV8WN-3, I-GV8WN-5]
labels: [blocked]
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
