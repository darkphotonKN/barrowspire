---
id: I-84N1G-5
status: open
implements: FS-84N1G
blocked_by: [I-84N1G-1]
labels: [ready-for-agent]
title: "FS-84N1G slice 5: every window over the party panel hides its invite field; the door closes the party panel"
---
Implements FS-84N1G §Requirements F (R20, R21)

**Lane: AFK (agent).** game-client only.

## What to Build

- `PartyPanelDeps.covered` is handed the field's rect; the UI scene answers whether the open controls
  panel's or the open record's rect meets it (R20).
- `offerWatch`'s first time closes the party panel in the party store, silently (R21).

## Acceptance Criteria

- [ ] The field hides while the controls panel or the record meets it, and only then; text kept, no focus taken.
- [ ] At the door the party panel closes once, silently; T reopens it.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-84N1G-1.

## Spec Reference

FS-84N1G R20, R21.

## TDD Approach

- RED: the UI scene tells the panel its field is covered by an open record over it, not by one beside it.
- GREEN: the rects and the intersection.
