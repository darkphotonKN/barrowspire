---
id: I-R82NV-6
status: done
implements: FS-R82NV
blocked_by: [I-R82NV-1]
labels: [ready-for-agent]
title: "FS-R82NV slice 6: party store, the T panel, notices in the chat window (game-client)"
---
Implements FS-R82NV §Requirements R28–R31, R36

**Lane: agent (AFK).**

## What to Build

- A zustand vanilla `partyStore` fed by `party_update` and `party_notice` from `SocketManager`;
  pure selectors for "am I leader", "may I invite here", "locked".
- **T** toggles the party panel in hub, field and run, not while a text input has focus. Carved
  panel (`carvedPanel.ts`), game palette tokens only.
- Panel contents: members (name, class, leader icon, `where`, away greyed); **Invite** as a
  Phaser DOM `<input>` like chat's (IME-safe), Enter sends `party_invite`, usable only in the
  hub; **Kick** / **Transfer** per member for the leader; **Leave** for any member; a reserved
  slot for the loot-rule selector (FS-V780R). Actions greyed by role and by lock.
- No party: only the Invite field and "Invite someone by name to form a party."
- Every `party_notice` lands in the chat window as a system line (copy from R36's table,
  including `queued`).

## Acceptance Criteria

- [x] T opens and closes the panel in all three scenes; never while typing in chat.
- [x] Panel reflects `party_update` (members, leader icon, where).
- [x] Buttons grey correctly for leader / member / no party / locked (pure tests).
- [x] Invite field sends `party_invite {name}` on Enter and is disabled outside the hub.
- [x] Each notice code renders its copy as a system line in the chat window.
- [x] `vitest` green; lint fence passes (no raw hex). Scene files not reformatted by prettier.

## Blocked By

I-R82NV-1

## Spec Reference

FS-R82NV §Requirements R28–R31, R36; §User Stories 9–12, 17–19.

## TDD Approach

- RED: a pure test that a store holding a `party_update` where the viewer is leader yields Kick/Transfer enabled and, for a member viewer, disabled.
- GREEN: the store and selectors, then the panel draws from them.

## Implementation notes (code review 2026-11-01)

- **Kick and transfer send `{target_id}`, not R19's `{player_id}`.** `SocketManager.sendMessage`
  writes the sender's own `player_id` over every outgoing payload, so a `player_id` target would
  arrive as the leader's own id. I-R82NV-2 is updated to read `target_id`.
- **Party error replies are claimed once, at boot** (`routePartyErrors` in `BootScene`, beside
  the global handler), and logged. Never per scene: a gap at a scene switch would let a refusal
  reach the global handler, which logs the player out. Until slice 2 the server answers kick,
  transfer and leave with "Unknown action", so those buttons give no feedback yet.
- A `party_notice` becomes a chat system line `{code, text}` with no `channel: "party"`: party
  chat (FS-XGW7H) is still a draft. The words come from the party store (`receiveNotice`), not
  the socket.
- A named code that arrives without a name reads "Someone ...".
