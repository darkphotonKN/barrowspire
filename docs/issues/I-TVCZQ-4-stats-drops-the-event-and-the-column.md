---
id: I-TVCZQ-4
status: done
implements: FS-TVCZQ
blocked_by: [I-TVCZQ-2, I-TVCZQ-3]
labels: [ready-for-agent]
title: "FS-TVCZQ slice 4: stats-service drops profile.updated and the avatar column"
---
Implements FS-TVCZQ §Requirements 23–30, 32

## What to Build
Remove `profile.updated` completely. That covers `consumeProfileUpdated`, the queue declaration and
binding and the now unused `auth.events` exchange declaration in `SetupAMQPInfrastructure`,
`UpdatePlayerRankings`, the `ConsumerService` method and its test fake, `UpsertPlayerRankingStats`
(the non-Tx variant) and its mock, and the `MemberProfileUpdated` and
`StatsAuthProfileUpdatedQueue` constants. Delete `events/auth.proto` and `events/auth.pb.go`, and
take the file out of `common/Makefile`'s `gen` list.

Remove `AvatarUrl` from both stats structs, from the leaderboard mapping, and from every explicit
`avatar_url` column in the repository. In `stats.proto`, remove the field and add `reserved 6;`.
Regenerate, committing only `stats.pb.go` (FS-TVCZQ requirement 30).

Add migration `000006`, which drops `player_ranking_stats.avatar_url`, with a down file restoring
the empty column. It lands in this issue, with the struct fields, because stats uses `RETURNING *`
with sqlx.

Keep the match-ended consumer, topology, retries and DLQ as they are. Reword comments that say
"both consumers". Finish by running FS-TVCZQ requirement 32's search.

## Files expected to change
- `game-server/stats-service/internal/stats/amqp_consumer.go`
- `game-server/stats-service/internal/stats/amqp_consumer_test.go`
- `game-server/stats-service/internal/stats/service.go`
- `game-server/stats-service/internal/stats/service_test.go`
- `game-server/stats-service/internal/stats/repository.go`
- `game-server/stats-service/internal/stats/model.go`
- `game-server/stats-service/migrations/000006_*.up.sql`, `000006_*.down.sql` (new)
- `game-server/common/api/proto/stats/stats.proto`
- `game-server/common/api/proto/stats/stats.pb.go` (generated)
- `game-server/common/api/proto/events/auth.proto` (deleted)
- `game-server/common/api/proto/events/auth.pb.go` (deleted)
- `game-server/common/Makefile`
- `game-server/common/constants/events.go`

## Acceptance Criteria
- [ ] A search for `profile.updated`, `MemberProfileUpdated`, `StatsAuthProfileUpdatedQueue` and
      `UpdatePlayerRankings(` finds no live code. FS, issue history and `SPECIFICATION.md` lines
      named by FS-TVCZQ requirement 31 may still name them.
- [ ] `stats.proto` has `reserved 6;` in `PlayerRankingStats`.
- [ ] `events/auth.proto` and `events/auth.pb.go` do not exist, `common/Makefile` doesn't list them,
      and `make -C game-server/common gen` still runs.
- [ ] Migration `000006` and its down file exist and apply on a database at `000005`. No earlier
      migration has a diff.
- [ ] After `000006`, the leaderboard read and the match-completed path work against real Postgres
      where the suite can reach it.
- [ ] The match-ended tests pass with no change other than removing the fake's
      `UpdatePlayerRankings`.
- [ ] `go build`, `go vet` and `go test` pass in `stats-service`, `auth-service`, `api-gateway` and
      `common`, and `make -C game-server/api-gateway gates` still passes.
- [ ] FS-TVCZQ requirement 32's search returns only the entries it lists, plus the
      `SPECIFICATION.md` lines requirement 31 leaves for the ship step.

## Blocked By
- I-TVCZQ-2 (the gateway's `PlayerRankingStats` must drop `avatar_url` first)
- I-TVCZQ-3 (auth's publisher must be gone before the event proto and constant can go)

## Spec Reference
FS-TVCZQ §Requirements 23–30, 32; §User Stories 11, 14–17; §Edge States (old stats pod, stats scaled
to zero, event left on a broker, ranking username, cached leaderboard, rollback).

## TDD Approach
- RED: a repository test against real Postgres, skipping when it is unreachable, that
  `GetPlayerRankings` and `UpsertPlayerRankingStatsTx` run after `000006`. It fails on the explicit
  `avatar_url` columns.
- GREEN: remove the column from the repository and structs, then remove the consumer and the event.
