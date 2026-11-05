# FS-XEDFF: Listing duration bounds and a per-seller listing cap

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Listing duration bounds"; `game-server/items-service/SPECIFICATION.md` "## Inventory" → "Per-seller listed-item cap"; `game-client/SPECIFICATION.md` "### Marketplace" → "Listing limit refusals" → this FS · Also touches (no thin line): `game-server/api-gateway` create-listing operation description + regenerated contract · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (domain refusals are 400 with a code, decided by the owning service) · Related FS: [FS-HBXZN](HBXZN-worn-items-not-listable.md) (items refusals passed through marketplace; the account lock and placement read on reserve), [FS-8EGFA](8EGFA-marketplace-web-page.md) (the List-a-relic form and its refusal copy), [FS-V7A5S](V7A5S-withdraw-a-listing.md) (withdrawal, the other half of this charter)

> Every decision marked **[charter default]** was proposed by Claude and approved by Nick in the
> charter "listing withdraw + listing limits" on 2026-11-05. None were run through challenge-me.
> Gaps the agent filled are marked **(agent default)**.

## Summary

A listing's length is bounded: it must end between one hour and seven days after it is
created, with five minutes of slack either way for the client's clock and the request's
latency. And a seller can have at most 20 items up for sale at once. Both are refused with
switchable codes, and the List-a-relic form explains them.

## Requirements

### A. Duration bounds (marketplace)

1. **One hour to seven days.** A new listing's duration, `endsAt − now` at the moment the
   seller asks to list, must lie in **[1 h − 5 min, 7 d + 5 min]**. Outside it the request is
   refused with a new domain error `ErrListingDurationOutOfRange`, sent as the registered refusal
   `LISTING_DURATION_OUT_OF_RANGE`. [charter default B1, B2]
2. **Checked when the seller lists, not when the listing is created.** The bound is applied in
   the ListItem path (`ReserveItemUC`, which already validates terms through `listing.NewListing`
   before any item is reserved). `CreateListingUC`, which runs later when `ItemReserved` arrives,
   keeps only today's rule (`endsAt` after now): a late event must not fail the one-hour minimum.
   The bound therefore lives in its own domain function (e.g. `listing.CheckDuration(now, endsAt)`)
   that `ReserveItemUC` calls, not inside `NewListing`. [charter default B1]
3. **The bounds are constants.** `MinListingDuration = 1 h`, `MaxListingDuration = 7 d`,
   `ListingDurationSlack = 5 min` in the listing domain: tuning, not contract.
4. **An end in the past keeps its error.** `endsAt` at or before now is still
   `ErrInvalidEndTime` (unchanged); the new error covers only "in the future but too soon or too
   late". (agent default: keep the existing mapping stable)

### B. At most 20 listed items per seller (items-service)

5. **Twenty.** `ReserveItem` refuses when the seller already has **20** of their item instances in
   status `LISTED` or `PENDING_SETTLEMENT`, with the registered refusal `LISTING_LIMIT_REACHED`.
   Nothing is written: no reservation, no `reserved_at`, no outbox row. [charter default B3]
6. **Counted under the account lock.** The count runs inside the reserve transaction, after
   `LockAccountTx` and before the conditional `UPDATE` (the order FS-HBXZN set), so two concurrent
   reserves cannot both pass at 19, and an item reserved but not yet a listing counts.
   [charter default B3]
7. **The cap is a constant.** `MaxListedItems = 20` in items-service, tuning not contract.
8. **Order of refusals.** Not found → 404 and not available / worn refusals keep their order;
   the cap is checked after the placement checks pass (a worn or unavailable item still answers
   its own code). (agent default)
9. **Marketplace passes it through.** The existing item-reserver path forwards a registered refusal
   reason unchanged (FS-HBXZN), so no marketplace mapping is added beyond registering the code.

### C. Contract and client

10. **errcode.** `LISTING_DURATION_OUT_OF_RANGE` and `LISTING_LIMIT_REACHED` are added to
    `common/errcode` and registered. [charter default B5]
11. **Gateway.** The create-listing operation's description documents both codes and the
    duration range; contract regenerated. No route or schema shape change.
