---
id: I-MCYWK-2
status: in-progress
implements: FS-MCYWK
blocked_by: [I-MCYWK-1]
labels: [ready-for-agent]
title: "FS-MCYWK slice 2: a landing pod redirects a member present on another live pod at the WebSocket handshake; redirected connections are seated where they land (game-service)"
---
Implements FS-MCYWK §Requirements A1–A12, B13

**Lane: human (HITL), authorised by Nick's charter for FS-MCYWK (2026-11-04).** `/develop` may run
this slice. Blocked by I-MCYWK-1 because without it a travel's connection can be redirected back
to the traveller's old pod (FS-MCYWK R19).

## What to Build

In `HandleWebSocketConnection`, after the member is verified and **before** `connectPlayer`:

1. **Ask only when all hold:** no `session_id`; no `redirected=1`; no record for the member on
   this pod (a read under the lock, without creating one; a dead delver in `keptUntilRunEnd` is
   on record and is not asked).
2. **Look up within one bound** (a named constant, ~500 ms): the presence index by player id
   (`partypresence.Redis.Lookup`), then `pod:alive:<podID>` of the pod it names.
3. **Redirect only if** the entry's pod is not this pod, it carries a pod address, and its
   `pod:alive` key exists. Then: upgrade, write one `world_handoff {addr, reconnect: true}`
   directly on the socket (no writer goroutine exists yet), close with `1000` reason
   `redirected`, and return. No record, no mapped connection, no writer, no presence or queue
   write. Log at info with player id and holding pod id.
4. **Otherwise continue exactly as today** (no entry, self-entry, no address, not alive, an error
   or the bound exceeded, or a pod built without the presence lookup or the liveness reader).

Supporting pieces:

- `auth.WSAuthMiddleware` passes the `redirected` query parameter to the handler as it passes
  `session_id` (new `RedirectedParam` / `RedirectedKey` constants beside `SessionIDParam`).
- A narrow pod-liveness read: a consumer-owned interface in `internal/gameserver` (one method,
  e.g. `PodAlive(ctx, podID) (bool, error)`), implemented on `matchqueue.Redis` as an `EXISTS`
  of `keyPodAlivePrefix+podID`. No change to the key, its TTL or its write.
- The server holds the presence lookup it already receives through `WithPresence` and the
  liveness reader through a new `Option`; wire it in `config/routes.go` from the existing
  `matchQueueRedis`.
- **Presence during the grace (R13):** a test asserting `PresentPlayers` lists a member within the
  reconnect grace (connection unmapped by `holdForReconnect`, record kept) and not once the grace
  ends. No new write.
- The redirect message name is the existing `constants.ActionWorldHandoff`.

Likely files: `game-server/game-service/internal/gameserver/handler.go`; a new
`internal/gameserver/reconnect_redirect.go` (the decision, the consumer interfaces, the Option);
`internal/gameserver/fields.go` (`bootOptions` gains the liveness reader);
`game-server/game-service/auth/middleware.go`; `internal/match_queue/redis.go` (the `EXISTS`
read); `game-server/game-service/config/routes.go` (wiring); tests in a new
`internal/gameserver/reconnect_redirect_test.go` (handshake via `httptest` + gorilla dialer, as
`connect_handler_test.go` does, with fake presence and liveness), a presence-during-grace test
beside `presence_occupancy_test.go` or `reconnect_test.go`, and a `match_queue` test for the read.
Out of bounds: proto, gateway/openapi, endpoints, migrations, manifests, the presence write path.

## Acceptance Criteria

- [x] A connection for a member not on record here, found present on another live pod with an address, receives exactly one `world_handoff {addr, reconnect: true}` and a `1000` close; afterwards the landing pod has no record, mapped connection or writer for them, and its presence keeper writes nothing for them.
- [x] A member on record here (connected, in grace, or kept until run end) is never looked up and reconnects in place as today.
- [x] A connection with `session_id` is never looked up; existing handoff tests pass unchanged.
- [x] A connection with `redirected=1` is never looked up and is seated where it lands, including when the index names another live pod.
- [x] Seated where it landed, with no redirect: no entry; entry names this pod; entry has no address; entry's pod has no `pod:alive` key; lookup errors; liveness read errors; lookup or liveness read slower than the bound (the connection proceeds within the bound).
- [x] A server built without the presence lookup or the liveness reader never looks up.
- [x] A redirected connection arriving at a pod holding the member in a run gets `reconnected` and that run's `world_entered`.
- [x] A redirected connection arriving after the member's record went is seated as a fresh connection, not refused.
- [x] A grace-held member reconnecting in place into a hub at its cap is not refused (no cap check added).
- [x] `PresentPlayers` lists a member within the reconnect grace and not after `cleanUpPlayerCompletely` ends it.
- [x] `matchqueue.Redis` reports a pod alive while its heartbeat key exists and not after it lapses or is deleted.
- [ ] `make lint && make test` pass in game-service. (test: pass; lint: 7 errcheck findings remain, all pre-existing and outside this diff: `auth/middleware.go:68,71`, `cmd/server/main.go`.)
- [ ] **Live (HITL):** two local pods behind one entry address: a player in A's hub who refreshes and lands on B is returned to A's hub; a player in a run on A who refreshes is returned to the run; with A stopped and its `pod:alive` lapsed, a refresh seats the player on B; a party travel between the two pods still lands.

## Blocked By

I-MCYWK-1

## Spec Reference

FS-MCYWK §Requirements A1–A12, B13 (and R19's interaction with travel); User Stories 1–9, 13, 15–21; §Acceptance Criteria → Server, Live; §Edge States (all server-side rows).

## TDD Approach

- RED: with a fake presence lookup naming pod `b` at `ws://pod-b/game/ws` and a liveness fake saying `b` is alive, a dial to pod `a`'s handler for a member not on record reads one `world_handoff {addr: "ws://pod-b/game/ws", reconnect: true}`, then a `1000` close; `a` has no record for the member.
- GREEN: the lookup-before-`connectPlayer` branch in `HandleWebSocketConnection`, the bounded lookup, and the direct write and close.
