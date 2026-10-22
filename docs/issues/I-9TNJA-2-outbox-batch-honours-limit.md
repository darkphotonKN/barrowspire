---
id: I-9TNJA-2
status: done
implements: FS-9TNJA
blocked_by: []
labels: []
title: "FS-9TNJA slice 2: outbox worker fetches a bounded batch (LIMIT $1)"
---
Implements FS-9TNJA §Requirements 5, §Background and decisions (limit charter default)

**Author: agent**

## What to Build

`GetUnpublishedOutboxItems` takes a `limit` but never uses it, so every tick loads the whole
pending backlog. Add `LIMIT $1` after `ORDER BY created_at ASC` and pass the limit (20 when nil).
Affects every service's outbox worker.

There are no DB tests in `common/outbox` today and agents do not start Postgres, so test the
repository with a SQL mock (e.g. `github.com/DATA-DOG/go-sqlmock`, new test-only dependency in
`common/go.mod`; FS-9TNJA §Background "Spec decision").

## Acceptance Criteria

- [ ] The query is `... WHERE published_at IS NULL ORDER BY created_at ASC LIMIT $1`.
- [ ] Given limit `n`, `$1 == n`; given nil, `$1 == 20` (table-driven).
- [ ] Returned rows are mapped as before; DB errors still go through `wrapDBErr`.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...` pass in `common`.

## Blocked By

None

## Spec Reference

FS-9TNJA §Requirements 5; §User Stories 12; §Edge States (backlog larger than the batch, empty
outbox).

## TDD Approach

- RED: sqlmock expects the query with `LIMIT $1` and arg `5` for limit 5, `20` for nil; fails today.
- GREEN: add `LIMIT $1`, pass `*limit`.

## Predicted files

- `game-server/common/outbox/repository.go` (+ `repository_test.go`, new)
- `game-server/common/go.mod`, `game-server/common/go.sum` (test dependency)
