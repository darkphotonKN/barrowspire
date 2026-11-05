---
id: I-V7A5S-2
status: done
implements: FS-V7A5S
blocked_by: [I-V7A5S-1]
labels: []
title: "FS-V7A5S slice 2: DELETE /api/marketplace/listings/{id} and the seller's Withdraw action (api-gateway + game-client)"
---
Implements FS-V7A5S §Requirements 13–16, §API surface (HTTP)

## What to Build

The seller withdraws from the web client.

- **Gateway.** A typed operation `DELETE /api/marketplace/listings/{listing_id}` (beside place/withdraw-bid in `internal/gateway/listing/typed.go`), protected and secured like the other seller writes, forwarding the bearer to `WithdrawListing`; `204` on success; documents 401/403/404/400 (`LISTING_WITHDRAW_LOCKED`, `FAILED_PRECONDITION`, `EMAIL_UNVERIFIED`)/422/503. *(Amended 2026-11-05: no `EMAIL_UNVERIFIED` (withdraw is not email-gated, FS-V6SFK Req 30); adds `409 · CONFLICT`, and `503` may mean "withdrawn, follow-up not yet started; retrying is safe".)* Then `make openapi && make client`.
- **Client.** `apiClient.withdrawListing(listingId)`. A **Withdraw** action on the seller's own listing — in the seller block (`components/bazaar/SellerBlock.tsx` via `marketplace/accept.ts`'s `sellerBlock`) and on the My listings row (`marketplace/myListings.ts`) — shown while ACTIVE, not ended, not bought out, and hidden inside the final 30 minutes when the listing has bids (Req 14). A confirm naming the bid count (Req 15). Refusal copy per Req 16 (`withdrawListingFailure` beside `acceptFailure`/`withdrawFailure`), re-reading the listing on success and on `FAILED_PRECONDITION`.

## Acceptance Criteria

- [ ] Gateway seam table: 204; 403 FORBIDDEN; 404; `400 · LISTING_WITHDRAW_LOCKED`; `400 · FAILED_PRECONDITION`; `400 · EMAIL_UNVERIFIED`; malformed id → 422; *(Amended 2026-11-05: the `EMAIL_UNVERIFIED` row is gone — an unverified seller can withdraw; an `Aborted → 409 · CONFLICT` row is added.)* marketplace never called on a shape error; docs list the refusals.
- [ ] `openapi.yaml` and `schema.d.ts` regenerated and consistent; `make openapi-breaking` passes (additive route).
- [ ] Client: the action's visibility rule (table over status / ended / bought out / bids × time to end); the confirm text with and without bids; each refusal → its copy; success re-reads the listing.
- [ ] `tsc --noEmit`, vitest, next lint clean; Go tests green in api-gateway.

## Files expected to touch

- `game-server/api-gateway/internal/gateway/listing/typed.go`, `model.go` (+ `typed_test.go`) — **shared with I-XEDFF-1**
- `game-server/api-gateway/openapi.yaml` — **generated, hotspot (also I-XEDFF-1)**
- `game-client/src/api/generated/schema.d.ts` — **generated, hotspot (also I-XEDFF-1)**
- `game-client/src/utils/api.ts` (+ test)
- `game-client/src/marketplace/accept.ts` or a new `withdrawListing.ts` (+ tests), `marketplace/myListings.ts` (+ test)
- `game-client/src/components/bazaar/SellerBlock.tsx`, `components/bazaar/MyListingsTable.tsx`

## Blocked By

I-V7A5S-1 (the RPC must exist)

## Spec Reference

FS-V7A5S §Requirements 13–16; §User Stories 1, 5, 9, 11, 17; §Acceptance Criteria (HTTP, Client); §API surface.
