# ADR-0079 — The acting player of an inbound message is the connection's, never the payload's

Status: accepted
Date: 2026-11-12
Scope: `game-service`'s inbound WebSocket messages (the message hub and every world's message
handling) and `game-client`'s `SocketManager`. Not the handshake, the handoff, or any outbound
message.
Specified by [FS-29KSH](../specs/29KSH-hub-world-and-delve-entry.md) §Change: The acting player
is the connection's.
Builds on: [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection,
held across world switches), FS-29KSH §Requirements 16 (routing on the server's own record of the
player, not the payload's `session_id`).

## Context

The owner's decision on 2026-11-12: "前端不傳player id 由後端自己取得" (the client must not send
the player id; the server takes it itself). Recorded without adversarial review: no
`challenge-me` pass was run.

Forces:

- **The connection is already the identity.** The game socket is authenticated at the handshake
  (token to member id), a renewal must be for the same member, and the message hub holds each
  connection's player. Routing already uses it: FS-29KSH R16 took `session_id` off inbound
  messages for exactly this reason.
- **Player ids are public inside a world.** Every state broadcast tells each client the ids of
  the other players (`other_players[].id`), so an id in a payload is anyone's to write.
- **Two styles had grown up side by side.** The hub-loop actions (`drink_potion`, `forfeit_run`,
  `leave_run`, the party actions) took the player from the connection; the six actions routed
  into a world (`move`, `interact`, `attack`, `cast_skill`, `equip`, `unequip`) took the
  `player_id` from the payload, which let a modified client act for another player in its world.
- **Old clients will still send the field for a while.** A rule that rejected it would break them.

## Decision

1. **Who sends an inbound message is the player the server holds for its connection.** The
   message hub stamps that player on the message it hands a world; nothing a client sends can
   set it. Every handler acts for, and answers, that player only.
2. **No inbound payload names its sender.** The server never reads a payload's `player_id` (or
   any field like it) as the actor: not to act, not to compare, not to log as identity, not as a
   fallback. A payload that carries one is handled as if it did not.
3. **A payload id names someone else, or nothing.** Where a message needs another player (a
   party kick's or transfer's `target_id`, an invite's `name`), the field names the target, and
   is validated as one; it never stands in for the sender.
4. **The client sends no sender id.** `SocketManager` stamps nothing onto outgoing payloads.

## Consequences

- A modified client can only ever act as itself: the class of bug where one player moves,
  attacks, loots for or re-equips another is gone at the seam rather than per handler.
- A new inbound action gets the sender from the connection by construction; a reviewer who sees a
  payload read for the actor has found a violation of this ADR.
- **Deploy order: game-service before the client.** The new server accepts old clients (it
  ignores the field); a new client against an old server would have every in-world action refused,
  because the old server still requires `player_id`.
- Tests that drive a world directly hand it the acting player beside the message, as the hub does,
  instead of writing it into the payload.
