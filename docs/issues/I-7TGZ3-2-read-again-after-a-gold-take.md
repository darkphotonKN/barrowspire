---
id: I-7TGZ3-2
status: done
implements: FS-7TGZ3
blocked_by: [I-7TGZ3-1]
labels: []
title: "FS-7TGZ3 slice 2: the hub reads the purse again after the mailbox takes a letter carrying gold (game-client)"
---
Implements FS-7TGZ3 §C R9

**Lane: agent (AFK).** Branch `feat/client-gear-gold`.

## What to Build

- `mailboxStore`: a `goldTaken` count, raised when a taken letter (taken here, or already taken
  elsewhere) carries a gold enclosure; a letter without gold leaves it.
- `HubGear.refreshPurse()`; `HubScene` subscribes to the mailbox store for the visit and calls it
  when `goldTaken` rises, letting go of the subscription with the visit.

## Acceptance Criteria

- [x] Store tests: a Take of a gold letter raises `goldTaken`; an items-only letter and a refused Take do not; `LETTER_ALREADY_CLAIMED` on a gold letter raises it.
- [x] `HubGear` test: `refreshPurse` reads the purse, open or closed.
- [x] `npx vitest run`, `npx tsc --noEmit` pass.

## Blocked By

I-7TGZ3-1 (the purse reader).

## Spec Reference

FS-7TGZ3 §C R9, user story 4.

## Commits

d26173e7 (tests), 45ba6b83 (feature), and the docs commit that closes this issue.
