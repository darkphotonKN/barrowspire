# FS-BDA7X: Character leveling

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Progression" (experience from kills · character levels with class stat growth · level requirements on equipment), "### Persistent world" → "Progression persistence"; `game-server/api-gateway/SPECIFICATION.md` "### Characters" → "Character level and experience read"; `game-client/SPECIFICATION.md` "### Character" → "Character level and experience display" → this FS · Owner of persisted level/XP: **character-service** (no SPECIFICATION.md of its own and not in the root service map; its lines are carried by game-service's "Progression persistence") · Depends on: [FS-77AB6](77AB6-monsters-and-combat.md) (the kill record, its §Requirements 28–31) · Siblings (same scoping session, 2026-10-08): [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (derives required level from item level; this FS enforces it), [FS-F6F88](F6F88-multi-floor-delves.md) · Interacts with: [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (the character must survive a cross-pod handoff) · Related ADRs: none (candidate via `record-decision`: *character-service owns level/XP; game-service reports gains on the run-end event and reads the character at entry*) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*character*, *character in play*, *experience grant*, *kill experience*, *level floor* pending via `domain-model`)

## Summary

A delver's character gains experience by killing monsters in a run, levels up during the run
(class stats and HP/MP grow immediately), and keeps that experience whether they escape or die.
The level and experience persist on the character in character-service, are readable over the
gateway, and are shown in the client: a level and an experience bar in the run and HUB HUD and on
the character list. Levels gate gear: an item whose required level is above the character's level
cannot be equipped. Leveling exists so characters can use better items, and so items can be
spread across levels with the most interesting ones at the cap (FS-4R9M9).

**Prerequisite found during promotion.** Today there is **no server-side character identity**:
characters live only in the client's localStorage with client-minted ids (`char_…`); the client
enters the HUB world with a class and a name only; character-service's `CreateCharacter` writes
neither `player_id` nor `class_id` (and binds five arguments to a four-placeholder insert); the
gateway's character client dials the `auth` service by name; nothing reads
`player_loadouts.character_id` / `item_instances.character_id`. Experience cannot be attributed to
a character the server has never heard of, so **§Requirements "Character identity" is part of
this work order** and is sliced first.

**Lane.** Backend is the human lane by default (root CLAUDE.md). This FS is sliced into
agent-sized issues at the orchestrator's request; the human may take any backend slice by hand.

### Decision record (from scoping, plus orchestrator defaults)

Settled by the user during scoping:
- Leveling exists (everyone-at-max rejected). XP is **kept regardless of death**.
- **character-service persists level/XP**; game-service only reports gains.
- Level requirements gate equipment; **deriving** required level from item level is FS-4R9M9's.
- Manual stat-point allocation deferred.

**Orchestrator defaults — the user may revise** (marked *(OD)* where they appear below):
- Level cap **20**; the XP table in R14.
- XP from **monster kills only**; every **living, un-escaped** party member in the run gets the
  **full** kill XP (no range check); elite ×3, demon ×10 of the archetype's base XP; no escape bonus.
- A mid-run crash losing that run's XP is accepted for v1.
- Level-up applies **immediately in the run**; **no heal** on level-up; no skill or stat points.
- XP travels per player on the **run-end event** (`MatchEndedEvent`) to character-service.
- The gateway gets a typed character read that carries level and XP; the client shows level + XP bar.
- Enforcement reads the **existing** `item_templates.required_level`.
- Stat growth table (R19), kill-XP formula and base values (R9–R11), the 503-style refusal at
  entry when character-service is down (R6), loadout enforcement at seating rather than at
  loadout save (R31), and the one-time import of local characters (R40).

## Requirements

### Character identity (prerequisite)

1. **character-service owns characters per member.** It creates a character for the
   authenticated member (`player_id` = member id, `class_id`, `name`; level 1, experience 0),
   lists the member's live characters (oldest first), reads one of the member's characters, and
   soft-deletes one (`deleted_at`). Every read and delete is **scoped by member**: another
   member's character, a deleted one, and a nonexistent one are indistinguishable (not found).
2. The character model maps `level` and `exp` (the columns already exist). Existing rows keep
   their defaults (level 1, 0 XP); no backfill.
