# ADR-0033 — Chat is never stored server-side; a report carries its own evidence

Status: accepted
Date: 2026-10-31
Scope: `game-server/game-service`, `game-server/api-gateway`, `game-client`
Realized by: [FS-WJGFJ](../specs/WJGFJ-in-game-chat.md) (in-game chat), scoping notes decisions 7
and 8
Builds on: [ADR-0004](0004-game-traffic-bypasses-the-application-gateway.md) (chat rides the game
WebSocket; only the report is an HTTP call through the gateway)

## Context

Decided by the user on 2026-10-31 while scoping in-game chat (FS-WJGFJ). The user asked for it
directly ("如果後端都不存這些紀錄都只是暫時的存在使用者那呢"); Claude listed the consequences
and the user accepted them. Not adversarially reviewed; the blast radius is small (no money, no
migrations, no public contract beyond one new endpoint).

The chat window holds the last 100 messages and models itself on Path of Exile 2, whose chat is
likewise client-side only. Three storage shapes were considered:

- **A short buffer** (Redis or pod memory) so a reload can catch up on recent world messages.
- **Postgres with a retention period** (e.g. 7 days), which would also give moderation a
  history, at the cost of a chat domain, a table, and a cleanup job.
- **Nothing.** The server forwards and forgets.

The user then asked for report and mute. Mute needs no server state at all. Report is the one
place storing nothing bites: with no history, a moderator cannot see what was said. The way
out is that the client already holds the evidence.

## Decision

**No chat message is stored anywhere on the server.** Not in Postgres, not in Redis, not in
pod memory past the in-flight relay. A pod receives a message, resolves its audience, delivers
it, and drops it. History exists only in each client's window.

**A report carries its own evidence.** When a player reports a message, the client sends the
reported message, the few messages around it that the window still holds, the reporter, the
reported player, the channel, and the time. The server does not look anything up to build the
report, because it has nothing to look up.

**For now a report lands as one structured `slog` line** at the receiving service, option 1 of
three the user chose. No report table, no moderation UI, no external sink.

**Mute is client-side.** A muted player's messages still arrive and are not rendered; the
ignore list lives in the browser.

## Consequences

- **Reload or reconnect starts empty.** There is no catch-up of recent messages. Accepted.
- **Whispers to an offline player are lost**, with one system notice to the sender. Nothing is
  queued for later delivery.
- **Evidence is bounded by the client window.** Context older than 100 messages cannot be
  attached to a report. Accepted.
- **Evidence is client-asserted.** A report's content is whatever the client sent; a modified
  client can fabricate it. Acceptable while reports are only read by a human from a log line;
  the day reports drive automatic action, a server-side signature or buffer is needed and this
  ADR is superseded.
- **Reports are only as findable as the logs.** Until a table or sink exists, acting on a report
  means searching logs. Parked in FS-WJGFJ with the moderation UI.
- **One new HTTP endpoint** through api-gateway, serialized and regenerated per the contract
  rule. Chat messages themselves never touch the gateway (ADR-0004).
- **Upgrade path is additive.** A report table, an external sink, or a short catch-up buffer
  can each be added later without changing the message envelope or the client window.
