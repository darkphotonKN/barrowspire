---
id: I-9TNJA-3
status: done
implements: FS-9TNJA
blocked_by: []
labels: []
title: "FS-9TNJA slice 3: game-service writes to and drains an outbox in its own database"
---
Implements FS-9TNJA §Requirements 6–12, §Deployment notes

**Author: agent**

## What to Build

Move game-service off stats-service's database end to end:

1. Add `game-server/game-service/migrations/000001_create_outbox.up.sql`, copied exactly from
   `auth-service/migrations/000009_create_outbox.up.sql`, and `000001_create_outbox.down.sql`
   dropping `idx_outbox_cleanup`, `idx_outbox_pending`, and `outbox` (as auth's down does).
2. In `config/db.go`: game-service uses `InitDB()` (`DB_*`) and runs `runMigrations` at boot
   (export it or call it from `InitDB`, whichever fits); migration failure aborts startup with a
   logged error. Delete `InitStatsServiceDB`. Fix the stale "game service does not have its own
   database" comment.
3. In `cmd/server/main.go`: replace `statsDB := config.InitStatsServiceDB()` with the game-service
   DB; pass it to `config.SetupRouter`; start a `commonoutbox.OutboxWorker` with a **5s** cycle and
   batch 20, publishing through `commonbroker.NewAmqpPublisher(ch)` on the existing channel, run on
   a context cancelled at shutdown (mirror `stats-service/cmd/server/main.go`). The worker must be
   created after `ch` exists.
4. In `config/routes.go`: rename the `statsDB` parameter; the outbox repo/service is built on
   game-service's DB.

`internal/game/service.go` is NOT changed here: it still makes two `CreateOutbox` calls (slice 4
makes them one transaction). After this slice, match-end rows land in game-service's DB and
game-service publishes them.

Manual (not part of this issue): Kranti removes `STATS_DB_*` from his local, gitignored
`game-service/.env` (FS-9TNJA §Deployment notes).

## Acceptance Criteria

- [ ] Migration files exist; the up body is identical to auth's `000009` up.
- [ ] `InitStatsServiceDB` is gone; `grep -r STATS_DB game-server/game-service` finds nothing in
      tracked files.
- [ ] `main.go` connects with `config.InitDB()`, runs migrations at boot, and fails startup on a
      migration error.
- [ ] game-service starts an outbox worker: 5s cycle, batch 20, AMQP publisher on `ch`, cancelled
      on shutdown.
- [ ] `internal/matchmaker` and `internal/match_queue` are untouched.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...`, `make lint`, `make test` pass in
      game-service.

## Blocked By

None (independent of I-9TNJA-1/2: the worker works without them; it simply gains MessageId and the
bounded batch when they land).

## Spec Reference

FS-9TNJA §Requirements 6–12; §User Stories 1–2, 4–9, 14–15, 17–18; §Edge States (RabbitMQ
unreachable, pod dies after commit, migration already applied, migration fails).

## TDD Approach

Mostly wiring, verified by build/vet and Kranti's stack. Where a pure seam exists (e.g. a small
function returning the worker config: cycle 5s, batch 20), RED on it first. Do not start Postgres or
RabbitMQ.

## Predicted files

- `game-server/game-service/migrations/000001_create_outbox.up.sql` (new)
- `game-server/game-service/migrations/000001_create_outbox.down.sql` (new)
- `game-server/game-service/config/db.go`
- `game-server/game-service/config/routes.go`
- `game-server/game-service/cmd/server/main.go`