3. Class is one of `warrior`, `mage`, `archer` — character-service rejects anything else. Name is
   1–32 characters after trimming and unique among live characters, case-insensitively (the
   existing `idx_characters_name`); a taken name is refused as already-existing.
4. The character gRPC contract (`common/api/proto/character/character.proto`) carries member
   identity on every call and returns the full character (id, name, class, level, experience,
   level floor, next-level threshold, created-at). Its `package` is currently `items`; correct it
   to `character` while reshaping every RPC. Generated Go is regenerated, never hand-edited.
5. **The client enters with a character id.** The `enter_hub` message carries `characterId`.
   game-service resolves the character **from character-service, scoped by the connection's
   member** (gRPC read), and takes class, name, level and experience from that record. The
   client's `class` / `characterName` fields are ignored once a character id is present.
6. Entry is **refused** with a visible, retryable reason when the character id is missing, not
   the member's, deleted, or when character-service cannot be reached *(OD)* — the existing HUB
   refusal path (FS-29KSH R32). The member is never seated as a guessed or default character.
7. The **character in play** (id, class, level, experience) is part of the player's server-held
   record for the whole session, not of any one world. Every path that seats the player in a world
   carries it: the HUB entry, the same-pod world switch into a run, the return to the HUB, a
   reconnect into an in-progress run, and — once FS-K2HKP's handoff lands — the seat on the host
   pod, which re-resolves the character from character-service by the id the handoff carries.

### Experience and levels

8. A character has a **total experience** (monotonic, never decreases) and a **level** in 1..20
   derived from it by the table in R14. Level never decreases. At level 20 experience keeps
   accumulating but the level stays 20 *(OD)*.

### Kill experience

9. When a monster dies **to a player** (FS-77AB6's **kill record**, §Requirements 28–31: killer
   member id, monster level, archetype, elite flag, boss flag), every party member in that run who is **alive and has not escaped** at
   that moment gains the kill's experience, in full. The killer gets no extra share. A monster
   death with no player killer awards nothing.
10. Kill experience = `round(base(archetype) × (1 + 0.15 × (monsterLevel − 1)) × multiplier)`,
    where multiplier is **3** for an elite, **10** for the demon boss, otherwise 1 *(OD)*. There is
    no penalty or bonus for the gap between monster level and character level (monsters scale to
    the party, FS-77AB6; shared full XP is how a lower member catches up).
11. Base experience per archetype is **owned by this FS** (FS-77AB6's archetype sheet carries no
    XP value): ghoul **10**, troll **25**, demon **25** *(OD)*, kept in one table beside the
    archetypes so a new archetype adds a row. Elite is a promotion of a standard archetype, so an
    elite troll is `25 × factor × 3`.
12. Dead players earn nothing after death but **keep everything earned before it**. Escaped
    players earn nothing for kills after their escape. A player still seated but disconnected
    (reconnect grace) earns as a living player.
13. No experience is earned in the HUB world, from containers, from escaping, or from damage dealt
    without a kill.

### The experience table

14. Total experience required to **reach** each level *(OD)*, roughly ×1.28 per level:

    | Level | Total XP to reach | XP to next | | Level | Total XP to reach | XP to next |
    |---|---|---|---|---|---|---|
    | 1 | 0 | 100 | | 11 | 3,850 | 1,180 |
    | 2 | 100 | 130 | | 12 | 5,030 | 1,510 |
    | 3 | 230 | 160 | | 13 | 6,540 | 1,930 |
    | 4 | 390 | 210 | | 14 | 8,470 | 2,480 |
    | 5 | 600 | 270 | | 15 | 10,950 | 3,170 |
    | 6 | 870 | 340 | | 16 | 14,120 | 4,060 |
    | 7 | 1,210 | 440 | | 17 | 18,180 | 5,190 |
    | 8 | 1,650 | 560 | | 18 | 23,370 | 6,650 |
    | 9 | 2,210 | 720 | | 19 | 30,020 | 8,510 |
    | 10 | 2,930 | 920 | | 20 | 38,530 | — (cap) |

    Pacing intent: level 2 within the first run; ~3 single-floor runs per level around level 10;
    the last levels take long enough to be a goal. Tune by editing this table only.
