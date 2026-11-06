# FS-72KT8: A member already leading a listing cannot bid on it again

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "No bidding against your own lead"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Already-leading refusal on place-bid"; `game-client/SPECIFICATION.md` "### Marketplace" → "Explain a bid refused because you already lead" → this FS · Related ADRs: [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (promotion of the highest OUTBID bid, whose outcome this constrains), [ADR-0048](../adr/0048-a-leading-bid-is-locked-in-for-the-auctions-final-30-minutes.md) (final-30-minute leader lock), [ADR-0052](../adr/0052-a-member-who-withdrew-three-bids-on-a-listing-cannot-bid-on-it-again.md) (the withdrawal cap whose placement this copies), [ADR-0027](../adr/0027-place-bid-id-is-derived-from-the-callers-key.md) (a refused bid's key is spent), [ADR-0049](../adr/0049-a-refused-bid-answers-only-once-its-hold-is-back.md) (a refusal under the lock waits for its hold), [ADR-0001](../adr/0001-contract-layer.md) (a domain refusal is 400 with a domain code; the contract is generated) · Related FS: [FS-V74WE](V74WE-bid-price-refusal-codes.md) (same `ownRefusals` mechanism; this FS lands after it on the same branch), [FS-ZE43K](ZE43K-bid-withdrawal-cap.md) (the cap check this one sits beside), [FS-49Z37](49Z37-marketplace-sale-actions.md) (bid refusals in the bazaar), [FS-GKHYD](GKHYD-public-listing-privacy.md) (`own`, the viewer-relative pattern deliberately not reused here) · Vocabulary: [`marketplace-service/CONTEXT.md`](../../game-server/marketplace-service/CONTEXT.md) (*Leading*, added by this FS) · Promoted 2026-11-05 from Nick's charter "a member already leading a listing cannot bid on it again". **[charter default]** marks a default Claude proposed and Nick approved in the charter; none was run through challenge-me (not challenged).

## Summary

Today a member whose bid already leads a listing can bid on it again. The new bid leads, the old
one turns OUTBID and keeps its gold held, and the member pushes the price up against nobody but
themselves. In a local run on 2026-11-05 one bidder who raised their own lead six times had 1765
gold held. It also lets one account shield-bid: bid 100, bid 1000 on top of it, withdraw the 1000
before the final 30 minutes, and ADR-0028 promotes the account's own 100 back into the lead.

After this, a member who is leading is refused with `400 · ALREADY_LEADING` before any gold is
held, and the bazaar tells them they are already the highest bidder. They can still buy out. Bids
already on the books are left alone.

## Requirements

### The rule (`marketplace-service` domain)

1. **What leading means.** A member is *leading* a listing when the bid `findContendingBid()`
   returns (the highest WINNING or PENDING bid) is that member's. **[charter default]** It's the
   same bid the price rules already compare against. Counting PENDING also catches a quick second
   bid racing the first (Req 5).
2. **The refusal.** Placing a bid is refused with a new domain sentinel, `ErrAlreadyLeading`, when
   the bidding member is leading that listing. Nothing is recorded. **[charter default]**
