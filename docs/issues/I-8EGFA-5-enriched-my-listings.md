---
id: I-8EGFA-5
status: open
implements: FS-8EGFA
blocked_by: [I-8EGFA-3]
labels: [ready-for-agent]
title: "FS-8EGFA slice 5: my listings carry price facts and item"
---
Implements FS-8EGFA §Requirements 5, 8, 14, 15, 19, §API surface

## What to Build

- **marketplace:** `ListMyListings` gains the price facts and `ended`, reusing the piece from
  slice 3.
- **gateway:** `list-my-listings` joins `item` from `GetItemSummaries`. If items is unreachable,
  it answers 503.
- The path, the auth, and every existing field stay the same. The change is purely additive.
- Regenerate.

## Acceptance Criteria

- [ ] Every field `list-my-listings` answered before is still answered, with the same names and types. The breaking-change gate passes.
- [ ] Each listing carries `currentPrice?`, `minimumBid`, `bidCount`, `ended` and `item?`.
- [ ] An ACTIVE listing past `endsAt` appears with `ended: true`.
- [ ] It still answers `401` without a token.
- [ ] Contract gates and the regen-diff pass, and tests pass.

## Blocked By

I-8EGFA-3

## Spec Reference

FS-8EGFA §Requirements 5, 8, 14, 15, 19; §API surface (`list-my-listings`, changed); stories 21, 23, 24.

## TDD Approach

- **RED:** extend the existing list-my-listings query test with a bid and an ended listing, and assert the new fields.
- **GREEN:** join the price facts into the query, then add the gateway join.
