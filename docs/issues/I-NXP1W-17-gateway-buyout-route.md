---
id: I-NXP1W-17
status: done
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 17: gateway buyout route over the existing Buyout RPC"
---
Implements FS-NXP1W §HTTP entry points (Req 43, 44), §API surface, §Acceptance Criteria

**Author:** unassigned

## What to Build

`POST /api/marketplace/listings/{listing_id}/buyout` on api-gateway, a typed huma operation next to
`accept-bid` in `api-gateway/internal/gateway/listing/typed.go`, forwarding the bearer token to
marketplace's existing `Buyout` gRPC RPC. The gateway listing client (`listing/client.go`) gains a
`Buyout` call alongside `AcceptBid`. Then `make openapi && make client`, committed together.

Everything behind the route already exists: `BuyoutUC` (`marketplace-service/internal/listing/usecase/buyout.go`),
the gRPC handler (`internal/listing/grpc/handler.go` `Buyout`) and the listing buyout price
(I-9XKS6-1, I-9XKS6-2, done). This slice only opens it over HTTP.

### Decided deviation from §API surface (2026-10-20)

The route follows the **built** interface, not the §API surface row:

- **No request body, no `amount`.** `BuyoutCommand` takes none; a buyout always costs the listing's
  buyout price, read under the row lock. The `400 · VALIDATION_FAILED amount differs` error does not
  exist.
- **No `Idempotency-Key` header.** Replays are already idempotent by `BuyoutBidID(member, listing)`:
  a repeated buyout finds its own bid and hold and goes straight to the (idempotent) settlement start.

The FS is write-once and is not edited for this; `/spec-audit` reconciles the §API surface row
against the built operation.

## Acceptance Criteria

- [ ] `POST /api/marketplace/listings/{listing_id}/buyout` from a non-seller on an `ACTIVE` listing with a buyout price answers `202`, empty, leaving a `WINNING` BUYOUT bid and settlement started with trigger `BUYOUT`.
- [ ] Repeating the call answers `202` and places no second bid or hold (Req 44).
- [ ] The caller comes from the token only; the operation has no member parameter.
- [ ] Errors pass through the shared seam as in §API surface, minus the `amount` case: `401` no or bad token; `403 · FORBIDDEN` caller is the seller; `404 · NOT_FOUND` unknown listing; `400 · FAILED_PRECONDITION` not `ACTIVE`, past its end, no buyout price, or the buyer lacks the gold; `409 · CONFLICT` listing busy; `422 · VALIDATION_FAILED` malformed `listing_id`; `500`; `503` marketplace or wallet unreachable.
- [ ] `openapi.yaml` and `game-client/src/api/generated/` regenerated and committed with the handler.
- [ ] Tests pass (`typed_test.go` style).

## Blocked By

None

## Spec Reference

FS-NXP1W §HTTP entry points Req 43 (buyout entry point), Req 44 (already-started and replay are
success); §API surface `buyout` row (with the deviation above); §Acceptance Criteria
"`POST .../buyout` from a non-seller at the buyout price answers `202`…"; User Story 8.

## TDD Approach

- RED: a `typed_test.go` case — a stubbed marketplace client records the `BuyoutRequest`; the route
  answers `202` and the forwarded request carries the `listing_id` and the caller's bearer.
- RED: the seller case — the stub returns `PermissionDenied`; the route answers `403 · FORBIDDEN`.
- GREEN: register the operation and add `Client.Buyout`.
