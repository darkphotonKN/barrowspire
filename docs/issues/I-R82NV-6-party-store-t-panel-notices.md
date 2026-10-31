---
id: I-R82NV-6
status: open
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

- [ ] T opens and closes the panel in all three scenes; never while typing in chat.
- [ ] Panel reflects `party_update` (members, leader icon, where).
- [ ] Buttons grey correctly for leader / member / no party / locked (pure tests).
- [ ] Invite field sends `party_invite {name}` on Enter and is disabled outside the hub.
- [ ] Each notice code renders its copy as a system line in the chat window.
- [ ] `vitest` green; lint fence passes (no raw hex). Scene files not reformatted by prettier.

## Blocked By

I-R82NV-1

## Spec Reference

FS-R82NV §Requirements R28–R31, R36; §User Stories 9–12, 17–19.

## TDD Approach

- RED: a pure test that a store holding a `party_update` where the viewer is leader yields Kick/Transfer enabled and, for a member viewer, disabled.
- GREEN: the store and selectors, then the panel draws from them.
