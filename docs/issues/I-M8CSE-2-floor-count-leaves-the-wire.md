---
id: I-M8CSE-2
status: done
implements: FS-M8CSE
blocked_by: [I-M8CSE-1]
labels: [ready-for-agent]
title: "FS-M8CSE slice 2: floor_count leaves the broadcast"
---
Implements FS-M8CSE §A

## Files owned

- `game-server/game-service/internal/types/messages.go`
- `game-server/game-service/internal/serializer/state_serializer.go`, `floor_test.go`

## What to Build

The server stops sending `floor_count` (R5). It lands after the client has stopped reading it
(I-M8CSE-1, R6), and before the height is rolled (I-M8CSE-4), so a rolled height never reaches the
wire. Remove `FloorCount` from `GameState` and `BackendGameState`, and the three serializer lines
that copy and reset it. `FloorComponent.Count` stays: it is server state.

## Acceptance Criteria

- [ ] A serialized run state has no `floor_count` key; it still has `floor` and `stairs`.
- [ ] `go test ./internal/serializer/...` passes.

## Blocked By

I-M8CSE-1

## Spec Reference

FS-M8CSE §A R5, R6; user story 23.

## TDD Approach

- RED: the run-state JSON has no `floor_count` key.
- GREEN: the field and its copies go.
