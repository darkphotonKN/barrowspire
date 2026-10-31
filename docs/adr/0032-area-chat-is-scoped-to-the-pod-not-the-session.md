# ADR-0032 — Area chat is scoped to the pod, not to the player's session

Status: accepted
Date: 2026-10-31
Scope: `game-server/game-service`, `game-client`
Realized by: [FS-WJGFJ](../specs/WJGFJ-in-game-chat.md) (in-game chat), scoping notes decision 4
Builds on: [ADR-0030](0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md)
(worlds are per-pod channels), [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md)
(one process and one connection per pod)

## Context

Decided by the user on 2026-10-31 while scoping in-game chat (FS-WJGFJ). Claude recommended the
other shape, pushed back once, and the user reaffirmed this one. Recorded after that one
exchange, not after a full adversarial review.

The chat feature has an **area** channel: "the people around me". Everything else in the
feature (world, whisper, later party and trade) is a type plus a scope key and routes the
same way regardless of what area means. Only area needed a boundary chosen.

game-service runs as several pods. Today each pod holds its own hub world, its own field
worlds, and whatever tower runs it is hosting, all as `game.Session` objects distinguished by
`WorldType()`. FS-JEAVX's cross-pod hub sync is a work-order on paper and is not in the code,
so three pods are three separate villages; a player lands on whichever pod the connection hits.
That is the "channels / lines" model ADR-0030 chose for fields, and the user said the same thing
of the hub: "每個 game-service pod 有一個自己的村莊".

Two boundaries were on the table, and both are one function away in the code that exists:

1. **Session.** Area = the session the sender is in (`Player.CurrentGameSessionId` →
   `Session.GetPlayerIDs()`). Village, each field and each tower run are isolated rooms. This
   was the feature's opening requirement ("塔內說話村莊不會看到") and is what most MMOs mean by
   a zone or map channel. Claude recommended it because a session is a boundary the player can
   see, while a pod is not: a K2HKP handoff to another pod would silently change who the
   player's area is, and a party mid-escape would receive village chatter.
2. **Pod.** Area = everyone connected to this game-service pod, whatever world they stand in
   (iterate every session on the pod, or a pod-level connection registry). The MMO term is a
   line or channel chat.

## Decision

**The area channel's scope key is the pod id.** Every player connected to a game-service pod
hears every area message sent on that pod: village, fields and tower runs together. The
feature's original "tower and village do not hear each other" requirement is withdrawn by this
decision. The user's reason: the simpler mental model, "same pod, same room", and no desire to
isolate the tower.

The **world** channel spans all pods through Redis pub/sub and is unaffected. A session-scoped
room, if ever wanted, is added as one more scope type under the same channel-type-plus-key
model, not by changing this one.

## Consequences

- **The tower is not quiet.** A party inside a run receives the village's area chatter on the
  same pod. Players can hide it with the client's channel filter; the server does not.
- **A handoff moves your room.** When FS-K2HKP hands a run to another pod, the player's area
  audience becomes that pod's population with no visible cause. Accepted.
- **Delivery iterates the pod, not the sender's session.** The server must address "every
  connection on this pod", which the message hub can do from its `sessions` map; nothing new
  is needed for the boundary itself.
- **Conflicts with FS-JEAVX if that is ever built.** A cross-pod hub would show village players
  ghosts they cannot area-chat with. Parked in FS-WJGFJ; re-decide area scope if JEAVX revives,
  superseding this ADR.
- **Cheap to reverse.** The scope key is one enum value and one audience function. Nothing in
  the client depends on what "area" resolves to beyond a label.
