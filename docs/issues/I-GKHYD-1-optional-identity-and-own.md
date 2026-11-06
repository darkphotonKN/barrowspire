---
id: I-GKHYD-1
status: done
implements: FS-GKHYD
blocked_by: []
labels: [ready-for-agent]
title: "FS-GKHYD slice 1: public listing reads take an optional identity and answer own (common/auth + marketplace)"
---
Implements FS-GKHYD §Requirements 5–10, §API surface (gRPC rows), §Edge States

## What to Build

- **common/auth:** an optional-auth method list beside `publicMethods`, holding exactly
  `/marketplace.MarketplaceService/BrowseListings` and `/marketplace.MarketplaceService/GetListing`,
  both removed from `publicMethods`.
  - A valid `authorization: Bearer` embeds the identity, as for a protected method.
  - An absent, malformed, invalid or expired one calls the handler with no identity, never
    `Unauthenticated`.
  - Rewrite the `publicMethods` comment that says these reads reveal nothing member-owned.
- **Proto:** `marketplace.proto` `Listing` gains `bool own` (a new field number). Keep `seller_id`,
  `buyer_id` and `sold_price`. Regenerate with the repo's proto target (`make gen`) and keep only
  the marketplace outputs in the diff. Never hand-edit `.pb.go`.
- **Marketplace:** in `grpc/handler.go`, BrowseListings and GetListing set `own` from
  `commonauth.IdentityFromCtx` / `MemberIDFromCtx`: present and equal to the listing's seller →
  true, else false. ListMyListings sets `own = true`. `toProtoListing` takes the viewer (or its
  `own` value) instead of computing it inside the mapper.

## Acceptance Criteria

- [ ] Interceptor tests:
  - a public method never embeds identity, even with a valid token;
  - an optional-auth method embeds identity with a valid token, and serves anonymously with an absent, malformed or invalid one, never Unauthenticated;
  - other methods are unchanged;
  - the two lists are disjoint.
- [ ] Marketplace handler tests: `own` is true for the seller, and false for another member and for no identity, on both BrowseListings and GetListing. ListMyListings answers `own = true`.
- [ ] The gRPC `Listing` still carries `seller_id`, `buyer_id` and `sold_price`.
- [ ] `go build`, `go vet` and `go test ./...` are green in common, marketplace-service and api-gateway (api-gateway must still build against the regenerated proto).

## Blocked By

None

## Spec Reference

FS-GKHYD §Requirements 5–10 (who decides own; optional identity), §API surface gRPC rows, §Edge States (anonymous, expired/invalid/malformed token, disjoint lists). ADR-0053.

## TDD Approach

- RED: an interceptor test that GetListing with an expired token reaches the handler with no identity (today: the method skips identity entirely, so a valid token isn't embedded either), and a handler test that `own` is true for the seller.
- GREEN: the optional-auth list plus `own` in the handler.

## Expected files

`game-server/common/auth/interceptor.go` (+ `auth_test.go`); `game-server/common/api/proto/marketplace/marketplace.proto` + regenerated `marketplace.pb.go` (generated hotspot); `game-server/marketplace-service/internal/listing/grpc/handler.go` + `handler_test.go` / `browse_listings_test.go` / `get_listing_test.go` / `list_my_listings_test.go`.
