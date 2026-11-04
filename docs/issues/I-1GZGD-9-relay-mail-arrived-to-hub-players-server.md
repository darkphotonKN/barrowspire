---
id: I-1GZGD-9
status: open
implements: FS-1GZGD
blocked_by: []
labels: [ready-for-agent]
title: "FS-1GZGD slice 9: every pod relays mail:arrived as mail_arrived to its players in the HUB world (game-service)"
---
Implements FS-1GZGD §Requirements R42–R44, §Amendment 2026-11-04 (A4), §API surface (RPC surface: the `mail:arrived` and `mail_arrived` rows), §Acceptance Criteria (New-letter push: relay criteria), §Edge States (player on another pod or in a run, broadcast with many players); ADR-0045 §Decisions 2–4

**Lane: server (human lane; game-service is hand-coded by default — the 2026-11-04 mailbox charter's amendment widens its bounds for this subscriber and its forwarding only, so `/develop` may run it when Nick asks). Added by the 2026-11-04 amendment.**

## What to Build

The game-service half of the push: a subscriber on Redis `mail:arrived` and the forwarding to
players in the HUB world on this pod. **Nothing else** in game logic changes; game-service never
reads or stores a mailbox letter.

- A mail-arrival relay in `internal/gameserver`, in **world chat's shape** (`chat.go`'s
  `chatRelay`: `chatbus.Redis.Listen` on its own goroutine, resubscribe after a drop with a short
  wait, a bounded queue into the message hub loop, a full queue drops — at most once). Reuses the
  pod's one Redis client through `chatbus.NewRedis(redisClient)`; the channel name
  `mail:arrived` is a constant beside the relay.
- Decode: `{"member_id": "<uuid>"}` or `{"broadcast": true}`; anything else (both, neither, a bad
  uuid, not JSON) is skipped with a warning.
- Deliver, on the message hub loop: for a member id, send `{"action": "mail_arrived", "payload":
  {}}` to that player if they stand in the **HUB world** on this pod; for a broadcast, to every
  player standing in the HUB world on this pod. Players in a run or a field world get nothing; a
  player not on this pod is not an error. Read "stands in the HUB world" from what routing
  already trusts (the connection table / presence-here read the party registry uses), not from
  a new store.
- A new action constant `ActionMailArrived = "mail_arrived"` (server → client only; an inbound
  `mail_arrived` from a client is ignored like any unknown action).

Testable without notification-service: tests publish on miniredis themselves.

**Files it expects to touch:** `game-server/game-service/common/constants/game.go`
(`ActionMailArrived`); a new `game-server/game-service/internal/gameserver/mail_arrivals.go` +
`mail_arrivals_test.go`; `game-server/game-service/internal/gameserver/hub.go` (one select case
draining the relay's queue, as `chat.inbound()`); `game-server/game-service/internal/gameserver/server.go`
(construct and start the relay in `NewServer` via a boot option, and a read of the player ids in
the HUB world on this pod if none fits); `game-server/game-service/config/routes.go` (pass the
option with `chatbus.NewRedis(redisClient)`). This is the **only** FS-1GZGD issue that touches
game-service, so `hub.go` and `server.go` change here and nowhere else. `internal/chatbus/redis.go`
is reused, not changed.

## Acceptance Criteria

- [ ] Publishing `{"member_id": M}` on `mail:arrived` delivers one `mail_arrived` to M when M
      stands in the HUB world on the pod, and nothing when M is in a run, in a field world, or
      not connected to the pod.
- [ ] Publishing `{"broadcast": true}` delivers one `mail_arrived` to every player in the HUB world
      on the pod and none to players in runs or fields.
- [ ] A malformed message is skipped with a warning; the next valid one is still delivered.
- [ ] After the subscription drops, the relay subscribes again and delivers later messages.
- [ ] A full queue drops the message instead of blocking the subscriber.
- [ ] No other game-service behaviour changes (existing test suites pass unchanged); the relay
      makes no gRPC or HTTP call.
- [ ] Tests pass (`go test ./...` in game-service, with miniredis); lint clean.

## Blocked By

None (the channel contract is fixed by FS-1GZGD A4 and ADR-0045; I-1GZGD-8 is the producer, not a
prerequisite)

## Spec Reference

FS-1GZGD §Requirements R42–R44; §Amendment 2026-11-04 A4; ADR-0045 §Decisions 2–4. User stories
32, 33.

## TDD Approach

- RED: a relay test on miniredis that a `{"member_id"}` for a HUB-world player reaches their
  sender and one for a player in a run does not.
- GREEN: the subscriber → hub loop queue and the HUB-world audience filter.
