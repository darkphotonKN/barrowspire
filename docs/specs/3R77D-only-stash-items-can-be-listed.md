# FS-3R77D: Only stash items can be listed

> Status: work-order · SPECIFICATION.md: `game-server/items-service/SPECIFICATION.md` "## Inventory" → "Only stash items reserved for listing"; `game-client/SPECIFICATION.md` "### Marketplace" → "Only listable stash relics offered for listing" → this FS · Also touches (no thin line, documentation of an unchanged mapping): `game-server/common/errcode` (one new registered code), `game-server/api-gateway` create-listing operation description + regenerated contract; `game-server/marketplace-service` gains pinning tests only, its pass-through is unchanged (FS-HBXZN R7) · Related ADRs: [ADR-0065](../adr/0065-only-items-in-the-stash-can-be-listed.md) (the rule and why), [ADR-0001](../adr/0001-contract-layer.md) (domain refusals are 400 with a code, decided by the owning service) · Supersedes in part: [FS-8EGFA](8EGFA-marketplace-web-page.md) req 25's second bullet ("LISTED and IN_ESCROW items are shown disabled, with a tag") and [FS-HBXZN](HBXZN-worn-items-not-listable.md) R13 and R15 (a worn relic shown disabled and tagged "Worn"; a status tag wins over it); neither FS is edited · Builds on: [FS-HBXZN](HBXZN-worn-items-not-listable.md) R1–R5 (the account lock, the placement read and the check order on reserve), R7 (marketplace passes items' refusals through), R16 (a failed loadout read marks nothing worn); [FS-XEDFF](XEDFF-listing-limits.md) R5–R8 (the listed-item cap, counted after the item checks); [FS-VPD8Y](VPD8Y-town-stash.md) R7 (purchases land in the stash), R8 (an unsold or withdrawn listing leaves `location` as it was), R10–R11 (a move takes the same account lock), R19 (equipping from the stash) · Vocabulary: [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md) (*item location*, *bag*, *stash*, *worn*)

> **Decision provenance.** Nick asked (2026-11-06): "可以限制放在倉庫的才能交易嗎 或是能辨識是放在倉庫"
> (can trading be limited to stash items, or can the stash be recognised). Offered options, he
> chose: "拍賣場只顯示倉庫的道具 正在賣的或是不能賣的都不用特別顯示" (the marketplace shows only
> stash items; items being sold or not sellable need no special display). The decisions below
> marked **(owner)** come from that choice and its brief; gaps the agent filled are marked
> **(agent default)**. Not run through challenge-me.

## Summary

A member can only put up for auction an item that sits in their town stash. items-service
refuses to reserve any other item with the new code `ITEM_NOT_IN_STASH`, so an API caller
cannot get round the rule. The List-a-relic picker on the web shows only the stash relics that
can be listed right now: in the stash, AVAILABLE and not worn. Everything else is simply left
out, with no tags, no greyed cards and no explanation. When nothing in the stash can be listed,
the picker says so plainly.

The stash becomes the trading place and the bag what a member carries into runs. Purchases
already land in the stash (FS-VPD8Y R7), so the two ends of a trade now meet there. Listings
of bag items made before this FS are left as they are.

## Requirements

### A. The refusal code (common/errcode)

1. **One new registered domain code, `ITEM_NOT_IN_STASH`** (`errcode.ItemNotInStash`): the item
   is not in the member's stash, so it cannot be listed. Named after the rule, recorded with this
   FS, and listed in `domainCodes`, so `Refuse` answers it as a refusal and the gateway passes it
   through as `400` (ADR-0001). **(owner: the code name; agent default: its registry comment)**

### B. Reserving refuses an item outside the stash (items-service)

2. **An item not in the stash is not reserved.** `ReserveItem` (gRPC) refuses an instance whose
   `location` is not `STASH` with `ITEM_NOT_IN_STASH`. Nothing is written: the instance stays
   AVAILABLE in the bag with no `listing_id` and no `reserved_at`, and no `ItemReserved` row is
   put in the outbox. **(owner)**
3. **The check uses the placement already read.** `ItemPlacementTx` already returns `location`
   beside status and worn, read under the seller's account lock (FS-HBXZN R3). No new query and
   no schema change.
4. **The first failing check answers, in this order:** no such instance or not the seller's →
   not found; status not AVAILABLE → `ITEM_NOT_AVAILABLE`; worn → `ITEM_WORN`; not in the stash
   → `ITEM_NOT_IN_STASH`; seller at the listed-item cap → `LISTING_LIMIT_REACHED`. Worn comes
   before not-in-stash because a worn item can carry either location (equipping from the stash is
   allowed, FS-VPD8Y R19), and "take it off" is the step that matters first. The cap stays last,
   after every item check, as FS-XEDFF R8 set it. **(agent default: the place of the new check)**
