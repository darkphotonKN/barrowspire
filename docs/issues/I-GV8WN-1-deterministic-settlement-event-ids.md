---
id: I-GV8WN-1
status: in-progress
implements: FS-GV8WN
blocked_by: []
labels: []
title: "FS-GV8WN slice 1: settlement events get deterministic outbox ids"
---
Implements FS-GV8WN §B Requirement 7 (ADR-0040 §2)

**Author: human.** game-server is the owner's hand-coded lane; an agent writes tests only if asked.

## What to Build

The settlement outbox rows get ids the caller derives, so that writing the same settlement twice
(a retry after a commit that errored but did commit, or a second path) leaves one row.

- `common/outbox`: `OutboxParams` carries an id. The insert writes it and does nothing on conflict
  (`ON CONFLICT (id) DO NOTHING`), reporting success. Rows written without an id keep today's
  DB-generated id, so other producers are unchanged.
- game-service: the match-end writer derives ids as UUIDv5 under a fixed namespace over
  `run id + member id + routing key`. The run-end sweep (slice 4) uses member key `sweep`. A field
  visit uses `visit id + member id + routing key`.
- `MessageId` stays the row id (`worker.go`), so consumer inboxes dedup on the derived id.

## Acceptance Criteria

- [ ] Writing the same settlement twice leaves one `items.extracted` row and one `match.ended` row, and both calls succeed.
- [ ] Two different members of one run get different ids; the same member and run always get the same id.
- [ ] A field visit's settlement uses the derived id.
- [ ] Outbox rows written without an id behave as today.
- [ ] `go test ./...` passes in common and game-service.

## Blocked By

None

## Spec Reference

FS-GV8WN §B R7; user story 18; Design notes "Why deterministic ids".

## TDD Approach

- RED: repository test: insert the same `OutboxParams` (with id) twice in two transactions → expect one row, no error.
- GREEN: explicit id column in the insert + `ON CONFLICT (id) DO NOTHING`.
