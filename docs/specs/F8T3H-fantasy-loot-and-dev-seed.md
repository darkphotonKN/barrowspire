# FS-F8T3H: Fantasy loot and dev seed

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Rarity-rolled loot with themed names and type-flavoured stats"; `game-server/items-service/SPECIFICATION.md` "## Catalogue" → "Fantasy base-item catalogue and rarity tiers" → this FS · Related ADRs: [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (account-id claim is eventually consistent — affects the seed script) · Consumer: [FS-NXP1W](NXP1W-auction-settlement-saga.md) (settlement saga testing needs seeded players with owned instances and gold) · Vocabulary: [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md)

## Summary

The space-era items are replaced with a dark, low-fantasy catalogue (Ultima Online / Lord of
the Rings register: grounded, parchment, low-res) and five rarity tiers. Loot dropped in a run
stops being a verbatim copy of a template: each drop rolls a rarity, and that rarity scales the
item's stats and gives it a themed name built from a small word list. A checked-in dev seed
script creates an admin, four funded players, the base items, and a spread of owned item
instances, so the marketplace settlement saga can be tested without playing a single run.

**Size constraint (user's explicit, repeated requirement): very little code.** The roll is one
small pure file; the seed is one script. If a requirement here seems to demand more, the
requirement is wrong: flag it, don't build it.

## Background (state as of 2026-09-27)

- `item_rarities` already carries `color_hex` and `drop_rate_multiplier`; colour is schema,
  not a frontend mapping. It and the base items still hold the space seed from
  `items-service/migrations/000009_reseed_base_items.up.sql`.
- `generateItems` (`game-service/internal/game/session.go`) picks a random template and copies
  it unchanged. No rarity is rolled, and none reaches the instance: the extraction event's
  `Item` message (`common/api/proto/events/game.proto`) has no `rarity_id`, so
  `item_instances.rarity_id` is NULL for every drop.
- Three defects sit in the same path (already listed under known defects in
  `game-service/SPECIFICATION.md`) and block the roll, so this FS fixes them: `InitializeItems`
  files armor into the weapon pool and weapons into the armor pool; the armor and consumable
  loops in `generateItems` use wrong bounds; `findSingleItemBase` panics
  (`GenRandomBetween(0, -1)`) on an empty per-type pool.
- There is no HTTP endpoint for creating rarities. Base items are created through
  `POST /api/items/complete-weapon|complete-armor|complete-consumable`, which are auth-only, not
  admin-gated. `members.role` exists (default `player`).

## Requirements

### Rarity tiers (items-service)

1. A new items-service migration purges the space-era data (truncates `item_templates`,
   `weapons`, `armors`, `consumables`, `item_rarities`, cascading) and inserts exactly these
   five rarities:

   | sort_order | rarity_code | rarity_name | color_hex | drop_rate_multiplier |
   |---|---|---|---|---|
   | 1 | normal | Normal | `#BFB6A3` | 1.00 |
   | 2 | uncommon | Uncommon | `#6B8E3A` | 0.40 |
   | 3 | rare | Rare | `#3E6A9A` | 0.15 |
   | 4 | runed | Runed | `#B8732E` | 0.05 |
   | 5 | fabled | Fabled | `#9E2A2B` | 0.01 |

   The migration header states plainly that the cascade deletes existing `item_instances` (and
   loadout references). The down migration restores the space-era rarities from `000009`, and
   only the rarities, because the base items come from the seed.
2. Rarity ids are fixed UUIDs in the migration, so the seed script and tests can refer to them
   without a lookup.

### Base-item catalogue (seeded, not migrated)

3. The catalogue is 24 base items, all at rarity `normal`, `required_level` 1, icon URL
   `/icons/<type>/<snake_name>.png` (placeholder; no art in this FS). Each base stat is the
   centre of that item's roll (R9):

   **Weapons** (`weapon_type` uses existing values)

   | Name | weapon_type | attack_power | critical_rate |
   |---|---|---|---|
   | Longsword | sword | 6 | 0.08 |
   | Seax | knife | 3 | 0.15 |
   | Flanged Mace | mace | 9 | 0.02 |
   | Boar Spear | spear | 5 | 0.06 |
   | Bearded Axe | axe | 7 | 0.05 |
   | Iron Cestus | fist | 4 | 0.10 |

   **Armor** (`defense_rating` / `magic_resistance`)

   | Material | head | chest | legs | gloves |
   |---|---|---|---|---|
   | Leather (light, balanced) | Leather Cap 2/1 | Leather Jerkin 4/1 | Leather Leggings 3/1 | Leather Gloves 1/1 |
   | Bone (weak, warded) | Bone Helm 1/3 | Bone Armor 3/5 | Bone Leggings 2/4 | Bone Gloves 1/2 |
   | Ringmail (medium) | Ringmail Coif 3/1 | Ringmail Tunic 6/2 | Ringmail Leggings 4/1 | Ringmail Gauntlets 2/1 |
   | Plate (heavy, unwarded) | Plate Helm 5/0 | Plate Breastplate 8/1 | Plate Greaves 6/0 | Plate Gauntlets 3/0 |

   **Consumables**

   | Name | healing_amount | max_stack_size |
   |---|---|---|
   | Lesser Heal Potion | 10 | 20 |
   | Greater Heal Potion | 25 | 10 |

4. Every item has a one-line description in a grounded, dark register (e.g. Longsword: "A
   plain soldier's blade, nicked from old wars."), never whimsical and never sci-fi.

### Loot roll (game-service)

5. At session start the game service loads the rarity list (id, code, drop_rate_multiplier)
   alongside the templates, through the existing items `ListItemRarities` RPC. If rarities fail
   to load or come back empty, every drop falls back to the template's own rarity and no
   scaling is applied. A run never fails to start because of rarities.
6. Each dropped item rolls one rarity, weighted by `drop_rate_multiplier` (weight = multiplier
   / sum of multipliers). With the R1 values that gives roughly Normal 62%, Uncommon 25%, Rare
   9%, Runed 3%, Fabled 0.6%.
7. The rolled rarity's id travels with the item: it is set on the item's config and component,
   carried on the extraction event (new `rarity_id` field on `events.Item`, regenerated from
   `.proto`, never hand-edited), and written by the items-service consumer to
   `item_instances.rarity_id`. An empty `rarity_id` on the event keeps today's behaviour (NULL).
8. A tier multiplier scales stats: normal ×1.00, uncommon ×1.15, rare ×1.30, runed ×1.50,
   fabled ×1.80.
9. **Stat roll.** Stats are type-flavoured because they centre on the base values in R3 (a
   Seax rolls high crit, a Flanged Mace high attack, Bone armor high magic resistance). No new
   stat columns.
   - Integer stats (`attack_power`, `defense_rating`, `magic_resistance`, `healing_amount`):
     `round(base × uniform(0.8, 1.2) × tier)`, floored at 0. A base of 0 stays 0.
   - `critical_rate`: `base + uniform(-0.02, +0.02) + 0.01 × (sort_order − 1)`, clamped to
     [0, 0.50], two decimals.
   - `mana_amount`, `buff_duration`, `max_stack_size`, `weapon_type`, `armor_slot` are copied,
     not rolled.
10. **Name roll.** Built from the base name and a small word list in code:
    - normal → base name ("Longsword")
    - uncommon → `<prefix> <base>` ("Keen Longsword")
    - rare → `<prefix> <base> <suffix>` ("Blackened Longsword of Ashes")
    - runed, fabled → `<prefix> <base> <grand suffix>` ("Grim Plate Helm of the Last King")
    - consumables never take affixes; rarity only scales their healing.

    Word lists stay about 6–8 entries each: weapon prefixes (Keen, Notched, Blackened, Grim,
    Weeping, Barrow-touched…), armor prefixes (Stout, Weathered, Ashen, Grave-cold,
    Riveted…), suffixes (of Ashes, of the Wight, of the Barrow, of Thorns, of the Fen…), and
    grand suffixes (of the Last King, of Barrowspire, of the Drowned Crown, of the First
    Dark…).
11. The roll lives in one small, pure, dependency-free file in game-service (rarity pick, stat
    roll, name roll) that takes an injectable random source so tests are deterministic. Session
    code calls it; it doesn't reach into session state.
12. The template description is copied unchanged onto the rolled item.

### Loot-path defect fixes (game-service)

13. `InitializeItems` puts weapons in the weapon pool and armor in the armor pool.
14. `generateItems` drops exactly the number of weapons, armor and consumables it decided on.
15. A per-type pool that is empty is skipped (with a `slog.Warn`) and doesn't panic; the other
    types still drop.

### Dev seed script

16. `game-server/scripts/seed-dev.sh` runs against a local stack (gateway base URL and
    items/auth DB DSNs set by env vars with local defaults) and does, in order:
    1. **Accounts:** signs up `admin@barrowspire.dev` and four players
       (`aldric@`, `brenna@`, `corwin@`, `dunstan@barrowspire.dev`, a shared dev password) via
       `POST /api/member/signup`.
    2. **Admin:** `UPDATE members SET role='admin'` for the admin email, then signs in again so
       the token carries the role.
    3. **Base items:** as the admin, POSTs the 24 base items from R3/R4 through the
       `complete-*` endpoints (sending the legacy required-but-discarded fields with dummy
       values), all at the `normal` rarity id.
    4. **Gold:** each player signs in and `POST /api/wallet/deposit {"gold": 10000}`. Because
       the account-id claim is eventually consistent (ADR-0014), the script retries sign-in and
       deposit briefly until it succeeds, then fails loudly.
    5. **Instances:** inserts ~20 `item_instances` via psql: every player gets 4–6 items, all
       five tiers appear at least twice across the set, weapons, armor and consumables are all
       represented, `source='reward'`, `status='AVAILABLE'`, `owner_member_id` and `template_id`
       looked up by email and item name, `rarity_id` set.
17. Every seeded instance is an item the R9/R10 roll could have produced: its name follows the
    tier's affix form using words from the code's word lists, and every stat falls inside the
    tier's range. The seed SQL is hand-authored; a comment in the script points at the roll
    file as the source of the rules.
18. The script is meant for a freshly migrated DB and says so at the top. On a re-run, a
    duplicate signup is treated as "already exists, continue", and base items or instances that
    already exist are skipped or the script stops with a clear message. It never duplicates
    instances silently.
19. The script ends by printing each seeded member's email, member id and instance count.

## User Stories

1. As a player, I want loot that looks and reads like it belongs in a dark medieval world, so that the game's fiction holds.
2. As a player, I want each drop to have a rarity, so that opening a container is a gamble worth taking.
3. As a player, I want rarer drops to have better stats, so that rarity means power and not just colour.
4. As a player, I want a Seax to feel different from a Flanged Mace, so that weapon choice matters.
5. As a player, I want Bone armor to trade defence for warding, so that armor choice matters.
6. As a player, I want drops to have names like "Blackened Longsword of Ashes", so that items feel individual.
7. As a player, I want the rarest drops to have grander names, so that I notice when I've found something special.
8. As a player, I want rarity shown in a consistent colour, so that I can read an item's worth at a glance.
9. As a player, I want the rarity I rolled to stay on the item after I extract it, so that my inventory and the marketplace show its real tier.
10. As a player, I want a container to drop the item types it rolled, so that I don't get armor where a weapon should be.
11. As a player, I want a run to start even when the catalogue is missing a whole item type, so that thin data doesn't crash my run.
12. As a game designer, I want the tiers named Normal / Uncommon / Rare / Runed / Fabled, so that the rarity ladder isn't borrowed from WoW.
13. As a game designer, I want drop odds to come from `drop_rate_multiplier`, so that I can retune rarity with an UPDATE, not a deploy.
14. As a game designer, I want base items to be rarity-neutral, so that one template covers every tier.
15. As a game designer, I want type flavour to come from base stats, so that adding a new archetype is just a data change.
16. As a developer, I want the roll to be a pure function with an injectable random source, so that I can test it deterministically.
17. As a developer, I want the space-era data purged by migration, so that no Vibro-blade survives in a fresh DB.
18. As a developer, I want one script that stands up an admin, funded players, the catalogue and owned items, so that I can test marketplace settlement without playing runs.
19. As a developer, I want seeded items to follow the same rules as real drops, so that what I test matches what the game produces.
20. As a developer, I want seeded players to have gold, so that they can bid in saga tests.
21. As a developer, I want the seed to print the member ids it created, so that I can use them in API calls straight away.
22. As a developer, I want a re-run of the seed not to silently duplicate data, so that my test state stays predictable.
23. As an admin, I want the base items created through the real API, so that the create path gets exercised too.
24. As the items-service consumer, I want an empty `rarity_id` on the event to mean "none", so that old events and loadout re-extractions keep working.

## Acceptance Criteria

- [ ] After migrating, `item_rarities` holds exactly the five R1 rows and no space-era template, weapon, armor or consumable rows remain.
- [ ] The down migration restores the four space-era rarities.
- [ ] Unit tests (seeded random source) cover the roll: rarity pick respects the weights over many samples; stat ranges hold per tier; `critical_rate` clamps at [0, 0.50]; base 0 stays 0; the name form is right for each tier; consumables have no affixes.
- [ ] A test proves `InitializeItems` files weapons, armor and consumables into their own pools.
- [ ] A test proves `generateItems` drops exactly the decided count per type.
- [ ] A test proves an empty consumable pool (or any single type) doesn't panic and still drops the other types.
- [ ] If rarities fail to load, drops still happen, unscaled and unrenamed.
- [ ] `events.Item` has a `rarity_id` field; generated Go is regenerated, not hand-edited.
- [ ] A drop extracted from a real run lands in `item_instances` with a non-NULL `rarity_id`, a rolled name and rolled stats.
- [ ] `scripts/seed-dev.sh` on a freshly migrated stack finishes with exit 0: 1 admin (`role='admin'`), 4 players each with 10,000 gold, 24 base items, ~20 `AVAILABLE` instances covering all five tiers at least twice.
- [ ] Every seeded instance's name and stats satisfy R9/R10 for its tier (checked by reading the seed against the roll file).
- [ ] Running the script a second time doesn't create duplicate members, base items or instances.
- [ ] `go test ./...` passes in game-service and items-service.

## Edge States

- **Rarities missing or unloadable at session start:** drops fall back to the template rarity, unscaled, base name (R5).
- **Rarity row with multiplier ≤ 0:** impossible (DB CHECK), so not handled.
- **One item type has no templates:** that type is skipped with a warning; no panic (R15).
- **No templates at all:** existing behaviour, no ground items and a warning; the session still starts.
- **Loadout item re-extracted** (has `instance_id`): keeps its stored rarity. The roll only applies to items generated in the run; brought-in items are never re-rolled.
- **Old extraction events without `rarity_id`:** NULL rarity, as today (R7).
- **Seed run on a DB that already has data:** duplicate signups continue; existing base items or instances are skipped or the script stops, never duplicated (R18).
- **Account-id claim not yet in the token after signup:** deposit retries briefly, then fails loudly (R16.4).
- **Admin role not in the token:** the script signs in again after the role UPDATE, because role is a token claim (FS-9KW9F).
- **`complete-*` validation on legacy fields:** the script sends dummy `item_code`, `type_id`, `durability` and prices; the endpoint discards them.
- **Truncating templates cascades to instances:** intended in dev, called out in the migration header.

## Out of Scope

- Marketplace listing, bidding and settlement flows (FS-NXP1W).
- Admin-gating the item create endpoints (open gap; separate FS if wanted).
- New stat columns or new stats; rolling `mana_amount`, `buff_duration`, `max_stack_size`.
- Item icons and art; any frontend rarity display or colour rendering.
- An HTTP endpoint for creating rarities.
- Removing the legacy required-but-discarded fields from the `complete-*` bodies.
- A Go seed command that shares the roll code (rejected: it can't import game-service `internal/`, and it's more code than the hand-authored SQL).
- Rolling rarity for starting gear or rewards outside of run drops.