5. **The conditional reserve `UPDATE` is unchanged.** It gains no `location` predicate. Every
   write that changes an AVAILABLE instance's location (`MoveItemInstance`, and the item an equip
   displaces into the bag) takes the same account lock, so the placement read under the lock
   cannot go stale before the update. A location predicate there would only turn a lost race into
   `ITEM_NOT_AVAILABLE` instead of the true code. **(agent default)**
6. **The handler needs no change.** items' `ReserveItem` handler already answers any refusal as
   its `GRPCStatus()` (FS-HBXZN R5).

### C. The refusal reaches the seller (marketplace-service, api-gateway)

7. **marketplace-service is not changed.** Its item reserver and `mapError` pass any registered
   refusal from items through unchanged (FS-HBXZN R7). Test rows pin `ITEM_NOT_IN_STASH` in both,
   so the rule cannot silently fall back to `Internal`. marketplace does not check location
   itself: items owns the rule.
8. **The create-listing operation documents the refusal.** The `create-listing` description
   (`internal/gateway/listing/typed.go`) adds `ITEM_NOT_IN_STASH` to its "Refusals:" list. No
   change to `httperr`, the status list or any request or response field.
9. **The contract is regenerated, never hand-edited.** `make openapi && make client`; the
   description change, `game-server/api-gateway/openapi.yaml` and
   `game-client/src/api/generated/` are committed together (`docs/contract-guide.md`).

### D. The picker shows only what can be listed (game-client)

10. **Only listable stash relics are shown.** The List-a-relic picker (`pickerCards` in
    `src/marketplace/listRelic.ts`) makes a card only for an instance that has an id, whose
    `location` is `stash`, whose status reads AVAILABLE (`instanceStatus`), and whose id is not in
    the member's loadout. **(owner)**
11. **Nothing else is shown or marked.** Listed, settling, in-escrow, in-run, unknown-status,
    worn and bag items get no card at all: no tag, no greyed or disabled card, no explanation.
    Every card shown can be chosen, so a card has no "selectable" flag and no tag. **(owner)**
12. **An absent location is not the stash.** The contract marks `location` required, so the
    server always sends it; an instance without one gets no card. The server would refuse it
    anyway. **(agent default)**
13. **Worn-ness still comes from the loadout read, and a failed read still marks nothing worn**
    (FS-HBXZN R14, R16). A worn stash relic is then offered, and the server refuses it with
    `ITEM_WORN` and its existing copy. **(agent default: keep the fail-open stance)**
