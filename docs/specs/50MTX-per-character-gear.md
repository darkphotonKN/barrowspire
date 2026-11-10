# FS-50MTX: Per-character gear

> Status: work-order · SPECIFICATION.md: none (a change FS has no thin line; owners [FS-VPD8Y](VPD8Y-town-stash.md), [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md), [FS-HBXZN](HBXZN-worn-items-not-listable.md), [FS-3R77D](3R77D-only-stash-items-can-be-listed.md) each carry a stub) · Related ADRs: [ADR-0072](../adr/0072-items-are-held-per-character-and-owned-per-account.md) (held per character, owned per account), [ADR-0032](../adr/0032-run-gear-is-checked-out-synchronously-to-in-run-not-escrowed-by-a-saga.md) (checkout and orphan reclaim), [ADR-0065](../adr/0065-only-items-in-the-stash-can-be-listed.md) (only stash items are listed), [ADR-0040](../adr/0040-players-settle-on-resolve-one-event-pair-per-player-applied-at-once.md) (partial settlement) · Supersedes in part: FS-VPD8Y R6 for the bag and loadout (the stash stays per account); FS-VPD8Y R4 for the bag cap's scope; FS-18Z5F R7's checkout set; FS-HBXZN R13–R16 (the picker's loadout read and "Worn" tag) · Not challenged: this design did not go through `challenge-me`.

## Summary

Each character gets its own equipped gear and its own bag, while the stash stays shared across the
account and is how items move between characters. An account keeps owning every item, so purchases,
mailbox grants and the marketplace work as they do today. Old test data is not backfilled: gear
held by old rows lands in the stash or is dropped from a loadout, and the game keeps working.

## Requirements

### The model

1. **Holding is separate from owning (ADR-0072).** `owner_member_id` stays the owner on every
   instance. `item_instances.character_id` is the character holding it.
2. **An instance is held exactly when it is in a bag.** `character_id` is set if and only if
   `location = 'BAG'`, enforced by a check constraint. A stash instance has no holder.
3. **A worn instance is always in its character's bag location.** Worn stays the loadout table
   (FS-VPD8Y R2), and a worn instance still does not count toward the bag.
4. **One loadout per character.** `player_loadouts` is unique on `character_id`, which is required.
   `member_id` stays on the row and every read and write filters by both.
5. **The bag cap of 30 counts per character. The stash cap of 60 counts per account.**
6. **The per-account lock stays** on every write that takes it today, across all of an account's
   characters.

### Migration

7. **One items-service migration, in this order:** delete `player_loadouts` rows with no
   `character_id`; set `location = 'STASH'` on every instance with `location = 'BAG'` and no
   `character_id`, whatever its status; drop the unique constraint on `member_id`; make
   `character_id` required and unique; add the R2 check.
8. **No backfill.** No old item or loadout is assigned to a character. Old stash items stay in the
   shared stash, old bag items join it, and old loadouts are gone while their items survive.
9. **The migration ships with the items-service code that uses it.** The old `ON CONFLICT
   (member_id)` writes fail once the constraint is dropped.

### Character ownership

10. **items-service checks the character belongs to the caller on `UpdateLoadout` and
    `MoveItemInstance`,** through a narrow consumer-owned interface backed by character-service's
    existing `GetCharacter(member, character)`. A foreign, deleted or unknown character is refused
    with `404 · NOT_FOUND`. The check runs before the transaction, never under the account lock.
11. **character-service being unreachable refuses the write** with `503 · SERVICE_UNAVAILABLE` and
    writes nothing.
12. **Reads need no such call.** They filter by both member and character, so a foreign character
    reads as empty.
13. **items-service is configured with character-service's address** through the same env-var
    pattern as its auth address, locally and in `deploy/kind/items-config.yaml`.

### Loadout writes (`UpdateLoadout`)

14. **Equipping claims the instance.** It sets `character_id` to the character and `location` to
    `BAG`, in the same transaction as the slot write.
15. **Only an instance with no holder or held by this character can be equipped.** An instance held
    by another character, not owned by the caller, or absent is refused with `404 · NOT_FOUND`. This
    also closes today's gap, where an unowned id was not refused.
16. **Not-AVAILABLE is refused as today** with `ITEM_NOT_AVAILABLE`.
17. **A displaced instance goes to the same character's bag,** on an unequip and on a swap
    (FS-VPD8Y R16, R17). `BAG_FULL` applies against that character's bag (R18).

### Moves (`MoveItemInstance`)

18. **The request names the character** in both directions.
19. **Stash to bag sets the holder. Bag to stash clears it.** The move stays conditional on owner
    and status.
20. **An instance held by another character answers `404 · NOT_FOUND`.** `ITEM_WORN`,
    `ITEM_NOT_AVAILABLE`, `BAG_FULL` and `STASH_FULL` answer as today, with `BAG_FULL` measured
    against this character.
21. **A move to where the instance already is stays a no-op success.**

### Reads

22. **The loadout read takes the character** and returns only that character's row. No row reads as
    an empty loadout, as today.
23. **The instance list takes an optional character.** With one: that character's held instances
    plus the account's stash. Without one: the stash only. Another character's held instances are
    never returned.
24. **`ItemInstance` carries its `character_id`** on the wire and on gRPC, absent for a stash item.

### Run and field checkout

25. **`CheckOutRunGear` takes the character.** Its set is that character's worn and bag instances.
    Idempotency and the response shape are as FS-18Z5F R10, R11.
26. **Orphan reclaim stays per member (FS-18Z5F R9).** Reclaimed instances of any of the account's
    characters move to the new run, are not seated unless the character holds them, and are
    released at that run's settlement.
27. **Checkout needs no character-service call.** It is not reachable from the gateway, and
    game-service already resolved the character for the member at hub entry.

### game-service

28. **Every gear read and checkout passes the character in play:** hub seating, the loadout
    pre-check, field entry, run seating, and handoff.
29. **A handoff checks out before `SeatArrival`,** so it takes the character from the run's expected
    roster.

### Settlement

30. **`PlayerItems` carries `character_id`.** Run settlement, partial settlement and field visits all
    set it.
31. **Finds are held by the event's character.** Brought-in instances the run still owns stay or
    become held by it, and the loadout write is keyed by it.
32. **An event with no `character_id`** (written before this ships) puts its finds and applied
    instances in the stash with no holder, leaves every loadout untouched and logs a warning. It
    never fails on R2.
33. **Consumed-item deletion and release by run id are unchanged,** including partial settlement.

### Account-level flows (unchanged)

34. **Purchases and mailbox grants land in the stash with no holder,** as today.
35. **Only stash items can be listed (ADR-0065),** so a held item is refused as today, with
    `ITEM_WORN` still answering first for a worn one.

### Contract and client

36. **The contract is regenerated, never hand-edited:** `make openapi && make client`, committed
    with the handlers.
37. **The hub's gear overlay and stash read and write as the active character.** Changing character
    shows that character's gear and bag on the next open.
38. **The List-a-relic picker no longer reads the loadout.** A relic is listable when it is in the
    stash and AVAILABLE; a worn relic is in a bag and so never appears. The Bazaar needs no active
    character.

## User Stories

1. As a player, I want each of my characters to wear its own gear, so that my characters feel distinct.
2. As a player, I want each character to carry its own bag, so that packing for one does not disturb another.
3. As a player, I want a new character to start with empty gear and an empty bag, so that it starts fresh.
4. As a player, I want one stash across my account, so that I can pass items between my characters.
5. As a player, I want to put an item in the stash on one character and take it out on another, so that moving gear is simple.
6. As a player, I want to change character from the menu and see that character's gear, so that the switch is real.
7. As a player, I want my bag limit to apply per character, so that one full bag does not block another character.
8. As a player, I want the stash limit to stay across my account, so that its size stays predictable.
9. As a player, I want a delve to carry only the delving character's gear, so that my other characters' items stay home.
10. As a player, I want a character's finds to come home to that character's bag, so that loot lands where I earned it.
11. As a player, I want my gear back when a run dies mid-way, whichever character I next play, so that nothing stays locked forever.
12. As a player, I want what I buy to land in the stash, so that any of my characters can take it.
13. As a player, I want mailbox items to land in the stash, so that they are never tied to the wrong character.
14. As a player, I want to list relics from the Bazaar without choosing a character, so that selling stays simple.
15. As a player, I want a worn item kept off the listing picker, so that I do not sell what a character is wearing.
16. As a player, I want one character unable to equip what another holds, so that an item is never in two places.
17. As a player, I want my old stash items still there after this ships, so that the change does not empty my account.
18. As a player in two tabs, I want each tab's character to act on its own gear, so that the tabs do not corrupt each other.
19. As a player, I want a refused move to tell me why and show my real bag and stash, so that the screen stays honest.
20. As a server, I want a character id from a client checked against its caller, so that no one can write to another player's character.
21. As a server, I want a held item to always have a holder and a stash item never to, so that no item can become unreachable.
22. As a server, I want the account lock kept across characters, so that two characters cannot both claim one stash item.
23. As a server, I want a pre-deploy settlement event to settle safely, so that a deploy cannot dead-letter a run.
24. As a developer, I want no data backfill now, so that alpha test data does not cost a migration project.
25. As a developer, I want the holder enforced in the database, so that a query bug cannot create limbo items.

## Acceptance Criteria

- [ ] Two characters of one account hold different loadouts and different bags; a write to one leaves the other unchanged.
- [ ] A new character reads an empty loadout and an empty bag, without error.
- [ ] A row with `location = 'BAG'` and no `character_id`, or `location = 'STASH'` with one, is rejected by the database.
- [ ] The migration applies over existing data with old `BAG` rows and old loadouts; old items end in the stash with no holder and no error is raised at runtime.
- [ ] Equipping a stash item sets the holder and moves it to `BAG`; unequipping leaves it in that character's bag.
- [ ] Equipping an item held by another of the caller's characters, not owned by the caller, or absent → `404 · NOT_FOUND`, nothing written.
- [ ] `UpdateLoadout` or `MoveItemInstance` naming a foreign, deleted or unknown character → `404 · NOT_FOUND`, nothing written.
- [ ] character-service unreachable on those writes → `503 · SERVICE_UNAVAILABLE`, nothing written.
- [ ] Stash to bag sets the holder; bag to stash clears it; a same-location move changes nothing; another character's item → `404 · NOT_FOUND`.
- [ ] `BAG_FULL` is measured per character and `STASH_FULL` per account; 30 in one character's bag does not block another's.
- [ ] Instance list with a character returns that character's held instances plus the stash; without one, the stash only; another character's are never returned.
- [ ] Loadout read of a foreign character returns an empty loadout with no character-service call.
- [ ] Checkout moves only the named character's worn and bag instances to `IN_RUN`; another character's stay `AVAILABLE`.
- [ ] Checkout reclaims every `IN_RUN` instance of the member, whichever character holds it; those not seated are released at that run's settlement.
- [ ] Settlement inserts finds held by the event's character and writes that character's loadout; another character's loadout is untouched.
- [ ] An event with no `character_id` settles: finds and applied items in the stash with no holder, no loadout written, a warning logged.
- [ ] Hub seating, the loadout pre-check, field entry, run seating and handoff each read or check out the character in play.
- [ ] A purchase and a mailbox grant land in the stash with no holder.
- [ ] The List-a-relic picker works with no active character and shows no held item.
- [ ] The hub gear overlay shows the active character's gear and bag after Change character.
- [ ] `openapi.yaml` and the generated client are regenerated, not hand-edited.

## Edge States

- **Fresh character:** no loadout row, empty bag; reads answer empty and the first equip creates the row.
- **Two tabs, different characters:** each writes its own; the account lock serializes them.
- **Two characters claiming one stash item at once:** the account lock orders them; the second gets `404 · NOT_FOUND`.
- **Character in a run edits from another tab:** an `IN_RUN` item refuses as today; that character's other gear follows existing rules.
- **Orphaned `IN_RUN` gear, then a different character plays:** reclaim moves it to the new run; settlement releases it to its holder's bag, or to the stash for an old row.
- **Run killed before settling:** as FS-18Z5F; the holder is untouched, so the gear returns to the same character.
- **Old row in a loadout at migration:** the row is deleted and the item survives, unworn.
- **Listing of an old bag item, live at migration:** becomes a stash item; if it ends unsold it stays in the stash.
- **Item deleted while worn:** the slot clears through the foreign key, as today.
- **Settlement for a character deleted during the run:** applies as normal; the items are held by a character no one can select (see Out of Scope).
- **Stash over 60 after old bag items join it:** caps refuse growth and never remove (FS-VPD8Y R5); moves out still succeed.
- **Unauthorized:** no or bad token → `401 · UNAUTHENTICATED`; another account's item or character → `404`, never `403`, so ownership is not disclosed.

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `get-loadout` (changed) | `GET /api/characters/{characterId}/loadout` (was `GET /api/items/loadout`) | `characterId` path, uuid | none | `200`, as today, for that character; empty if none | `401 · UNAUTHENTICATED`; `422 · VALIDATION_FAILED` malformed id; `500 · INTERNAL_ERROR` |
| `update-loadout` (changed) | `PUT /api/characters/{characterId}/loadout` (was `PUT /api/items/loadout`) | `characterId` path, uuid | as today: `slot` required, `item_instance_id` optional | `200`, as today | `401 · UNAUTHENTICATED`; `404 · NOT_FOUND` foreign, deleted or unknown character, or an item not available to it; `400 · ITEM_NOT_AVAILABLE`; `400 · BAG_FULL`; `422 · VALIDATION_FAILED`; `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` character-service unreachable |
| `list-item-instances` (changed) | `GET /api/items/instances` | `characterId` query, uuid, optional | none | `200`, as today, scoped per R23; each item gains `character_id`, absent for a stash item | as today, plus `422 · VALIDATION_FAILED` malformed `characterId` |
| `move-item-instance` (changed) | `PUT /api/items/instances/{id}/location` | `id` path, uuid | `location`: `bag` \| `stash`, required; `character_id`: uuid, required | `200`, as today | as today, plus `404 · NOT_FOUND` foreign, deleted or unknown character or an item held by another character; `503 · SERVICE_UNAVAILABLE` character-service unreachable |

## Out of Scope

- **Backfilling old items or loadouts onto characters.** Deferred, and a later migration exercise.
- **What happens to a deleted character's gear.** It stays in the database but is unreachable. The follow-up is a `character.deleted` event that moves it to the stash; character-service has no outbox yet.
- **Level or class checks at equip time.** Seating still enforces level (FS-BDA7X R31). FS-BDA7X's reason for leaving equip unchecked no longer applies, so this is open for later.
- **Direct character-to-character transfer.** The stash is the path (ADR-0072).
- **A per-character stash, stash tabs, or changes to the stash cap.**
- **Releasing `IN_RUN` gear without a checkout** (a liveness lease or sweeper; ADR-0032 rejects a sweeper for v1).
- **`player_profile`'s per-account level.** Unrelated to gear.
- **marketplace-service, auth, wallet, ledger, payment, notification, stats:** no behaviour changes. character-service needs no change for this work.