15. The table is **one definition shared** by game-service (in-run level-ups) and
    character-service (persisted level): a small package under `game-server/common/` exposing
    level-for-experience, the level floor (total XP at which the current level began) and the
    next-level threshold (absent at the cap). Neither service keeps its own copy.

### Level-up in a run

16. When a character's experience crosses one or more thresholds, it levels up **immediately**,
    in the same tick the experience is awarded. One kill can cross several levels; each level's
    growth applies once.
17. Level-up raises the four attributes and max HP / max MP by the class growth in R19. **Current
    HP and MP do not change** — no heal, not even by the amount max grew *(OD)*.
18. A character is seated (HUB or run) with the stats for its current level: class base (today's
    class presets) + `(level − 1) ×` growth, at full HP and MP as today.
19. Class growth per level *(OD)*:

    | Class | Str | Agi | Int | Vit | Max HP | Max MP |
    |---|---|---|---|---|---|---|
    | warrior | +2 | — | — | +2 | +12 | +2 |
    | mage | — | — | +3 | — | +6 | +10 |
    | archer | — | +3 | — | — | +8 | +5 |

    Level growth touches only these six values. Whatever FS-77AB6 derives from attributes
    (damage, mitigation) follows from them; gear contributions (FS-4R9M9) layer on top.
20. No skill points, stat points, skill unlocks or level-gated skills.
21. The world state a client receives carries, for its own player: `level`, `experience`,
    `level_floor`, `next_level_at` (absent at the cap) — game-service's typed message layer, not
    OpenAPI.

### Persistence

22. Each player's **run experience gained** is reported on the run-end event: `PlayerMatchResult`
    in `common/api/proto/events/game.proto` gains `character_id` and `experience_gained`
    (additive; stats-service and notification-service ignore them).
23. Experience gained is tracked **outside the player entity** for the life of the run, so a player
    whose entity is removed before the run ends (left, disconnected past grace) is still reported
    with what they earned. Every character that earned experience in the run appears on the event.
24. When the run resolves, the player's server-held character in play takes the run's resulting
    level and experience, so the HUB HUD and the next run reflect it without waiting for
    character-service.
25. character-service consumes `match.ended` on the `game.events` exchange (its own durable queue)
    and, for each player with `experience_gained > 0`, applies an **experience grant**: in one
    transaction, record the grant keyed by **(run session id, character id)** and add the amount to
    the character's experience, recomputing level from the shared table (R15).
26. Grants are **idempotent**: a redelivered event finds the grant already recorded and changes
    nothing (deterministic key from the event, ADR-0009's principle; the outbox is at-least-once).
    Grants are deltas, so order between runs does not matter.
27. A grant is applied only if the character is live **and** belongs to the event's `member_id`.
    Otherwise it is dropped and logged — never applied to another member's character, never
    resurrecting a deleted one.
28. A malformed message is rejected without requeue (dead-lettered like the other consumers); a
    transient database failure is requeued.
29. A run that never reaches its end (process crash) reports nothing; its experience is lost
    *(OD, accepted for v1)*.

### Level requirements on equipment

30. Every item carries its template's `required_level` (default 1): items brought in from the
    loadout (`ItemInstance` gains `required_level`, populated by items-service from the template),
    and items rolled in the run from templates.
31. **Seating is the authoritative loadout gate** *(OD)*: when a character is seated, any loadout
    item whose required level is above the character's level is placed in the inventory instead
    of its slot — brought in, carried, extractable, not worn.
32. **In-run equip is refused** when the item's required level is above the character's current
    level: the item stays where it is and the player is told the level it requires. Unequip is
    never gated. The rule applies to every equip slot, consumable slots included.
33. A level-up mid-run makes previously refused items equippable at once; nothing is
    auto-equipped.
34. When FS-4R9M9 lands, the *source* of an item's required level changes (derived from item
    level); this enforcement reads whatever required level the item carries and does not change.

### Gateway read

35. The gateway serves the member's characters as typed operations (tag `characters`, §API
    surface): create, list mine, get one, delete. Each character carries level, total experience,
    level floor and next-level threshold, computed by character-service from the shared table — the
    client never holds the curve.
