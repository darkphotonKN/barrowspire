# FS-P9G8R: Drink health potions

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (drink an equipped health potion); `game-server/items-service/SPECIFICATION.md` "## Run extraction" (consumed items removed at extraction); `game-client/SPECIFICATION.md` "### Escape run" (potion count and drink key on the HUD) → this FS · Related ADRs: [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WebSocket contract) · Builds on: [FS-F8T3H](F8T3H-fantasy-loot-and-dev-seed.md) (Lesser / Greater Heal Potion templates), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (the Health and resource HUD; mana potions stay out there too), [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (extracted items applied once, in one transaction), [FS-9K8EZ](9K8EZ-die-by-choice.md) (the run's ESC menu owns keys 1/2 while open; `forfeit_run` routing), [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 17 (resolved delvers act no more), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) ("death loses everything") · Vocabulary: **Consumed item** ([`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md)); no other new terms

## Summary

Healing potions exist, drop, rarity-scale and ride the loadout into a run, but nothing in the
game ever applies them. This feature gives the delver one key: **1 drinks a health potion**
from their consumable slots and heals them at once. The server decides everything (which slot,
whether the drink is allowed, how much it heals). A drunk potion is gone for good: the run
reports it as a **consumed item** in its extraction event and items-service deletes its
instance in the same transaction as the rest of the extraction, so it never returns to the
stash or the marketplace. The run's HUD shows how many health potions the delver carries, with
the key that drinks them.

**Lane:** every slice is agent-built, server included (decided at `/spec-to-issues`; no human
blocks).

**Scoping record.** Scoped 2026-10-31 from a "healing potions don't work" report, **not
challenged** (the persistence decision converged without pushback; the user chose to lock
without a challenge-me pass). The draft's open questions were settled by user-approved charter
defaults; each is marked *(charter default)* below with its reason.

**Why this is a feature, not a fix** (verified in code at promotion):
- `HealingAmount` travels items-service template → `item_pool.go` → `loot_roll.go`
  (rarity-scaled) → `factory.go` → `components.ItemComponent` → `serializer/state_serializer.go`
  → `extracted_item.go`. No ECS system reads it.
- There is no client → server "drink" message. (`ActionUseItem = "use_item"` in
  `game-service/common/constants/game.go` and `ActionType.Use = "use"` in the client are dead
  constants nothing handles; this FS does not reuse them.)
- No stacking exists: `item_instances` has no quantity column, `max_stack_size` lives only on
  the `consumables` template, and the serializer hard-codes `Quantity = 1` on every loadout
  item. Each potion is its own instance.
- Extraction (`items-service ProcessItemsExtracted` → `storeExtractedPlayerItems`) upserts the
  extracted items and the loadout and deletes nothing, so a potion that merely vanished from its
  slot would keep its `item_instances` row: still in the stash, still sellable. Persistence is
  therefore in scope.

## Requirements

### A. Drinking (game-service)

1. **A health potion** is an item of type consumable whose `HealingAmount` is above 0. A
   consumable with only `ManaAmount` (a mana potion) is not one: never drunk by this feature,
   never counted. The client counts by the same rule (R23).
2. **A new inbound WebSocket action `drink_potion`, with no payload fields of its own**
   *(charter default: an intent-only message keeps the slot rule on the server, the one place
   it can be trusted; a general `use_consumable` was rejected as premature until mana potions
   are scoped)*. The client's `SocketManager` stamps `player_id` onto every send as usual; the
   server ignores it. **Who drinks comes from the connection's player record**
   (`GetPlayerFromConn`), routed on the message hub's loop beside `forfeit_run` (FS-9K8EZ), not
   from the payload.
3. **Escape runs only** *(charter default: the HUD and the key are a run's; the hub is a safe
   zone with no damage, and field worlds have their own death/respawn rules that this v1 does not
   reason about)*. A `drink_potion` from a player whose record names the hub, a field world, or
   no world is a silent no-op.
4. **The drink is an intent applied on the run's tick.** The hub hands the run a drink request
   for the member; the run queues it and applies it at the start of the next tick, as other
   client actions are (`queueIntent` / `applyIntents`), so it never races the systems. All
   checks (R5–R7) are made when it is applied, against the world as it is then.
5. **Which potion:** the lowest consumable slot holding a health potion, in the order
   Consumable1 → Consumable2 → Consumable3 *(charter default: the player controls order by how
   they equip; "smallest heal first" was rejected in scoping because one key could then never
   force a Greater potion in an emergency)*. Empty slots and slots holding a non-health
   consumable are skipped.
6. **Refusals are a silent server no-op**: nothing changes, the potion is kept, the cooldown is
   not started, and no reply or error message is sent (debug log only) *(charter default: every
   refusal is one the HUD already explains, by a full Health bar, a resolved card or a count of
   0, so a notice would only add noise)*. The drink is refused when:
   - the delver is not in play: dead, escaped or left behind (`systems.InPlay` false, FS-77AB6
     R17), which includes a delver whose run has resolved;
   - the delver is at full health (`CurrentHealth >= MaxHealth`);
   - the delver's drink cooldown is running (R9);
   - no consumable slot holds a health potion.
7. **A drink that is allowed:** `CurrentHealth` becomes `min(MaxHealth, CurrentHealth +
   HealingAmount)` using the potion's own `HealingAmount` (already rarity-scaled at its roll).
   A heal that overshoots is capped; the remainder is lost (no partial potion is kept).
8. **The potion is used up in the same application:** its item entity is removed from the
   world and its slot on the delver's `EquipmentComponent` is emptied. Health and the emptied
   slot reach the client through the normal state broadcast (the serializer already sends
   `current_player.equipment.consumable_1..3`); no new outbound message.
9. **Cooldown: 1.0 s, shared across all three slots, per delver, server-enforced, measured in
   simulation time** (ticks), started by an allowed drink only *(charter default: long enough
   that three potions cannot be chugged in one frame, short enough not to feel like a lockout;
   no HUD indicator in v1 to keep v1 small)*. Two drinks applied in the same tick: the first is
   judged, the second meets the cooldown.
10. **A consumed item is recorded on the delver.** When the drunk potion carries an
    `InstanceID` (it came from the stored loadout and has an `item_instances` row), that id is
    added to the delver's record of consumed items for this run. A potion with no `InstanceID`
    (looted in this run) is drunk the same way but records nothing: it has no row to delete.
11. **The record lives with the delver's body**, so it survives everything the body survives:
    a floor change (`persistentEntityIDs` keeps player entities), death, escape, leaving the
    barrow early after dying (FS-QPDKN: the body stays for settlement).
12. **ECS shape:** the cooldown and the consumed record are plain data on the delver (a
    component); the decision (R5–R9) and the cooldown countdown are system/session behaviour,
    tested through the run. No component grows methods beyond `Type()`.

### B. Consumed items leave the stash (game-service settlement, proto, items-service)

13. **Proto:** `PlayerItems` in `common/api/proto/events/game.proto` gains `repeated string
    consumed_item_ids = 5;` (canonical UUID strings) *(charter default: an additive proto3 field
    is backward compatible with events already in the outbox, which read as "nothing
    consumed")*. `game.pb.go` is regenerated from the `.proto` (`make gen` in `common/`), never
    hand-edited.
14. **The run's end carries them.** `getRawMatchState` reads each delver's consumed record onto
    their `RawPlayerState`; `rankPlayers` carries it onto `RankedPlayerState` (it already copies
    each settled field by hand, so a forgotten copy silently drops the ids); `formatMatchData`
    writes it to `PlayerItems.consumed_item_ids`. Order is not significant; ids are unique.
15. **The death path is not changed** *(charter default: consumed ids ride whatever per-player
    extraction entry the run already sends)*. Verified at promotion: a dead delver's body stays
    in the world until the run ends and `getRawMatchState` builds an entry for every player body,
    dead or escaped, so a dead delver's consumed ids are carried exactly like a survivor's. No
    gap for death. (See Edge States for the separate, pre-existing removed-body gap.)
16. **Field visits carry none.** `PublishFieldVisit` sends no consumed ids (nothing can be drunk
    in a field, R3); its event shape is otherwise unchanged.
17. **items-service deletes consumed items in the extraction transaction.** In
    `storeExtractedPlayerItems`, for each `PlayerItems`, the consumed ids are deleted with
    `DELETE FROM item_instances WHERE id = ANY($ids) AND owner_member_id = $member` inside the
    existing transaction opened by the FS-BVM9H inbox mark *(charter default: the inbox already
    dedups the event and the transaction already makes extraction all-or-nothing, so the delete
    inherits both for free)*. The query lives in the repository layer (a `tx`-taking method), the
    call in the service.
18. **The delete is the member's last write**, after the item upsert and after the loadout
    upsert. The loadout's slot columns are `REFERENCES item_instances(id) ON DELETE SET NULL`, so
    deleting last can never trip a foreign key and clears any slot still pointing at the consumed
    instance.
19. **Applied when `loadout_unknown` is set too**: the items are upserted, the consumed ids are
    deleted, the stored loadout is left as it is (its now-dangling slot is nulled by the FK). The
    early return for an unknown loadout must not skip the delete.
20. **Idempotent and owner-scoped.** An id that no longer exists, or belongs to another member,
    matches nothing and is not an error. An empty list issues no query. A redelivered event is
    already turned away by the inbox (FS-BVM9H).
21. **A consumed id that is not a UUID fails the event** as a malformed event, the same way a
    malformed member id or instance id does today (`ErrUUIDCouldNotBeParsed`), so the producer
    bug surfaces instead of half-applying.
22. **No schema change** *(charter default)*. No migration; `item_instances` and
    `player_loadouts` are used as they are.

### C. The potion cell and the key (game-client)

23. **The count** is the number of health potions (R1) in the current player's
    `equipment.consumable_1..3` from the latest state: 0 to 3. It updates live with every state;
    a drunk potion's emptied slot lowers it, an in-run equip raises it. Teammates' potions are
    never shown.
24. **The potion cell** sits beside the existing `ResourceHud` bars at the bottom left: the
    `potion_health` icon (`itemIcons.ts`, the same art the gear overlay uses), the count, and the
    key label `[1]` signalling "this key drinks". It is shown exactly when the Health / resource
    panel is (in the delve: up from the first state, down once resolved) and never overlaps the
    ability card or the leave button. Neutral HUD register, per `game-client/docs/design-guideline.md`.
25. **At 0 the cell stays, dimmed, showing "0"** *(charter default: a stable layout, and the key
    stays learnable even with no potion equipped)*. It is not hidden.
26. **A named action `drinkPotion` mapped to key ONE in one place** *(charter default:
    keybind-ready; a future rebinding layer changes the one mapping and nothing else)*. The HUD's
    `[1]` label and the controls panel's "1" are read from that mapping, never typed again.
27. **Pressing the key sends `drink_potion` once per press**, with an empty payload, while the
    player is in the delve. The client may skip the send when the count is 0 or the player is
    resolved (the server would refuse it anyway); it never predicts the heal or the slot. Holding
    the key does not repeat.
28. **The key does nothing while the run's ESC menu (or its confirm) is open** (FS-9K8EZ R5: the
    menu owns the keyboard; there ONE picks a row). The menu polls ONE with `JustDown` every
    frame, so the drink must be an event binding (`keydown-ONE`) gated on `this.menu`, like E/F/
    I/Q/H, not a second `JustDown` poll of the same key (one poll would steal the other's press).
29. **The controls panel (H) lists "1 — Drink potion"**.
30. **Feedback is the Health bar.** The client has no floating heal or combat text to reuse
    (checked at promotion), so per the charter there is none: no new art, sound, animation or
    notice. Refusals show nothing *(charter default)*.
31. **BarrowspireScene only** *(charter default)*. The hub scene and `FieldScene` get no potion
    cell and do not bind the key.

## User Stories

1. As a delver, I want to press 1 to drink a health potion, so that I can recover mid-fight
   without opening my gear.
2. As a delver, I want the drink to heal me at once, so that it can save me from the next hit.
3. As a delver, I want the heal to stop at my maximum health, so that I understand a potion
   cannot over-heal me.
4. As a delver at full health, I want pressing 1 to do nothing and keep my potion, so that a
   stray key press does not waste it.
5. As a dead or escaped delver, I want key 1 to do nothing, so that I cannot spend potions from
   beyond the run.
6. As a delver, I want a short cooldown between drinks, so that the game stays a fight and not
   a one-frame triple chug.
7. As a delver who mashes 1, I want only the first press inside the cooldown to count, so that I
   do not lose all three potions to one panic.
8. As a delver, I want key 1 to drink from my first potion slot first, so that I control which
   potion goes next by how I equip.
9. As a delver carrying a mana potion in slot 1 and a health potion in slot 2, I want key 1 to
   skip the mana potion, so that it always heals.
10. As a delver, I want to see how many health potions I carry next to my Health bar, so that I
    know how much healing I have left.
11. As a delver, I want the potion cell to show the key that drinks, so that I learn the key
    without opening the controls panel.
12. As a delver with no health potion, I want the cell to stay, dimmed at 0, so that the HUD
    does not jump around and I remember the key exists.
13. As a delver who drinks, I want the count to drop with the next state, so that the HUD stays
    honest.
14. As a delver who equips a potion I looted in the run, I want the count to rise and key 1 to
    drink it, so that found potions are useful at once.
15. As a delver with the ESC menu open, I want key 1 to pick the menu row and not drink, so that
    I never drink by accident while choosing to fall.
16. As a new player, I want the controls panel to list "1 — Drink potion", so that I can find
    the key.
17. As a delver, I want a potion I drank to be gone from my stash after the run, so that drinking
    costs me something.
18. As a delver who dies after drinking, I want the drunk potion gone too, so that dying is
    never a way to keep potions.
19. As a delver who drinks on floor 1 and extracts from floor 3, I want the potion still recorded
    as consumed, so that floors never resurrect it.
20. As a marketplace buyer, I want never to see a potion that was already drunk listed for sale,
    so that I am not sold an item that no longer exists.
21. As the economy owner, I want drunk potions deleted in the same transaction as the rest of the
    extraction, so that a partial failure never leaves a potion both consumed and kept.
22. As the economy owner, I want a redelivered extraction event to delete nothing twice and fail
    nothing, so that retries are safe.
23. As the economy owner, I want consumed items deleted even when the run never read the stored
    loadout, so that an unknown loadout is never a duplication hole.
24. As the economy owner, I want the delete scoped to the member who drank, so that a bad id can
    never remove another player's item.
25. As a game-service developer, I want the drinker taken from the connection rather than the
    payload, so that nobody can drink another delver's potion.
26. As a game-service developer, I want the drink applied on the tick, so that it never races the
    systems mid-update.
27. As a client developer, I want the drink key defined once as a named action, so that a later
    rebinding feature changes one mapping.
28. As a player in the hub or a field, I want key 1 to do nothing and no potion cell to show, so
    that runs alone have potions in v1.
29. As a teammate, I do not want to see my party's potion counts, so that the HUD stays mine.
30. As an operator, I want an older extraction event without consumed ids to apply exactly as
    before, so that the rollout needs no drain.

## Acceptance Criteria

### Drinking (game-service)
- [ ] `drink_potion` from a delver in play in a run, below max health, off cooldown, with a
      health potion in Consumable1, heals them by its `HealingAmount` on the next tick, removes
      the item entity and empties Consumable1.
- [ ] A heal that would pass `MaxHealth` stops at `MaxHealth`.
- [ ] With Consumable1 empty or a mana potion and health potions in 2 and 3, slot 2 is drunk.
- [ ] Each refusal leaves health, slots, item entities, cooldown and consumed record untouched
      and sends no message: full health; dead; escaped; left behind; on cooldown; no health
      potion equipped; world is the hub; world is a field; no world.
- [ ] Two `drink_potion` in the same tick drink one potion; a third 1.0 s of simulation time
      after the first is allowed (table test: 0.99 s refused, 1.0 s allowed).
- [ ] The drinker is the connection's player; a `player_id` in the payload naming someone else
      changes nothing about who drinks.
- [ ] Drinking a stored-loadout potion records its instance id on the delver; drinking a potion
      looted this run records nothing.
- [ ] The consumed record survives a floor change.
- [ ] `go test ./...` and lint pass in game-service.

### Consumed items leave the stash
- [ ] `PlayerItems.consumed_item_ids = 5` exists in `game.proto`; `game.pb.go` is regenerated,
      not hand-edited, and both game-service and items-service build against it.
- [ ] A run in which a delver drank two stored potions publishes an `items.extracted` whose
      `PlayerItems` for that member lists both ids; for a delver who died after drinking, too.
- [ ] A field visit's `items.extracted` carries no consumed ids.
- [ ] items-service, given an event with consumed ids, deletes exactly those instances owned by
      that member, in the extraction transaction, after the item and loadout upserts.
- [ ] With `loadout_unknown` set, the consumed instances are still deleted and the stored
      loadout's slot that pointed at one reads empty afterwards.
- [ ] An id already deleted, or owned by another member, deletes nothing and does not fail the
      event; an empty list issues no delete.
- [ ] A redelivered event deletes nothing and returns `ErrAlreadyProcessed` (FS-BVM9H).
- [ ] A failure later in the transaction rolls the delete back with everything else.
- [ ] A consumed id that is not a UUID fails the event as malformed.
- [ ] An event without the field (older producer) applies exactly as before.
- [ ] `go test ./...` and lint pass in items-service.

### The potion cell and the key (game-client)
- [ ] In a run, a potion cell (icon, count, `[1]`) sits beside the Health / resource bars,
      shown and taken down with them.
- [ ] The count equals the health potions in `current_player.equipment.consumable_1..3`
      (0–3), mana potions excluded, updated on every state.
- [ ] At 0 the cell is dimmed and reads 0.
- [ ] Pressing 1 in play sends one `drink_potion` with an empty payload; holding 1 sends one.
- [ ] With the ESC menu or its confirm open, 1 picks the row and sends no `drink_potion`.
- [ ] The controls panel lists "1 — Drink potion"; the HUD label and the panel row both read
      the key from the single `drinkPotion` mapping.
- [ ] The hub and field scenes show no potion cell and send nothing on 1.
- [ ] Client tests, typecheck and lint pass.

## Edge States

- **Empty:** no consumable equipped, or only mana potions → count 0, cell dimmed, key sends
  nothing (or sends and is refused silently).
- **Full health:** refused, potion kept. The delver sees a full Health bar and an unchanged
  count.
- **Concurrent presses:** queued intents apply in arrival order on one goroutine; the cooldown
  makes the second and later inside 1.0 s no-ops. Two delvers drinking on the same tick are
  independent.
- **Drink and lethal hit on the same tick:** the intent applies before combat (`applyIntents`
  runs first), so a drink can save a delver from a hit landing that tick; a delver already at 0
  health and eliminated on an earlier tick is not in play and cannot drink.
- **Disconnected mid-cooldown, reconnected (grace hold):** the body and its component kept the
  cooldown and the record; nothing resets.
- **Body removed before the run's end (pre-existing gap, not fixed here):** a member whose body
  is taken out of the run before its end snapshot (`removePlayerLocked`, e.g. the disconnect
  cleanup path in `gameserver/handler.go` for a member not held for settlement) gets no
  `PlayerItems` entry at all, so their consumed ids are lost with it and the drunk potion keeps
  its row in the untouched stored loadout. Resolved delvers are kept for settlement
  (FS-QPDKN R18–R22) and are not affected; only an in-play member whose body is removed is.
  Recorded here per the charter; fixing settlement for removed bodies is its own work.
- **Death:** handled; the body stays and is settled with the run (R15). Note, separately, that
  the extraction event carries no escape/death flag and items-service stores what a dead delver
  wore exactly as for a survivor; whether "death loses everything" (FS-4R9M9) is enforced
  anywhere is outside this FS.
- **Floor change:** player entities and their worn items persist; the consumed record rides the
  body (R11). A drunk potion's entity is already removed, so it is not "kept" onto the new floor.
- **Run resolved / shutting down:** a world already shut down applies no intents; a resolved
  delver is not in play. Either way a late drink is a no-op.
- **Extraction failure / retry:** the delete is inside the inbox transaction; a failed attempt
  rolls back with the loot and is retried whole; a duplicate is turned away by the inbox.
- **Unknown loadout:** consumed ids deleted all the same; the stored loadout is otherwise
  untouched (R19).
- **Fenced (listed) items — assumption:** no `listing_id` check is made on drink. Assumed: an
  item listed or frozen on the marketplace cannot be in a run loadout, so a drinkable potion is
  never fenced. If that assumption is ever broken, R17's owner-scoped delete would still remove
  a listed instance; the listing fence (`item_instances.listing_id`) would need a check here.
- **Teammates:** never shown, never drinkable by another member (identity from the connection).
- **Unauthorized:** a connection with no player record, or a player in another world, is a
  silent no-op.
- **Hub / field:** no cell, no binding, server no-op (R3, R31).
- **A potion with both healing and mana:** no template exists today; by R1 it counts and drinks
  as a health potion, and its mana part stays unapplied (FS-8AY7S keeps `ManaAmount` unapplied).

## WebSocket message surface

No HTTP endpoint changes; the gateway and `openapi.yaml` are untouched.

| Direction | Action | Payload | Reply |
|---|---|---|---|
| client → server | `drink_potion` | none of its own (`player_id` auto-stamped by `SocketManager`, ignored) | none; the effect arrives in the next state broadcast (health, `equipment.consumable_N`) |

Event contract (RabbitMQ, `items.extracted`): `PlayerItems.consumed_item_ids` (`repeated
string`, field 5), canonical UUIDs of consumed item instances, empty when none.

## Out of Scope

- Mana potions / restoring a class resource (`ManaAmount` stays unapplied, as in FS-8AY7S).
- Real stacking: quantity on instances, `max_stack_size`.
- A keybind settings UI or any rebinding (only the single named mapping is built).
- Potion keys 2 and 3, a per-slot quick bar, choosing which potion to drink.
- Buffs (`buff_duration`), heal-over-time.
- A cooldown indicator on the HUD (radial sweep or otherwise).
- Drink animation, sound, new art, floating heal text, refusal notices.
- Drinking in the hub or in field worlds; field-world settlement changes.
- Fixing the pre-existing removed-body settlement gap (Edge States) or enforcing "death loses
  everything".
- The matchmaker / `match_queue` (user-owned), the marketplace, the api-gateway and its
  `openapi.yaml`.
- Any `SPECIFICATION.md` / `CONTEXT.md` edit (the thin lines and the *Consumed item* term exist).
