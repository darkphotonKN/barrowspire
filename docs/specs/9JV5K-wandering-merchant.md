# FS-9JV5K: Wandering merchant

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout" (wandering merchant), "### Gameplay actions" (drink an antidote); `game-server/wallet-service/SPECIFICATION.md` "### Account" (idempotent gold debit for a purchase); `game-client/SPECIFICATION.md` "### Escape run" (buy from the wandering merchant · drink an antidote) → this FS · Also the change FS for: [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) (the tome can be bought; the altar then stands above), which carries `## Change: Wandering merchant → FS-9JV5K` · Siblings (same scoping session, 2026-11-25): [FS-5FZ4J](5FZ4J-sealed-floors.md) (the other two respites, trap poison), [FS-4EC7Z](4EC7Z-dungeon-encounters.md), [FS-X2CMM](X2CMM-class-books.md) · Related: [FS-P9G8R](P9G8R-drink-health-potions.md) (health potions), [FS-1GZGD](1GZGD-in-game-mailbox.md) (the idempotent credit the debit mirrors), [FS-7TGZ3](7TGZ3-gold-in-the-gear-overlay.md) (the purse read), [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md) (unsafe finds) · ADRs to record: "an in-run purchase debits the wallet over gRPC at the moment of sale, off the tick, idempotent per purchase" (not challenged)

## Scoping notes (raw)

Residue from the 2026-11-25 scoping session (Kranti), plus the charter defaults Kranti approved
the same day. **[owner]** = Kranti's words; **[charter default]** = the charter's pick.

### What [owner]

"Our first vendor, acting as a random spawn that is our third respite — has healing potions for
purchase (common rarity), antidote that allows poison trap heals once (so poison should last long
enough to hurt them till this point, or for them to want to proactively buy one), and on rare
occasion, the scroll that's needed to burn for the special boss." The "scroll" is FS-3103M's
**Tome of Filth**.

### Spawn [charter default]

- Floors 2+, never the top floor; on ~33% of floors; at most one per floor; in a room where no
  monster spawns (like the fountain, FS-5FZ4J). Any floor may also hold a fountain.
- Model: a town NPC model with a pack and lantern (built in code, gated on a contact sheet).

### Wares [owner: kinds; charter default: numbers]

| Ware | Price | Stock per merchant |
|---|---|---|
| Health potion (common) | 60 gold | 3 |
| Antidote (one use: ends trap poison) | 40 gold | 3 |
| Tome of Filth (rare offer) | 1500 gold | 1 |

- The tome is offered by ~10% of merchants, and only when the run's height leaves a floor above
  (not the top) where FS-3103M's Altar of Consecration can stand, and no tome has rolled in this
  run. When it is offered, the server commits to placing the altar on a floor above.
- Stock is shared by the party: first come.
- Bought items are **run finds** (unsafe, lost on death, FS-18Z5F). **[charter default]**

### Paying [owner]

"It calls a gRPC to deduct the gold directly, through the DDD way with a method like we have set
up now. Only way to keep it synced and safe, vs dealing with refresh and quit before finish
situations where gold benefited the party yet they're out somehow." Kranti: no stress-test needed
("it's fair across all classes and just spend to get an item, no gaming around an ability").
**(not challenged)**

- game-service owns a consumer-side interface for the wallet debit; wallet-service exposes an
  idempotent debit (usecase in the domain/usecase split, mirroring the idempotent credit of
  FS-1GZGD) over gRPC. Proto change → `make gen`, generated Go committed with it.
- Order **[charter default]**: refuse at once if the stock is gone, the bag is full or the buyer is
  out of reach; reserve the stock; make the gRPC call **off the tick** (never block the game loop);
  apply the result on a later tick: success → grant the item into the bag; failure (not enough
  available gold, no wallet account, wallet down) → release the stock and tell the buyer why.
- Idempotency key per purchase (run id + buyer + purchase sequence), so a retry never charges
  twice. Available gold excludes held gold (marketplace bids).
- The client shows prices and the buyer's purse (the existing wallet read, FS-7TGZ3).

### Antidote

- New item template in the items catalogue (content), consumable. **[charter default]**: drunk
  from the bag (the long-declared, unused `use` action), not a new ability-bar square. Ends
  poison at once; does nothing (and is not spent) when the drinker is not poisoned.

### Open questions (left for write-a-spec under the charter)

- If adding the antidote template needs a migration, an additive one is allowed (the migrations
  redesign discussion is deferred; new files follow the current pattern).
