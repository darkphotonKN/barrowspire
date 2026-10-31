---
id: I-R82NV-10
status: in-progress
implements: FS-R82NV
blocked_by: []
labels: [ready-for-agent]
title: "FS-R82NV slice 10: create a party of one with party_create (game-service)"
---
Implements FS-R82NV §Requirements R4, R4a

**Lane: human (HITL).** Discuss each choice before writing code.

## What to Build

- A `party_create` action (no payload). A player seated in the hub and in no party becomes the
  leader of a new party of one on this pod: the party and its pointers are written exactly as the
  first delivered invite forms one, and the player gets a `party_update` (reason `joined`,
  subject = them).
- Refusals as `party_notice`, in order: `not_in_hub`, `already_in_party`, `queued`.
- A party of one made this way behaves like any other: it can invite, and it ends when its
  leader leaves.

## Acceptance Criteria

- [ ] `party_create` from a hub-seated, party-less player forms a party of one with them as leader and sends them a `party_update` (`joined`, subject = them).
- [ ] Both pointers are written for it (miniredis).
- [ ] Refused `not_in_hub`, `already_in_party`, `queued`, in that order (table-driven).
- [ ] The created party can invite, and its leader's leave ends it.
- [ ] `go test ./... -race` on the touched party tests green.

## Blocked By

None

## Spec Reference

FS-R82NV §Requirements R4, R4a; §Edge States ("Create while in a party, queued, or outside the hub").

## TDD Approach

- RED: a hub-seated player sends `party_create` and receives a `party_update` naming them leader of a party of one.
- GREEN: a `create` on the party registry that forms the party the way `form` already does.

## Implementation notes (agreed with Nick, 2026-11-01)

- A create that succeeds sends only the `party_update` (`joined`, subject = the creator): no
  `party_notice`, since the panel and frames are the feedback and R36 has no copy for it.
- A created party of one is never dissolved for want of invites; it ends when its leader leaves.
- `party_create` and `party_accept` share one check, `joinRefusal` (`not_in_hub` →
  `already_in_party` → `queued`): R4a and R16 name the same three in the same order.
- Ignored while the pod is shutting down, like every party action.
