# FS-VPD8Y: Town stash

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" (town stash); `game-server/items-service/SPECIFICATION.md` "## Inventory" (bag and stash locations on owned instances); `game-server/api-gateway/SPECIFICATION.md` "### Items" (move an item between bag and stash) → this FS · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (contract layer; §6 errors carry a domain `code` from `common/errcode`, decided by the owning service), [ADR-0002](../adr/0002-batch-retrofit-of-the-legacy-surface.md) (the items group's result envelope), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only colour), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas palette) · Amends: [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) §E R41 (what the hub bag is) and R44 (no capacity pre-check in the hub); FS-HRH2J is not edited · Builds on: FS-HRH2J §B R14–R18, R23 (bag grid, gestures, over-capacity rows), §E R42–R43 (one request at a time, refusal → notice + reload); [FS-MRZH7](MRZH7-function-npc-markers.md) (function marker); [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md) (the Quartermaster's store) · Related, out of scope: [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md) (IN_RUN status, run checkout and settlement; depends on this FS's `location`), FS-P9G8R (consumed items, concurrent draft) · Vocabulary: [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md) (*item location*, *bag*, *stash*), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*stash*; the stash chest is not a *container view*)

> **Decision provenance.** The thread is the draft's raw scoping notes (sessions 2026-10-30 and
> 2026-10-31, neither challenged) plus the approved charter defaults. Every charter default is
> marked **(charter default)** with its reason. Where neither settled a point, the smaller v1 was
> taken and marked **(v1 pick)**; those are escalation candidates.

## Summary

Every item a player owns now sits in one place: worn, in the **bag**, or in the **stash**. The
bag is what the player carries (30 cells, FS-HRH2J); the stash is town storage (60 cells) that
never leaves the hub. A stash chest stands in the Quartermaster's store; pressing `E` beside it
opens the gear overlay with the stash in the left panel, and right-click or `E` moves the hovered
item between bag and stash. Existing unworn items all start in the stash, so nothing is lost and
the hub bag stops showing the whole collection (the reported bug).

**Lane:** agent-built throughout: items-service, api-gateway and game-client **(charter default:
no human-lane split)**. game-service is not touched.

## Requirements

### A. Item location (items-service)

1. **A `location` column on `item_instances`, `BAG` | `STASH`, NOT NULL** **(charter default:
   smallest migration, nothing deleted)**. One sequential migration (next after `000026`) with a
   matching down migration. A CHECK constraint (or enum) admits only the two values.
2. **Worn is not a location value.** Worn stays the loadout table (`player_loadouts`). An instance
   in the loadout is worn whatever its `location` column says; it counts toward neither the bag
   nor the stash. **(charter default.)**
3. **Backfill: every existing instance is set to `STASH`; the bag starts empty** **(charter
   default: no data loss; existing players find everything in the stash)**. Worn items keep
   being worn (R2); their column reads `STASH` until they are next unequipped (R17).
4. **Bag cap 30, stash cap 60, per account, counted at write time** **(charter default)**. The
   bag count is the account's `BAG` instances not in its loadout; the stash count is its `STASH`
   instances not in its loadout. Every status counts (a listed item still occupies its cell).
   `BagCapacity = 30` and `StashCapacity = 60` are named constants in items-service.
5. **The caps refuse growth; they never remove.** An account already over a cap keeps every item;
   only a write that would grow a location already at or over its cap is refused (R10, R18).
6. **Per account, not per character** **(charter default: items are owned per member today)**.
   Switching character keeps the same bag and stash.
7. **Marketplace purchases land in the buyer's `STASH`** **(charter default: the bag may be full,
   or the buyer may be in a run)**. items-service `TransferItem` sets `location = 'STASH'` in the
   same conditional update that changes the owner. Not capped: a purchase is never refused or
   lost for stash space, so a stash may read over 60. marketplace-service is not changed.
