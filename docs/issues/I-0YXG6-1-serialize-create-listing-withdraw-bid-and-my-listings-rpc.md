---
id: I-0YXG6-1
status: done
implements: FS-0YXG6
blocked_by: []
labels: [ready-for-agent]
title: "FS-0YXG6 slice 1: serialize create-listing, add withdraw-bid, and the my-listings RPC"
---
Implements FS-0YXG6 §Requirements 1–8, 16–19, §API surface

## What to Build

Three parts in one issue. They share `listing/typed.go`, `listing/client.go` and the generated
contract, so they land together.

**A. Slice ⓪: serialize create-listing (gateway).**
- Typed `create-listing` at `POST /api/marketplace/listings` → `202`, no body. It forwards the
  bearer token and calls marketplace `ListItem`. Errors go through the seam.
- Delete the gin route `POST /api/listing` in `config/routes.go`, `CreateListingHandler`, the
  `ListItemResponse` model (and its stray comment), and the handler's hand-rolled auth check and
  envelope. Huma decodes the body, so the ignored `io.ReadAll` error disappears with it.
- **Deliberate shape break:** `201` with a `{statusCode, message, result}` envelope becomes `202`
  with no body. oasdiff cannot see this (the old route was never in the contract), so verify it by
  hand before and after. game-client has no call-site on `/api/listing`.

**B. withdraw-bid (gateway).**
- Add `WithdrawBid` to the gateway's listing client and `ListingClient` interface.
- Typed `withdraw-bid` at `DELETE /api/marketplace/listings/{listing_id}/bids/{bid_id}` → `204`,
  errors as in §API surface.

**C. My listings over gRPC (marketplace and proto).**
- In `common/api/proto/marketplace/marketplace.proto`, rename the `CreateListing` stub to a read
  of the caller's own listings. Give it a real `Listing` message, cursor and limit in, listings and
  next cursor out, and delete the wallet-shaped `CreateListingRequest/Response`. Regenerate; never
  hand-edit the generated Go.
- The read query returns a list: seller = caller, newest first, cursor-paged the same way as
  ledger's list-entries. `GetContext` becomes `SelectContext`.
- The handler follows ledger's read-path pattern: identity from the context, errors through
  `mapError`, DTO mapped to proto. `version` is never mapped.

## Acceptance Criteria

- [ ] `create-listing` and `withdraw-bid` are typed, and appear in the regenerated `openapi.yaml` and `schema.d.ts`.
- [ ] No marketplace gin route remains. `check-seam.sh` reports no offender in `internal/gateway/listing/`.
- [ ] create-listing answers `202` with no body. The shape change is verified by hand and noted in the PR.
- [ ] withdraw-bid answers `204`, `403 · FORBIDDEN` for another member's bid, and `404 · NOT_FOUND` for an unknown bid.
- [ ] Each operation's `Errors` list in `typed.go` matches FS-0YXG6 §API surface.
- [ ] The my-listings RPC returns only the caller's listings, newest first, paged by cursor. A malformed cursor answers `InvalidArgument`.
- [ ] `CreateListing` and its wallet-shaped messages are gone from the proto, and the Go is regenerated.
- [ ] `make openapi-diff`, `make lint-contract`, `make openapi-breaking`, client regen-diff and `tsc --noEmit` pass.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-0YXG6 §Requirements 1–8 (gateway surface, create listing), 16 (withdraw-bid), 17–19 (my
listings over gRPC), §API surface. User stories 1, 4, 12–19, 23, 24.

## TDD Approach

- RED: a typed-route test showing `POST /api/marketplace/listings` answers `202` with an empty body and forwards `itemId`, `startPrice` and `endsAt` plus the bearer token to `ListItem`.
- GREEN: register `create-listing`, then delete the gin route.
- RED: `DELETE …/bids/{bid_id}` answers `204` and forwards both ids. A `PermissionDenied` stub answers `403 · FORBIDDEN`.
- RED: a marketplace handler test showing the my-listings RPC returns only the caller's listings, and a query test showing a second page follows the cursor.
