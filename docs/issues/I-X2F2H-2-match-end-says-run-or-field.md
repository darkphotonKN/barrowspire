---
id: I-X2F2H-2
status: done
implements: FS-X2F2H
blocked_by: []
labels: [ready-for-agent]
title: "FS-X2F2H slice 2: match.ended says run or field; stats-service and notification-service skip field visits (common proto + consumers)"
---
Implements FS-X2F2H §F (Requirements 43–47, "The settlement finding")

**Author: agent.** **This slice is the server decision the FS flags to the user** (FS §F, "The
settlement finding"; Decision log D22): a field visit can carry its data on the existing
match-end events, but stats-service and notification-service cannot tell it from a match
without a discriminator. If the user declines the change, close this issue unbuilt and drop it
from I-X2F2H-6's `blocked_by`; field visits then count as games played and send a "Game Over".

## What to Build

1. **Proto** (FS §F R43): `MatchEndedEvent` gains `string world_type = 5;` in
   `game-server/common/api/proto/events/game.proto`, documented as `"run"` or `"field"`, empty
   read as `"run"`. Regenerate with `common/Makefile`; never hand-edit `game.pb.go`.
2. **game-service** sets `world_type = "run"` on every run's `match.ended` (`formatMatchData`).
   Nothing else in the run path changes.
3. **stats-service** (R44): in `ProcessMatchCompleted`, an event with `world_type = "field"` is
   marked processed in the inbox (`processed_events`) and writes nothing else: no player stats,
   no `match_history`, no leaderboard. A run event (`"run"` or empty) is processed exactly as
   before.
4. **notification-service** (R45): `ProcessGameEnded` sends nothing for `world_type = "field"`.
5. **character-service and items-service are not touched** (R46).
6. **Deploy note** (R47): this slice ships before I-X2F2H-6 publishes any visit. Say so in the
   hand-back.

No DB migration, no HTTP endpoint, no change to the AMQP topology.

## Acceptance Criteria

- [ ] `game.proto` has `world_type = 5` on `MatchEndedEvent`; generated Go is regenerated, not patched.
- [ ] A run's `match.ended` outbox payload carries `world_type = "run"` (game-service test).
- [ ] stats-service: a field event leaves stats, history and leaderboard unchanged, and its `MessageId` is recorded processed (a redelivery is still a no-op); a run event and an event with empty `world_type` behave exactly as before (existing tests green).
- [ ] notification-service: a field event creates no notification; run events unchanged.
- [ ] `go test ./...` and `golangci-lint run` green in common, game-service, stats-service and notification-service; no new failures versus the branch point.

## Files expected to touch

- `game-server/common/api/proto/events/game.proto` and regenerated `game.pb.go`
- `game-server/game-service/internal/game/service.go` (`formatMatchData` sets `"run"`) and `publish_match_complete_test.go`
- `game-server/stats-service/internal/stats/service.go`, `process_match_completed_test.go`
- `game-server/notification-service/internal/notification/service.go`, `service_test.go`
- A shared constant for `"run"` / `"field"` only if one of these services already imports a fitting place; otherwise string constants beside each consumer

## Blocked By

None

## Spec Reference

FS-X2F2H §F R43–R47 and "The settlement finding"; User Story 23; Acceptance Criteria 12–14
(stats, notification, run carries `"run"`); Decision log D22.

## TDD Approach

- RED: stats-service `ProcessMatchCompleted` with a field event → no stats rows, inbox row present.
- RED: notification-service `ProcessGameEnded` with a field event → no notification.
- RED: game-service run end → payload `world_type == "run"`.
- GREEN: proto field, regenerate, the two skips, the run setter.