8. **A listing that ends unsold or is cancelled leaves `location` as it was.** `ReturnItem`,
   `UnfreezeItem`, `CancelReservation` and `ReserveItem` do not write `location`.
9. **Run extraction writes `BAG`** **(v1 pick: "the bag is what you bring in and bring out")**.
   Every instance `ProcessItemsExtracted` writes, new or returning (`ON CONFLICT`), gets
   `location = 'BAG'`. Not capped: an extraction is never refused and never drops an item, so a
   hub bag may read over 30 after a big run (rendered per FS-HRH2J R23). FS-18Z5F, which settles
   checked-out gear at run end, may refine this.
10. **Moving an instance** (`MoveItemInstance`, a new items gRPC method) sets its `location`, for
    the caller only. Checks, in this order, the first failing one answering:
    1. the instance does not exist or the caller does not own it → not found;
    2. the instance is in the caller's loadout → `ITEM_WORN`;
    3. its status is not `AVAILABLE` (listed, in escrow, pending settlement, or later in a run,
       FS-18Z5F) → `ITEM_NOT_AVAILABLE`;
    4. it is already at the destination → success, nothing written (a no-op succeeds even when
       that location is full) **(charter default)**;
    5. the destination count is at or above its cap → `BAG_FULL` or `STASH_FULL`.
    The write is conditional on owner = caller and status = `AVAILABLE`, so a listing that
    reserves the item between the check and the write turns the move into `ITEM_NOT_AVAILABLE`,
    never a moved listed item **(charter default)**.
11. **Writes that count are serialised per account.** A move (R10) and a loadout write (R16–R18)
    take one per-account lock inside their transaction (for example a transaction-scoped advisory
    lock keyed by the member id) before counting, so two concurrent writes at 29 cannot both pass
    and leave the bag at 31. Purchases (R7) and extraction (R9) are not capped and do not take it.
12. **The caller comes from the authenticated context**, never the request: `MoveItemInstance`
    carries the instance id and destination only, and owns-or-not-found is decided against the
    token's member (as `ensureOwner` does for the other member routes).
13. **gRPC outcomes.** Not found → `codes.NotFound`. A domain refusal (R10.2–R10.5, R18) →
    `codes.FailedPrecondition` with a `google.rpc.ErrorInfo` detail whose `reason` is the domain
    code (`BAG_FULL`, `STASH_FULL`, `ITEM_NOT_AVAILABLE`, `ITEM_WORN`). A malformed id or an
    unknown location → `codes.InvalidArgument`. Anything else → `codes.Internal`.
14. **Read.** `ItemInstance` (proto) gains `location`, carried as the HTTP vocabulary `bag` |
    `stash` (lowercase); the handler maps from the column. Every instance returned by
    `ListItemInstances` and `GetLoadoutWithItems` carries it. Additive: no field is renumbered.
15. **Proto is regenerated, never hand-edited** (`common/api/proto`), per root CLAUDE.md.

### B. Loadout writes keep the bag honest (items-service)

16. **An equip swap sends the displaced item to the bag.** When `UpdateLoadout` puts an item in a
    slot that held another, the displaced instance's `location` is set to `BAG` in the same
    transaction. The equipped item's column is left as it is (it is worn now, R2).
17. **An unequip sends the item to the bag** **(charter default)**. `UpdateLoadout` with an empty
    item id sets the slot's previous instance to `BAG` in the same transaction as clearing the
    slot.
18. **A loadout write into a full bag is refused with `BAG_FULL`** **(charter default: the hub bag
    is a real 30 bag now; amends FS-HRH2J R38 and R44)**. Counted under the lock (R11): an unequip
    when the bag holds 30 or more, or a swap that would grow the bag (the equipped item was not
    from the bag), is refused and nothing changes. A swap of a bag item is net zero and always
    allowed; an equip into an empty slot shrinks the bag and is always allowed.
19. **Equip from the stash is not refused by the server (v1 pick).** The hub never offers it
    (R33), and a forged one cannot break a cap: the stash shrinks and R18 still guards the bag.