3. **One read-only check, used twice.** The rule lives in one read-only `Listing` method that
   returns `ErrAlreadyLeading` or nil, in the style of `WithinBidWithdrawalCap` (the name is the
   implementer's). The use case asks it before the hold (Req 6), and `PlaceBidWithID` applies it
   again under the lock (Req 4).
4. **Placement under the lock.** In `Listing.PlaceBidWithID` the order becomes: bid id already on
   the listing (replay) → `CanPlaceBid` → the member's idempotency key already used (replay) →
   `WithinBidWithdrawalCap` → **the leading check** → the price rules. **[charter default]**
   - After both replay checks, so a keyed resend of the member's own leading bid is still answered
     as that bid and is never refused as already leading.
   - After the withdrawal cap, so a capped member keeps getting the cap refusal (FS-ZE43K).
   - Before the price rules, so a leader who sends an amount that is too low or at the buyout is
     told they lead, not that the price is wrong.
5. **A refusal under the lock is definite.** `ErrAlreadyLeading` is added to the place-bid use
   case's `bidRejected` set. A leading refusal found under the lock (the advisory read was stale,
   e.g. the member's own first bid landed in between) releases the hold at once and answers
   `ALREADY_LEADING`, including when the release outlasts the 3 s wait (ADR-0049). Leaving it out
   of `bidRejected` would retry the write and answer 503.
6. **Asked before the hold.** `PlaceBidUC.Handle` asks the leading check on its existing unlocked
   read, after the `HasBid(bidID)` replay shortcut and after `WithinBidWithdrawalCap`, before
   `PlaceHold`. A leader's bid therefore holds no gold and starts no release. Advisory; Req 4 is
   authoritative. **[charter default]**
7. **The domain stays free of `errcode`.** The sentinel is a plain `errors.New` in
   `domain/listing/errors.go`.

### Buyout and promotion

8. **A leader may buy out.** `CanBuyout` and `Buyout` are unchanged and never ask the leading
   check. **[charter default]** A buyout ends the auction; it is not bidding against yourself.
9. **Promotion is unchanged, and its outcome counts.** ADR-0028's promotion still runs when a
   leader withdraws. If it promotes the withdrawing member's own earlier OUTBID bid, that member is
   now leading and their next bid is refused. **[charter default]** One rule: are you leading
   now. To bid again they would have to withdraw that bid too, which counts toward the withdrawal
   cap (ADR-0052), and in the final 30 minutes a leading bid can't be withdrawn at all (ADR-0048).
10. **Existing bids are untouched.** No migration and no data repair. A listing that already
    carries one member's stacked bids keeps them, and they settle as today (the WINNING bid wins,
    the rest are released in settlement step 2). Only new bids are refused, including a new bid
    from a member whose legacy stack leads. **[charter default]**

### Wire (`common/errcode`, marketplace `grpc`)

11. **A registered code.** `AlreadyLeading Code = "ALREADY_LEADING"` in `common/errcode/errcode.go`,
    with a doc comment in the Marketplace block (what it refuses, that marketplace-service decides
    it, "Added for FS-72KT8"), listed in `domainCodes` under `// FS-72KT8`.
12. **Mapped through `ownRefusals`.** Marketplace `grpc/handler.go`'s `ownRefusals` gains
    `{listing.ErrAlreadyLeading, errcode.AlreadyLeading}`. It crosses gRPC as `FailedPrecondition`
    with an ErrorInfo whose reason is `ALREADY_LEADING`, the same `Refusal` transport FS-V74WE
    uses. **[charter default]**

### Gateway (`api-gateway`)

13. **Passed through as 400.** The gateway's existing registered-refusal path (`httperr`,
    `FailedPrecondition` + registered reason) answers `400 · ALREADY_LEADING`. No gateway mapping
    code changes.
14. **Documented and regenerated.** The place-bid operation's description adds `ALREADY_LEADING`
    to its `Refusals:` sentence (the member's own bid already leads; no gold is held; buyout is
    still allowed). `openapi.yaml` and `game-client/src/api/generated/` are regenerated with
    `make openapi && make client` in `game-server/api-gateway`, never hand-edited.
15. **Not a breaking change.** No request or response shape changes; the diff is the description
    only. oasdiff (`make gates`) is expected to report no breaking change, and the slice records
    what it actually reports. A code is added, none is removed or repurposed.

### Client (`game-client`)

16. **The message.** `bidFailure` maps `ALREADY_LEADING` to a new constant `BID_ALREADY_LEADING` =
    "You're already the highest bidder." No re-read of the listing. **[charter default]** The bid
    box shows it as an error note, like the other refusals.
17. **The key is spent.** `keepsBidKey` stays false for `ALREADY_LEADING` (it is a 400), so the
    next press mints a new key (FS-49Z37 req 22–23, ADR-0027).
18. **No advance warning.** The client is not told whether the viewer leads before they bid; the
    bid box's pre-send checks are unchanged. **[charter default]** See Out of Scope.

### Rollout

19. **marketplace-service ships last.** api-gateway (built with the new registry) and game-client
    go out first or together; marketplace-service after both. An old gateway doesn't know the
    reason and answers `400 · FAILED_PRECONDITION`, which the client reads as "Not enough gold"
    or "This auction has ended"; an old client shows the bare problem detail for an unknown code.
    Same order as FS-V74WE Req 16. (Derived from the gateway's `httperr` mapping, not a charter
    decision.)

## User Stories

