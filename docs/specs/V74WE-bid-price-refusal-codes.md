# FS-V74WE: A refused bid says why (too low / at or above buyout)

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Distinct refusals for a bid too low or at buyout"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Bid-price refusals on place-bid"; `game-client/SPECIFICATION.md` "### Marketplace" → "Explain a bid refused for its price" → this FS · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (a domain refusal is 400 with a domain code; the contract is generated), [ADR-0027](../adr/0027-place-bid-id-is-derived-from-the-callers-key.md) (a refused bid's key is spent) · Related FS: [FS-49Z37](49Z37-marketplace-sale-actions.md) (bid refusals in the bazaar, req 21–23), [FS-9XKS6](9XKS6-listing-buyout-price.md) (bids stay below the buyout price), [FS-ZE43K](ZE43K-bid-withdrawal-cap.md) and [FS-F692V](F692V-accept-bid-floor.md) (earlier marketplace refusals on the same `ownRefusals` table), [FS-VPD8Y](VPD8Y-town-stash.md) R13/R25 (how a refusal crosses gRPC and the gateway) · **Supersedes in part:** FS-9XKS6 Req 10 and its API row "bid `amount` ≥ the listing's `buyoutPrice` → `400 · VALIDATION_FAILED`"; FS-0YXG6's place-bid row "`400 · VALIDATION_FAILED` (below current price)"; FS-8EGFA's "400 `VALIDATION_FAILED` on a bid" copy rule; FS-49Z37 req 21 (telling the two apart by the re-read now applies only to `VALIDATION_FAILED`) and the `VALIDATION_FAILED` in req 23. Those FSs are not edited. · Vocabulary: [`marketplace-service/CONTEXT.md`](../../game-server/marketplace-service/CONTEXT.md), no new terms · Promoted 2026-11-05 from Nick's charter "a refused bid says why". **[charter default]** marks a default Claude proposed and Nick approved in the charter; none was run through challenge-me (not challenged).

## Summary

Today a bid that is too low and a bid at or above the buyout price both come back as `400 ·
VALIDATION_FAILED`, and the bazaar guesses which one it was by re-reading the listing. After this,
marketplace answers each with its own registered code, `BID_TOO_LOW` or `BID_AT_OR_ABOVE_BUYOUT`,
still with HTTP 400, and the bazaar shows the matching message without guessing. The old
`VALIDATION_FAILED` path stays in the client as a fallback.

## Requirements

### Registry (`common/errcode`)

1. **Two new registered codes.** `BidTooLow Code = "BID_TOO_LOW"` and `BidAtOrAboveBuyout Code =
   "BID_AT_OR_ABOVE_BUYOUT"`, each with a doc comment in the Marketplace block (what it refuses,
   that marketplace-service decides it, "Added for FS-V74WE"), and both listed in `domainCodes`
   under `// FS-V74WE`. **[charter default]** The client already has to tell these two apart, and
   today it guesses.

### Marketplace (`marketplace-service`)

2. **Mapped through `ownRefusals`.** `grpc/handler.go`'s `ownRefusals` gains
   `{listing.ErrBidTooLow, errcode.BidTooLow}` and `{listing.ErrBidAtOrAboveBuyout,
   errcode.BidAtOrAboveBuyout}`, and both sentinels leave the `codes.InvalidArgument` branch of
   `mapError`. The domain is unchanged and still does not import `errcode`. **[charter default]**
3. **What crosses gRPC.** Each refusal crosses as `FailedPrecondition` with an ErrorInfo whose
   reason is its code (the existing `Refusal` transport), in place of today's bare
   `InvalidArgument`. The gateway is the only gRPC caller of `PlaceBid`.
4. **The rules are unchanged.** What counts as too low (below `startPrice` with no contending bid,
   or not above the contending bid) and as at or above the buyout (`amount >= buyoutPrice`) is
   exactly what `PlaceBidWithID` decides today, in the same order, after the replay checks and the
   withdrawal cap (FS-ZE43K). The two cases cannot both hold for one bid: a contending bid is
   always below the buyout price.
5. **The hold is still released, and the cause still answered.** Both sentinels stay in the
   place-bid use case's `bidRejected` set, so a refusal found under the listing lock releases the
   hold and is answered with its code, including when the release outlasts the 3 s wait
   (`releaseHold` never replaces the cause). No use case change.
6. **`ErrInvalidAmount` is unchanged.** An amount ≤ 0 stays `InvalidArgument` → `400 ·
   VALIDATION_FAILED`. **[charter default]** The client blocks it before sending, and the gateway
   already refuses a non-positive amount as `422`. `ErrBuyoutAmountMismatch` is also unchanged (Out
   of Scope).
7. **No amount in the refusal.** The refusal carries only its code, not the current minimum bid.
   **[charter default]** The client already re-reads the listing for the fresh `minimumBid`, and a
   `Refusal` carries only its code today; adding data would change `common/errcode`.

### Gateway (`api-gateway`)

8. **Status stays 400.** The gateway passes both reasons through its existing registered-refusal
   path as `400 · BID_TOO_LOW` and `400 · BID_AT_OR_ABOVE_BUYOUT`. No gateway mapping code
   changes. **[charter default]** The client routes on `code`, and the status is unchanged.
9. **Documented and regenerated.** The place-bid operation's description lists both refusals in its
   `Refusals:` sentence, beside `BID_WITHDRAW_LIMIT_REACHED`. `openapi.yaml` and
   `game-client/src/api/generated/` are regenerated with `make openapi && make client` in
   `game-server/api-gateway`, never hand-edited. **[charter default]**
10. **Not a breaking change.** No request or response shape changes; the diff is the description
    only. oasdiff (`make gates`) is expected to report no breaking change, and the slice records
    what it actually reports. A code is added, none is removed or repurposed (`docs/agents/contract.md`
    error vocabulary). **[charter default]**

### Client (`game-client`)

11. **`BID_TOO_LOW`.** `bidFailure` answers it by asking for a re-read; after the re-read the bid
    box shows the existing outbid message with the fresh minimum, `outbidMessage(fresh.minimumBid)`,
    and never the at-buyout message, whatever the re-read buyout price. A failed re-read shows
    `BROWSE_UNREACHABLE`, as today. The box's `touched` reset before the re-read is kept, so the
    new minimum lands in the box. **[charter default]**
12. **`BID_AT_OR_ABOVE_BUYOUT`.** `bidFailure` answers it with the existing `BID_AT_BUYOUT`
    message, with no re-read. **[charter default]**
13. **`VALIDATION_FAILED` is the fallback.** It keeps today's behavior: re-read, then
    `validationRefusal` infers at-buyout from the re-read buyout price, else outbid. **[charter
    default]** A new client against an old server still reads right during a rolling deploy, at no
    cost.
14. **Keys.** Both new codes spend the bid's Idempotency-Key, as every 400 refusal does today
    (`keepsBidKey` false; FS-49Z37 req 22–23, ADR-0027): the next press sends a new key.
15. **Nothing else in the client changes.** The bid box's own pre-send checks (below minimum, at
    or above buyout, not enough gold) and every other `bidFailure` row are unchanged.

