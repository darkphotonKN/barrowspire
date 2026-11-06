# FS-S109X: Outbid withdrawals don't count toward the bid withdrawal cap

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Only leading-bid withdrawals count toward the cap"; `game-client/SPECIFICATION.md` "### Marketplace" → "Withdraw confirm says whether it counts" → this FS · Related ADRs: [ADR-0055](../adr/0055-only-a-withdrawal-of-a-leading-bid-counts-toward-the-bid-withdrawal-cap.md) (the decision this implements), [ADR-0052](../adr/0052-a-member-who-withdrew-three-bids-on-a-listing-cannot-bid-on-it-again.md) (the cap it amends), [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (promotion, the loop), [ADR-0029](../adr/0029-an-outbid-bid-may-be-withdrawn.md) (outbid withdrawal), [ADR-0048](../adr/0048-a-leading-bid-is-locked-in-for-the-auctions-final-30-minutes.md) (final-30-minute leader lock, unchanged), [ADR-0054](../adr/0054-a-member-already-leading-a-listing-cannot-bid-on-it-again.md) (a leader cannot bid again; place-bid check order, unchanged) · Related FS: [FS-ZE43K](ZE43K-bid-withdrawal-cap.md) (the shipped cap whose counting rule (Req 2) and client warning (Req 13) this changes), [FS-EYQ8K](EYQ8K-my-bids.md) (My bids and the withdraw confirm) · Vocabulary: [`marketplace-service/CONTEXT.md`](../../game-server/marketplace-service/CONTEXT.md) (*bid withdrawal cap*, *leading withdrawal*, *outbid withdrawal*) · Promoted 2026-11-05 under Nick's charter "outbid withdraw free". **[charter default]** marks a default Claude proposed and Nick approved in the charter. Every item is **(not challenged)**: no challenge-me ran against this scope.

## Summary

Withdrawing a bid after it has been outbid no longer counts toward the bid withdrawal cap. Only a
*leading withdrawal* counts: withdrawing a bid that is WINNING at that moment, which promotes the
runner-up and can drop the price (ADR-0028). A bidder in a bidding war can therefore withdraw each
outbid bid to get its gold back and keep bidding. The cap still stops the bid-then-withdraw loop it
was written for, and the withdraw confirm in My bids says which kind of withdrawal the member is
about to make.

## Requirements

### Marketplace: what counts

1. **Only leading withdrawals count.** `Listing.WithinBidWithdrawalCap(memberID)` counts the
   member's bids on the listing that are `CANCELLED` **and** were withdrawn while leading. A bid
   withdrawn while `OUTBID` never counts. The limit, the refusal and everything else in FS-ZE43K
   stay the same: 3 (`bidWithdrawalCap`), `ErrBidWithdrawLimitReached` /
   `BID_WITHDRAW_LIMIT_REACHED`, withdrawing never refused, buyout not limited, decided under
   the lock after the replay checks and asked again before the hold, no grandfathering.
   **[charter default]** (D1) Only a leading withdrawal drives the ADR-0028 loop; an outbid one
   changes no price and promotes nobody (ADR-0055).
2. **Status at the moment of withdrawal decides.** A withdrawal is leading when the bid's status
   is `WINNING` at the moment `Listing.WithdrawBid` turns it `CANCELLED`, the same `wasLeading`
   the method already computes for ADR-0048's lock and ADR-0028's promotion. A bid promoted back
   to `WINNING` and then withdrawn counts. A bid that once led and is withdrawn after being
   outbid doesn't. A sole bid withdrawn while `WINNING`, with no runner-up to promote, still
   counts. **[charter default]** (D2) One rule, read from the state the write actually changes.
3. **Recorded on the bid.** The `Bid` entity carries `withdrawnWhileLeading` (false on every new
   bid). `WithdrawBid` sets it to `wasLeading` in the same aggregate change that makes the bid
   `CANCELLED`, so the two always reach the table in one write. Only `WithdrawBid` sets it; no
   other transition reads or writes it. It shows up on `BidSnapshot` and is accepted by
   `BidReconstituteParams` (as `WithdrawnWhileLeading`). No new bid status; the bid FSM is
   unchanged. **[charter default]** (D3) A new status would touch every status switch and the
   client's status labels for a fact only the cap reads.
4. **No other withdraw rule changes.** The final-30-minute leader lock (ADR-0048), promotion
   (ADR-0028), the outbid withdrawal itself (ADR-0029), ALREADY_LEADING (ADR-0054), buyout and
   place-bid's check order are untouched. **[charter default]** Bounds of the charter.

### Marketplace: storage

5. **Column.** A new migration pair `game-server/marketplace-service/migrations/000012_bid_withdrawn_while_leading.{up,down}.sql`
   adds `bids.withdrawn_while_leading BOOLEAN NOT NULL DEFAULT false`. The `bids_status_check`
   constraint is untouched. No existing migration is edited. Down drops the column.
   **[charter default]** (D3, D4) New numbered pair, never an edit (repo rule).
6. **Backfill.** The up migration sets `withdrawn_while_leading = true` on every existing
   `CANCELLED` bid. **[charter default]** (D4) Old withdrawals never recorded whether they led,
   so they all keep counting; nothing is live yet, so this costs nobody anything.
