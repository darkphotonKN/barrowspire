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
**Checkout** — the synchronous, conditional AVAILABLE → IN_RUN move of an account's worn and bag instances at seating, in one transaction, returning what moved. Not the marketplace "reserve" (that is AVAILABLE → LISTED). (FS-18Z5F, ADR-0032)
**Run fence** — the run id stored on an in-run instance; settlement releases (and applies) only instances carrying its run's id, and the member's next checkout re-tags orphans still fenced by an older run, as `listing_id` fences listings. (FS-18Z5F, ADR-0032)
**Consumed item** — an item instance used up during a run (a drunk health potion); its id rides the extraction event and its instance is deleted in the extraction transaction, before the run fence releases it, never returning to the stash or marketplace. Not "consumable" (an item type, which may sit unused) and not an AMQP-consumed event. (FS-P9G8R)