### Rollout

16. **marketplace-service ships last.** api-gateway (built with the new `common/errcode` registry)
    and game-client go out first or together; marketplace-service after both. Otherwise an old
    gateway, not knowing the reasons, answers `400 · FAILED_PRECONDITION`, which the client reads
    as "Not enough gold" or "This auction has ended"; and an old client shows the bare problem
    detail for a code it doesn't know. (Derived from the code while verifying the charter, not a
    charter decision.)

## User Stories

1. As a bidder who was outbid while typing, I want to be told the new minimum, so that I can bid again at the right amount.
2. As a bidder who typed an amount at or above the buyout price on a stale page, I want to be pointed at Buy out, so that I pay the buyout the right way.
3. As a bidder, I want the bazaar to tell me the server's reason, not its guess, so that the message matches what actually happened.
4. As a bidder refused as too low, I want the box to follow the fresh minimum, so that I don't have to retype it.
5. As a bidder refused as too low, I want the message decided by the server's code and not by the re-read listing, so that I'm never told the wrong reason.
6. As a bidder refused at the buyout price, I want the answer at once without a page reload, so that the refusal is fast.
7. As a bidder, I want no gold held after either refusal, so that my purse is unchanged by a refused bid.
8. As a bidder who presses Bid again after either refusal, I want it sent as a new bid, so that the spent key never answers 409.
9. As a bidder whose refused bid's hold took long to release, I want the price refusal anyway, not a 503, so that I know what to change.
10. As a bidder who sent a zero or negative amount by hand, I want the usual validation answer, so that a malformed request is still called malformed.
11. As a bidder on a new client while an old server is still running, I want the right message, so that a rolling deploy doesn't confuse me.
12. As the client, I want to route on a stable code, so that refusals are told apart without reading the listing.
13. As the client, I want the old `VALIDATION_FAILED` handling kept, so that a server without these codes is still read correctly.
14. As the gateway, I want to pass the refusals through as registered codes, so that the owning service decides the rule and the edge only carries it.
15. As marketplace, I want the price rules to name their refusal, so that the wire says which rule refused the bid.
16. As marketplace, I want the domain still free of `errcode`, so that the transport mapping stays in the handler.
17. As a contract reader, I want the place-bid description to list these refusals, so that I can find every code it answers in one place.
18. As an operator, I want the contract change confirmed non-breaking by oasdiff, so that the release isn't gated by surprise.
19. As an operator, I want the deploy order written down, so that marketplace isn't shipped ahead of the gateway that understands its codes.

