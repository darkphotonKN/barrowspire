---
id: I-0YXG6-2
status: done
implements: FS-0YXG6
blocked_by: [I-0YXG6-1]
labels: [ready-for-agent]
title: "FS-0YXG6 slice 2: list-my-listings endpoint"
---
Implements FS-0YXG6 §Requirements 18, §API surface

## What to Build

Typed `list-my-listings` at `GET /api/marketplace/listings/mine`, calling the my-listings RPC from
I-0YXG6-1. Query `cursor` (opaque, optional) and `limit` (optional, capped the same way as ledger's
list-entries). The response is `200` with `{ listings: Listing[], nextCursor?: string }`, using the
`Listing` fields in FS-0YXG6 §API surface. `version` is never exposed. No parameter can select
another member. Add the op to the gateway client, then regenerate the contract and client.

## Acceptance Criteria

- [ ] `GET /api/marketplace/listings/mine` returns the caller's listings with the `Listing` fields in §API surface, and `nextCursor` only when there is a next page.
- [ ] A caller with no listings gets `200` with an empty list, not 404.
- [ ] A malformed cursor answers `400 · VALIDATION_FAILED`.
- [ ] `buyerId` and `soldPrice` are optional in the generated schema.
- [ ] Contract gates, client regen-diff and `tsc --noEmit` pass.
- [ ] Tests pass.

## Blocked By

I-0YXG6-1 (the my-listings RPC, and the same `typed.go`, `client.go` and generated files)

## Spec Reference

FS-0YXG6 §Requirements 18–19, §API surface (`list-my-listings`, `Listing`), §Edge States (empty,
bad cursor). User stories 15–17.

## TDD Approach

- RED: a stub client returning two listings and a next cursor. The route answers `200` with both listings in the documented shape and `nextCursor` set.
- GREEN: register the op, mapping proto to the response type.
