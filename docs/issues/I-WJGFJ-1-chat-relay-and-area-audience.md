---
id: I-WJGFJ-1
status: open
implements: FS-WJGFJ
blocked_by: []
labels: [ready-for-agent]
title: "FS-WJGFJ slice 1: chat relay with stamping and the pod-wide area audience (game-service)"
---
Implements FS-WJGFJ §Requirements A1–A4, A7–A8, B9–B16, D32

**Author: human (hand-coded, human lane). Agent: table-driven tests only.**

## What to Build

The `chat` inbound action handled **on the message hub loop** (`internal/gameserver/hub.go`),
beside the menu actions, never forwarded to a session's `MessageCh` and never touching an ECS
world (R11).

- Constants: the five chat channels `area | world | party | whisper | trade`, the outbound
  action `chat_notice`, and the notice codes `channel_closed`, `not_in_world` (`too_long` and
  `too_fast` arrive in slice 2). `ActionChat = "chat"` already exists.
- Sender is resolved **from the connection** (`GetPlayerFromConn`), never from the payload's
  `player_id` (R2).
- Refusals, as `chat_notice {code, text}` to the sender only, nothing relayed:
  - sender in no world (record names `uuid.Nil`) → `not_in_world`;
  - `channel` is `world`, `party`, `whisper`, `trade`, or anything outside the five →
    `channel_closed` (R8).
- Accept `channel: "area"`: **stamp** the message (R3): `message_id` uuid v4 minted here,
  `sender_id`, `sender_name` = the name of the character in play (what the name plate shows),
  `channel: "area"`, `scope` = this pod's id, `sent_at` UTC RFC 3339 with milliseconds, `text`
  (passed through untouched in this slice; slice 2 adds the rules).
- **Audience** (R9–R10): the union of `GetPlayerIDs()` over every session the hub holds (hub,
  every field channel, every run). Deliver the stamped message as outbound action `chat` with
  `MessageSender.BroadcastToPlayerList`, which already skips a gone player and drops on a full
  writer queue (R12). The sender is in the list and hears their own line this way (R4).
- Order is the hub loop's receipt order (R13); nothing new to build, but a test pins it.
- **Nothing is kept** (R14): no slice, map or log holds the text after the broadcast returns. A
  `slog.Debug` may carry sender id, channel and `len(text)`, never the text.
- World switches on the pod and handoffs need no code: the audience is recomputed per message
  (R15); the name is read at stamping time (R16).

## Acceptance Criteria

- [ ] `chat {channel:"area", text:"hi"}` from a hub member is delivered as `chat` to every
      player in the hub, in each field channel and in each run on the pod, the sender included,
      with `message_id` (uuid v4), `sender_id`, `sender_name` (character name), `channel:"area"`,
      `scope` (pod id), `sent_at` (RFC 3339 ms, UTC), `text`.
- [ ] A payload carrying `player_id`, `sender_name`, `message_id` or `sent_at` of its own: all
      ignored; the stamped values come from the connection and the clock.
- [ ] Sender in no world: `chat_notice {code:"not_in_world"}` to the sender; no delivery.
- [ ] `channel` of `world`, `party`, `whisper`, `trade`, `shout`: `chat_notice
      {code:"channel_closed"}`; no delivery.
- [ ] A player in no world receives nothing when others chat.
- [ ] Ten messages A..J from one hub member reach a player in a run on the pod in order A..J.
- [ ] A recipient with a full writer queue misses the line; the remaining recipients get it.
- [ ] A recipient who disconnected between audience resolution and delivery: no error, no retry.
- [ ] `chat` is never forwarded to `session.MessageCh`; no system or component references it.
- [ ] No Redis, Postgres or in-memory history call on the chat path; log lines on the path
      contain no message text.
- [ ] After hub → field → hub on one pod the member still receives area chat.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-WJGFJ §Requirements A1–A4 (model, envelope, stamping, outbound), A7–A8 (notices, closed
channels), B9–B16 (area audience, hub handling, delivery, order, nothing kept, world switch,
name at stamping), D32 (server constants); §User Stories 1–3, 7, 14, 16–19; §Edge States
(player in menu, disconnect during relay, writer queue full, forged payload, handoff).

## TDD Approach

- RED: a hub-loop test with three sessions (hub, field, run) on one pod; a `chat` from the hub
  member expects a `chat` on every player's writer queue with the stamped fields.
- GREEN: the `case constants.ActionChat` on the hub loop, the audience union, the broadcast.
- RED: `not_in_world`, `channel_closed`, ordering, full-queue and disconnect rows as a table.