1. As a leading bidder, I want a second bid refused, so that I don't push the price up against myself.
2. As a leading bidder, I want no gold held for a bid that is refused, so that my purse isn't frozen for nothing.
3. As a leading bidder, I want to be told I'm already the highest bidder, so that I understand why the bid didn't go through.
4. As a leading bidder, I want to keep the option to buy out, so that I can still end the auction at the buyout price.
5. As a bidder who has been outbid, I want to bid again normally, so that the rule only stops self-raising.
6. As a bidder who resends my leading bid after a network error, I want the resend answered as that same bid, so that I'm not told my own bid was refused.
7. As a bidder who presses Bid twice quickly with two different amounts, I want only the first to land and the second refused with no gold left held, so that a quick second press can't stack my bids.
8. As a bidder whose own earlier bid was promoted back after I withdrew my lead, I want to be told I'm leading, so that the rule is the same however I came to lead.
9. As a bidder with stacked bids from before this change, I want them to settle as they would have, so that nothing I already placed is changed under me.
10. As a leading bidder who sends a too-low amount, I want the leading refusal, not a price refusal, so that I get the reason that actually matters.
11. As a capped bidder who also leads, I want the withdrawal-cap refusal, so that the cap's message stays consistent.
12. As an honest bidder, I want another account unable to shield its own low bid behind a high one, so that the auction price reflects real competition.
13. As a seller, I want the price raised only by other bidders, so that the final price is a real market price.
14. As marketplace, I want the rule decided under the listing's row lock, so that two racing bids from one member resolve the same way every time.
15. As marketplace, I want a leading refusal found under the lock to release its hold and answer the refusal, so that a stale advisory read neither strands gold nor answers 503.
16. As marketplace, I want the domain to name the rule and the handler to map its code, so that the domain stays free of `errcode`.
17. As the gateway, I want to pass the refusal through as a registered code, so that the owning service decides and the edge only carries it.
18. As the client, I want to route on a stable code, so that the message never depends on reading the listing.
19. As a contract reader, I want the place-bid description to list `ALREADY_LEADING`, so that every code it answers is in one place.
20. As an operator, I want the contract change confirmed non-breaking by oasdiff, so that the release isn't gated by surprise.
21. As an operator, I want the deploy order written down, so that marketplace isn't shipped ahead of a gateway and client that understand its code.

## Acceptance Criteria

