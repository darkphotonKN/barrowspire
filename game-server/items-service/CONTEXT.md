# CONTEXT — items-service

Ubiquitous language for the **items-service** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## Terms

<!-- **Term** — one-line definition -->
**Base item** — a rarity-neutral item template (seeded at `normal`) whose stats are the centre of every roll made from it. (FS-F8T3H)
**Rolled rarity** — the tier picked for one dropped item at drop time, weighted by `drop_rate_multiplier`; stored on the item instance, not the template. (FS-F8T3H)
**Rarity tier** — one of Normal, Uncommon, Rare, Runed, Fabled (ascending); scales an item's stats and decides its name affixes. (FS-F8T3H)
**Item location** — where an owned, unworn-or-worn instance sits for its owner: **worn** (in the loadout), **bag** or **stash**. One field on the instance (worn is the loadout table). Independent of item status: a LISTED item still has a location. (FS-VPD8Y)
**Bag** (location) — the instances an account carries into a run or field world; at most 30. Same meaning as game-service's **bag** once seated. Not "inventory": that word stays the wire field and "everything an account owns". (FS-VPD8Y)
**Stash** — account storage in town, at most 60 instances; never checked out into a run or field world. Not a per-player container entity: an account's stash is its stash-location instances. (FS-VPD8Y)
**In-run** (`IN_RUN`) — the item status of an instance checked out into a live run or field world; tagged with that run's id. Fails every write that requires AVAILABLE or LISTED. (FS-18Z5F, ADR-0032)
**Reservation** — an item held LISTED for one listing id items minted at reserve; `reserved_at` set means it still waits for marketplace to create that listing. Fenced on the listing id, never the item alone. (FS-NXP1W Req 24a, ADR-0050)
**Confirmed reservation** — a reservation marketplace has matched to its listing: still LISTED under that listing id, `reserved_at` cleared, so the stale-reservation reconciler can no longer cancel it; only a release fenced on the same listing id hands the item back. (FS-04ZB6, ADR-0050)
**Checkout** — the synchronous, conditional AVAILABLE → IN_RUN move of an account's worn and bag instances at seating, in one transaction, returning what moved. Not the marketplace "reserve" (that is AVAILABLE → LISTED). (FS-18Z5F, ADR-0032)
**Run fence** — the run id stored on an in-run instance; settlement releases (and applies) only instances carrying its run's id, and the member's next checkout re-tags orphans still fenced by an older run, as `listing_id` fences listings. (FS-18Z5F, ADR-0032)
**Partial settlement** — an extraction event that settles only the members it lists (`partial`): their items stored and only their in-run instances under the run released; the rest of the run stays checked out. Its opposite, a **whole-run** event, releases every in-run instance of the run, except those of the **settled members** it names. (FS-GV8WN R6, R12)
**Settled members** (of an extraction) — `settled_member_ids` on a whole-run event: members already settled by their own partial events, whose instances its release leaves for those events. (FS-GV8WN R14, ADR-0040)
**Apply a settlement** (`ApplySettlement`) — game-service handing items an extraction directly, through the consumer's own path and inbox key; the asynchronous copy then arrives as a duplicate. Service-to-service, no member token. (FS-GV8WN R11, ADR-0040)
**Item grant** (`GrantItems`) — minting a fixed set of instances into a member's stash in one transaction, all-or-nothing: every instance fits under the stash cap or nothing is minted (`STASH_FULL`). Items only: a grant knows nothing of gold or letters. Minted exactly from the item snapshots it is given, with no roll and no drop rule, unlike a drop (contrast **Rolled rarity**). The member is the one in the caller's forwarded token. (FS-1GZGD)
**Item snapshot** — the full, self-contained description of an item to be minted: template, name, item type, base stats, durability, item level, required level, rarity, affixes and a unique's effect text, in the item-summary facts. `ResolveItemSnapshots` makes one from a template (a fresh item: base stats, `normal`, no affixes, at a chosen item level or the template's `min_item_level`) or from an existing instance (a copy of it as it stands, without owner, listing, status, location or run state); a grant mints from it. Only **representability** is checked (a known template, `Affix.wellFormed`, item level ≥ 1), never a drop rule. Not an instance: it has no id and no owner until a grant mints it. (FS-1GZGD A1, A2)
**Grant id** — the caller-minted unique key of one item grant (ADR-0009). A repeat with a known grant id mints nothing and answers with the first grant's result; that answer is "already granted", not an error. (FS-1GZGD, ADR-0044)
**Consumed item** — an item instance used up during a run (a drunk health potion); its id rides the extraction event and its instance is deleted in the extraction transaction, before the run fence releases it, never returning to the stash or marketplace. Not "consumable" (an item type, which may sit unused) and not an AMQP-consumed event. (FS-P9G8R)
**Listed-item cap** — the most item instances one seller may have LISTED or PENDING_SETTLEMENT at once (20). Checked on reserve under the seller's account lock, so an item reserved but not yet a listing counts. (FS-XEDFF)