36. `POST /api/character/` (legacy gin, unauthenticated, no client consumer) is **replaced** by the
    typed, authenticated `create-character`. Identity comes from the JWT, never the body. The
    gateway's character client dials the `character` service (it currently dials `auth`).
37. `list-item-instances` gains `required_level` on each instance (additive).
38. Contract artifacts are generated: edit the typed handlers, then `make openapi && make client`;
    `openapi.yaml` and `game-client/src/api/generated/` are never hand-edited.

### Client

39. Characters are server records. Character select, create and delete go through the generated
    client; localStorage keeps only the **active character id** (a convenience). Creation never
    falls back to a default name (`"Hero"` would collide globally).
40. **One-time import** *(OD)*: local-only characters (client-minted ids) found on load are created
    on the server in slot order at level 1 / 0 XP and replaced by the server record. A name
    already taken is dropped with a visible notice to recreate it; a network failure keeps the
    local entry and retries on the next load.
41. `enter_hub` sends `characterId`; an entry refusal (R6) shows its reason on the main menu.
42. The run and HUB HUD show the player's own level and an experience bar (progress from
    `level_floor` to `next_level_at`; full and marked as the cap at level 20), updated from world
    state.
43. A level-up shows a brief, non-blocking cue (derived from the level rising in state).
44. The character list shows each character's level and experience bar from the gateway read.
45. Item views (loadout, satchel, in-run inventory) show "Requires level N" when N is above the
    character's level, as a hint only; a refused equip shows the server's reason. Appearance
    follows `game-client/docs/design-guideline.md`.

## User Stories

1. As a delver, I want my character to exist on the server, so that its progress follows me to any
   browser.
2. As a delver, I want to create a character with a name and a class, so that I can start leveling.
3. As a delver, I want to be told when a name is already taken, so that I can pick another.
4. As a delver, I want to see my characters' levels on the character list, so that I can choose
   whom to play.
5. As a delver, I want to delete a character I no longer want, so that my list stays tidy.
6. As a delver with characters from before this change, I want them carried over once, so that I
   don't lose them.
7. As a delver, I want to enter the HUB as the character I selected, so that the server knows whose
   experience I'm earning.
8. As a delver, I want to gain experience when a monster dies, so that fighting is rewarded.
9. As a delver in a party, I want full experience for kills my partner lands, so that co-op never
   costs me progress.
10. As a lower-level party member, I want the same experience as my higher-level partner, so that I
    catch up.
11. As a delver, I want much more experience from elites and the demon, so that taking on the
    dangerous ones pays.
12. As a delver, I want to level up the moment I cross the threshold, so that I feel stronger in
    the fight I'm in.
13. As a warrior / mage / archer, I want my class's own attributes to grow each level, so that my
    class identity sharpens as I level.
14. As a delver, I want my max HP and MP to grow with level, so that I can face tougher monsters.
15. As a delver, I want to keep my experience when I die, so that death costs my loot, not my
    progress.
16. As a delver, I want my experience saved even if I drop out before the run ends, so that a
    disconnect doesn't erase the work.
17. As a delver, I want to see my level and an experience bar while delving, so that I know how
    close the next level is.
18. As a delver, I want a clear cue when I level up, so that I notice it mid-fight.
19. As a delver, I want to see my level in the HUB too, so that I know where I stand between runs.
20. As a delver, I want to know which items I'm not yet high enough level for, so that I don't
    try to wear them.
21. As a delver, I want to be told why an equip failed, so that I know to level up first.
22. As a delver who levels up mid-run, I want to equip a now-allowed item straight away, so that
    the level matters immediately.
23. As a delver, I want over-level gear in my loadout carried into the run rather than lost, so
    that a bad loadout costs nothing.
24. As a delver at the level cap, I want the bar to say so, so that I know I've maxed out.
25. As a member, I want no one else able to read, delete or level my characters, so that my
    progress is mine.
26. As the operator, I want a redelivered run-end event never to double-grant experience, so that
    levels stay honest.
27. As a developer, I want one experience table shared by both services, so that tuning it can't
    make them disagree.
28. As a designer, I want the curve, multipliers and growth in tables, so that tuning is an edit
    rather than a rewrite.

## Acceptance Criteria

