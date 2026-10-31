---
id: I-R82NV-11
status: in-progress
implements: FS-R82NV
blocked_by: [I-R82NV-10]
labels: [ready-for-agent]
title: "FS-R82NV slice 11: Create party and Invite buttons in the party panel (game-client)"
---
Implements FS-R82NV §Requirements R29, R30

**Lane: agent (AFK).**

## What to Build

- With no party, the panel shows a **Create party** button that sends `party_create`; usable only
  in the hub, greyed elsewhere.
- An **Invite** button beside the invite field; it sends `party_invite {name}` exactly as Enter
  does (trimmed, nothing sent for a blank name).
- The no-party hint reads "Create a party, or invite someone by name."
- `party_create` is routed through the boot-time party error claim (`routePartyErrors`) like the
  other party actions.

## Acceptance Criteria

- [ ] No party, in the hub: Create party sends `party_create`; in a field or run it is greyed and sends nothing.
- [ ] In a party, the Create party button is not shown.
- [ ] The Invite button sends what Enter sends; a blank field sends nothing.
- [ ] The hint text matches R30.
- [ ] `vitest` green; lint fence passes; scene files not reformatted.

## Blocked By

I-R82NV-10

## Spec Reference

FS-R82NV §Requirements R29, R30; §User Stories 26, 27; §Edge States ("Empty").

## TDD Approach

- RED: a pure test that the panel's actions for a party-less viewer in the hub include Create party enabled, and in a field disabled.
- GREEN: the selector, then the button.

## Implementation notes (2026-11-01)

- The static "Invite" label left of the field is gone: the Invite button at the row's right end
  carries the word, and the field's placeholder marks it.
- Copy gap: `party_create` refused `already_in_party` arrives with no name and reads "Someone
  walks with another party." R36 has no self form. The Create button is hidden in a party, so
  only a race or a hand-sent frame reaches it; left for a spec decision.