20. **The extraction path's loadout write (`UpsertPlayerLoadoutTx`) is unchanged** apart from
    R9; it is not a hub write and is not capped.

### C. The HTTP surface (api-gateway)

21. **`GET /api/items/instances` gains `location` per instance** **(charter default: no new read
    route)**. Always present, enum `bag` | `stash`. The operation's description stops calling the
    whole list "the member's stash".
22. **`PUT /api/items/instances/{id}/location`**, body `{ "location": "bag" | "stash" }`, a typed
    (huma) operation beside the other items operations in
    `api-gateway/internal/gateway/item/typed.go` **(charter default; the instances routes are
    already typed, so no wrap slice is needed)**. Bearer-secured; identity from the token only.
    Errors per §API surface.
23. **`PUT /api/items/loadout` documents `400 · BAG_FULL`** (R18).
24. **Domain codes.** `BAG_FULL`, `STASH_FULL`, `ITEM_NOT_AVAILABLE` and `ITEM_WORN` are added to
    `game-server/common/errcode` under "Domain-specific", each commented with this FS. They are the
    repo's first domain-specific codes.
25. **The seam carries the reason.** `api-gateway/internal/httperr` maps a gRPC
    `FailedPrecondition` whose `ErrorInfo.reason` names a registered `errcode` code to `400` with
    that code. Any other `FailedPrecondition` (no detail, or an unknown reason) stays
    `400 · FAILED_PRECONDITION`, so every existing route answers exactly as before. The gateway
    never decides a cap or a status rule itself (ADR-0001 §6).
26. **The contract is regenerated, never hand-edited**: `make openapi && make client`, committing
    `openapi.yaml`, the generated client and the handler change together (root CLAUDE.md).

### D. The hub bag (game-client; amends FS-HRH2J §E)

27. **The hub bag is the bag-location items only** **(charter default; amends FS-HRH2J R41)**.
    `loadHubGear` puts loadout ids in their slots, `location: "bag"` instances not worn in the
    bag, and `location: "stash"` instances not worn in the stash list (§F). REST order is kept
    in each.
28. **An instance with no `location`** (an older gateway) is shown in the bag, as before this FS.
29. **Unequip into a full hub bag is pre-checked** **(amends FS-HRH2J R44)**. With 30 or more in
    the bag, a hub unequip is not sent and "Your bag is full." shows as the hub notice; the item
    stays worn. A swap is always sent. The server refusal (`400 · BAG_FULL`) stays authoritative
    and shows the same toast (R39).
30. **Over-capacity rendering of FS-HRH2J R23 applies to the hub bag unchanged.**

### E. The stash chest (game-client)

31. **One stash chest in the hub, client-side** **(charter default: reuse, save time and tokens)**.
    It stands inside the Quartermaster's store, at a fixed world spot that is more than
    `NPC_TALK_RANGE` (80) plus a margin from the Quartermaster (1280, 270), clear of the store's
    dressing (shelves, crates) and of the walk in from its door. It does not collide: like
    dressing, nothing stops a body walking through it, so hub obstacles stay the server's and
    game-service is not changed **(charter default: a server prop only if hub obstacles must be
    server-defined; a walk-through chest needs none)**. Everyone sees the same chest; each player
    opens their own stash.
32. **Look.** The run chest's baked sheet (`render/world/chest.ts`, `CHEST`, closed frame), drawn
    with a slight tint and a trim in code over the existing art so it reads as distinct from a
    run chest. Colour from palette tokens only (ADR-0013, ADR-0025), per
    `game-client/docs/design-guideline.md`. No new bake, no sourced art. While the player's own
    stash is open, their client draws the chest's open frame **(v1 pick)**.
33. **Marker.** An MRZH7-style function marker over it: the amber nameplate "Stash" in
    `palette.markerFunction` with the amber sigil above, at marker depth **(charter default)**.