7. **Repository round trip.** `listing_repository.go` reads the column in both bid loads
   (`FindByID`, `Update`) and passes it through `reconstitute`. The bid status update
   (`updateBids`, the unnest UPDATE) writes it with the status: `diffListing` already emits a bid
   update whenever the status changes, and a withdrawal always changes it. A new bid's INSERT
   writes `false`, or leaves the column out and takes the default; either way a new bid is never
   stored as a counted withdrawal. **[charter default]** (D3) Same write as the withdrawal.

### Gateway

8. **Descriptions.** In `api-gateway/internal/gateway/listing/typed.go`, the place-bid
   description's `BID_WITHDRAW_LIMIT_REACHED` entry reads as "3 or more withdrawals of a leading
   bid" on this listing, and adds that withdrawing an outbid bid never counts. The withdraw-bid
   description adds that withdrawing a leading bid counts toward the bid withdrawal cap (after 3
   on one listing, place-bid answers `400 · BID_WITHDRAW_LIMIT_REACHED`) and withdrawing an
   outbid bid doesn't. No request, response, status or code changes. `openapi.yaml` and the
   generated client are regenerated with `make openapi && make client`, never hand-edited, and
   oasdiff reports no breaking change. **[charter default]** (D8) Description-only.
9. **Stale comments.** The `BidWithdrawLimitReached` comment in `common/errcode/errcode.go`
   ("has withdrawn 3 or more bids") and the seam-table comment in `typed_test.go` are reworded to
   say leading withdrawals. Comments only; the code and its registration don't change.

### Client

10. **Outbid confirm.** `withdrawConfirmText` (`game-client/src/marketplace/withdrawBid.ts`) for an
    `OUTBID` bid (status matched case-insensitively, as today) drops FS-ZE43K's
    three-withdrawals warning and ends with "Withdrawing an outbid bid doesn't count toward the
    limit." In full: "Withdraw your bid of 75 gold? Your gold is returned. Withdrawing an outbid
    bid doesn't count toward the limit." **[charter default]** (D7) The member shouldn't be warned
    about a limit this act can't reach.
11. **Leading confirm.** For a `WINNING` bid the confirm is unchanged: "Withdraw your bid of
    1,200 gold? The next highest bid takes the lead. After three withdrawals on one auction, you
    can't bid on it again." **[charter default]** (D7) This is the withdrawal the cap counts.
12. **No API change on the client.** The confirm reads the status My bids already has; the
    client still isn't told the member's count. The `BID_WITHDRAW_LIMIT_REACHED` refusal copy
    (FS-ZE43K Req 12) is unchanged. **[charter default]** (D7)

## User Stories

1. As a bidder in a bidding war, I want to withdraw my outbid bid to get its gold back without it counting against me, so that I can keep bidding with that gold.
2. As a bidder who has withdrawn several outbid bids on one auction, I want to still be able to bid on it, so that competing honestly never locks me out.
3. As a bidder about to withdraw an outbid bid, I want the confirm to tell me this withdrawal doesn't count toward the limit, so that I'm not put off by a warning that doesn't apply.
4. As a bidder about to withdraw a leading bid, I want the confirm to still warn me about the three-withdrawal limit, so that I know this one counts.
5. As a bidder whose bid was promoted back to the lead, I want to know that withdrawing it now counts, so that the rule matches what the confirm shows me at that moment.
6. As a bidder whose bid led once and was then outbid, I want withdrawing it to be free, so that its history doesn't count against me.
7. As a bidder who withdrew leading bids three times, I want my next bid refused with the same clear reason as before, so that the rule is consistent.
8. As a bidder, I want withdrawing to stay possible whatever my count is, so that my gold is never trapped.
9. As a bidder locked out by the cap, I want buyout to still work, so that I can still get the item.
10. As an honest bidder, I want the bid-then-withdraw-the-lead loop still bounded, so that a looping member can't flood the auction with bid rows.
11. As a seller, I want bidding wars on my listing not to be cut short by the cap, so that my item reaches its real price.
12. As marketplace, I want whether a withdrawal counts recorded in the same write as the withdrawal, so that the count can never disagree with what happened.
13. As marketplace, I want the cap to read a stored fact rather than reconstruct history, so that the count is the same on every load path and under the lock.
14. As marketplace, I want withdrawals recorded before this change to keep counting, so that nobody who really looped is released by the migration.
15. As marketplace, I want no new bid status, so that every status switch, the my-bids read and the client's labels stay as they are.
16. As the gateway, I want the place-bid and withdraw-bid descriptions to say only leading withdrawals count, so that the published contract describes the rule correctly.
17. As an operator, I want the change to be a new migration with a backfill, so that existing schema history stays intact and rollback is a column drop.

## Acceptance Criteria

