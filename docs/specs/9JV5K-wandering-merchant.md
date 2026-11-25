# FS-9JV5K: Wandering merchant

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout" (wandering merchant), "### Gameplay actions" (drink an antidote); `game-server/wallet-service/SPECIFICATION.md` "### Account" (idempotent gold debit for a purchase); `game-client/SPECIFICATION.md` "### Escape run" (buy from the wandering merchant · drink an antidote) → this FS · Also the change FS for: [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) (the tome can be bought; the altar then stands above), which carries `## Change: Wandering merchant → FS-9JV5K` · Siblings (same scoping session, 2026-11-25): [FS-5FZ4J](5FZ4J-sealed-floors.md) (the other two respites, trap poison), [FS-4EC7Z](4EC7Z-dungeon-encounters.md), [FS-X2CMM](X2CMM-class-books.md) · Related: [FS-P9G8R](P9G8R-drink-health-potions.md) (health potions), [FS-1GZGD](1GZGD-in-game-mailbox.md) (the idempotent credit the debit mirrors), [FS-7TGZ3](7TGZ3-gold-in-the-gear-overlay.md) (the purse read), [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md) (unsafe finds), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (the bag) · Related ADRs: [ADR-0093](../adr/0093-an-in-run-purchase-debits-the-wallet-over-grpc-at-the-moment-of-sale-off-the-tick-idempotent-per-purchase.md) (recorded with this FS, not challenged), [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md), [ADR-0044](../adr/0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md), [ADR-0022](../adr/0022-service-addresses-come-from-config-not-a-registry.md) (service addresses), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) (on-demand art groups)

> Promoted `--from-thread` on 2026-11-25 from the scope-it session's raw notes. **(owner)** marks
> Kranti's words or approval; **(charter default)** the defaults approved under the 2026-11-25
> charter, with their reason; **(promotion default)** what the notes left open and this promotion
> settled, as the smaller v1.

## Summary