34. **`E` within `NPC_TALK_RANGE` of the chest opens the overlay in stash mode** **(charter
    default: same reach as NPC talk)**. The chest joins the hub's nearest-in-range choice
    (`offerConversation`): if an NPC is nearer, `E` talks to the NPC. With the overlay already
    open, `E` stays the overlay's (FS-HRH2J R10), so the player closes it first **(v1 pick)**.
    While the ESC menu or a dialogue is open, `E` does not open the stash (FS-HRH2J R6).

### F. Stash mode of the overlay (game-client)

35. **The left panel shows the stash instead of the stats** **(charter default)**: a 6 × 10 grid
    of 60 cells filled in stash order, empty wells for the rest, and a count `N / 60`. Same look,
    hover tip and level dimming as the bag grid. The right panel (gear + bag) is unchanged.
36. **Over 60 (legacy or purchases):** extra rows of 6 tinted over capacity and the count in the
    over-capacity tone (e.g. `64 / 60`), scrolling inside the panel if needed, per FS-HRH2J R23.
37. **Closing the overlay closes the stash** (`I`, `B`, `ESC`, and `Q` where it closes the
    overlay). The next `I`/`B` opens the normal overlay with the stats panel. Walking away from
    the chest does not close it **(v1 pick: the server does not check proximity)**.
38. **Gestures in stash mode** **(charter default: one gesture, one meaning per mode)**:
    right-click or `E` on a hovered **bag** item moves it to the stash; on a hovered **stash** item
    moves it to the bag; on a hovered **worn** slot unequips it to the bag (as FS-HRH2J R17).
    Equip is not offered in stash mode. Left-click does nothing; no drag (FS-HRH2J R18).
39. **Client pre-checks and toasts** **(charter default)**, shown as the hub notice, nothing sent:
    a move into the bag (or an unequip) with 30 or more in the bag → "Your bag is full."; a move
    into the stash with 60 or more in it → "Your stash is full."; a move of an item whose status
    is not `AVAILABLE` → "That item is not free to move.".
40. **Items not `AVAILABLE`** draw dimmed in the bag and the stash, so a listed item reads as
    unavailable before the player tries it.
41. **One request at a time, optimistic** **(charter default, as FS-HRH2J R42)**: the item moves at
    once to the end of its destination grid and one `PUT .../location` is sent; while it is in
    flight further move, equip and unequip input on the overlay is ignored and the overlay shows
    it is busy. Walk keys are not blocked.
42. **Refusals** **(charter default, as FS-HRH2J R43)**: a failed move shows the hub notice by
    `code` (the client switches on `ApiError.code`, never on `detail`): `BAG_FULL` → "Your bag is
    full."; `STASH_FULL` → "Your stash is full."; `ITEM_NOT_AVAILABLE`, `ITEM_WORN` or
    `NOT_FOUND` → "That item is not free to move."; anything else → "Could not change your
    gear.". Then gear, bag and stash reload from REST.
43. **No stash in runs or field worlds** **(charter default)**. `BarrowspireScene` and
    `FieldScene` never compose stash mode; their overlay is FS-HRH2J's.
44. **The Quartermaster is unchanged** **(charter default)**: his dialogue, function and position
    stay as FS-HRH2J left them; he is not the stash keeper.

## User Stories