14. **A plain empty state.** When the relics have been read and no card is made, the picker shows
    "Nothing in your stash to list. Move a relic into your stash in town." in place of the grid,
    and submit stays disabled. This replaces the old `NOTHING_LISTABLE` copy, which talked of
    worn relics and listings ending. **(owner: the wording, adapted to the page's word "relic")**
15. **The refusal has its own copy.** `createListingFailureMessage` maps `ITEM_NOT_IN_STASH` →
    "Only relics in your stash can be listed. Move it into your stash in town." Without it the
    new 400 would fall to the end-time reading. It ships with the server refusal (R2), as
    FS-HBXZN R18 did. **(agent default: the wording)**
16. **The drawer re-reads on every opening, as today** (FS-HBXZN R14). A relic moved into the
    stash in town shows the next time the drawer opens.

### E. Existing listings (no migration)

17. **Listings of bag items made before this FS stay as they are.** Nothing repairs, cancels or
    moves them. They settle, are bought out, end unsold or are withdrawn as before. **(owner)**
18. **No data migration and no schema change.** For the deploy notes only, this counts the
    grandfathered listings (none need fixing):

    ```sql
    SELECT COUNT(*) FROM item_instances
    WHERE location = 'BAG'
    AND status IN ('LISTED', 'PENDING_SETTLEMENT');
    ```

    (`IN_ESCROW` is not counted: items migration `000021` renamed it to `PENDING_SETTLEMENT` and
    dropped it from the status check.)

### F. Deploy order

19. **Deploy game-client with or before items-service.** A client built before this FS has no
    copy for `ITEM_NOT_IN_STASH`: `createListingFailureMessage` reads any other `400` as the
    listing's terms and shows `END_TIME_PASSED` ("That end time has already passed — check your
    clock"), the wrong reason. The old client's picker still offers bag relics, so it would hit
    that refusal. With the client first, a member sees the stash-only picker and, in a race,
    the right copy; the old server never sends the code, so nothing breaks in between. The order
    of api-gateway and marketplace-service does not matter (no behaviour change). **(agent
    default)**

## User Stories

1. As a seller, I want the List-a-relic picker to show only stash relics I can list, so that
   every card I see is one I can actually put up for sale.
2. As a seller, I want my listed and settling relics left out of the picker, so that I am not
   offered something already for sale.
3. As a seller, I want my worn gear left out of the picker, so that I never sell what I am
   wearing by mistake.
4. As a seller, I want my bag left out of the picker, so that the gear I carry into runs is never
   sold from under me.
5. As a seller, I want no tags or greyed cards in the picker, so that it stays a short, clean
   list of choices.
6. As a seller with nothing listable in the stash, I want a plain message telling me to move a
   relic into my stash in town, so that I know what to do next.
7. As a seller who moved a relic into the stash, I want it in the picker the next time I open it,
   so that I can list it straight away.
8. As a seller who moved a relic out of the stash after opening the picker, I want a plain
   message saying only stash relics can be listed, so that the refusal tells me why.
9. As a seller, I want a worn relic I somehow submit still refused with "Take it off first", so
   that the message matches the problem.
10. As a seller, I want my listings of bag items from before this change left alone, so that
    nothing I already put up for sale is cancelled.
11. As a seller whose old bag listing ends unsold, I want the relic back where it was, so that
    nothing moves without me.
12. As a buyer, I want what I win to land in my stash, so that the stash is where trading
    happens on both ends.
13. As a delver, I want everything in my bag to stay out of the marketplace, so that what I take
    into a run is what I packed.
14. As a player, I want moving a relic and listing it at the same moment to end in exactly one
    of them, so that a listed relic is never in my bag.
15. As an operator, I want the rule enforced by items-service, so that an API caller cannot list
    a bag item by skipping the web page.
16. As a client developer, I want the refusal to carry the stable code `ITEM_NOT_IN_STASH`, so
    that I switch on it instead of guessing from the status.
17. As a client developer, I want the create-listing description to list the new refusal, so
    that the generated client documents it.
18. As an items-service maintainer, I want the stash check to read the placement the reserve
    already reads, so that there is one place the rule lives and no extra query.
19. As a marketplace-service maintainer, I want marketplace to pass items' refusal through, so
    that location stays items' rule alone.
20. As an operator, I want a ready count of grandfathered bag listings, so that I know what is
    still out there when this deploys.

## Acceptance Criteria

### common/errcode

- [ ] `errcode.ItemNotInStash` is `"ITEM_NOT_IN_STASH"`, is in `domainCodes`, and crosses gRPC as
      `FailedPrecondition` with `ErrorInfo` reason `ITEM_NOT_IN_STASH`.

### items-service

- [ ] `ReserveItem` on an AVAILABLE, unworn bag instance the seller owns answers
      `ITEM_NOT_IN_STASH`; the instance stays AVAILABLE in the bag with no `listing_id` and no
      `reserved_at`, and no `ItemReserved` outbox row is written.
- [ ] `ReserveItem` on an AVAILABLE, unworn stash instance reserves it as today (LISTED,
      `listing_id`, `reserved_at`, one `ItemReserved` row).
- [ ] A worn bag instance and a worn stash instance answer `ITEM_WORN`; a LISTED or IN_RUN bag
      instance answers `ITEM_NOT_AVAILABLE`; a bag instance with the seller at the cap answers
      `ITEM_NOT_IN_STASH`; a missing or foreign instance answers not found.
- [ ] The refusal is decided from the placement read under the account lock; the conditional
      reserve `UPDATE` is unchanged.
- [ ] The opt-in database tests that expect a reservation to succeed seed the item in the stash.

### marketplace-service

- [ ] The item reserver translates an items `ITEM_NOT_IN_STASH` refusal into that refusal, and
      `ListItem` answers `FailedPrecondition` with `ErrorInfo` reason `ITEM_NOT_IN_STASH`. No
      production code changes.

### api-gateway / contract

- [ ] The `create-listing` description lists `ITEM_NOT_IN_STASH`; `openapi.yaml` and
      `game-client/src/api/generated/` are regenerated by `make openapi && make client` and
      committed with it; `make gates` passes.
- [ ] `POST /api/marketplace/listings` for a bag item answers `400 · ITEM_NOT_IN_STASH`.

### game-client

- [ ] `pickerCards` makes cards only for instances with an id, `location` `stash`, status
      AVAILABLE (or absent) and not worn; bag, listed, in-escrow, settling, in-run, unknown-status,
      worn and location-less instances get no card.
- [ ] A card carries no `selectable` flag and no tag; the drawer draws no disabled card state.
- [ ] With relics read and no card made, the drawer shows "Nothing in your stash to list. Move a
      relic into your stash in town." and submit is disabled.
- [ ] `createListingFailureMessage` maps `ITEM_NOT_IN_STASH` to "Only relics in your stash can be
      listed. Move it into your stash in town."; every other row is unchanged.
- [ ] A failed loadout read still lists (nothing marked worn).
- [ ] Full vitest suite, `tsc` and lint pass.

### Deploy

- [ ] game-client is deployed with or before items-service (R19).

### Browser check (Nick)

- [ ] In the web marketplace, the List-a-relic drawer shows only the AVAILABLE, unworn relics
      in the stash; bag, worn and listed relics do not appear and nothing is greyed or tagged.
- [ ] With no listable stash relic, the drawer shows the empty-state copy.
- [ ] Moving a relic from the bag into the stash in town and reopening the drawer shows it, and
      it lists.

## Edge States

- **Move and list race on the same item:** both take the member's account lock. Move first → the
  reserve reads the bag and answers `ITEM_NOT_IN_STASH`. Reserve first → the move reads LISTED
  and answers `ITEM_NOT_AVAILABLE` (FS-VPD8Y R10).
- **Relic moved to the bag after the drawer opened:** its card is still shown until the drawer
  re-reads; submitting it is refused `ITEM_NOT_IN_STASH` with the R15 copy.
- **Relic moved into the stash after the drawer opened:** not shown until the drawer is reopened
  (R16). Nothing is refused wrongly, only not offered yet.
- **Stash empty, or every stash relic listed or worn:** the R14 empty state.
- **Relic put on after the drawer opened:** still shown; the server refuses `ITEM_WORN` with the
  existing copy.
- **Loadout read fails:** worn stash relics are offered (R13); the server refuses them
  `ITEM_WORN`.
- **A stash listing cannot drift to the bag:** two guards. A move of a LISTED item is refused
  (FS-VPD8Y R10; `MoveItemInstanceTx` is conditional on AVAILABLE). The other write of location,
  `SetLocationTx` (the item an equip displaces into the bag), is not conditional on status, but
  it only ever touches a worn item, and a worn item is never reserved (FS-HBXZN R3, R4), nor can
  a LISTED item be equipped (FS-18Z5F R32). So while listed it stays in the stash.
- **A grandfathered bag listing:** unchanged (R17). Sold, the item lands in the buyer's stash
  (FS-VPD8Y R7). Unsold or withdrawn, it returns to the seller's bag (FS-VPD8Y R8), and must be
  moved to the stash before it can be listed again.
- **In a run:** IN_RUN instances answer `ITEM_NOT_AVAILABLE` before location is looked at; the
  stash is never checked out anyway.
- **Bag item at the cap:** `ITEM_NOT_IN_STASH`, not `LISTING_LIMIT_REACHED` (R4).
- **Stale or forged item id:** another member's item → `404`, unchanged.
- **API caller lists a bag item directly:** refused `400 · ITEM_NOT_IN_STASH` (R2).
- **items-service down:** `503`, unchanged.
- **Reservation reconciler, settlement saga, `TransferItem`, grants:** none call `ReserveItem`;
  unaffected.

## API surface

Changed (existing) operations only; no new endpoint, no request or response field changes.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| Create listing (existing) | `POST /api/marketplace/listings` | — | unchanged (`itemId`, `startPrice`, `buyoutPrice?`, `endsAt`) | unchanged (`202`, empty) | adds `400 · ITEM_NOT_IN_STASH` (the item is in the bag, not the stash); every existing row unchanged |
| Reserve item (gRPC, items) | `ItemsService.ReserveItem` | — | unchanged | unchanged | adds `FailedPrecondition` + `ErrorInfo` `ITEM_NOT_IN_STASH` |
| List item (gRPC, marketplace) | `MarketplaceService.ListItem` | — | unchanged | unchanged | passes `ITEM_NOT_IN_STASH` through unchanged (existing pass-through) |
| List item instances (existing) | `GET /api/items/instances` | — | — | unchanged (`location` already on every instance) | unchanged; the picker newly reads `location` |

## Out of Scope

- Any change to existing listings of bag items, or a migration of them (R17).
- Showing why an item is not offered (tags, greyed cards, hints per item) (owner).
- Listing from the game canvas, or a "list this" action in the gear overlay or stash chest.
- Moving items from the web marketplace page; moving stays in town (FS-VPD8Y).
- Any change to `MoveItemInstance`, the equip path, run checkout, settlement, `TransferItem` or
  the reconciler.
- A thin line for api-gateway or marketplace-service: neither one's behaviour changes; only the
  gateway's description and the regenerated contract move (as FS-HBXZN and FS-XEDFF did).

## Change: Per-character gear → FS-50MTX
