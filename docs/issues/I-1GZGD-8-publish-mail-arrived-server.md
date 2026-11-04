---
id: I-1GZGD-8
status: open
implements: FS-1GZGD
blocked_by: [I-1GZGD-3]
labels: [ready-for-agent]
title: "FS-1GZGD slice 8: publish mail:arrived on Redis after a letter commits (notification-service)"
---
Implements FS-1GZGD §Requirements R41, §Amendment 2026-11-04 (A4), §API surface (RPC surface: the `mail:arrived` row), §Acceptance Criteria (New-letter push: publish and Redis-down criteria), §Edge States (Redis down at send); ADR-0045 §Decision 1

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks). Added by the 2026-11-04 amendment.**

## What to Build

notification-service tells the game pods a letter was just sent (ADR-0045), without making the
send depend on it.

- A Redis client for notification-service, configured by `REDIS_ADDR` (default for a local run
  on the host: `127.0.0.1:6492`, the compose Redis; standalone mode as game-service runs it).
  Built in `cmd/server/main.go` / `config/routes.go` and injected, never created inside the
  mailbox package.
- A narrow **arrival publisher** the mailbox's store path consumes (an interface defined in
  `internal/mailbox/`, a Redis implementation beside it): after the letter's transaction
  **commits**, publish one message on channel `mail:arrived` — `{"member_id": "<uuid>"}` for a
  letter to one member, `{"broadcast": true}` for a broadcast. Outside the transaction, under a
  short deadline (a few seconds); a failure is logged at warn with the letter id and **never**
  fails, undoes or delays the send's answer beyond the deadline.
- Put the publish in the path both entry points use to store a letter, so I-1GZGD-5's letter
  request publishes through it after its own commit; a refused send publishes nothing.
- Deploy config: `REDIS_ADDR` in notification's ConfigMap, pointing at the Redis game-service
  uses (`redis:6379` in GKE). The local `.env` is gitignored; note the key for the developer and
  rely on the default.

game-service's subscriber is I-1GZGD-9; this issue publishes only.

**Files it expects to touch:** `game-server/notification-service/internal/mailbox/` (a new
`arrival.go` or `arrival_publisher.go` + `_test.go`, and the send / store use case to call it
after commit); `game-server/notification-service/config/routes.go`;
`game-server/notification-service/cmd/server/main.go`; `game-server/notification-service/go.mod`,
`go.sum` (`github.com/redis/go-redis/v9`, `github.com/alicebob/miniredis/v2` for tests, the
versions game-service pins); `game-server/deploy/gke/notification-config.yaml` (`REDIS_ADDR`).
No proto, no migration, no gateway, no game-service file.

## Acceptance Criteria

- [ ] An admin send to one member publishes exactly one `{"member_id": M}` on `mail:arrived`
      after the letter is stored (asserted with miniredis or a fake publisher).
- [ ] A broadcast publishes exactly one `{"broadcast": true}`.
- [ ] A refused send (any bound or unknown-id refusal) publishes nothing.
- [ ] With Redis unreachable, the send stores the letter, answers success within the deadline,
      and logs the publish failure.
- [ ] The publish happens after the commit: a send whose transaction fails publishes nothing.
- [ ] The Redis client is injected; `REDIS_ADDR` is in the GKE ConfigMap.
- [ ] Tests pass (`go test ./...` in notification-service); lint clean.

## Blocked By

I-1GZGD-3 (the letters store path the publish hooks into)

## Spec Reference

FS-1GZGD §Requirements R41; §Amendment 2026-11-04 A4; ADR-0045 §Decision 1. User stories 32,
39.

## TDD Approach

- RED: a send-use-case test with a fake publisher that a stored one-member letter publishes one
  `{"member_id"}` and a refused one publishes nothing; a second test that a failing publisher
  still yields a successful send.
- GREEN: the publisher interface called after the transaction commits.