1. As a player in the hub, I want my bag to show only what I carry, so that it stops pretending my whole collection fits in 30 cells.
2. As a long-time player, I want everything I owned before the stash to be waiting in my stash, so that nothing disappears when this ships.
3. As a player, I want a stash chest I can walk up to in town, so that storage is a place in the world, not a menu.
4. As a player, I want the stash chest to look like a chest I know but distinct from a run chest, so that I recognise it at a glance and do not expect loot.
5. As a player, I want an amber "Stash" marker over the chest, so that I can find it the way I find the other things I can act on.
6. As a player, I want to press `E` beside the chest to open my stash, so that it works like talking to an NPC.
7. As a player, I want my stash to open beside my bag in the same overlay, so that I can see both while I sort.
8. As a player, I want to see my stash as a 6 × 10 grid with a `N / 60` count, so that I know how much room is left.
9. As a player, I want to hover a stash item to read its stats, so that I can decide what to carry.
10. As a player, I want right-click or `E` on a bag item to put it in the stash, so that putting things away is one gesture.
11. As a player, I want right-click or `E` on a stash item to put it in my bag, so that taking things out is the same gesture.
12. As a player, I want right-click or `E` on worn gear to still take it off into my bag while the stash is open, so that I do not have to close the stash to undress.
13. As a player, I want equipping to stay out of stash mode, so that one gesture never means two things on the same screen.
14. As a player with a full bag, I want "Your bag is full." when I try to take something out, so that I know why it stayed.
15. As a player with a full stash, I want "Your stash is full." when I try to put something away, so that I know why it stayed.
16. As a player, I want a listed item to look unavailable and say "That item is not free to move." if I try, so that I do not pull an item out from under my own listing.
17. As a player, I want a moved item to jump at once to the other grid, so that sorting feels immediate.
18. As a player, I want a refused move to tell me and show my real bag and stash, so that what I see is never a lie.
19. As a player, I want closing the overlay to close the stash, so that the next `I` shows my stats as usual.
20. As a player with more than 60 stored items, I want every one still shown, past the 60 cells and marked as over, so that nothing is hidden.
21. As a player with an over-full stash, I want moves into it refused but moves out allowed, so that I can work my way back under the cap.
22. As a player in the hub with a full bag, I want unequipping refused with "Your bag is full.", so that my worn gear never lands nowhere.
23. As a player, I want to swap a bag item onto me even with a full bag, so that a full bag never locks my gear.
24. As a buyer on the marketplace, I want what I buy to land in my stash, so that a purchase never fails for bag space or while I am in a run.
25. As a seller whose item did not sell, I want it back where it was, so that my sorting is kept.
26. As a player coming back from a run, I want my finds in my bag, so that what I brought out is what I carry.
27. As a player with two characters, I want the same bag and stash on both, so that switching character does not hide my items.
28. As a player in a run or field world, I want no stash there, so that storage stays a town thing.
29. As the server, I want every count and its write in one locked transaction per account, so that two quick moves can never overfill a bag or stash.
30. As the server, I want a move to be conditional on my ownership and an available status, so that a concurrent listing can never leave a listed item moved.
31. As a client developer, I want each refusal to carry a stable `code`, so that I switch on it instead of matching prose.
32. As an API consumer, I want the instances list to say where each item is, so that I need no second read.
33. As a developer, I want the contract regenerated from the typed handler, so that the published API cannot drift from the code.

## Acceptance Criteria

