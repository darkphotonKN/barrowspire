---
id: I-5SH4G-1
status: done
implements: FS-5SH4G
blocked_by: []
labels: [ready-for-agent]
title: "FS-5SH4G slice 1: subscribe to chat:world and deliver each line to the pod's seated players (game-service)"
---
Implements FS-5SH4G §Requirements B7, B9, B11, B13

**Author: agent, the user having invoked `/develop` on this slice and approved the plan on
2026-10-31 (the FS-WJGFJ exception again). Branch `feat/in-game-chat`.** Built: `internal/chatbus`
(Redis pub/sub wrapper, `Listen` confirms the subscription before reporting), the relay's
`chatBus` interface at its point of use, a subscriber goroutine that resubscribes a second after a
drop, a 64-line inbound queue the hub loop drains (`case line := <-h.chat.inbound()`), delivery to
`SeatedPlayerIDs`, the `WithChatBus` boot option, and the wiring in `config/routes.go` on the
matchmaker's Redis client. Tests run on miniredis. The context-cancel test proves the subscriber
is gone by seeing a publish find no listener.

## What to Build

The receiving half of world chat. A pod subscribes to the Redis channel `chat:world` and, for
every line that arrives, delivers it to every player seated in any world on this pod.

- **Redis client**: the `redis.UniversalClient` `cmd/server/main.go` already holds
  (`config.GetClient()`), constructor-injected into the server the way the handoff announcer is
  (R13). No new client, no wrapper. The relay gets a `chatBus` interface at its point of use with
  what it needs (subscribe now; publish in slice 2).
- **Subscriber** (R9): one goroutine, started with the pod, stopped with the server's context,
  shaped like `handoff.Listen`. It decodes each message as a stamped chat line and hands it to
  the hub loop on a channel the loop selects on (`case line := <-chatInbound`), beside the match,
  queue-status and handoff channels. A message that does not decode is skipped with a `Warn`
  that carries no text. If the subscription's channel closes, log a `Warn` and subscribe again
  (R11).
- **Delivery** (R7): on the hub loop, the arrived line goes as action `chat` to
  `SeatedPlayerIDs()` through `BroadcastToPlayerList`; a full writer queue or a gone player is
  skipped as for area (FS-WJGFJ R12). A pod with nobody seated delivers nothing and logs nothing.
- Nothing is written to Redis and nothing is stored (R11, ADR-0033). The area relay is untouched
  (R12).

## Acceptance Criteria

- [ ] With a line published to `chat:world` on a miniredis the server was built on, every seated
      player on the pod (hub, field, run) receives `chat` with that line's stamped fields and the
      same `message_id`; a connected player in no world receives nothing.
- [ ] A payload on `chat:world` that is not a stamped line (not JSON, or missing `message_id` /
      `channel`) is skipped with a `Warn` carrying no text; the next good line is delivered.
- [ ] A pod with nobody seated receives a line and delivers to no one without error.
- [ ] Cancelling the server's context stops the subscriber goroutine (no goroutine leak; a
      `goleak`-style or done-channel check).
- [ ] The subscriber hands lines to the hub loop; delivery happens on the loop (the test sends on
      the same loop the area tests use and sees the broadcast from it).
- [ ] No `SET`/`HSET`/any key write reaches miniredis from the chat path.
- [ ] Logs on this path carry no message text.
- [ ] Tests pass; `golangci-lint` clean.

## Blocked By

None

## Spec Reference

FS-5SH4G §Requirements B7 (delivery to the pod's seated players), B9 (subscriber goroutine →
hub loop), B11 (at-most-once, resubscribe), B13 (the existing Redis client); §User Stories 11,
12; §Edge States subscriber down, decoding, pod start, nobody seated.

## TDD Approach

- RED: build a server on `testutil.NewRedis`, seat players in hub, field and run, `PUBLISH` a
  stamped line on `chat:world` through the miniredis client, expect each inbox to get it.
- GREEN: the `chatBus` interface, the subscriber goroutine, the hub-loop case, the broadcast.
- RED: a bad payload row, then a good one; the context-cancel row.
