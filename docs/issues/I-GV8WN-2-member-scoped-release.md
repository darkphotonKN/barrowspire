---
id: I-GV8WN-2
status: in-progress
implements: FS-GV8WN
blocked_by: []
labels: []
title: "FS-GV8WN slice 2: items-service settles one player of a run without releasing the rest"
---
Implements FS-GV8WN §B Requirement 6, §D Requirement 12, §H Requirement 26

**Author: human.** game-server is the owner's hand-coded lane.

## What to Build

- `common/api/proto/events/game.proto`: `ItemsExtractedEvent` gains `bool partial`. Regenerate;
  never hand-edit the generated Go.
- items-service `settleRun`: when `partial` is true, lock only the event's members and release only
  their IN_RUN rows under the run (`run_id = $1 AND owner_member_id = ANY($2) AND status =
  'IN_RUN'`), in place of `ReleaseRunTx`. Storing through the run fence and deleting consumed items
  are unchanged. When false, everything is as today.
- `DeleteConsumedItemInstancesTx` matching fewer rows than ids under the run fence: log a warning
  (member, run, ids) and count it in a metric. This is the free-consumable residual ADR-0040 accepts.

## Acceptance Criteria

- [ ] A partial event for member A releases A's IN_RUN rows under the run; member B's IN_RUN rows under the same run stay IN_RUN.
- [ ] A partial event locks only its members' accounts.
- [ ] An event without `partial` (old producer) settles exactly as today, releasing every IN_RUN row of the run.
- [ ] A consumed delete that matches zero rows under the fence logs a warning and increments the counter.
- [ ] `go test ./...` passes in items-service.

## Blocked By

None

## Spec Reference

FS-GV8WN §B R6, §D R12, §H R26; user stories 15, 19.

## TDD Approach

- RED: service test with two members IN_RUN under one run, a partial event for A → B's rows still IN_RUN.
- GREEN: a member-scoped release in the repository and the `partial` branch in `settleRun`.