- [ ] Migration adds `item_instances.location` NOT NULL, `BAG` | `STASH` only; every pre-existing row reads `STASH`; the down migration drops it.
- [ ] `GET /api/items/instances` returns `location` (`bag` | `stash`) on every item; `openapi.yaml` and the generated client show it as a required enum.
- [ ] `PUT /api/items/instances/{id}/location` with `{ "location": "stash" }` on an owned, unworn, `AVAILABLE` bag item returns `200` and the item reads `stash` on the next list.
- [ ] Same-location move returns `200` and writes nothing, even when that location is full.
- [ ] Move of an unknown id or another account's item → `404 · NOT_FOUND`; of a worn item → `400 · ITEM_WORN`; of a listed or pending-settlement item → `400 · ITEM_NOT_AVAILABLE`; into a bag of 30 → `400 · BAG_FULL`; into a stash of 60 → `400 · STASH_FULL`; malformed id or a location other than `bag`/`stash` → `422 · VALIDATION_FAILED`. Each error is `application/problem+json`.
- [ ] Counts exclude worn items and include listed ones; an account over a cap keeps every item, moves out still succeed, moves in are refused.
- [ ] A test proves two concurrent moves into a bag at 29 leave it at 30, one refused with `BAG_FULL`.
- [ ] A move racing a listing never leaves a `LISTED` item with a changed location.
- [ ] `PUT /api/items/loadout` unequip sets the item's location to `bag`; a swap sends the displaced item to `bag`; unequip with 30 in the bag → `400 · BAG_FULL`, nothing changed; a bag-item swap at 30 succeeds.
- [ ] A completed marketplace transfer leaves the item in the buyer's stash; a returned listing keeps its location.
- [ ] Items written by run extraction read `bag`.
- [ ] `common/errcode` has `BAG_FULL`, `STASH_FULL`, `ITEM_NOT_AVAILABLE`, `ITEM_WORN`, each citing FS-VPD8Y; `httperr` maps `FailedPrecondition` + a registered `ErrorInfo.reason` to `400 · <reason>` and every other `FailedPrecondition` to `400 · FAILED_PRECONDITION` (existing routes' tests unchanged).
- [ ] items-service tests are table-driven next to the code; `go test ./...` passes in items-service, api-gateway and common.
- [ ] Hub overlay bag shows only `bag` items not worn; an instance without `location` shows in the bag.
- [ ] Hub unequip with 30 in the bag is not sent and shows "Your bag is full."; a swap is sent.
- [ ] A stash chest stands in the Quartermaster's store, out of his talk range, walk-through, run-chest art with a code-drawn tint and trim from palette tokens, and an amber "Stash" function marker.
- [ ] `E` within talk range of the chest opens the overlay with the stash grid (6 × 10, `N / 60`) in the left panel; an NPC nearer than the chest takes the `E` instead.
- [ ] In stash mode, right-click / `E` on a bag item moves it to the stash, on a stash item to the bag, on a worn slot unequips to the bag; equip is never sent.
- [ ] Pre-checks show "Your bag is full." / "Your stash is full." / "That item is not free to move." and send nothing; non-`AVAILABLE` items draw dimmed.
- [ ] One move in flight at a time, applied optimistically; a refusal shows the toast for its `code` and reloads gear, bag and stash.
- [ ] A stash over 60 shows tinted extra rows and an over-capacity count; every item is reachable.
- [ ] Closing the overlay ends stash mode; the next `I`/`B` shows the stats panel.
- [ ] No stash mode in `BarrowspireScene` or `FieldScene`; the Quartermaster is unchanged.
- [ ] No hand edits to `common/api/proto` generated Go, `openapi.yaml` or `game-client/src/api/generated/`; no game-service or marketplace-service change; the client test suite passes.

## Edge States

- **Empty stash:** 60 empty wells, `0 / 60`. **Empty bag:** 30 wells, `0 / 30`.
- **Fresh account:** no instances; both grids empty; moves have nothing to act on.
- **Bag exactly 30 / stash exactly 60:** moves in are pre-checked and refused; moves out succeed; a bag-item swap still works.
- **Over capacity (legacy, purchases, extraction):** every item shown in tinted extra rows; moves into that location refused (`BAG_FULL` / `STASH_FULL`); moves out allowed until under.
- **Same-location move** (stale client, double send): `200`, nothing written.
- **Concurrent moves from two tabs:** the per-account lock serialises them; the loser sees a cap refusal or a no-op, then reloads.
- **Move races a listing:** whichever commits first wins; a move that loses answers `ITEM_NOT_AVAILABLE`; a listing that loses fails its own existing check, unchanged.
- **Worn item addressed by a move** (stale view after equipping elsewhere): `ITEM_WORN`, toast, reload.
- **Item sold or transferred away while the stash is open:** the move answers `404 · NOT_FOUND`; toast "That item is not free to move." and reload drops it.
- **Purchase while the buyer has the stash open:** it is not shown until the next reload (closing and reopening, or any refusal); no push.
- **Move in flight and the overlay is closed:** the call finishes; the next open reloads from REST.
- **REST load fails in stash mode:** the error line shows in the bag area as FS-HRH2J R43, and the stash panel shows the same error line; reopen retries.
- **Gateway older than this FS (no `location`):** everything not worn shows in the bag as before; the stash grid is empty; a move answers 404 from the old gateway and the generic toast shows.
- **World switch while the stash is open** (queue pop, handoff, gate): the hub shuts down and the overlay with it; nothing persists.
- **Unauthorised:** no or bad token → `401 · UNAUTHENTICATED`; another account's item → `404`, never `403`, so ownership of an id is not disclosed.
- **items-service unreachable:** `503 · SERVICE_UNAVAILABLE`; the client shows "Could not change your gear." and reloads.
- **Later statuses** (FS-18Z5F `IN_RUN`): refused as `ITEM_NOT_AVAILABLE` with no change here.

## API surface

All three operations are bearer-secured; identity comes from the token and never appears in a
request. Responses keep the items group's envelope `{ statusCode, message, result }` (ADR-0002).
Domain refusals are decided by items-service and carried to the gateway as a gRPC
`FailedPrecondition` with an `ErrorInfo.reason` (R13, R25).

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `list-item-instances` (changed, additive) | `GET /api/items/instances` | none | none | `200`, as today; each item gains `location`: `bag` \| `stash`, always present | unchanged |
| `move-item-instance` (new) | `PUT /api/items/instances/{id}/location` | `id` path, uuid | `location`: `bag` \| `stash`, required | `200`, `result`: `{ id: uuid, location: bag \| stash }` (the instance's location after the call; unchanged on a no-op) **(v1 pick: echo, as update-loadout echoes)** | `401 · UNAUTHENTICATED` no or bad token; `404 · NOT_FOUND` no such instance or not the caller's; `400 · ITEM_WORN` in the caller's loadout; `400 · ITEM_NOT_AVAILABLE` status not `AVAILABLE`; `400 · BAG_FULL` destination bag at or over 30; `400 · STASH_FULL` destination stash at or over 60; `422 · VALIDATION_FAILED` malformed `id`, missing or unknown `location`, unknown body member; `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` items-service unreachable |
| `update-loadout` (changed) | `PUT /api/items/loadout` | none | unchanged | unchanged | adds `400 · BAG_FULL` an unequip, or a swap that would grow the bag, with the bag at or over 30; others unchanged |

## Out of Scope

- Run checkout, the `IN_RUN` status, run-end settlement and unsafe finds (FS-18Z5F). This FS only
  provides `location` and refuses non-`AVAILABLE` moves.
- A stash in runs or field worlds; a per-character stash; stash tabs, sorting, search, drag,
  manual arrangement, stacking.
- Buying stash space or raising either cap.
- Server-checked proximity to the chest; a server-side chest entity, collision or hub function.
- Any game-service change (the hub map, NPCs, the run/field bag cap of FS-HRH2J §D).
- marketplace-service changes; listing from the stash or bag is unchanged.
- Changing the Quartermaster.
- Overflowing extraction or purchases into the other location when one is full.
- Server refusal of equip from the stash (R19).
- New art bakes or a design-guideline amendment.
- The matchmaker / match queue (FS-K2HKP).

## Review notes (2026-11-01)

Amends §E R31 and R34 (code review, fix round 1). [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md)
R14 (no talking through walls) holds for the stash chest by a gate on `E`, not by placement: the
chest joins the nearest-in-range choice only while the player stands inside the Quartermaster's
store, by the scene's `insideHouse` test on the store's rect. No spot in the 300×240 store meets
both rules. Standing more than `NPC_TALK_RANGE` (80) from every outer wall leaves a 140×80 box
centred near the Quartermaster (1280, 270), and no point in it is 80 plus R31's margin from him.
The chest keeps its spot at (1180, 245), which is about 50 px inside the west wall. From the road
west of the store it is within reach, and `E` there offers nothing.
