---
id: I-8EGFA-4
status: done
implements: FS-8EGFA
blocked_by: [I-8EGFA-3]
labels: [ready-for-agent]
title: "FS-8EGFA slice 4: public read of one listing"
---
Implements FS-8EGFA §Requirements 4, 6, 8, 13, 15, 19, §API surface

## What to Build

- **marketplace:** add a `GetListing(listing_id)` RPC. It returns one listing in **any**
  status, with the price facts and `ended` from slice 3. An unknown id returns `NotFound`.
- **Auth:** add `/marketplace.MarketplaceService/GetListing` to `publicMethods`, and extend
  slice 3's test pair to cover it.
- **gateway:** add a typed public `get-listing` op at `GET /api/marketplace/listings/{listing_id}`.
  It does the same item join and answers the extended `Listing`.
- **Routing:** verify that the new path coexists with the static
  `/api/marketplace/listings/mine` route under the Huma/gin router.
- Regenerate.

## Acceptance Criteria

- [ ] It answers 200 with no token for a listing in any status, including an ACTIVE listing that has ended (`ended: true`).
- [ ] An unknown id answers `404 · NOT_FOUND`, and a non-uuid id answers `422 · VALIDATION_FAILED`.
- [ ] `/api/marketplace/listings/mine` still routes to list-my-listings and isn't captured as a `listing_id`.
- [ ] The price facts match slice 3's cases for the same listing.
- [ ] When items is unreachable it answers 503.
- [ ] Contract gates and the regen-diff pass, and tests pass.

## Blocked By

I-8EGFA-3 (price facts, item join, `Listing` extension, public-method test)

## Spec Reference

FS-8EGFA §Requirements 4, 6, 8, 13, 15, 19; §API surface (`get-listing`); stories 9, 14, 15.

## TDD Approach

- **RED:** a query test that an unknown id is not found, and that an ended listing comes back with `ended = true`.
- **GREEN:** a single-row query that reuses the price-facts piece, then the gateway op with the join.
