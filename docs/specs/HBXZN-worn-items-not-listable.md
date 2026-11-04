# FS-HBXZN: Worn items cannot be listed on the marketplace

> Status: work-order · SPECIFICATION.md: `game-server/items-service/SPECIFICATION.md` "## Inventory" → "Worn items refused for listing"; `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Item refusals passed through on listing"; `game-client/SPECIFICATION.md` "### Marketplace" → "Worn relics not listable" → this FS · Also touches (no thin line, documentation of an unchanged mapping): `game-server/api-gateway` create-listing route description + regenerated contract · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (domain refusals are 400 with a domain code, decided by the owning service) · Supersedes in part: [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md)'s Edge State "A worn listed item seats as an empty slot", which this FS makes unreachable; FS-18Z5F is not edited · Related: [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md) R32–R33 (the converse rule, a listed item cannot be equipped, already shipped), [FS-VPD8Y](VPD8Y-town-stash.md) R11–R13 (the account lock, the placement read, ITEM_WORN on a move), [FS-8EGFA](8EGFA-marketplace-web-page.md) req 25, 29 (the List-a-relic picker and its refusal copy), [FS-V6SFK](V6SFK-signup-hardening.md) R38 (EMAIL_UNVERIFIED on listing), [FS-49Z37](49Z37-marketplace-sale-actions.md) req 2 (buyout-not-above-start copy), [FS-22WKC](22WKC-uniform-error-contract.md) (the gateway's one error seam)

> Terms follow `game-server/items-service/CONTEXT.md`: **worn** means the instance is in its
> owner's loadout (the loadout table, never a location value). Every decision below is a
> **charter default** approved by the user, with its reason; none were run through
> challenge-me. Gaps the charter left open and the agent filled are marked **(agent default)**.

## Summary

A member can no longer put an item they are wearing up for auction. When marketplace asks
items-service to reserve an item for a new listing, items-service now refuses a worn one with
`ITEM_WORN`, and the List-a-relic picker shows worn relics greyed out with a "Worn" tag so the
member rarely gets that far. The converse rule (a listed item cannot be equipped) shipped with
FS-18Z5F R32; together they make "worn" and "listed" mutually exclusive.

The same seam is cleaned up on the way: today every items-side failure of a listing reaches the
browser as a 500. After this FS a not-available item answers `400 · ITEM_NOT_AVAILABLE` and an
item that is not the member's answers `404`, and the client switches on those codes.

## Requirements

### A. Reserving refuses a worn item (items-service)

1. **A worn item is not reserved.** `ReserveItem` (gRPC) refuses an instance that is worn by its
   owner with the registered domain code `ITEM_WORN` (`errcode.ItemWorn`). Nothing is written:
   the instance stays AVAILABLE with no `listing_id` and no `reserved_at`, and no
   `ItemReserved` event is put in the outbox. (charter default D1/D2: same code the bag/stash
   move already uses for the same fact, already registered)
2. **"Worn" has one definition.** The check uses the existing `wornByOwner` predicate in
   `internal/items/repository.go`: the instance's id is in any of its owner's ten loadout slots,
   the three consumable slots included. No second definition is written. The existing placement
   read (`ItemPlacementTx`: status, location, worn, only if the caller owns the instance)
   already carries it. (charter default D1: one definition)
3. **The check serializes with equipping.** Inside the reservation's transaction, in this order:
   take the seller's account lock (`LockAccountTx`, the lock `UpdateLoadout`, `MoveItemInstance`
   and run checkout already take); read the placement in a separate statement; then run the
   existing conditional `UPDATE` in `ReserveItemTx` unchanged. A worn check placed only as a
   subquery inside the `UPDATE` is not acceptable: under READ COMMITTED a concurrent equip can
   commit between the statement's snapshot and its row lock, and the EvalPlanQual recheck
   re-reads the target row, not the subquery's snapshot of the loadout. An equip writes
   `player_loadouts`, not the item row, so only the account lock orders the two.
   (charter default D3)
4. **The first failing check answers.** Under the lock: no such instance, or not the caller's →
   not found; status not AVAILABLE (LISTED, IN_ESCROW, PENDING_SETTLEMENT, IN_RUN) →
   `ITEM_NOT_AVAILABLE`; worn → `ITEM_WORN`. Status is checked before worn because "take it off
   first" is only advice that helps when the item is otherwise listable (an IN_RUN worn item
   cannot be taken off in the hub). If the conditional `UPDATE` still matches no row, the answer
   is `ITEM_NOT_AVAILABLE`. **(agent default: check order; the charter fixes the codes, not
   their precedence)**
5. **The handler answers each outcome with its own status.** items' `ReserveItem` handler
   returns a refusal as its `GRPCStatus()` (gRPC `FailedPrecondition` with a
   `google.rpc.ErrorInfo` whose reason is the code), not-found as gRPC `NotFound`, and anything
   else as `Internal` with a fixed message, the error logged with seller and item id and never
   put on the wire. Today it answers `Internal` with the raw error text for every failure.
   (charter default D5)

### B. Listing passes items' answer through (marketplace-service)

6. **Marketplace does not check worn.** marketplace-service holds no loadout and does not
   restate the rule. items owns it. (charter default D4)
7. **A refusal from items reaches the caller unchanged.** When items' `ReserveItem` answers a
   status from which `errcode.RefusalReason` reads a registered code, `ListItem` answers the same
   refusal: gRPC `FailedPrecondition` with an `ErrorInfo` carrying the same reason. Today
   `mapError` falls to its default and answers `Internal`. (charter default D4/D5)
8. **Not found from items is not found.** When items answers gRPC `NotFound`, `ListItem` answers
   gRPC `NotFound`. (charter default D5)
9. **Everything else is unchanged.** items unreachable or past its deadline still answers
   `Unavailable` (transient); any other items failure still answers `Internal`. The
   email-verified gate and the listing-terms validation still run before items is called, so
   `EMAIL_UNVERIFIED` and the price / end-time refusals keep their precedence.

### C. The contract says so (api-gateway)

10. **No mapping change at the edge.** `httperr.mapError` already turns a registered refusal into
    `400` with that code and gRPC `NotFound` into `404 · NOT_FOUND`. Nothing in the gateway's
    error seam changes.
11. **The create-listing operation documents its refusals.** The `create-listing` operation
    (`POST /api/marketplace/listings`, `internal/gateway/listing/typed.go`) gains in its
    description a "Refusals:" list in the style of `move-item-instance`: `ITEM_WORN` (the item is
    worn), `ITEM_NOT_AVAILABLE` (listed, in escrow, pending settlement or in a delve),
    `EMAIL_UNVERIFIED` (the member's email is not verified); and "An item that is not the
    member's answers 404." Its documented errors gain `404`. (charter default D10)
12. **The contract is regenerated, never hand-edited.** `make openapi && make client`; the
    handler change, `game-server/api-gateway/openapi.yaml` and `game-client/src/api/generated/`
    are committed together (`docs/contract-guide.md`). (charter default D10)

### D. The picker and the copy (game-client)

13. **A worn relic is shown, not choosable, tagged "Worn".** In the List-a-relic drawer
    (`src/marketplace/listRelic.ts` `pickerCards`, `src/components/bazaar/ListRelicDrawer.tsx`) a
    relic whose id is in any slot of the member's loadout stays in the picker as a disabled card
    tagged "Worn", like the Listed / In escrow cards. It cannot be selected, so the listing
    cannot be submitted for it. (charter default D6: consistent with the existing tags)
14. **Worn-ness comes from the loadout read.** The drawer reads the existing
    `GET /api/items/loadout` alongside the instances it already reads, and re-reads both when it
    re-reads relics. The instances API is not changed. (charter default D6)
15. **A status tag wins over "Worn".** A relic that is worn and also not AVAILABLE shows its
    status tag (Listed, In escrow, Settling, Unavailable), matching the server's check order
    (R4). **(agent default)**
16. **A failed loadout read does not block listing.** If the loadout read fails, the picker
    marks nothing worn and stays usable; the server is the authority and a worn relic is then
    refused with the R17 copy. Same stance the picker already takes for an absent status.
    **(agent default)**
17. **Refusal copy switches on the code.** `createListingFailureMessage` maps:
    `ITEM_WORN` → "Take it off first — worn relics can't be listed." (new constant, charter
    default D7); `ITEM_NOT_AVAILABLE` → the existing `CANNOT_LIST` copy; `404` → `CANNOT_LIST`;
    `EMAIL_UNVERIFIED` → unchanged (`VERIFY_TO_LIST`); any other `400` → unchanged (the
    buyout-not-above-start / end-time reading); `503` / non-API errors → unchanged; `500` →
    `LIST_FAILED` ("could not be listed — try again"), since a 500 no longer means "already
    listed". The doc comment that calls a 500 "the items-side refusal" is corrected.
    **(agent default for the ITEM_NOT_AVAILABLE, 404 and 500 rows: keep today's user-visible copy
    for the refusals, honest copy for a real failure)**
18. **The code-switch ships with the pass-through.** R7–R8 turn what the client today receives as
    a `500` into a `400`/`404`. Without R17 a listed relic would read "That end time has already
    passed". R7–R8 and R17 are released together.

### E. Ops note (no migration)

19. **No data migration.** Rows already both worn and listed are not repaired by code (0 rows
    locally). Before deploying this FS to GKE, run:

    ```sql
    SELECT ii.id, ii.owner_member_id, ii.status, ii.listing_id
    FROM item_instances AS ii
    WHERE ii.status IN ('LISTED', 'IN_ESCROW', 'PENDING_SETTLEMENT')
    AND EXISTS (
      SELECT 1 FROM player_loadouts AS pl
      WHERE pl.member_id = ii.owner_member_id
      AND ii.id IN (
        pl.weapon_instance_id, pl.head_instance_id, pl.chest_instance_id,
        pl.gloves_instance_id, pl.legs_instance_id,
        pl.ring_1_instance_id, pl.ring_2_instance_id,
        pl.consumable_1_id, pl.consumable_2_id, pl.consumable_3_id));
    ```

    and fix any row by hand (clear the loadout slot, or cancel the listing), per row. Dev
    environment only. (charter default D8)

## User Stories

1. As a seller, I want the marketplace to refuse listing an item I am wearing, so that I never
   sell gear off my own back by mistake.
2. As a seller, I want worn relics greyed out and tagged "Worn" in the List-a-relic picker, so
   that I can see at a glance why I cannot pick them.
3. As a seller, I want worn relics to stay visible in the picker, so that I am not left
   wondering where my sword went.
4. As a seller, I want a clear "Take it off first" message if I somehow submit a worn relic, so
   that I know exactly what to do next.
5. As a seller, I want a consumable sitting in one of my consumable slots to count as worn, so
   that a potion I have readied is not sold out from under me.
6. As a seller, I want an item I took off to become listable, so that the rule only blocks what
   I am actually wearing.
7. As a seller, I want an already-listed relic I submit again to say it cannot be listed right
   now, not that my end time has passed, so that the message matches the problem.
8. As a seller, I want a relic that is no longer mine to be refused plainly, so that a stale
   page cannot list someone else's item.
9. As a seller, I want the picker to stay usable if my loadout cannot be read, so that a
   transient failure does not block every listing.
10. As a player, I want equipping and listing the same item at the same moment to end with
    exactly one of them succeeding, so that an item is never both worn and for sale.
11. As a buyer, I want every item I win to be one the seller was not wearing, so that settlement
    never pulls an item out of someone's loadout.
12. As a delver, I want my worn gear never to be LISTED when I enter a run, so that I never seat
    with an empty slot because of a listing.
13. As a client developer, I want listing refusals to carry stable codes, so that I switch on
    `ITEM_WORN` / `ITEM_NOT_AVAILABLE` instead of guessing from the status.
14. As a client developer, I want the create-listing operation's description to list its
    refusals, so that the generated client documents them.
15. As an items-service maintainer, I want "worn" defined once, so that listing, moving and
    checkout never disagree about what is worn.
16. As a marketplace-service maintainer, I want marketplace to pass items' refusals through
    rather than restate them, so that the loadout rule has one owner.
17. As an operator, I want items-side listing failures to stop surfacing as 500s, so that real
    faults stand out in the logs and dashboards.
18. As an operator, I want items' error text kept off the wire, so that internals do not leak to
    a client.
19. As an operator, I want a ready query for rows that are already worn and listed, so that I can
    check an environment before deploying this rule.

## Acceptance Criteria

### items-service

- [ ] `ReserveItem` on an AVAILABLE instance the seller owns and wears (any of the ten slots,
      tested with a weapon slot and a consumable slot) answers gRPC `FailedPrecondition` with
      `ErrorInfo` reason `ITEM_WORN`; the instance is still AVAILABLE with no `listing_id` and
      no `reserved_at`, and no `ItemReserved` outbox row exists for it.
- [ ] `ReserveItem` on an AVAILABLE, unworn instance the seller owns reserves it exactly as today
      (LISTED, `listing_id` set, `reserved_at` set, one `ItemReserved` outbox row).
- [ ] `ReserveItem` on a LISTED (and on an IN_RUN) instance answers `ITEM_NOT_AVAILABLE`, worn or
      not.
- [ ] `ReserveItem` on an instance that does not exist, and on another member's instance, answers
      gRPC `NotFound`; the two are indistinguishable.
- [ ] Any other failure answers `Internal` with a fixed message that carries no error text.
- [ ] The reservation takes the seller's account lock before reading the placement: an equip and
      a reservation of the same instance run concurrently end with exactly one success (either
      worn and still AVAILABLE, or LISTED and not worn), never worn and LISTED.
- [ ] No second worn predicate is added; the check uses `wornByOwner`.

### marketplace-service

- [ ] `ListItem` whose items call answers an `ITEM_WORN` refusal answers gRPC
      `FailedPrecondition` with `ErrorInfo` reason `ITEM_WORN`; likewise `ITEM_NOT_AVAILABLE`.
- [ ] `ListItem` whose items call answers `NotFound` answers `NotFound`.
- [ ] `ListItem` whose items call is unavailable still answers `Unavailable`; any other items
      error still answers `Internal`.
- [ ] An unverified email and invalid listing terms are still refused before items is called.
- [ ] marketplace-service contains no worn check.

### api-gateway / contract

- [ ] `POST /api/marketplace/listings` for a worn item answers `400` with code `ITEM_WORN`; for a
      listed item `400 · ITEM_NOT_AVAILABLE`; for another member's item `404 · NOT_FOUND`.
- [ ] The `create-listing` description lists `ITEM_WORN`, `ITEM_NOT_AVAILABLE`,
      `EMAIL_UNVERIFIED` and the 404 rule; its documented errors include `404`.
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are regenerated by
      `make openapi && make client` and committed with the handler change; neither is
      hand-edited.

### game-client

- [ ] In the List-a-relic picker, a relic in any loadout slot shows as a disabled card tagged
      "Worn" and cannot be selected; submit stays disabled for it.
- [ ] An unworn AVAILABLE relic is selectable as today; a Listed / In escrow / Settling /
      Unavailable relic keeps its tag even when it is also worn.
- [ ] When the loadout read fails, no relic is tagged "Worn" and the picker still lists.
- [ ] A create-listing refusal with code `ITEM_WORN` shows "Take it off first — worn relics
      can't be listed."; `ITEM_NOT_AVAILABLE` and `404` show the existing `CANNOT_LIST` copy;
      `EMAIL_UNVERIFIED` still shows the verify prompt; a `400` without those codes keeps the
      buyout / end-time reading; a `500` shows `LIST_FAILED`.

### Ops

- [ ] The R19 query is run against GKE before this FS is deployed there, and its result is
      recorded in the deploy notes.

## Edge States

- **Equip and list race on the same item:** both take the member's account lock; whichever runs
  second sees the first's result. Listing first → the equip is refused `ITEM_NOT_AVAILABLE`
  (FS-18Z5F R32). Equipping first → the listing is refused `ITEM_WORN`.
- **Two listings of the same item at once:** the second, behind the lock, sees LISTED and answers
  `ITEM_NOT_AVAILABLE`.
- **Run checkout and listing race:** checkout takes the same account lock; whichever is second
  sees IN_RUN (listing refused `ITEM_NOT_AVAILABLE`) or LISTED (the item stays home, as today).
- **Worn and in a delve:** `ITEM_NOT_AVAILABLE`, not `ITEM_WORN` (R4); the picker shows its
  status tag, not "Worn" (R15).
- **Item taken off after the drawer opened:** the card still says "Worn" until the drawer
  re-reads; reopening the drawer re-reads the loadout. Nothing is refused wrongly, only not
  offered.
- **Item put on after the drawer opened:** the card is still selectable; the server refuses with
  `ITEM_WORN` and the drawer shows the R17 copy.
- **Loadout read fails:** fail-open (R16); the server stays the authority.
- **Stale or forged item id:** another member's item → `404`; the client shows `CANNOT_LIST`.
- **Item already worn AND listed before this FS (legacy rows):** untouched by code; found and
  fixed by hand per R19. Once fixed, the FS-18Z5F Edge State "a worn listed item seats as an
  empty slot" cannot arise again.
- **items-service down:** `503`, unchanged.
- **Reservation reconciler, settlement saga, `TransferItem`:** none of them call `ReserveItem`;
  unaffected.

## API surface

Changed (existing) operations only; no new endpoint, no request or response field changes.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| Create listing (existing) | `POST /api/marketplace/listings` | — | unchanged (`itemId`, `startPrice`, `buyoutPrice?`, `endsAt`) | unchanged (`202`, empty) | adds `400 · ITEM_WORN` (the item is worn), `400 · ITEM_NOT_AVAILABLE` (listed, in escrow, pending settlement or in a delve), `404 · NOT_FOUND` (no such item, or not the member's); existing rows unchanged (`400 · EMAIL_UNVERIFIED`, `400 · VALIDATION_FAILED`, `401`, `422 · VALIDATION_FAILED`, `503 · SERVICE_UNAVAILABLE`); `500 · INTERNAL_ERROR` now only for unexpected failures |
| Reserve item (gRPC, items) | `ItemsService.ReserveItem` | — | unchanged | unchanged | adds `FailedPrecondition` + `ErrorInfo` `ITEM_WORN` / `ITEM_NOT_AVAILABLE`, `NotFound`; `Internal` no longer carries error text |
| List item (gRPC, marketplace) | `MarketplaceService.ListItem` | — | unchanged | unchanged | passes items' `FailedPrecondition` refusals through with their `ErrorInfo`, and `NotFound` as `NotFound` |
| Get loadout (existing) | `GET /api/items/loadout` | — | — | unchanged | unchanged; newly read by the List-a-relic drawer |

## Out of Scope

- The converse rule "a listed item cannot be equipped": shipped as FS-18Z5F R32; no change.
- `TransferItem` not clearing the seller's loadout on sale (a separate defensive fix).
- Any other marketplace review finding.
- New endpoints, a worn flag on the instances API, schema or migration changes.
- Any change to the equip path (`UpdateLoadout`), run checkout, or the settlement saga.
- A data migration for rows already worn and listed (ops note R19 instead).
- A thin line for api-gateway: the gateway's mapping is unchanged; only its description and the
  regenerated contract move.
