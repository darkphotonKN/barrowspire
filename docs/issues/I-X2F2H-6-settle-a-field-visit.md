---
id: I-X2F2H-6
status: done
implements: FS-X2F2H
blocked_by: [I-X2F2H-1, I-X2F2H-2, I-X2F2H-3]
labels: [blocked]
title: "FS-X2F2H slice 6: a field visit settles through the match-end outbox as a returned result (game-service)"
---
Implements FS-X2F2H §F (Requirements 38–42, 48–50), §B (Requirement 16)

**Author: agent.** Must not ship to an environment before I-X2F2H-2's consumer skip is deployed
(FS §F R47).

## What to Build

Slice 1's `settle(visit)` seam starts publishing.

1. **Snapshot** (FS §F R38): under the field's lock, take the body's equipment and satchel (the
   same extraction the run's end uses: `extractedEquipmentOf`, `extractedItemFrom`), its kills,
   the visit's deaths (slice 4) and the visit's XP from slice 3's tally, which is taken and
   cleared for that member. Publish off the lock and off the tick.
2. **Publish** (FS §F R39–R41): a new `EventEmitter` method (e.g. `PublishFieldVisit`) on the
   game service that builds one `ItemsExtractedEvent` and one `MatchEndedEvent` and writes both
   through the existing `writeMatchEndOutbox` in one transaction. It does **not** go through
   `rankPlayers` (which would mark the visitor a winner). The result: `session_id` = the visit id,
   started/ended = entry/leave times, `member_id`, `username`, `character_id`,
   `experience_gained`, `kills`, `deaths`, `win = false`, `escape = false`, `final_position = 1`,
   `world_type = "field"`. Equipment never nil; picked-up items with an empty `instance_id`.
3. **Fresh visit id per visit** (FS §F R42): slice 1 mints it; assert two visits by one
   character produce two ids and two XP grants.
4. **Hub level** (FS §B R16): before the hub seats a returning player, apply the visit's progress
   through `ApplyRunProgress`.
5. **Exactly once** (FS §F R49): whichever exit removes the body settles; others settle nothing.
   Already structured in slice 1; this slice proves it with the publisher in place.
6. **No double mint** (FS §F R48): a test that a picked-up item settled from one visit does not
   appear without its `instance_id` in a second visit's snapshot (every body is built from
   items-service).

**Hard bounds:** no matchmaker / match queue change, no HTTP endpoint, no migration; character-
service and items-service unchanged.

## Acceptance Criteria

- [ ] `leave_field` writes exactly two outbox rows (`items.extracted`, `match.ended`) in one transaction with the stated fields; `world_type = "field"`, `win = false`, `final_position = 1`, `escape = false`.
- [ ] Disconnect, `leave_hub` and `enter_hub` from a field each write the same pair once; a race between two of them writes one pair (`-race`).
- [ ] Two visits by the same character carry different `session_id`s.
- [ ] A visit's XP equals the killer-only XP earned in it; a second visit starts at zero.
- [ ] The returning player's hub body shows the new level at once.
- [ ] A run's end still publishes through `PublishMatchComplete` unchanged (existing tests green).
- [ ] `go test ./...`, `golangci-lint run`: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/game/service.go` (`PublishFieldVisit`, a field result builder beside `formatMatchData`) and `publish_match_complete_test.go` or a new `publish_field_visit_test.go`
- `game-server/game-service/internal/game/session.go` (`EventEmitter` gains the method; the field's settle snapshot)
- `game-server/game-service/internal/types/` (a `FieldVisit` raw type beside `RawMatchState`)
- `game-server/game-service/internal/game/field_kill_experience.go` (take-and-clear a member's tally)
- `game-server/game-service/internal/gameserver/server.go` (the settle seam calls the publisher; `ApplyRunProgress` before hub seating)
- Mocks in `internal/gameserver/*_test.go` that implement `EventEmitter`
- Tests: `internal/gameserver/field_settlement_test.go` (new)

## Blocked By

- I-X2F2H-1: the settle seam and visit id.
- I-X2F2H-2: the `world_type` field and the consumers' skip (decline path: see I-X2F2H-2).
- I-X2F2H-3: the visit XP tally.

## Spec Reference

FS-X2F2H §F R38–R42, R48–R50; §B R16; User Stories 6, 7, 19, 20, 22, 25; Acceptance Criteria
9–11; Edge States "Leave races", "Disconnect while fallen", "Two visits back to back within one
outbox cycle", "Visit with no XP and no pickups", "Pod crash"; Decision log D6, D22.

## TDD Approach

- RED: `leave_field` → fake outbox repository receives the two rows with the stated fields.
- RED: two visits → two distinct `session_id`s, XP reset between.
- RED: race leave + disconnect → one pair.
- GREEN: the publisher, the snapshot, the wiring.