- [ ] Domain: a member with 3 CANCELLED bids withdrawn while leading on the listing is refused (`ErrBidWithdrawLimitReached`); with 3 CANCELLED bids withdrawn while outbid, the bid is placed; with 2 leading + any number of outbid withdrawals, the bid is placed.
- [ ] Domain: `WithdrawBid` of a WINNING bid leaves it CANCELLED with `WithdrawnWhileLeading` true on its snapshot; of an OUTBID bid, CANCELLED with it false; a new bid's snapshot has it false.
- [ ] Domain: a bid outbid and then promoted back to WINNING (another member's leading withdrawal) and then withdrawn counts; a bid that led, was outbid, and is withdrawn while OUTBID doesn't.
- [ ] Domain: a sole WINNING bid withdrawn with no runner-up counts.
- [ ] Domain: the FS-ZE43K cap tests still pass with their CANCELLED fixtures marked withdrawn while leading (replay at the cap, cap before price rules, withdraw and buyout unrefused, LOST/FAILED/other members/other listings don't count).
- [ ] Repository (Postgres): withdrawing a WINNING bid via `Save` and via `Update` persists `withdrawn_while_leading = true`; an OUTBID withdrawal persists false; reloading the listing reproduces the flag; a newly inserted bid stores false.
- [ ] Migration: `000012` up adds the column NOT NULL DEFAULT false and sets it true on every pre-existing CANCELLED row (non-CANCELLED rows stay false); down drops it; `bids_status_check` unchanged; no earlier migration file changed.
- [ ] Use case: a member with only outbid withdrawals passes the advisory check and the hold is placed; a member with 3 leading withdrawals is still refused before `PlaceHold`.
- [ ] Gateway: place-bid and withdraw-bid descriptions carry Req 8's text; `make openapi && make client` regenerated `openapi.yaml` and `schema.d.ts`; oasdiff reports no breaking change; the seam-table row for `BID_WITHDRAW_LIMIT_REACHED` still maps to `400`.
- [ ] Client: `withdrawConfirmText` for `OUTBID` (any case) returns Req 10's exact text; for `WINNING`, Req 11's exact text (unchanged).
- [ ] Tests pass in marketplace-service, api-gateway, common and game-client.

## Edge States

- **Promoted, then withdrawn.** A's 100 is OUTBID; B withdraws its leading 110; ADR-0028 promotes A's 100 to WINNING; A withdraws it. B's withdrawal counts for B, and A's counts for A (Req 2).
- **Outbid while the withdraw is in flight.** The withdraw use case loads with `FindByID` and writes with OCC `Save`, retrying on a version conflict. If C's higher bid confirms between A's load and A's save, A's save conflicts, the retry reloads A's bid as OUTBID, and the withdrawal doesn't count. If A's save lands first, A withdrew a leading bid and it counts. The committed write decides, since `wasLeading` is computed on the aggregate that gets saved.
- **Leading withdrawal in the final 30 minutes.** Still refused by ADR-0048 (`ErrLeadingBidLocked`); nothing is written and nothing counts.
- **PENDING bid.** Not withdrawable (FS-EYQ8K offers only WINNING and OUTBID; the FSM refuses), so there is no third kind.
- **Seller withdraws the listing.** Live bids become LOST; the flag stays false and they never count (unchanged).
- **Advisory read stale in the permissive direction.** The member's third leading withdrawal lands between the use case's read and its write: the hold is placed, the locked check refuses, the hold is released (FS-ZE43K Req 7, unchanged).
- **Advisory read stale in the strict direction.** Still impossible: a counted withdrawal is CANCELLED, which is terminal, and the flag is never cleared.
- **Two accounts alternating outbid-then-withdraw.** Neither is capped, and the bid rows grow. Each round raises the price by at least 1, up to the buyout price where one is set, and every bid needs held gold. This is the cost ADR-0055 accepts.
- **Pre-migration CANCELLED rows.** All count (Req 6), including ones that were in fact outbid withdrawals.
- **Rollback of the migration.** Down drops the column; code that still reads it would fail to load bids, so the code goes back before the migration does (normal order).

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| place-bid (existing) | `POST /api/marketplace/listings/{listing_id}/bids` | unchanged | unchanged | unchanged (`201`) | unchanged; `400 · BID_WITHDRAW_LIMIT_REACHED` now means 3 or more *leading* withdrawals on this listing (description only) |
| withdraw-bid (existing) | `DELETE /api/marketplace/listings/{listing_id}/bids/{bid_id}` | unchanged | none | unchanged (`204`) | unchanged; description adds which withdrawals count toward the cap |
| gRPC `PlaceBid`, `WithdrawBid` (existing) | marketplace | unchanged | unchanged | unchanged | unchanged |

No new code, no proto change, no response-shape change.

## Out of Scope

- An "X gold still held" note on Outbid rows in My bids.
- Releasing a member's older OUTBID holds automatically when they rebid (a place-bid TCC change).
- A minimum bid increment above 1 gold.
- Alt accounts (each account still has its own count; ADR-0052, ADR-0055).
- Telling the client a member's current count, or hiding the bid form in advance (FS-ZE43K Out of Scope, unchanged).
- Changing the cap's number, its refusal copy, or any other withdraw rule (final-30-minute lock, promotion, buyout, ALREADY_LEADING).
- Loading only live bids into the listing aggregate (ADR-0052's deferred optimisation).
- Any wallet, items, settlement or proto change.
