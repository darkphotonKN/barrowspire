# FS-ZE43K: Bid withdrawal cap per listing

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Bid withdrawals capped per listing"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Withdrawal-cap refusal on place-bid"; `game-client/SPECIFICATION.md` "### Marketplace" → "Explain the bid withdrawal cap" → this FS · Related ADRs: [ADR-0052](../adr/0052-a-member-who-withdrew-three-bids-on-a-listing-cannot-bid-on-it-again.md) (the decision this implements), [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (the promotion that makes the loop), [ADR-0029](../adr/0029-an-outbid-bid-may-be-withdrawn.md), ADR-0048 (final-30-minute leader lock; unmerged branch), [ADR-0024](../adr/0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) · Related FS: [FS-EYQ8K](EYQ8K-my-bids.md) (withdraw from My bids), [FS-49Z37](49Z37-marketplace-sale-actions.md) (bid refusals in the bazaar), [FS-V6SFK](V6SFK-signup-hardening.md) (gated marketplace writes) · Vocabulary: [`marketplace-service/CONTEXT.md`](../../game-server/marketplace-service/CONTEXT.md) (*bid withdrawal cap*) · Promoted 2026-11-05 under Nick's charter "bid withdrawal cap". **[charter default]** marks a default Claude proposed and Nick approved in the charter.

> **Amended 2026-11-05** after code review round 1, before ship: the merge note in Out of Scope
> no longer folds the cap into `feat/marketplace-seller-cannot-bid`'s `CanPlaceBid` (that check
> runs before the replay checks, so folding would refuse a keyed resend at the cap and break
> Req 5–6 and User Story 9), and Req 9 / User Story 17 no longer call retuning the limit a
> one-line change (the gateway description and the client copy name the number too). Each
> corrected item says *(Amended 2026-11-05; was: …)*. No behaviour changes.

## Summary

A member who has withdrawn three bids on one listing can no longer bid on that listing. Placing a
fourth bid is refused with `400 · BID_WITHDRAW_LIMIT_REACHED` before any gold is held. Withdrawing
is never refused, and buying out is not limited. This bounds the bid-then-withdraw loop that ADR-0028's
promotion makes free, and that otherwise grows a listing's bids, and the work every later
operation on it does, without limit.

## Requirements

1. **The rule.** Placing a bid on a listing is refused when the bidding member already has **3 or
   more** bids on that listing in status `CANCELLED`. **[charter default]** Only the next bid is
   limited, so no member's gold is ever trapped (ADR-0052).
2. **What counts.** Only that member's bids on that listing whose status is `CANCELLED`, the
   status a bidder's own withdrawal sets. Bids in any other status never count, including `LOST`
   (a settlement rollback or a seller withdrawing the listing) and `FAILED`. Withdrawals on other
   listings never count: the cap is per listing. **[charter default]** CANCELLED is the bidder's
   own act; the loop is per listing.
3. **Withdrawing is never refused by the cap.** `WithdrawBid` is unchanged. A member with several
   live bids can withdraw all of them, even if that takes their count past 3. **[charter default]**
   Refusing a withdrawal would trap gold behind a bid the member wants out of.
4. **Buyout is not limited.** `Buyout` / `CanBuyout` are unchanged. **[charter default]** A buyout
   ends the auction and isn't part of the loop; refusing a paying buyer has no benefit.