## Acceptance Criteria

- [ ] `common/errcode`: `BID_TOO_LOW` and `BID_AT_OR_ABOVE_BUYOUT` are registered; `Refuse` of each crosses gRPC as `FailedPrecondition` and `RefusalReason` reads it back (`refusal_test.go` table rows).
- [ ] Marketplace `mapError`: `ErrBidTooLow` → `FailedPrecondition` + reason `BID_TOO_LOW`; `ErrBidAtOrAboveBuyout` → `FailedPrecondition` + reason `BID_AT_OR_ABOVE_BUYOUT`; `ErrInvalidAmount` and `ErrBuyoutAmountMismatch` still `InvalidArgument`.
- [ ] Marketplace handler: a bid at the buyout price is refused with `BID_AT_OR_ABOVE_BUYOUT`, no bid is recorded, and the hold is released (today's `TestPlaceBid_AtBuyoutPriceIsInvalidArgumentAndReleasesTheHold`, updated); a bid not above the leader is refused with `BID_TOO_LOW`, no bid recorded, hold released.
- [ ] Gateway: place-bid answers `400 · BID_TOO_LOW` and `400 · BID_AT_OR_ABOVE_BUYOUT` (rows in `TestPlaceBid_MarketplaceRefusalsGoThroughTheSeam`); a bare `InvalidArgument` still answers `400 · VALIDATION_FAILED`.
- [ ] Gateway: the place-bid description names both codes; `make openapi && make client` regenerated `openapi.yaml` and `schema.d.ts`; oasdiff reports no breaking change (result noted on the issue).
- [ ] Client: `BID_TOO_LOW` → re-read → `outbidMessage(fresh.minimumBid)`, also when the bid amount is at or above the re-read buyout price; a failed re-read → `BROWSE_UNREACHABLE`; `resetTouched` is called before the re-read.
- [ ] Client: `BID_AT_OR_ABOVE_BUYOUT` → `BID_AT_BUYOUT`, no re-read.
- [ ] Client: `VALIDATION_FAILED` keeps today's re-read-and-infer behavior; every other `bidFailure` row is unchanged.
- [ ] Client: `keepsBidKey` is false for both new codes.
- [ ] Tests pass in common, marketplace-service, api-gateway and game-client (tsc, vitest, lint).

## Edge States

- **Too low and at the buyout at once.** Can't happen: the contending bid is always below the buyout price, so an amount not above it is below the buyout too (Req 4).
- **Refused under the lock after the hold was placed.** The advisory read let the bid through and the locked write refused it on price: the hold is released and the code answered (Req 5). If the release outlasts the 3 s wait, the answer is still the price refusal, not a 503.
- **Refused as too low, then the re-read fails.** The box shows `BROWSE_UNREACHABLE` (Req 11), as the `VALIDATION_FAILED` path does today.
- **Refused as too low, and the fresh minimum is at or above the buyout price.** The outbid message names the fresh minimum (Req 11); the bid box's own check then blocks any amount at or above the buyout with `BID_AT_BUYOUT` before sending.
- **Refused at the buyout, page still stale.** No re-read; the at-buyout message points the bidder at Buy out (Req 12). The Buy out action's own price check is FS-49Z37's.
- **Listing ended between the bid and the answer.** Unchanged: the ended refusal is `FAILED_PRECONDITION` and the bazaar says the auction has ended.
- **Capped bidder sends a too-low bid.** The withdrawal cap is checked first (FS-ZE43K), so the answer is `BID_WITHDRAW_LIMIT_REACHED`.
- **Keyed resend of a recorded bid.** A replay returns success before the price rules run, so a resend never gets a price refusal.
- **New client, old server.** The server answers `VALIDATION_FAILED`; the client re-reads and infers, as today (Req 13).
- **Old gateway, new marketplace.** The gateway doesn't know the reasons and answers `400 · FAILED_PRECONDITION`; the client says "Not enough gold" or "This auction has ended". Avoided by Req 16's order.
- **Old client, new server.** An unknown code falls to the problem detail ("Bad Request"). Avoided by Req 16's order.
- **Amount ≤ 0 by hand.** The gateway refuses it as `422 · VALIDATION_FAILED` before marketplace; a direct gRPC caller gets `InvalidArgument` (Req 6).
- **Unauthenticated or unverified bidder.** Unchanged: refused before the price rules (`401` / `400 · EMAIL_UNVERIFIED`).

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| place-bid (existing) | `POST /api/marketplace/listings/{listing_id}/bids` | unchanged | unchanged | unchanged (`201`) | adds `400 · BID_TOO_LOW` (the amount is below the start price, or not above the contending bid) and `400 · BID_AT_OR_ABOVE_BUYOUT` (the amount is at or above the listing's buyout price); `400 · VALIDATION_FAILED` no longer answers those two cases and stays for a non-positive amount reaching marketplace; all other rows unchanged (`400 · BID_WITHDRAW_LIMIT_REACHED`, `400 · EMAIL_UNVERIFIED`, `400 · FAILED_PRECONDITION`, `403 · FORBIDDEN`, `404 · NOT_FOUND`, `409 · CONFLICT`, `409 · ALREADY_EXISTS`, `422 · VALIDATION_FAILED`, `503 · SERVICE_UNAVAILABLE`) |
| gRPC `PlaceBid` (existing) | marketplace | unchanged | unchanged | unchanged | `ErrBidTooLow`: `InvalidArgument` → `FailedPrecondition` + reason `BID_TOO_LOW`; `ErrBidAtOrAboveBuyout`: `InvalidArgument` → `FailedPrecondition` + reason `BID_AT_OR_ABOVE_BUYOUT`; `ErrInvalidAmount` stays `InvalidArgument` |

New registered domain codes: `BID_TOO_LOW`, `BID_AT_OR_ABOVE_BUYOUT`. No new endpoint, no proto change, no migration.

## Out of Scope

- A price check before `PlaceHold` (queued separately, after the open auction branches merge).
- The old hold kept when a bidder raises their own bid.
- Splitting `FAILED_PRECONDITION` into not enough gold vs ended.
- A registered code for the buyout amount mismatch (`ErrBuyoutAmountMismatch` stays `InvalidArgument` → `VALIDATION_FAILED`).
- Carrying the current minimum bid in the refusal (Req 7).
- Removing the client's `VALIDATION_FAILED` fallback (Req 13).
- Any change to the bid rules themselves, the bid box's pre-send checks, or the copy of either message.
- **Merge note:** other unmerged branches also touch `common/errcode/errcode.go`, marketplace `grpc/handler.go` (`ownRefusals`, `mapError`), api-gateway `typed.go` (place-bid description), `bid.ts`, and the generated `openapi.yaml` / `schema.d.ts`; regenerate the generated files rather than hand-merging them.