12. **Client copy.** The List-a-relic form's `createListingFailureMessage` maps
    `LISTING_DURATION_OUT_OF_RANGE` → "A listing must last between 1 hour and 7 days." and
    `LISTING_LIMIT_REACHED` → "You already have 20 relics for sale. Wait for one to end, or
    withdraw one." The duration choices (1 h / 12 h / 24 h / 3 d) are unchanged; all lie in range.
    [charter default B4; agent default for exact copy]

## User Stories

1. As a seller, I want a typo'd end date refused, so that my item isn't locked for decades.
2. As a seller, I want a listing too short to settle refused up front, not lost after a "listed" reply.
3. As a seller choosing "1 hour", I want it accepted even though my request takes a moment to arrive.
4. As a seller, I want to know I've hit the 20-listing limit and what to do about it.
5. As a seller listing two items at once with 19 already up, I want exactly one to succeed.
6. As the marketplace, I want a listing event that arrives late to still create its listing.
7. As other players, I want one seller unable to flood the Bazaar or the listing pipeline.
8. As a client developer, I want both refusals as switchable codes.

## Acceptance Criteria

- [ ] Domain duration table: now+55m (inclusive edge) and now+7d+5m (inclusive edge) allowed; now+54m59s and now+7d+5m+1s → `ErrListingDurationOutOfRange`; now or earlier → `ErrInvalidEndTime` (unchanged).
- [ ] `ReserveItemUC` refuses an out-of-range duration before calling items (no reservation made).
- [ ] `CreateListingUC` with an `endsAt` only 30 min ahead at consume time still creates the listing (the bound is not re-applied).
- [ ] gRPC ListItem: out-of-range → FailedPrecondition with reason `LISTING_DURATION_OUT_OF_RANGE`; gateway → `400 · LISTING_DURATION_OUT_OF_RANGE`.
- [ ] items (DB-backed): with 19 LISTED/PENDING_SETTLEMENT items the 20th reserve succeeds and the 21st is refused `LISTING_LIMIT_REACHED` with nothing written; AVAILABLE / IN_RUN items don't count; two concurrent reserves at 19 → exactly one succeeds.
- [ ] A worn or unavailable item at the cap still answers its own code.
- [ ] Gateway: `400 · LISTING_LIMIT_REACHED` passes through create-listing; the operation documents both codes; contract regenerated.
- [ ] Client: both codes map to their copy; existing refusals unchanged.

## Edge States

- **Client clock skewed by more than 5 min.** Its "1 hour" may be refused. Accepted; the slack covers latency and ordinary drift.
- **Event delayed past the one-hour minimum.** Unaffected (Req 2).
- **Exactly at the cap after a withdrawal.** A withdrawn listing's item leaves LISTED only when its `ReturnItem` runs (FS-V7A5S); until then it still counts. Accepted.
- **Items listed before this FS beyond 20.** Not touched; the seller just can't add more until under 20.
- **Concurrent reserve across two items.** Serialized by the account lock (Req 6).

## API surface

| Surface | Change |
|---|---|
| gRPC `MarketplaceService.ListItem` | new refusal: FailedPrecondition, reason `LISTING_DURATION_OUT_OF_RANGE`; passes through `LISTING_LIMIT_REACHED` from items |
| gRPC `ItemsService.ReserveItem` | new refusal: FailedPrecondition, reason `LISTING_LIMIT_REACHED` |
| HTTP `POST /api/marketplace/listings` (create-listing) | new errors `400 · LISTING_DURATION_OUT_OF_RANGE`, `400 · LISTING_LIMIT_REACHED`; no shape change |

| errcode (new) | Meaning |
|---|---|
| `LISTING_DURATION_OUT_OF_RANGE` | endsAt is less than 1 h − 5 min or more than 7 d + 5 min away |
| `LISTING_LIMIT_REACHED` | the seller already has 20 items listed or settling |

## Out of Scope

- Withdrawing a listing (FS-V7A5S).
- Changing the client's duration choices, or a 7-day option.
- Per-seller caps that vary (by level, account age, …), or a listing fee.
- Any migration, settlement or wallet change.