5. **Decided under the row lock.** `Listing.PlaceBidWithID` applies the cap inside the listing's
   `repo.Update` closure, **after** its two replay checks (the bid id already on the listing; the
   member's idempotency key already used), so a keyed resend of a bid that was recorded before the
   member reached the cap still succeeds as a replay. The cap is checked before the price rules.
6. **Asked before the hold.** The place-bid use case asks the same rule on its existing unlocked
   read, after its `HasBid(bidID)` replay shortcut and before `PlaceHold`, so a capped member's
   bid freezes no gold and starts no ReleaseHold workflow. This check is advisory; Requirement 5's
   is authoritative. **[charter default]** Holding then releasing is exactly the cost the loop
   imposes.
7. **A definite refusal.** The cap's domain error is listed in the use case's `bidRejected` set, so
   a refusal found under the lock (the advisory read was stale) releases the hold at once rather
   than being retried as an unknown outcome and answered 503.
8. **Wire code.** The refusal crosses gRPC as `FailedPrecondition` with the registered reason
   `BID_WITHDRAW_LIMIT_REACHED` (registered in `common/errcode` `domainCodes`; marketplace's
   `mapError` turns the domain sentinel into the refusal, and the domain does not import
   `errcode`). The gateway passes it through as `400 · BID_WITHDRAW_LIMIT_REACHED`. **[charter
   default]** The same mechanism as `ITEM_WORN`.
9. **The constant.** The limit, 3, is one named constant in the marketplace domain
   (`bidWithdrawalCap`); the domain rule reads only that constant. Tuning, not contract.
   **[charter default]** Retuning it also means updating the number in the place-bid operation's
   gateway description (then `make openapi && make client`) and in the client's withdraw-confirm
   copy (Req 13, "three"). *(Amended 2026-11-05; was: "The limit, 3, is one named constant in the
   marketplace domain. Tuning, not contract.", which left the other two places unnamed.)*
10. **No grandfathering.** A member already at or past 3 withdrawals on a live listing when this
    ships is refused like anyone else. **[charter default]**
11. **Gateway docs.** The place-bid operation's description documents `400 ·
    BID_WITHDRAW_LIMIT_REACHED`. No request or response shape changes. `openapi.yaml` and the
    generated client are regenerated, never hand-edited.
12. **Client: the refusal.** When place-bid answers `400 · BID_WITHDRAW_LIMIT_REACHED`, the bid
    form shows: "You've withdrawn too many bids on this auction to bid on it again." No re-read is
    needed. **[charter default]**
13. **Client: the warning.** The withdraw confirm in My bids adds: "After three withdrawals on one
    auction, you can't bid on it again." The client is not told the member's current count; no API
    change. **[charter default]**

## User Stories

1. As a bidder, I want to keep my right to withdraw a bid, so that my gold is never trapped by an anti-abuse rule.
2. As a bidder who withdrew once or twice, I want to keep bidding normally, so that changing my mind occasionally costs me nothing.
3. As a bidder, I want to know before I withdraw that three withdrawals on one auction lock me out of it, so that I'm not surprised.
4. As a bidder who has withdrawn three times, I want a clear reason when my next bid is refused, so that I don't think the site is broken.
5. As a bidder who has withdrawn three times, I want no gold held for a bid that will be refused, so that my balance isn't frozen even briefly.
6. As a bidder who has withdrawn three times on one auction, I want to bid normally on every other auction, so that the cap is local.
7. As a bidder locked out of bidding, I want to still be able to buy the item out, so that I can still get it at its buyout price.
8. As a bidder whose bids were cancelled because the seller withdrew the listing, I want those not to count against me, so that someone else's action doesn't limit me.
9. As a bidder who resends a bid after a network error, I want the resend recognised as the same bid even if I've since reached the cap, so that I'm not told my recorded bid was refused.
10. As a bidder with several live bids on one auction, I want to withdraw all of them, so that I can leave entirely.
11. As an honest bidder, I want a looping bidder unable to flood the auction with bid rows, so that bidding stays fast.
12. As a seller, I want my listing protected from a loop that slows every operation on it, so that my auction and its settlement aren't degraded.
13. As marketplace, I want the cap decided under the listing's row lock, so that a bid racing a third withdrawal resolves the same way every time.
14. As marketplace, I want a capped bid refused before the hold, so that the loop's cost (a hold plus a ReleaseHold workflow) is gone.
15. As marketplace, I want a refusal found under the lock to release its hold immediately, so that a stale advisory read never strands gold or answers 503.
16. As the gateway, I want the refusal passed through as a registered code, so that the client can tell it from other refusals.
17. As an operator, I want the rule to read the limit from one constant, so that retuning it is one domain change plus the two places that name the number to members (the gateway description, then `make openapi && make client`, and the client's "three"; Req 9). *(Amended 2026-11-05; was: "I want the limit in one constant, so that tuning it is a one-line change.")*

## Acceptance Criteria

- [ ] Domain: a member with 3 CANCELLED bids on the listing is refused (`ErrBidWithdrawLimitReached`); with 2, the bid is placed; another member's CANCELLED bids don't count; this member's CANCELLED bids on another listing don't count; LOST and FAILED bids don't count.
- [ ] Domain: a replay (same bid id, or the member's used idempotency key) still returns success with no new bid when the member is at the cap.
- [ ] Domain: `WithdrawBid` succeeds for a member already at or past the cap; `Buyout` succeeds for a member at the cap.
- [ ] Domain: the cap is checked after the replay checks and before the price rules (a too-low bid from a capped member gets the cap refusal).
- [ ] Use case: a capped member's bid makes no `PlaceHold` call and starts no release; a keyed resend of a recorded bid at the cap returns success with no hold.
- [ ] Use case: a cap refusal found under the lock (advisory read stale) is a definite rejection: the hold is released and the error is not transient.
- [ ] gRPC: the refusal is `FailedPrecondition` with `errcode.RefusalReason` = `BID_WITHDRAW_LIMIT_REACHED`.
- [ ] Gateway: place-bid answers `400 · BID_WITHDRAW_LIMIT_REACHED` (seam table row); the description documents it; `make openapi && make client` regenerated; oasdiff reports no breaking change.
- [ ] Client: `bidFailure` maps `BID_WITHDRAW_LIMIT_REACHED` to the Req 12 copy; other refusals unchanged.
- [ ] Client: the withdraw confirm carries the Req 13 line for both a leading and an outbid bid.
- [ ] Tests pass in marketplace-service, api-gateway, common and game-client.

## Edge States

- **A bid races the member's third withdrawal.** Both write under the listing's row lock (bid via `repo.Update`; withdraw via OCC `Save`, retried on version conflict). Whichever lands second sees the other: a bid that commits first is placed, then withdrawn; a withdrawal that commits first makes the bid refused under the lock (Req 5), and its hold is released (Req 7).
- **Several live bids withdrawn together.** A member with live bids withdraws each of them; none is refused, and the count can end above 3 (Req 3). Their next bid is refused.
- **Keyed resend after the cap.** The use case's `HasBid(derived bidID)` shortcut returns success before the advisory check, and `PlaceBidWithID` returns success before the cap (Req 5–6). A resend of a pre-ADR-0027 bid recorded under a random id isn't found by `HasBid`, so the advisory check may refuse it; the original bid stands and no hold is placed. This is legacy-only and harmless.
- **Advisory read stale in the permissive direction.** The member's third withdrawal lands between the use case's read and its write: the hold is placed, the authoritative check refuses, and the hold is released (Req 7).
- **Advisory read stale in the strict direction.** Impossible: CANCELLED is terminal, so the count never falls.
- **Buyout after the cap.** Allowed (Req 4).
- **Seller withdraws the listing.** Bids become LOST and don't count; the listing is closed to bids anyway.
- **Member already past 3 when this ships.** Refused (Req 10).
- **Bids on other listings.** Unaffected (Req 2).

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| place-bid (existing) | `POST /api/marketplace/listings/{listing_id}/bids` | unchanged | unchanged | unchanged (`201`) | adds `400 · BID_WITHDRAW_LIMIT_REACHED` (member has withdrawn 3+ bids on this listing); all existing rows unchanged |
| gRPC `PlaceBid` (existing) | marketplace | unchanged | unchanged | unchanged | adds `FailedPrecondition` + reason `BID_WITHDRAW_LIMIT_REACHED` |

New registered domain code: `BID_WITHDRAW_LIMIT_REACHED`.

## Out of Scope

- Loading only live bids into the listing aggregate (an optimisation ADR-0052 defers).
- A cooldown, a per-member bid cap, a withdrawal fee, or raising the 1-gold minimum increment.
- Telling the client a member's current withdrawal count, or hiding the bid form in advance.
- Alt accounts (each account has its own count).
- Any wallet, items, settlement or migration change.
- **Merge note:** the `feat/marketplace-seller-cannot-bid` branch adds a read-only `Listing.CanPlaceBid` (seller check, then `AcceptsBidAt`) to the same use case. Whichever branch lands second keeps **two separate checks**, in this order: `CanPlaceBid` first, before the idempotency key is turned into a bid id; then the `HasBid(bidID)` replay shortcut; then `WithinBidWithdrawalCap`; then `PlaceHold`. The cap must not move into `CanPlaceBid`, because that runs before the replay shortcut, and a keyed resend of a bid recorded before the member reached the cap would then be refused instead of answered as its replay (Req 5–6, User Story 9). Both sentinels (`ErrSellerCannotBid`, `ErrBidWithdrawLimitReached`) stay in `bidRejected`. `TestPlaceBidUC_ResendOfARecordedBidAtTheCap_IsAReplay` and `TestPlaceBidWithID_BidWithdrawalCap_ReplayStillSucceeds` guard this order and must still pass after the merge. *(Amended 2026-11-05; was: "whichever lands second folds both rules into one check.")* Other unmerged branches also touch `common/errcode/errcode.go`, `grpc/handler.go` `mapError`, `typed.go` and the generated `openapi.yaml` / `schema.d.ts`; regenerate rather than hand-merge.