The Spire's first vendor. On about a third of floors from 2 up, a **wandering merchant** stands in
a quiet room with a pack and a lantern: the third respite (the fountain and the hallowed altar are
FS-5FZ4J's). He sells common health potions, **antidotes** that end trap poison, and on rare
occasions the Tome of Filth. A delver pays with their **account gold**: the sale takes the stock on
the tick, debits the wallet over gRPC off the tick, and hands the item over on a later tick, so
gold and goods never drift apart across a refresh, a quit or a death (ADR-0093). An antidote is
drunk from the bag.

## Requirements

### §A. The merchant on a floor (game-service)

1. **Spawn** (charter default): on about **33%** of floors 2+, never floor 1, never the top floor,
   at most one a floor, on sealed dungeon floors only (none on a floor of buildings). He stands in a
   **respite room**: a room where no monster spawns (FS-5FZ4J §D R21), not the start, stairs,
   switch, escape door, a seal piece's, a hidden room or the fountain's (a floor may hold both a
   fountain and a merchant, in different rooms). Placed as a fixture is (off doorways, clear of what
   is placed, `mapKeepOut`), rolled from the session's spawn source.
2. **He is not a combatant.** No health, never targeted by monsters, never hit by a delver's attack,
   area or projectile, never a body that holds a plate or fires a trap. He stands still. Monsters
   path around him as around a fixture.
3. **Wares** (owner: kinds; charter default: numbers). Each merchant's stock, rolled at his spawn:

   | Ware | Template | Price | Stock |
   |---|---|---|---|
   | Health potion | `HEALTH_POT_SMALL` (common) | 60 gold | 3 |
   | Antidote | `ANTIDOTE` (common, §D) | 40 gold | 3 |
   | Tome of Filth | none: run state (§E) | 1500 gold | 1, rare (R16) |

   Prices and counts are tunables beside the spawn rates. Stock is shared by the party, first come.
4. **The wire.** A run-only state key `merchant`: `{ entity_id, position, wares: [{ ware, price,
   left, item? }] }` on his floor, sent whole (promotion default: one landmark a floor). `ware` is
   `health_potion | antidote | tome_of_filth`; `left` counts what is neither sold nor reserved;
   `item` carries the template's display data the client draws (name, rarity, icon key), absent
   for the tome. Absent in the hub, the fields and on floors without him.

### §B. Buying (game-service, ADR-0093)

5. **A new client action `buy`**: `{ merchant_id, ware }`, routed as the run's other actions are
   (the message hub's generic run routing; no matchmaker change). Applied on the tick.
6. **Refused at once**, nothing reserved, no gRPC call, with a `buy` reply `{ success: false,
   reason }`: the buyer is not in play (`not_in_play`); farther than the interact range from the
   merchant (`out_of_reach`); the ware has none left (`sold_out`); a bag ware into a full bag
   (`bag_full`); the tome when the party already carries one, or one was burned (`tome_held`); the
   buyer already has a purchase in flight (`purchase_pending`, promotion default: one at a time
   keeps the key sequence simple).
7. **Reserve, then pay off the tick** (charter default). Otherwise the sale **reserves** one of the
   ware (its `left` drops at once), records the purchase with its **purchase key**
   `purchase:<run id>:<buyer member id>:<n>` (`n` the buyer's purchase count in this run, from 1,
   kept on the run, never reused, ADR-0009), and starts the debit on its own goroutine through a
   consumer-side interface game-service owns. The tick never waits on it.
8. **The debit is made as the buyer** (the buyer's forwarded token, as every member call is, the
   way the mailbox's credit is made, ADR-0044). The session keeps each seated delver's latest token
   (from seating, and replaced on every reconnect), never on the wire or in logs.
9. **Retries keep the key.** A transient wallet failure (unavailable, deadline exceeded, aborted)
   is retried with backoff for at most 10 s in all, always with the same key. Each call times out at
   5 s.
10. **The result is applied on a later tick** (through the session's intent queue):
    - **Success** (applied or already applied): the reserve becomes a sale. A bag ware is created
      from its template as an **unsafe find** (FS-18Z5F) and put on the end of the buyer's bag; if
      the bag filled meanwhile it is dropped at the buyer's feet as a drop pile (promotion default:
      they paid; nothing is lost). The tome is §E. Reply `{ success: true, ware }`.
    - **Refusal**: the reserve is released (`left` rises again) and nothing is granted. Reply
      `{ success: false, reason }`: `not_enough_gold` (available gold, excluding gold held in bids,
      is below the price), `no_wallet` (no account), `wallet_unavailable` (the retries ran out, or
      the call was refused as unauthenticated).
11. **The buyer left before the result** (died, escaped, left the run, or the run ended): on
    success nothing can be granted; the gold is spent. Logged at warn with the purchase key, buyer,
    ware and price, so support can make it good (ADR-0093's accepted gap). On refusal the reserve
    is released if the floor still stands. No reply is sent to a buyer who is gone.
12. **A floor change before the result**: the merchant is gone with his floor; a success still
    grants the bag ware to the buyer on the new floor (the bag travels), a refusal releases nothing
    (there is no stock left to release).

### §C. The wallet debit (wallet-service, `common/api/proto/wallet`)

13. **A new RPC `Debit`**: `DebitRequest { amount int64, idempotency_key string }` →
    `DebitResponse { applied bool }`, beside `Credit`, and the generated Go committed with it
    (`make gen`). It names no account: the account is the forwarded token's member's, as `Credit`.
14. **A `DebitUC` in the account context's usecase layer** mirroring `CreditUC`: the key is
    required and namespaced (`debit:`); the amount must be positive; the key's dedup row
    (`MarkActivityProcessed`) and the balance change commit in **one transaction**; a known key
    debits nothing and returns `applied = false`; the removal is bounded by **available** gold (the
    account's domain `Withdraw` rule: held gold is not spendable). A refusal rolls the mark back, so
    the key is not burned.
15. **Errors** map as the handler's others do: missing key or a non-positive amount →
    `InvalidArgument`; not enough available gold → `FailedPrecondition`; no account → `NotFound`;
    no member in the context → `Unauthenticated`. No ledger entry (ADR-0093: as the credit).

### §D. The antidote (items-service catalogue, game-service)

16. **A new consumable template** `ANTIDOTE` ("Antidote", common, no healing, no mana), added by
    an additive items-service migration following the current numbering pattern (the migrations
    redesign is deferred). Tradeable and droppable as a small potion is. It is **not** in the
    Spire's random loot pool (promotion default: the merchant is the way to get one, which is what
    makes buying ahead a choice).
17. **Drinking from the bag** (charter default: the long-declared, unused `use_item` action, not a
    new ability-bar square): `use_item { item_entity_id }` on an item in the user's bag, in a run,
    while in play. An antidote **ends poison at once** (FS-5FZ4J §D R29's cure) and is spent (its
    entity removed; a seated item's instance recorded as consumed, as a drunk potion is). Refused
    with a `use_item` reply `{ success: false, reason }` and **not spent** when the drinker is not
    poisoned (`not_poisoned`), the item is not in their bag (`not_in_bag`) or is not usable
    (`not_usable`). On success, reply `{ success: true }`. No cooldown (promotion default).

### §E. The tome for sale (game-service; the FS-3103M change)

18. **The tome is offered rarely** (charter default): by **10%** of merchants, only when the run has
    no tome plan yet (FS-3103M's 2% roll did not fire) and the merchant's floor is below height − 1
    (a floor above it, not the top, can hold the Altar of Consecration).
19. **Offering commits the altar.** When a merchant offers the tome, the run's tome plan is set on
    that tick: the tome's floor is the merchant's, the altar's floor drawn uniformly from the next
    floor to height − 1, never the top, whether or not anyone buys it (as a rolled tome run places
    its altar whether or not the tome is taken, FS-3103M R9). No tome entity lies on the floor.
20. **Buying it** (R7–R10) sets the plan's `carried`: the party carries the tome (`tome_carried`
    on the wire, FS-3103M R14), exactly as taking a found tome does. Every other FS-3103M rule
    (burning at the altar, Vorsk) is unchanged.

### §F. The client (game-client)

21. **The merchant is drawn** at his position from his own baked sheet (§G), with a nameplate
    *"Wandering Merchant"* in the function-NPC ink and a soft lantern light. He is an E target in
    reach; E opens the **wares panel**.
22. **The wares panel** (a UI-scene window, ADR-0084–0086; world → UI data and a typed request back):
    a row per ware with its icon, name, price in gold and *"N left"*, and a **Buy** button; the
    buyer's **purse line** (the FS-7TGZ3 read, refreshed on open and after every purchase answer).
    Buy is disabled when `left` is 0 (*"Sold out"*) or a purchase is in flight. Closing it (Esc,
    walking out of reach, the merchant leaving the state) changes nothing on the server.
23. **Paying.** Buy sends `buy`; the row shows *"Paying…"* until the `buy` reply. Success: a
    success notice *"Bought: <ware>."* and the purse refreshes. Refusal: the panel shows the reason,
    in plain words (money clarity overrides lore): `not_enough_gold` → *"Not enough gold."*,
    `sold_out` → *"Sold out."*, `bag_full` → *"Your bag is full."*, `out_of_reach` → *"Too far
    away."*, `wallet_unavailable` / `no_wallet` → *"Your purse can't be reached. Nothing was
    taken."*, `tome_held` → *"You already carry a tome."*, `purchase_pending` → nothing new.
24. **Drink.** In the gear overlay, an antidote in the bag offers **Drink** (the bag item's action
    in place of equip for an antidote) and sends `use_item`. `not_poisoned` shows *"You are not
    poisoned."*; success plays the potion shimmer in the poison tint's colour and clears nothing
    else (the state's `poisoned_for` going away clears the tint).
25. **The antidote's icon** is its own baked item icon (§G), chosen by the icon resolver for the
    `ANTIDOTE` template.

### §G. Art (game-client bake)

26. **The wandering merchant**: a townsfolk build (FS-67QQY faces) with a heavy pack and a lantern,
    travel-worn cloak, built in code at Ultima Online fidelity, colours from `BARROW` tokens; idle
    in eight directions (he never walks). Its own art group fetched on demand the first time a
    state carries a merchant, with a stand-in until it lands (ADR-0071's pattern). **The antidote
    icon**: a small stoppered vial distinct from the health and mana potions and the tonic. A
    contact sheet of both is made for the owner's gate.

## User Stories

1. As a delver, I want to meet a merchant on some floors, so that the climb has a third respite.
2. As a delver, I want to buy health potions from him, so that I can recover between fights.
3. As a poisoned delver, I want to buy an antidote, so that I can end the poison before it kills me.
4. As a careful delver, I want to buy an antidote ahead of time, so that the next gas vent does not end my run.
5. As a delver, I want to pay with my account gold, so that what I earned outside the Spire matters inside it.
6. As a delver, I want to see each ware's price and what is left, so that I can decide before I buy.
7. As a delver, I want to see my gold beside the wares, so that I know what I can afford.
8. As a delver, I want a purchase to either land in my bag or cost me nothing, so that I never lose gold for nothing.
9. As a delver, I want to be told plainly why a purchase failed, so that I can fix it.
10. As a party, we want the merchant's stock shared, so that the first to buy gets it.
11. As a delver, I want a sold-out ware to refuse at once, so that I am not charged for nothing.
12. As a delver whose bag filled while paying, I want the item at my feet, so that I still get what I paid for.
13. As a delver, I want to drink an antidote from my bag, so that I can cure poison in the middle of a fight.
14. As a delver, I want an antidote to stay in my bag if I am not poisoned, so that I don't waste it.
15. As a delver, I want the merchant to rarely sell the Tome of Filth, so that a party with gold can choose to summon Vorsk.
16. As a delver who buys the tome, I want the altar to stand above, so that the purchase can be used.
17. As a delver, I want the merchant never to be attacked, so that his room is a real respite.
18. As the owner, I want the gold deducted over gRPC at the moment of sale, so that refresh-and-quit tricks can't keep goods the party never paid for.
19. As the owner, I want a retried purchase never to charge twice, so that a flaky network does not cost a player.
20. As the owner, I want the game loop never to wait on the wallet, so that a slow wallet never stalls a run.
21. As the owner, I want a paid purchase that could not be granted logged with its key, so that support can make it good.
22. As the owner, I want held bid gold excluded from what can be spent, so that a bid is never left unfunded.

## Acceptance Criteria

### wallet-service and proto

- [ ] `Debit` is in `wallet.proto`, generated Go regenerated and committed.
- [ ] `DebitUC`: a fresh key debits once and returns applied; the same key again debits nothing and returns not applied; not enough available gold (with held gold present) is `FailedPrecondition` and leaves the key unburned; missing key and non-positive amount are refused before the mark; the dedup row and balance commit in one transaction (§C R13–R15).
- [ ] The handler maps every error per R15 (handler tests).

### items-service

- [ ] An additive migration adds the `ANTIDOTE` consumable template (§D R16), with its down migration.

### game-service

- [ ] Merchant spawn odds, floors and room rules over a seed sweep; he is never hit, targeted or a trap/plate body (§A R1–R2).
- [ ] The `merchant` key serializes per R4 and is absent elsewhere.
- [ ] Each refusal of R6 replies at once with no reservation and no wallet call (a fake wallet counts calls).
- [ ] A purchase reserves on the tick, calls the debit off the tick with the purchase key and the buyer's token, and grants on a later tick; the tick does not block on a slow fake wallet (§B R7–R10).
- [ ] A transient failure is retried with the same key, at most 10 s; a refusal releases the reserve and replies the mapped reason (§B R9–R10).
- [ ] A full bag at grant drops the item at the buyer's feet; a buyer gone at grant logs and grants nothing (§B R10–R11).
- [ ] The purchase key is unique per buyer purchase and stable across retries.
- [ ] `use_item` with an antidote cures poison and spends it; not poisoned refuses and keeps it; other refusals per R17.
- [ ] The tome offer: 10% of merchants when no tome plan exists and a floor above can hold the altar; offering sets the plan; buying sets `tome_carried` (§E).
- [ ] The antidote is never rolled into a container or a kill drop.

### game-client

- [ ] The parser keeps `merchant`; he draws with his nameplate and is an E target (§F R21).
- [ ] The wares panel lists every ware with price, left and Buy; the purse line; disabled states (§F R22).
- [ ] *"Paying…"* until the reply; each reason's line (§F R23).
- [ ] Drink on an antidote sends `use_item`; `not_poisoned` shows its line (§F R24).

### Art

- [ ] The merchant and the antidote icon are baked from code with `BARROW` colours; a contact sheet is made for the owner's gate (§G).

## Edge States

- **Two buyers, one potion left.** The first buy applied on the tick reserves it; the second is
  refused `sold_out` at once. If the first's debit is refused, the potion returns to stock.
- **A buyer clicks Buy twice.** The second is refused `purchase_pending` while the first is in
  flight.
- **The wallet is down.** Retries for 10 s, then `wallet_unavailable`; the reserve is released and
  nothing was taken (a debit that applied but whose answer was lost within those 10 s is found by
  the retry with the same key and succeeds).
- **The buyer's token expired** (access tokens last 60 minutes): the debit is refused as
  unauthenticated and reported as `wallet_unavailable`; reconnecting refreshes the token the
  session keeps.
- **The buyer dies while paying.** On success the gold is spent and nothing granted (logged); an
  item granted just before death is an unsafe find and is lost as any find is.
- **Server restart mid-purchase.** The run ends; a debit that applied is logged by nothing (the
  process is gone): the accepted gap of ADR-0093.
- **The merchant's floor is changed by the party mid-purchase.** §B R12.
- **The tome offer and a found tome.** Mutually exclusive: an offer needs no tome plan; a rolled
  plan blocks offers.
- **Gold held in bids.** Not spendable; `not_enough_gold` even when the total would cover it.
- **A spectating (dead) delver opens the panel.** The client does not offer Buy to a delver out of
  play; the server refuses `not_in_play` anyway.

## Out of Scope

- Selling to the merchant, haggling, restocking, a hub shop.
- A ledger entry or reconciliation for in-run purchases (ADR-0093 consequence).
- Making good a paid purchase that could not be granted (logged only).
- An ability-bar square or hotkey for the antidote.
- Any HTTP contract change.
