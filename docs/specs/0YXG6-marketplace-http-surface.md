# FS-0YXG6: Marketplace HTTP surface

> Status: shipped · SPECIFICATION.md: `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Typed marketplace surface"; `game-server/marketplace-service/SPECIFICATION.md` "### Surface" → "Read a member's own listings" → this FS · Related ADRs: [ADR-0002](../adr/0002-batch-retrofit-of-the-legacy-surface.md) §5 (new gateway operations are typed), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-minted idempotency) · Related FS: [FS-22WKC](22WKC-uniform-error-contract.md) (the error seam this surface answers through), [FS-NTPW2](NTPW2-gateway-surface-serialized.md) (the serialization pattern)

> **Reconciliation FS.** Most of this surface was built by hand before any spec existed: the typed
> place-bid operation, the legacy gin create-listing route, and marketplace's `ListItem`,
> `PlaceBid` and `WithdrawBid` RPCs. Treat that code as **existing but untested**: characterize it
> with tests first, and let those tests expose the defects this FS fixes (requirements 11–13).

## Summary

Players can list an item for auction, bid on a listing, withdraw a bid they placed, and see their
own listings, all through the gateway's typed HTTP contract. Every operation is described by the
generated OpenAPI document and client, and every failure answers as problem+json through the
error seam. Where marketplace-service's gRPC handler already exposes a flow, this FS brings it to
HTTP. Where that flow was left unfinished (the listing stub, the dropped listing terms, the
unmapped wallet errors), it finishes it without adding domain logic.

## Requirements

### Gateway surface

1. **Every marketplace operation is typed.** Each is registered in
   `internal/gateway/listing/typed.go` through `RegisterOperations`, so the generated
   `openapi.yaml` and client describe exactly what the server serves. No marketplace route
   remains on gin.
2. **The legacy create route is removed.** `POST /api/listing` and its gin handler are deleted,
   along with the hand-rolled auth check, the `{statusCode, message, result}` envelope and the
   unused `ListItemResponse` model. The typed operation replaces it. game-client has no call-site
   on the old path, so nothing on the client migrates.
3. **Paths live under `/api/marketplace/listings`.** Bids are a sub-resource of their listing:
   `/api/marketplace/listings/{listing_id}/bids[/{bid_id}]`.
4. **Responses are bare.** No envelope. An operation that returns a resource returns the resource;
   an operation with nothing to return has no body.
5. **Authentication is the middleware's alone.** Every operation is protected by the gateway's
   JWT middleware and declares the bearer security scheme. Handlers never inspect the
   `Authorization` header themselves; they only forward it to marketplace, which re-validates it.
6. **Identity never comes from the request.** The seller of a listing, the bidder of a bid, the
   member withdrawing a bid and the owner of "my listings" are all taken from the token downstream.
   No request body or parameter carries a member id.
7. **Errors go through the seam.** Every handler error is converted by the injected seam function,
   so it answers as problem+json with a `status · code` pair. The gateway never restates a
   marketplace rule: shape failures are rejected at the boundary (422), and domain refusals come
   back from marketplace as gRPC codes the seam maps (400, 404, 409 and so on).

### Create listing

8. **Create-listing is accepted, not created.** The listing does not exist when the request
   returns: marketplace reserves the item with items-service, and the listing is born later when
   marketplace consumes the `ItemReserved` event. The operation therefore answers `202 Accepted`
   with no body and no `Location`.
9. **The listing terms reach the listing.** The start price and end time the seller sends are
   carried through the reservation into the `ItemReserved` event, so the listing born from that
   event has the terms the seller asked for.
10. **Invalid terms are refused before the item is reserved.** A non-positive start price (422 at the boundary) or an
    end time not in the future is refused with `InvalidArgument` (400) before items-service is
    called. It uses the listing's existing validation rules, and no new domain rule is written.
    Otherwise a bad request would lock the item and then fail invisibly in the consumer.

### Existing defects fixed here

11. **The reservation passes the terms through.** Marketplace's reserve-item path currently sends
    only the item id to items-service. `start_price` and `ends_at` are dropped, so the event carries
    `0` and `1970-01-01`, and the consumer refuses to create the listing. The fix passes both fields
    through the reserve-item command and the item-reserver adapter. It is a pass-through only.
12. **The consumer stops requeueing refusals.** The `ItemReserved` consumer currently answers every
    non-duplicate failure with `Nack(requeue=true)`. A domain refusal (invalid terms) can never
    succeed, so it is redelivered forever. Refusals that will never succeed are dead-lettered.
    Transient failures are still requeued.
13. **Wallet refusals keep their meaning.** Marketplace's wallet client currently wraps wallet's
    gRPC status and returns it, and marketplace's `mapError` matches no sentinel for it, so an
    insufficient-gold bid answers 500. The wallet client switches on the returned gRPC code and
    returns marketplace sentinels inline (for example `FailedPrecondition` → insufficient funds →
    400 `FAILED_PRECONDITION`; `Unavailable` → `ErrTransient` → 503). `mapError` then maps them
    like any other sentinel.

### Place and withdraw a bid

14. **Place-bid is transcribed as it ships.** Its request, idempotency behavior and validation are
    unchanged by this FS. It answers `201` with **no body**: the client needs no read-back of the
    bid it just placed.
15. **The idempotency key is optional and caller-minted.** It is sent as the `Idempotency-Key`
    header, minted once per bid and reused on every retry of that bid (ADR-0009). Without one, a
    retry is a second bid.
16. **Withdraw-bid is exposed.** `DELETE` on the bid withdraws it, answering `204` with no body.
    Ownership is enforced by marketplace: withdrawing another member's bid is refused (403), never
    silently ignored.

### My listings

17. **The `CreateListing` stub becomes "my listings".** The stub RPC is misnamed: it sits on the read
    path, reads listings by seller, returns `nil, nil`, and has a response message copied from the
    wallet balance. It is renamed in `marketplace.proto` (regenerated, never hand-edited) to a read
    of the caller's own listings, with a real listing message. The gRPC handler follows the ledger
    read-path pattern: identity from the context, errors through `mapError`, DTO to proto mapping.
18. **The seller is the caller.** "My listings" returns only listings whose seller is the
    authenticated member. There is no parameter for choosing another member.
19. **My listings is paginated by cursor,** the same way ledger's list-entries is: an opaque cursor
    and a bounded limit, newest first. The read query returns a list, not the first matching row.

### Seam codes

20. **Two gRPC codes gained seam mappings for this surface.** `FailedPrecondition` → `400 ·
    FAILED_PRECONDITION` (the request was valid but the resource's state refuses it) and `Aborted` →
    `409 · CONFLICT` (optimistic-locking contention that outlasted marketplace's internal retries).
    Both codes were added to `common/errcode`. They are platform-wide, since wallet uses the same
    two gRPC codes with the same meanings.

## User Stories

1. As a player, I want to list an item from my stash for auction with a start price and end time, so that other players can bid on it.
2. As a player, I want the listing to carry exactly the start price and end time I asked for, so that the auction runs on my terms.
3. As a player, I want a listing request with an invalid price or an end time in the past refused immediately, so that my item is not locked by a listing that will never exist.
4. As a player, I want to be told my listing request was accepted even though the listing appears a moment later, so that the client can show it as pending rather than as failed.
5. As a player, I want to be refused when I try to list an item I do not own or that is already listed, so that items cannot be sold twice.
6. As a player, I want to place a bid on an active listing, so that I can take the lead.
7. As a player, I want a bid that does not beat the current price refused with a reason I can act on, so that I can bid again higher.
8. As a player, I want a bid on an ended or closed listing refused as a state problem, not a server error, so that I stop retrying.
9. As a player, I want a bid I cannot afford refused as a state problem, not a server error, so that I know to top up my gold.
10. As a player on a flaky connection, I want to retry a bid with the same idempotency key, so that a retry is recognised instead of placed twice.
11. As a player racing other bidders, I want contention reported as a conflict I can retry, so that a lost race doesn't look like a crash.
12. As a player, I want to withdraw a bid I placed, so that my held gold is released.
13. As a player, I want to be refused when I try to withdraw someone else's bid, so that nobody can cancel my bids.
14. As a player, I want withdrawing a bid that is already withdrawn or no longer withdrawable refused as a state problem, so that the client can refresh instead of crashing.
15. As a player, I want to see my own listings, newest first, so that I can track what I am selling.
16. As a player with many listings, I want my listings paged, so that the list loads quickly.
17. As a player, I never want to see another member's listings through "my listings", so that my view is really mine.
18. As a signed-out visitor, I want every marketplace operation to answer 401, so that the client can send me to sign in.
19. As a client developer, I want every marketplace operation in the generated client, so that I never hand-write a fetch to the marketplace.
20. As a client developer, I want every marketplace failure as problem+json with a stable `code`, so that I switch on codes instead of parsing prose.
21. As a client developer, I want malformed input rejected as 422 before it reaches marketplace, so that "you sent garbage" is distinguishable from "you were refused".
22. As a client developer, I want a marketplace outage answered 503, so that the client knows retrying is correct.
23. As the gateway, I want no marketplace route left on gin, so that the seam gate passes and the contract gates behind it run.
24. As marketplace-service, I want identity only from the verified token, so that no request can act as another member.
25. As marketplace-service, I want an `ItemReserved` event that can never become a listing dead-lettered, so that one bad message does not loop forever.
26. As an operator, I want wallet refusals logged as the refusal they are, so that real server errors are not buried among insufficient-gold bids.

## Acceptance Criteria

- [ ] `create-listing`, `place-bid`, `withdraw-bid` and `list-my-listings` are registered in `listing/typed.go` and appear in the generated `openapi.yaml` and `schema.d.ts`.
- [ ] `POST /api/listing`, `CreateListingHandler` and the `ListItemResponse` model are deleted, and `routes.go` has no marketplace gin route.
- [ ] `game-server/scripts/check-seam.sh` reports no offender in `internal/gateway/listing/`.
- [ ] create-listing answers `202` with no body. A test shows the terms sent reach the items-service request.
- [ ] A create-listing with a past end time answers `400 · VALIDATION_FAILED`, and a non-positive start price answers `422 · VALIDATION_FAILED`. In both cases items-service is not called.
- [ ] A test shows the `ItemReserved` consumer dead-letters an event whose terms the listing refuses, and still requeues a transient failure.
- [ ] place-bid answers `201` with no body. Its existing tests still pass unchanged.
- [ ] A bid refused by wallet with `FailedPrecondition` answers `400 · FAILED_PRECONDITION`, and wallet `Unavailable` answers `503 · SERVICE_UNAVAILABLE`.
- [ ] withdraw-bid answers `204`. Another member's bid answers `403 · FORBIDDEN`. An unknown bid answers `404 · NOT_FOUND`.
- [ ] list-my-listings returns only the caller's listings, newest first, paged by cursor.
- [ ] The `CreateListing` RPC and its wallet-shaped messages are gone from `marketplace.proto`, and the generated Go is regenerated, not patched.
- [ ] Every operation's `Errors` list in `typed.go` matches the table below.
- [ ] `make openapi-diff`, `make lint-contract`, `make openapi-breaking`, client regen-diff and `tsc --noEmit` pass.

## Edge States

- **Unauthenticated** (no, malformed or expired token): the middleware answers `401 · UNAUTHENTICATED` before any handler runs.
- **Malformed input** (non-uuid path id, non-uuid idempotency key, missing or non-positive amount, missing field, unknown body member): `422 · VALIDATION_FAILED` at the boundary, and marketplace is never called.
- **Listing accepted, then refused asynchronously:** after requirement 10 this is limited to item-side refusals that happen after the reservation succeeds. The client sees `202`, and the listing never appears in "my listings". There is no failure notification to the seller in this FS.
- **Item not owned, not found or already listed:** items-service currently maps every reservation failure to `Internal`, so these answer `500 · INTERNAL_ERROR` today. They are **not** fixed here (see Out of Scope). The surface documents 500 honestly rather than promising codes items-service does not send.
- **Bid below the current price / invalid amount:** `400 · VALIDATION_FAILED` (marketplace `InvalidArgument`).
- **Bid on a listing that is expired, not active, or in settlement:** `400 · FAILED_PRECONDITION`.
- **Bid the bidder cannot afford:** `400 · FAILED_PRECONDITION` (requirement 13).
- **Concurrent bids on one listing outlasting marketplace's retries:** `409 · CONFLICT`. Retrying with the same idempotency key is safe.
- **Withdraw a bid already withdrawn, or no longer withdrawable:** `400 · FAILED_PRECONDITION`.
- **Withdraw another member's bid:** `403 · FORBIDDEN`.
- **Marketplace, wallet or items unreachable:** `503 · SERVICE_UNAVAILABLE`.
- **My listings when the caller has none:** `200` with an empty list, not 404.
- **My listings with a malformed or stale cursor:** `400 · VALIDATION_FAILED`, as in ledger's list-entries.
- **DB constraint violation (not-null, FK) anywhere:** `500 · INTERNAL_ERROR` with generic detail. It is a server bug, never a precondition, and nothing about the row leaks.

## API surface

All operations: tag `marketplace`, bearer security, protected by the gateway JWT middleware.
Errors are `status · code` through the seam. Every operation can also answer `401 ·
UNAUTHENTICATED`, `422 · VALIDATION_FAILED` (shape) and `503 · SERVICE_UNAVAILABLE`; the table
lists only what is specific to each.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `create-listing` | `POST /api/marketplace/listings` | none | `itemId` uuid, required · `startPrice` int64 ≥ 1, required · `endsAt` RFC 3339 date-time, required | `202`, no body | `400 · VALIDATION_FAILED` (end time not in the future) · `500 · INTERNAL_ERROR` (any items-side refusal, see Edge States) |
| `place-bid` | `POST /api/marketplace/listings/{listing_id}/bids` | path `listing_id` uuid · header `Idempotency-Key` uuid, optional | `amount` int64 ≥ 1, required | `201`, no body | `400 · VALIDATION_FAILED` (below current price) · `400 · FAILED_PRECONDITION` (listing not accepting bids / expired / insufficient gold) · `404 · NOT_FOUND` (listing) · `409 · CONFLICT` (contention) |
| `withdraw-bid` | `DELETE /api/marketplace/listings/{listing_id}/bids/{bid_id}` | path `listing_id` uuid · path `bid_id` uuid | none | `204`, no body | `400 · FAILED_PRECONDITION` (bid not withdrawable) · `403 · FORBIDDEN` (not the caller's bid) · `404 · NOT_FOUND` (listing or bid) · `409 · CONFLICT` (contention) |
| `list-my-listings` | `GET /api/marketplace/listings/mine` | query `cursor` opaque string, optional · query `limit` int, optional, bounded (same as list-entries) | none | `200` · `{ listings: Listing[], nextCursor?: string }` | `400 · VALIDATION_FAILED` (malformed cursor) |

**`Listing`** (response resource, new):

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `itemId` | uuid | |
| `sellerId` | uuid | always the caller in `list-my-listings` |
| `buyerId` | uuid, optional | present once sold |
| `startPrice` | int64 | |
| `soldPrice` | int64, optional | present once sold |
| `status` | string | the listing status as stored (e.g. ACTIVE, PENDING_SETTLEMENT, SOLD, SETTLEMENT_FAILED) |
| `endsAt` | date-time | |
| `createdAt` | date-time | |
| `updatedAt` | date-time | |

The listing's optimistic-locking `version` is internal and never exposed.

## Out of Scope

- **Releasing holds stranded by a refused bid.** place-bid places the wallet hold before the domain checks run. The sweeper is tracked as `I-UNANCHORED-1` and needs its own anchor.
- **items-service reservation error mapping.** items-service answers `Internal` for every reservation failure, so item-side refusals surface as 500. Mapping them properly is items-service work.
- **Cancel a listing, search listings, another member's bids or listings.** No marketplace RPC backs these yet. They were rows in marketplace's old API Surface table and stay unplanned.
- **Buyout.** A BUYOUT-type bid is part of the marketplace domain but has no RPC or route yet.
- **Notifying a seller when an accepted listing fails asynchronously.**
- **`common/interceptor/status.go`** mapping `ErrConstraintViolation` to `InvalidArgument`. That's a separate cleanup; marketplace's own `mapError` no longer maps it (it falls to Internal).
- **Settlement** (FS-NXP1W). Untouched.