### Character identity
- [ ] Creating a character over the gateway stores member, class and name; level 1, 0 XP.
- [ ] Listing returns only the caller's live characters; getting or deleting another member's,
      a deleted, or an unknown character answers not found.
- [ ] An unknown class or an empty/over-long name is refused (400); a taken name (any case)
      answers 409.
- [ ] `POST /api/character/` no longer exists; the gateway character client dials `character`.
- [ ] `enter_hub` with a valid `characterId` seats the player with that character's class, name,
      level and experience, regardless of class/name in the payload.
- [ ] `enter_hub` with no, a foreign, or a deleted `characterId`, or with character-service down,
      is refused with a visible reason and seats nothing.
- [ ] The character in play survives HUB → run → HUB and a reconnect into an in-progress run.

### Experience and level-up
- [ ] A monster killed by any party member grants every living, un-escaped member
      `round(base × (1 + 0.15 × (lvl − 1)) × mult)`; elite ×3, demon ×10; dead and escaped
      members get nothing for that kill.
- [ ] A kill crossing one or more thresholds levels the character up in the same tick, applying
      each level's class growth once; current HP and MP are unchanged.
- [ ] A character seated at level L has class base + (L − 1) × growth, at full HP/MP.
- [ ] Level never exceeds 20; experience keeps accumulating at 20.
- [ ] World state carries `level`, `experience`, `level_floor`, `next_level_at` for the own player.
- [ ] Both services compute level from the one shared table; a table-driven test pins R14.

### Persistence
- [ ] A finished run's `match.ended` event carries `character_id` and `experience_gained` for every
      character that earned experience, including players removed before the end.
- [ ] character-service applies each grant once: replaying the same event leaves experience and
      level unchanged.
- [ ] A grant for a character not owned by the event's member, or deleted, is dropped and logged.
- [ ] After a run, the HUB HUD shows the new level immediately; the gateway read shows it once the
      event is consumed.
- [ ] A character that died in the run keeps the experience it earned before dying.

### Level requirements
- [ ] `ItemInstance` (gRPC) and `list-item-instances` (HTTP) carry `required_level`.
- [ ] Loadout items above the character's level are seated in the inventory, not in slots.
- [ ] Equipping an above-level item in a run is refused with the required level; unequip always
      works; after a level-up the same equip succeeds.

### Client
- [ ] Characters come from the server; localStorage holds only the active character id.
- [ ] Local-only characters are imported once; a taken name shows a notice.
- [ ] Run and HUB HUD show level + experience bar; the cap shows a full, capped bar.
- [ ] A level-up shows a cue; the character list shows level + bar.
- [ ] Over-level items show "Requires level N"; a refused equip shows the server's reason.

### Contract
- [ ] `openapi.yaml` and the generated client are regenerated from the typed handlers and match
      §API surface; gates pass.

## Edge States

- **No server characters yet (fresh member):** list is empty; the menu sends the player to
  character creation, as it does today with empty slots.
- **character-service down:** gateway reads answer `503 · SERVICE_UNAVAILABLE`; HUB entry is
  refused with a retryable reason (R6). Run-end grants wait durably in the outbox / queue and apply
  when it returns.
- **Consumer lag:** the gateway read can trail the HUB HUD by the event's delivery time. A
  reconnect (fresh `enter_hub`) during that window seats the character at the persisted, older
  value; the late grant still adds its delta, so nothing is lost — only displayed late.
- **Duplicate delivery:** no-op (R26). **Out-of-order runs:** deltas commute.
- **Character deleted mid-run:** the run continues; the grant is dropped (R27). The deleted
  character cannot be re-entered.
- **Two tabs, same member:** unchanged from today — one server-held player record per member, so
  one character in play at a time.
- **Foreign character id on entry:** refused exactly like a missing one; no existence oracle.
- **Monster killed by several players:** one death, one award to every living, un-escaped member.
- **Kill on the same tick the player dies:** a member at 0 HP at award time is dead and earns
  nothing.
