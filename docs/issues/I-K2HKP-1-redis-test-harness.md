---
id: I-K2HKP-1
status: open
implements: FS-K2HKP
blocked_by: []
labels: [ready-for-agent]
title: "FS-K2HKP slice 1: Redis test harness for game-service (miniredis)"
---
Implements FS-K2HKP §Summary (Lane), §Acceptance Criteria (miniredis tests)

## What to Build

Pure labor, agent-owned. Give game-service a way to test Redis code in-process, **without
touching any feature logic**. Kranti writes the queue, matcher, liveness and handoff code (and
FS-JEAVX's pub/sub) by hand; this issue only makes them testable.

- Make `github.com/alicebob/miniredis/v2` a direct test dependency of `game-service`
  (it is already used in `common/utils/cache/intergation_test.go`).
- A test helper in game-service (e.g. `internal/testutil/redis.go`) that starts miniredis and
  returns a real `redis.UniversalClient` connected to it plus the `*miniredis.Miniredis` handle,
  closing both via `t.Cleanup`.
- One example test file that demonstrates the patterns the features need, so they can be copied:
  - pub/sub: subscribe, publish, receive on `pubsub.Channel()` with a timeout
  - `SET ... EX` then `mr.FastForward` to expire a key without sleeping
  - `EVAL` of a small Lua script
  - list ops (`RPUSH` / `LREM` / `LPUSH`) and `GETDEL`
- No helpers wrapping publish/subscribe or any feature operation. No production code changes.

## Acceptance Criteria

- [ ] `go test ./...` in game-service passes with the helper and example test, no Docker needed.
- [ ] The helper returns `redis.UniversalClient` (the type features receive by injection).
- [ ] The example test covers pub/sub, TTL via `FastForward`, Lua `EVAL`, list ops and `GETDEL`.
- [ ] No non-test file under `game-service` is changed except `go.mod`/`go.sum`.

## Blocked By

None

## Spec Reference

FS-K2HKP §Summary (Lane: the agent-owned harness), §Acceptance Criteria ("Tests run against
miniredis…"), User Story 18. Also serves FS-JEAVX's tests.

## TDD Approach

- RED: example test using the not-yet-existing helper fails to compile.
- GREEN: add the helper and the dependency.