- [ ] Domain: a member whose WINNING bid leads is refused with `ErrAlreadyLeading` and no bid is added; a member whose PENDING bid is the contender is refused; a member who is OUTBID (another member leads) may bid; a member whose WINNING bid is outranked by another member's PENDING bid may bid.
- [ ] Domain: a replay (same bid id, or the member's used idempotency key) of the member's own leading bid still returns success with no new bid.
- [ ] Domain: order: a capped member who leads gets `ErrBidWithdrawLimitReached`; a leader sending an amount not above their own bid, or at or above the buyout, gets `ErrAlreadyLeading`; the seller still gets `ErrSellerCannotBid`; an ended listing still refuses as ended.
- [ ] Domain: a leader withdraws (before the final 30 minutes) and ADR-0028 promotes their own earlier bid → their next bid is refused; when another member's bid is promoted instead → their next bid is placed.
- [ ] Domain: `CanBuyout` / `Buyout` succeed for the leading member.
- [ ] Use case: a leading member's bid makes no `PlaceHold` call and starts no release; a keyed resend of the member's recorded leading bid returns success with no hold.
- [ ] Use case: a leading refusal found under the lock (advisory read shows the member not leading, the locked read shows them leading) is a definite rejection: the hold is released, the error is `ErrAlreadyLeading`, not transient.
- [ ] Use case: `bidRejected` lists `ErrAlreadyLeading`.
- [ ] `common/errcode`: `ALREADY_LEADING` is registered; `Refuse` crosses gRPC as `FailedPrecondition` and `RefusalReason` reads it back (`refusal_test.go` row).
- [ ] Marketplace `mapError`: `ErrAlreadyLeading` → `FailedPrecondition` + reason `ALREADY_LEADING` (handler test).
- [ ] Gateway: place-bid answers `400 · ALREADY_LEADING` (row in `TestPlaceBid_MarketplaceRefusalsGoThroughTheSeam`); the description names `ALREADY_LEADING`; `make openapi && make client` regenerated `openapi.yaml` and `schema.d.ts`; oasdiff reports no breaking change (result noted on the issue).
- [ ] Client: `bidFailure(apiError(400, "ALREADY_LEADING"), …)` → `{ message: BID_ALREADY_LEADING }`, no re-read; `keepsBidKey` false for it; every other `bidFailure` row unchanged.
- [ ] Existing tests that stack one member's bids on a listing are rewritten to use a second member where stacking isn't what they test; none is deleted to make the suite pass.
- [ ] Tests pass in common, marketplace-service, api-gateway and game-client (tsc, vitest, lint).

## Edge States

- **Keyed resend of the leading bid.** Both replay checks answer before the leading check (Req 4), and the use case's `HasBid` shortcut answers before its advisory check (Req 6): success, no new bid, no hold.
- **Two different bids from one member racing.** Neither advisory read sees the other, so both hold gold. The first write lands WINNING; the second, under the lock, finds the member leading, is refused, and its hold is released before the answer (Req 5, ADR-0049).
- **The member's own PENDING bid is the contender.** Leading (Req 1). In practice a PENDING bid is confirmed in the same write that records it, so this is the race above seen from inside the lock.
- **Another member's PENDING bid outranks the member's WINNING bid.** That member is the contender; this member is not leading and may bid, and must beat the PENDING amount.
- **Outbid, then bid again.** Allowed; the older OUTBID bid keeps its hold until settlement step 2, as today (Out of Scope).
- **Leader withdraws, someone else is promoted.** Not leading; may bid.
- **Leader withdraws, their own earlier bid is promoted.** Leading; refused (Req 9). Reachable when another member's outbid bid was withdrawn first, or from a legacy stack.
- **Leader in the final 30 minutes.** Can't withdraw (ADR-0048) and can't bid again; can buy out (Req 8).
- **Leader wants to raise in advance against a sniper.** Refused. They bid again once outbid. Proxy bidding is Out of Scope.
- **Capped and leading.** Cap refusal (Req 4).
- **Leader sends a too-low or at-buyout amount.** `ALREADY_LEADING` (Req 4), never `BID_TOO_LOW` / `BID_AT_OR_ABOVE_BUYOUT`.
- **Seller.** Refused as seller before the leading check (`CanPlaceBid` first); a seller never leads their own listing anyway.
- **Listing ended, bought out or withdrawn.** Refused by `CanPlaceBid` before the leading check, as today.
- **Legacy stacked bids.** Untouched; they settle as today (Req 10).
- **Old gateway, new marketplace / old client, new server.** See Req 19; avoided by the deploy order.
- **Unauthenticated or unverified bidder.** Unchanged: refused before the bid rules (`401` / `400 · EMAIL_UNVERIFIED`).

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| place-bid (existing) | `POST /api/marketplace/listings/{listing_id}/bids` | unchanged | unchanged | unchanged (`201`) | adds `400 · ALREADY_LEADING` (the member's own bid is the listing's leading bid; no gold is held); all existing rows unchanged, including FS-V74WE's `400 · BID_TOO_LOW` / `400 · BID_AT_OR_ABOVE_BUYOUT`, which a leader no longer receives |
| buyout (existing) | `POST /api/marketplace/listings/{listing_id}/buyout` | unchanged | unchanged | unchanged | unchanged: a leading member may buy out |
| gRPC `PlaceBid` (existing) | marketplace | unchanged | unchanged | unchanged | adds `FailedPrecondition` + reason `ALREADY_LEADING` |

New registered domain code: `ALREADY_LEADING`. No new endpoint, no proto change, no migration.

## Out of Scope

- Releasing a member's older OUTBID holds when they bid again (needs a change to the place-bid TCC).
- Proxy (maximum) bidding, or any way for a leader to raise in advance.
- A viewer-relative `leading` flag on listing reads, or hiding / disabling the bid box for a leader (would need proto + gateway + client, like `own` in ADR-0053).
- Re-reading the listing after `ALREADY_LEADING`.
- Repairing or collapsing bids already stacked by one member (Req 10).
- Alt accounts bidding against each other.
- Any change to buyout, withdraw-bid, promotion (ADR-0028), the withdrawal cap, or the price rules.
- **Merge note:** FS-V74WE (same branch, lands first) also edits `common/errcode/errcode.go`, `ownRefusals` in `grpc/handler.go`, the place-bid description in `typed.go`, `bid.ts`, and the generated `openapi.yaml` / `schema.d.ts`. Build on its result; regenerate the generated files rather than hand-merging them.