- **Demon kill at low level:** may cross several levels at once (R16).
- **At the cap:** experience accumulates, level stays 20, `next_level_at` is absent.
- **Over-level item picked up in the run:** carried; equip refused until the level is reached.
- **Process crash mid-run:** that run's experience is lost (accepted, R29).
- **Cross-pod run (FS-K2HKP):** the host pod has no record of the player's character until it
  resolves the id the handoff carries; a host that cannot reach character-service fails the seat,
  and FS-K2HKP's seat timeout (R25 there) compensates.
- **Local-only characters with a taken name on import:** dropped with a notice; nothing else is
  affected.

## API surface

**Conventions:**
- Typed Huma operations under a new `characters` tag; all **protected** (JWT, per-operation
  middleware as the other serialized groups).
- Wire is camelCase (new resource). Errors are problem+json through the FS-22WKC seam, as
  `status · code`.
- Identity is the JWT's member; no member field appears in any request.
- Domain rules (class set, name rules, uniqueness) are character-service's; the edge checks shape
  only (ADR-0001 §6–§8).

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `create-character` **(re-typed; replaces gin `POST /api/character/`)** | POST `/api/characters` | — | `CharacterCreate` | 201 `Character` | `401 · UNAUTHENTICATED`; `400 · VALIDATION_FAILED` (unknown class, name empty/over 32 after trim — character-service's rule); `409 · ALREADY_EXISTS` (name taken); `422 · VALIDATION_FAILED` (shape: missing field, unknown body member); `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `list-my-characters` **(new)** | GET `/api/characters` | — | — | 200 `CharacterList` (`characters: Character[]`, oldest first; no paging) | `401 · UNAUTHENTICATED`; `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `get-character` **(new)** | GET `/api/characters/{characterId}` | `characterId` uuid | — | 200 `Character` | `401 · UNAUTHENTICATED`; `404 · NOT_FOUND` (unknown, deleted, or another member's); `422 · VALIDATION_FAILED` (non-uuid id); `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `delete-character` **(new)** | DELETE `/api/characters/{characterId}` | `characterId` uuid | — | 204 | `401 · UNAUTHENTICATED`; `404 · NOT_FOUND` (as `get-character`); `422 · VALIDATION_FAILED`; `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `list-item-instances` **(changed, additive)** | GET `/api/items/instances` | unchanged | — | unchanged envelope; each `ItemInstance` gains `required_level` (int32 ≥ 1; snake_case like the rest of this wire) | unchanged |

**`CharacterCreate` (request; writable fields only):**

| Field | Type | Notes |
|---|---|---|
| `name` | string | required; validity decided by character-service |
| `class` | string | required; `warrior`, `mage` or `archer` (decided by character-service) |

**`Character` (new):**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | string | |
| `class` | string | `warrior`, `mage`, `archer` |
| `level` | int32, 1..20 | |
| `experience` | int64 ≥ 0 | total, monotonic |
| `levelFloor` | int64 ≥ 0 | total experience at which `level` began |
| `nextLevelAt?` | int64 | total experience for the next level; absent at the cap |
| `createdAt` | date-time | |

No member / owner field.

## Out of Scope

- **Deriving required level from item level**, item levels, affixes, uniques — FS-4R9M9.
- **Monsters, the kill record, combat formulas, monster levels** — FS-77AB6. **Floors** — FS-F6F88.
- **Loadout-save validation in items-service** (refusing to *save* an over-level loadout).
  Loadouts are per member, not per character, today; seating enforces instead (R31) *(OD)*.
  Per-character loadouts (`player_loadouts.character_id`, `item_instances.character_id`) stay
  unused.
- **Level on other players' nameplates in the HUB** and in runs *(OD)* — FS-JEAVX's thin slice
  is unchanged.
- **Escape-bonus XP**, XP from containers / quests / anything but kills, party range checks,
  level-gap penalties.
- **Heal or restore on level-up**; skill points, stat points, skill unlocks.
- **Persisting XP from a crashed run** (checkpointing mid-run grants).
- **A character cap per member**, renaming characters, undeleting.
- **Durable accounts and profile** beyond character records — this FS realises only the character
  half of that unlinked Persistent-world line; the line is left for `spec-update` to decide.
- **A SPECIFICATION.md for character-service** or adding it to the root service map (`/setup`).
- **Leaderboards / stats by level**; stats-service and notification-service ignore the new fields.
