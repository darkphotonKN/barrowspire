---
id: I-49Z37-3
status: done
implements: FS-49Z37
blocked_by: []
labels: [ready-for-agent]
title: "FS-49Z37 slice 3: set a buyout price when listing, and show it"
---
Implements FS-49Z37 §Requirements 1–4

**Author:** unassigned

## What to Build

- Listing form: optional `Buyout price (optional)` field under the starting bid. Empty → no
  `buyoutPrice` sent. Filled → a whole amount above the starting bid, else `The buyout price must be
  above the starting bid.` and nothing sent; the server's refusal shows the same.
- Show the buyout price, when set, in the posted preview, My listings and the listing detail.
- Browse rows with a buyout price show `Buyout {price}` next to the current price.

`CreateListingBody.buyoutPrice` already exists in the generated client; the listing read already
carries `buyoutPrice`.

## Acceptance Criteria

- [ ] Empty field sends no `buyoutPrice`; ≤ starting bid shows the message and sends nothing; a valid one is sent.
- [ ] The buyout price shows in the posted preview, My listings and detail when set, and nowhere when not.
- [ ] Browse rows show the badge exactly when `buyoutPrice` is set.
- [ ] Styling uses tokens only (ADR-0013); tests, lint and typecheck pass.

## Blocked By

None

## Spec Reference

FS-49Z37 §Requirements 1–4; §User Stories 5, 14, 15, 16; §Acceptance Criteria "Listing form…", "Browse…".

## TDD Approach

- RED: the listing-form validator refuses a buyout price ≤ the starting bid and omits an empty one from the body.
- RED: the browse row model carries a buyout badge only when `buyoutPrice` is set.
