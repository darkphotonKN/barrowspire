---
id: I-EYQ8K-3
status: open
implements: FS-EYQ8K
blocked_by: [I-EYQ8K-2]
labels: [blocked]
title: "FS-EYQ8K slice 3: GET /api/marketplace/bids/mine"
---
Implements FS-EYQ8K §Requirements (Req 1–7), §API surface

**Author:** unassigned

## What to Build

api-gateway. A typed (huma) operation `list-my-bids`, `GET /api/marketplace/bids/mine`, bearer, the member
from the token, calling marketplace `ListMyBids`. Query `cursor` (optional) and `limit` (optional, default
50, 1–100). Response `200 · { bids: MyBid[], nextCursor?: string }` with `MyBid` exactly as FS §API surface,
`item` embedded through the existing `embedItems` join (a failed items lookup fails the request, as for
listings). Errors per §API surface (`status · code`). Then `make openapi && make client && make gates`;
commit `openapi.yaml` and `game-client/src/api/generated/` with the handler. oasdiff must report no
breaking change.

## Acceptance Criteria

- [ ] The route returns the caller's bids with listing summary and embedded item, in marketplace's order, with `nextCursor`.
- [ ] Malformed cursor → `400 · VALIDATION_FAILED`; no token → `401 · UNAUTHENTICATED`; out-of-range limit → `422 · VALIDATION_FAILED`; items failure → `500 · INTERNAL_ERROR`; unreachable → `503 · SERVICE_UNAVAILABLE`.
- [ ] `openapi.yaml` and the generated client regenerated; every `MyBid` field present with the §API surface optionality; oasdiff clean.
- [ ] Tests pass (gateway typed tests, like `my_listings_test.go`).

## Blocked By

I-EYQ8K-2

## Spec Reference

FS-EYQ8K §Requirements 1–7; §API surface (`list-my-bids`, `MyBid`); §Edge States (items lookup fails).

## TDD Approach

- RED: a stub marketplace returning two bids → `200` with both, items embedded, `nextCursor` passed through.
- RED: stub returns `INVALID_ARGUMENT` for the cursor → `400 · VALIDATION_FAILED`.
