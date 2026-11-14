# ADR-0082 — A moved piece's own commands go from the piece; world-play messages stay the world's

Status: accepted
Date: 2026-11-14
Scope: game-client's UI scene and the world scenes: which of them sends a socket message. Not the
server, not the message set.
Amends: [ADR-0081](0081-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md)
— Decision 2, its last clause ("socket messages stay the world's"). The rest of Decision 2 and every
other decision of ADR-0081 stand.
Specified by: [FS-TQZ5J](../specs/TQZ5J-ui-scene.md) § Change: Phase 2: the party, R37.

## Context

ADR-0081 Decision 2 ends: "No scene imports or calls another scene; socket messages stay the
world's." It was written in phase 1, when every piece the UI scene took (the corner row, the ESC
menu, OPTIONS, the dialogue card, the notices) sent nothing of its own: what they did on the server
(leave the queue, change character, leave the run, fall, a dialogue row) was the world's, so they
asked the world through the bridge's requests.

Phase 2 moved the party pieces (the panel, the invite prompt, the ready check, the frames with
Travel). They were never a world's senders. Each mount factory (`mountPartyPanel`,
`mountPartyInvitePrompt`, `mountPartyReadyCheck`, `mountPartyFrames`) has always built its commands
from `partyCommands(socketManager)`, and the party store, the game store's world and the auth
store's player they read are app state fed by `SocketManager`, which no world's field holds. Read
literally, the clause would route create, invite, kick, transfer, leave, accept, decline, ready and
travel through the world's report as new request kinds, each answered by every world in the same
way: by calling the same commands the piece already has. That is three copies of a pass-through and
nine request kinds for nothing, and it would put the world back between the player and a piece the
phase moved to free it from. FS-TQZ5J R37 already wrote it the other way ("Party commands go out as
before, from the pieces"); the review of phase 2 (ecb92ba9..09ff93e0) found R37 and the ADR's clause
at odds.

Chat (a later phase) is the same shape: its sends read the chat store and the socket, not a world.

Recorded without adversarial review: no `challenge-me` pass was run; it settles a review finding.

## Decision

1. **World-play messages stay the world's.** A message about the world being played (moving,
   attacking, casting, interacting, the run's leave and fall, the town's queue, a dialogue row's
   action) is sent by the world scene. A UI piece that triggers one asks the world through the
   bridge's typed requests, as phase 1's pieces do.
2. **A moved piece's own commands go from that piece.** A command that belongs to a piece the UI
   scene now holds, and that reads only app-level state (the stores and the socket the app feeds,
   never a world scene's fields), is sent by the piece itself, through its own command module. The
   party's `partyCommands(socketManager)` is the first case; chat's sends will be the next.
3. **The test is what the command reads.** If composing the message needs anything only a world
   knows (an entity, a position, a run's state), it is a world-play message (1), whatever piece the
   press landed on. If it needs only app state, it is the piece's (2). No scene imports or calls
   another scene, as ADR-0081 Decision 2 says; that part is unchanged.

## Consequences

- The party pieces keep sending as they always did; no request kinds are added for them, and no
  world answers for the party.
- The bridge stays a contract about the world: what crosses it is the world's state and what only
  the world can do. A piece's own traffic does not pass through it.
- A piece moved into the UI scene brings its command module with it. Its tests stand a fake socket
  under the commands, as the party's do, rather than a world.
- The line can blur: a command that later needs a world fact (say, an invite by the name of the
  player under the pointer) becomes a world-play message and goes through a request. Decide it by
  what it reads (3), not by where the button is drawn.
- ADR-0081's header carries `Amended by: ADR-0082 — Decision 2`; its body is unchanged.
