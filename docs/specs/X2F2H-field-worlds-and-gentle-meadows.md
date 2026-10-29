# FS-X2F2H: Field worlds and Gentle Meadows

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Field worlds" (field world scene · Gentle Meadows look and creature); `game-server/game-service/SPECIFICATION.md` "### Field worlds" (shared field worlds per replica · costless death with respawn at the field entrance · killer-first loot · field drop rates derived from the Spire's · Gentle Meadows) → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (fields are per-replica channels, local world switch, never handed off), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection, per-pod player ceiling), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) · Related: [FS-0XMCP](0XMCP-hub-destination-gates.md) (the hub gates that lead here), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (the second field, built on this machinery), [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) (hub syncs only players across pods), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (out of bounds), [FS-NSV3D](NSV3D-solo-delve-entry.md) (queued-refusal precedent), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (leave for the roster), [FS-77AB6](77AB6-monsters-and-combat.md) (monster stats, elites, kill records), [FS-BDA7X](BDA7X-character-leveling.md) (XP, level cap 20), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (drops), [FS-9TNJA](9TNJA-game-service-owns-its-outbox.md) / [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (match-end outbox path), [FS-8RBQY](8RBQY-tower-interior-run-look.md) (exterior theme kept for a future outdoor place), [FS-Q14EV](Q14EV-expanded-baked-enemy-roster.md) (guideline-amendment precedent)

## Summary

A **field world** is a third kind of world, beside the hub and the run: shared like the hub,
with monsters and loot like a run, and with no queue. A player walks out of the hub through a
field gate (FS-0XMCP) into their pod's channel of that field, fights for XP and items, and walks
back out through the field's entrance gate. Nothing is at risk: death respawns you at the
entrance after 3 s with everything you carried. What you earned settles when you leave, through
the same outbox the Spire's runs settle through. **Gentle Meadows**, the first field, is a
hand-laid open meadow east of the hub with one creature, the boar.

## Decision log

Scoped 2026-10-29 and locked under a charter; promoted to work-order 2026-10-29 from the scoping
notes and ADR-0030 (`--from-thread`, no interview: the charter covers it). Provenance:
**[user]** the user's own call; **[charter default]** proposed by the agent and approved by the
user wholesale, not individually discussed; **(not challenged)** converged without pushback;
**[promotion default]** a gap the scoping notes left open at the acceptance-criteria level,
filled at promotion and flagged to the user in the hand-back. Lane: **all issues are agent
lane, game-server included** (user, 2026-10-29: "no hand coded here, all agents now"). This
supersedes the draft's "server items are human lane".

| # | Decision | Provenance |
|---|----------|------------|
| D1 | New world type `field`: a long-lived world shared like the hub, no queue | [user] |
| D2 | One channel of each field per pod, created at boot, always on (ADR-0030) | [charter default]; "MMOs having servers" [user] |
| D3 | Enter and leave by a local world switch on the same pod, never a handoff | [charter default] |
| D4 | Entering a field while queued for the Spire is refused, as solo start is | [charter default] |
| D5 | Enter with the currently equipped gear; no loadout screen, no escrow | [charter default] |
| D6 | Gains settle on leaving (gate, disconnect, leaving for the roster) through the existing match-end outbox as a costless `returned` result | [charter default] (not challenged) |
| D7 | Disconnect in a field: the player is home in the hub on reconnect; fields are never resumed | [charter default] |
| D8 | No separate field occupancy cap; the per-pod ceiling covers it | [charter default] |
| D9 | No PvP in fields | [charter default] |
| D10 | Death costs nothing | [user] (not challenged) |
| D11 | Respawn at the field entrance, full health, after 3 s | entrance [user]; 3 s [charter default] |
| D12 | Kill credit (XP and the loot roll) goes to the killing blow only | [user] (not challenged) |
| D13 | Killer-first loot window of 30 s, then anyone | killer-first [user]; 30 s [charter default] (not challenged) |
| D14 | A monster respawns 45 s after death at its spawn point | [charter default] |
| D15 | Monster level is a fixed band per field (Meadows 1–4, Forest 4–9), not party-scaled; level cap 20 unchanged | [charter default] |
| D16 | Field stats = the Spire's stat formula × 0.75; elites keep the Spire's elite multipliers on top | "tamer" [user]; numbers [charter default] |
| D17 | Field drop chance = the live Spire drop chance × a field factor (Meadows 0.35, Forest 0.5), read at roll time | [user] direction; numbers [charter default] (not challenged) |
| D18 | Gentle Meadows: east of the hub, cozy greens, sparse trees, a horizon; low-level animals; one enemy to start | [user] |
| D19 | The Meadows is a fixed, hand-laid open map, not generated | [charter default] |
| D20 | Creature: the boar, one baked creature plus its elite variant, built in code | [charter default] |
| D21 | An empty field stays awake (the open question "should it sleep" resolved to the default) | [charter default] |
| D22 | A field visit settles through `MatchEndedEvent` + `ItemsExtractedEvent` with a new `world_type` discriminator; stats-service and notification-service skip field visits (see §F, "the settlement finding") | [promotion default]: the charter assumed no consumer change; the code says otherwise |
| D23 | The boar's drop row is the Spire's ghoul row by reference (fodder drops as Spire fodder); an elite boar's is the Spire's elite row | [promotion default] |
| D24 | A field elite rolls at the Spire's floor-1 elite chance, read live | [promotion default] |
| D25 | A field drop pile vanishes 120 s after it lands | [promotion default] |
| D26 | A respawn waits while a player in play stands within the Spire's monster-to-player exclusion radius of the spawn point | [promotion default] |
| D27 | Entry is refused when the loadout cannot be read, rather than entering bare | [promotion default]: settling a bare body would clear the stored loadout |
| D28 | The boar breaks two guideline rules (undead-only fodder; humanoid rig). The design guideline gets a field-wildlife amendment, owner-approved through the contact sheet | [promotion default] (rule change flagged) |

## Requirements

### §A The field world

1. **World type `field`.** game-service's world type gains `field` beside `hub` and `run`
   (`types.WorldType`), and every state broadcast and `world_entered` from a field carries
   `world_type: "field"`.
2. **Field identity.** Each field has a stable id: `gentle_meadows` here, `forlorn_forest` in
   FS-3QHQZ. `world_entered` for a field world also carries `field: "<id>"`, so the client picks
   the place's look without inferring it. Hub and run `world_entered` messages are unchanged.
3. **A field is a place definition plus a channel.** A **field place** is data: id, map bounds,
   layout (walls / obstacles / keep-out areas), entrance gate (position and radius), the point a
   player arrives at, spawn points, a creature table, a level band, a stat factor and a drop
   factor. A **channel** is one running world built from a place. The place's layout comes from
   a **layout provider**: the Meadows uses a fixed, hand-laid layout (§G); FS-3QHQZ plugs in a
   generated one without changing anything in §A–§F.
4. **One channel per field per pod, at boot.** game-service registers its field places at
   startup and builds one channel of each before the first connection, next to the hub (D2,
   ADR-0030). This FS registers only the Meadows; FS-3QHQZ registers the Forest.
5. **A field never ends.** It is never shut down for being empty, by the co-op end rule, by seat
   release or by the last player's disconnect. It lives as long as the pod does. An empty field
   keeps ticking (D21).
6. **What a field runs.** A field ticks the same systems as a run: gear, monster AI, movement,
   projectiles, combat, monster death, kill records, interaction. It never has floors, stairs,
   an escape, a match-progress entity, an end rule or seats. PvP damage is off, as in runs (D9).
7. **Fields stay on their pod.** A field never publishes to Redis and never touches the
   matchmaker, the match queue or the handoff (`internal/matchmaker`, `internal/match_queue`
   and their wiring are not edited). Only the hub syncs across pods (FS-JEAVX).
8. **No field cap.** A field admits anyone connected to its pod; the per-pod ceiling bounds it
   (D8, ADR-0015).

### §B Entering and leaving

9. **`enter_field`** (client → server, payload `{ "field": "<id>" }`) asks to walk from the hub
   into that field. It is sent when the player walks into a field gate in the hub. The gate's
   position and the proximity check belong to FS-0XMCP; this FS consumes them through a narrow
   interface (the hub gate for a field id; whether a hub position is at it).
10. **Entry is validated on the server, in order**, refused with the existing error shape and a
    stable reason the client switches on:
    - not in the hub (in a run, a field, or no world) → `not_in_hub`
    - no character in play → `no_character`
    - unknown field id → `unknown_field`
    - not standing at that field's hub gate → `not_at_gate`
    - queued for the Spire → `queued` (D4; an unreadable queue counts as not queued, as
      `start_solo` and `enter_hub` already treat it)
    - the loadout cannot be read from items-service → `loadout_unavailable` (D27)
11. **Accepted entry is a world switch** (D3): the player's hub body is removed, a fresh body is
    built in this pod's channel at the place's arrival point from the character in play and the
    currently equipped loadout read from items-service (D5), the record names the field, and the
    client gets `world_entered { session_id, world_type: "field", field }`. The connection is
    kept.
12. **The loadout is read before the field's lock is taken**, never under it, so a slow
    items-service cannot stall a shared world (the arrival path's pattern: fetch, then seat).
13. **A visit starts on entry.** Each entry mints a fresh **visit id** and records the entry
    time. The visit's XP tally starts at zero.
14. **`leave_field`** (client → server, no payload) asks to walk back to the hub. It is sent when
    the player walks into the field's entrance gate. Refused with `not_in_field` when the record
    names no field, `not_at_gate` when the body is not within the entrance gate's radius, and
    `fallen` while the player is dead (they respawn at the entrance in under 3 s anyway).
15. **Accepted leave**: the visit settles (§F), the field body and every item entity it held are
    removed from the field, the hub seats the player at the arrival point of the matching hub
    gate (FS-0XMCP), and the client gets `world_entered { world_type: "hub" }`. Coming home is not
    arriving: the hub's occupancy cap does not refuse a returning player, as for a run's end.
16. **Hub level stays current.** Before the hub seats a returning player, the visit's progress is
    applied to the character in play, so the hub shows the new level without waiting for
    character-service (the run's `ApplyRunProgress` path).
17. **Disconnect in a field** (D7): when the connection drops, the visit settles at once, the
    field body goes, and the player's record moves to the hub with a body at the matching hub
    gate, held through the reconnect grace like any hub member's. A reconnect within the grace is
    announced the hub; a grace that runs out removes the hub body as today.
18. **Leaving for the roster from a field** (`leave_hub`, FS-G4VMQ) is accepted: the visit
    settles, the body goes, and the record names no world, exactly as from the hub.
19. **`enter_hub` while the record names a field** settles the visit and seats the player in the
    hub as the requested character. A field is never resumed.
20. **`find_game` and `start_solo` from a field** start nothing: the player is answered with the
    field they are in, as a member already in a run is answered with the run.
21. **The field keeps its character.** Nothing switches a field body to another character; the
    roster is reachable only by leaving.

### §C Death

22. **Costless death** (D10). A player at 0 HP in a field is fallen: their moves, attacks,
    interactions and leave are refused, exactly as for a dead delver in a run. Nothing they wear
    or carry is dropped or lost. Their death counts in the visit's deaths.
23. **Respawn** (D11). 3 s after falling, the player stands at the place's arrival point (the
    entrance) with full health and full mana, and is in play again. Nothing else about the body
    changes.
24. **A field records no eliminations** and sends no `end_game`; there is no result card.
25. **Monsters ignore the fallen**, as in runs.

### §D Monsters, kills and loot

26. **Spawn points.** Each place lists fixed spawn points. At boot every point is filled. A point
    holds at most one monster, living or lying dead.
27. **Respawn** (D14). 45 s after its monster dies, the point rolls a new one. If a player in play
    stands within the Spire's monster-to-player exclusion radius (`MonsterDelverExclusion`) of the
    point when it is due, the respawn waits and retries each second (D26).
28. **Rolling a field monster.** The archetype is drawn from the place's creature table; the
    level is uniform in the place's band (D15, Meadows 1–4); it is an elite with the Spire's
    floor-1 elite chance, read from the live Spire function (`eliteChance(1)`) at roll time (D24).
    Not party-scaled.
29. **Stats** (D16). A field monster's HP, damage, defense and magic resistance are the Spire's
    level formula (`statsAt`) applied to its sheet, × the place's stat factor (0.75), rounded,
    HP and damage at least 1. An elite then takes the Spire's elite multipliers on top
    (`EliteHPMultiplier`, `EliteDamageMultiplier`). Speeds, radii and timings are the sheet's,
    unscaled. The factor is applied in one place, never baked into a second sheet.
30. **Kill credit** (D12). A field kill's XP goes to the killer only (`KillerMemberID`), at the
    Spire's kill-XP formula, if the killer's body is still in this field, alive or fallen. Nobody
    else earns from it. A kill with no player killer earns nothing.
31. **The drop chance is derived, never copied** (D17, D23). The Spire's monster drop table
    (`MonsterDrops`, `EliteMonsterDrop`, `BossMonsterDrop` in `loot_tuning.go`) stays the single
    source of truth. A field creature names the Spire row it drops as (the boar: the ghoul's row;
    any elite: the elite row). At roll time the field reads that row live and uses
    `chance × the place's drop factor` (Meadows 0.35). Item count, type split, rarity source and
    item level (the kill's level) come from the same row unchanged. Retuning a Spire row retunes
    every field creature that drops as it, with no field edit.
32. **Containers in fields** (none in the Meadows; FS-3QHQZ's clearings). A field container rolls
    the Spire's chest roll unchanged (`generateItems`, including the `weaponDropRate`,
    `armorDropRate` and `consumableDropRate` type split), and each rolled item is kept with
    probability equal to the place's drop factor. One function owns this, next to the monster
    rule.
33. **Killer-first window** (D13). A field drop pile is reserved for the killer for 30 s after it
    lands. Inside the window anyone else's pickup is refused with reason `loot_reserved` and the
    item stays. After it, anyone in range may take anything from it. The window runs whether or
    not the killer is still in the field.
34. **Piles expire** (D25). A field drop pile is removed 120 s after it lands, with whatever it
    still holds; an emptied pile is removed at once. A run's piles are unchanged.
35. **The state broadcast says who a pile is reserved for.** A field drop pile carries
    `reserved_for` (the killer's member id) while its window is open, and no such field after.
    Run piles never carry it.

### §E Balance numbers live with the Spire's

36. The field factors (stat 0.75; drop Meadows 0.35, Forest 0.5), level bands, the respawn,
    window and pile timings, and the boar's sheet and kill-XP base are tuning constants in
    game-service's tuning files beside the Spire's, each a starting value.
37. **The boar's sheet** (starting values, to move in play): HP 36, damage 5, attack interval
    1.2 s, wind-up 0.45 s (a lowered-head charge), attack range 45 px, move speed 140 px/s,
    defense 2, magic resistance 0, aggro radius 200 px, leash radius 450 px. Kill-XP base 8.
    Elite names take a field prefix list (`Old`, `Scarred`, `Great`), not the barrow prefixes.

### §F Settlement: a field visit through the match-end outbox

38. **What settles.** On every leave (§B 15, 17, 18, 19) the visit settles exactly once: a
    snapshot of the body (equipped gear, satchel) and the visit's XP, kills and deaths, taken
    under the field's lock, published off it.
39. **Through the existing outbox** (D6). game-service writes one `items.extracted` and one
    `match.ended` row to its own outbox in one transaction, through the same write the run's end
    uses (`writeMatchEndOutbox`), so the FS-9TNJA relay and the FS-BVM9H consumer inboxes carry
    it unchanged.
40. **`MatchEndedEvent` for a visit**: `session_id` = the visit id; `match_started_at` / `ended_at`
    = entry and leave times; one `PlayerMatchResult` with `member_id`, `username`,
    `character_id`, `experience_gained` (the visit's XP), `kills`, `deaths`, `win = false`,
    `escape = false`, `final_position = 1` (stats-service's `match_history` CHECK requires ≥ 1);
    and the new `world_type = "field"` (R43). This is the **`returned`** result: there is no
    outcome enum on the wire, and none is added.
41. **`ItemsExtractedEvent` for a visit**: `session_id` = the visit id; one `PlayerItems` with the
    full equipment (loadout items with their `instance_id`; items picked up in the field and worn
    with an empty one) and the full satchel. Equipment is never nil: a body is only ever seated
    with a read loadout (R10, D27).
42. **A fresh visit id per visit is load-bearing.** character-service keys XP grants on
    `(session_id, character_id)`; reusing the channel's id would drop every visit after the first
    as already granted.
43. **The discriminator** (D22). `MatchEndedEvent` gains `string world_type = 5` (`"run"` or
    `"field"`; empty reads as `"run"`, so runs and old rows are unchanged). game-service sets
    `"run"` on a run's end and `"field"` on a visit. The `.proto` changes and the Go is
    regenerated (`common/Makefile`), never hand-edited.
44. **stats-service skips field visits.** A `match.ended` with `world_type = "field"` is marked
    processed in its inbox and writes nothing: no `games_played`, no win or loss, no
    `match_history` row, no leaderboard change. A field visit is not a match.
45. **notification-service skips field visits.** No "Game Over" / "Victory!" / "Escaped!"
    notification for `world_type = "field"`.
46. **character-service and items-service are unchanged.** character-service grants the visit's
    XP by its existing grant row; items-service mints picked-up items (empty `instance_id`) and
    upserts the loadout snapshot by its existing path.
47. **Deploy order.** The consumers' skip (R44, R45) ships before game-service publishes any field
    visit; proto3 consumers ignore the unknown field until then, so the order is safe only this
    way round.
48. **No double mint.** An item picked up in a field exists only on that field body. Every body,
    in any world, is built from items-service, so a settled pickup never reaches a later
    snapshot without its `instance_id`.
49. **Nothing settles twice and nothing is lost by a leave racing a drop**: whichever of leave,
    disconnect, `leave_hub` or `enter_hub` removes the body first settles the visit; the rest
    find no body and settle nothing.
50. **A pod crash loses only the unsettled visit** (ADR-0030); nothing was at risk.

#### The settlement finding (why R43–R45 exist)

The charter assumed a field visit could ride the match-end path untouched. Read against the code
(2026-10-29), it can carry a visit's data with no change: `session_id` is already a world-minted
uuid, one-player events are fine, there is no escrow (gear is read over gRPC at seating and
written back as a snapshot), and items-service already treats a dead player's gear exactly like
a survivor's. Every run today already settles as "returned" on the items side. What it cannot do
without a change is tell its consumers that a visit is not a match:

- **stats-service** (`ProcessMatchCompleted`) has no per-outcome branch. Every `match.ended`
  player adds `games_played + 1`, a `match_history` row, and, if `win`, a win counted twice
  (stats and leaderboard). Farming the Meadows would inflate games played and the match history
  by one per visit.
- **notification-service** (`ProcessGameEnded`) sends one in-app notification per player per
  event: a "Game Over" for every field visit.
- **The run path's ranking** marks anyone not eliminated `win = true`, so a visit must not go
  through `rankPlayers`; it builds its own result (R40).

The smallest honest change is one additive proto field and a skip in two consumers (R43–R45).
No DB migration, no HTTP endpoint, no change to character-service or items-service. **This is a
server decision for the user**; the alternative, publishing with no discriminator, works today at
the cost of the stats and notification side effects above.

### §G Gentle Meadows

51. **The place.** A fixed, hand-laid open map east of the hub (D18, D19), larger than the hub
    viewport so it scrolls: about the hub's size (2000 × 1000 px). Its entrance gate is on its
    **west** edge (the road back to the hub's east gate); players arrive just inside it.
52. **Layout.** A few obstacles only (sparse tree clusters and rocks as keep-out areas); no
    walls, rooms, doors or containers. 10–12 spawn points spread across the open ground, none
    within 400 px of the entrance, so the arrival point is quiet.
53. **Creatures.** One creature table entry: the boar (D20). Level band 1–4; drop factor 0.35;
    stat factor 0.75.
54. **The look** (client). The exterior theme's ground family (FS-8RBQY's `OUTDOOR_GROUND`),
    recoloured to cozy, daylight greens; sparse baked trees and rocks matching the server's
    obstacles; a horizon backdrop (sky and distant hills) behind the map's far edge; daylight
    ambient with no torch-lit darkness. The entrance gate reads as the road home with a signpost.
    Ground stays deterministic per tile and per world seed, as every world's does.

### §H The client

55. **Routing.** `world_entered` with `world_type: "field"` starts the field scene;
    `world_type` in the client's state types gains `"field"`; the store keeps the field id from
    `world_entered`. A field never routes to the run scene or the hub scene.
56. **The field scene** draws the player, other players in the channel, monsters with their
    plates and HP bars, attacks, projectiles and drop piles, and offers the satchel and equip
    HUD, all **shared with the run scene, never copied**. Run-only surfaces never appear: the
    result card, escape, stairs and floor HUD, die-by-choice and leave-run.
57. **Walking out.** The player walks into the entrance gate to leave; the client sends
    `leave_field` once and waits for `world_entered` or a refusal, as the hub does for its own
    sends.
58. **Fallen.** A fallen player sees a short fallen state with a 3-2-1 countdown, then stands at
    the entrance. No result card, no "you lost" copy: nothing was lost.
59. **Reserved loot.** A pile reserved for someone else (`reserved_for` ≠ me) is drawn dimmed and
    its pickup is not offered; a click on its item gets the `loot_reserved` copy. A pile reserved
    for me, or open, draws as a run's pile.
60. **Refusal copy** for every reason in R10, R14 and R33 is written by the client, in the voice
    of `game-client/docs/design-guideline.md`, never shown as a raw code.
61. **The boar** (D20, D28). Baked in the bake tool, authored in code on the shared rig with a
    quadruped variant (ADR-0020, ADR-0021): 8 directions; idle, walk, attack (a readable
    lowered-head wind-up before the charge) and death; plus an elite variant sheet (bigger tusks,
    scarred, darker bristle). Drawn at fodder tier. A hostile's ember-red eyes stay the hostile
    accent. The client draws the elite sheet for an elite boar. Gated on the owner's contact
    sheet.
62. **Guideline amendment first** (D28). `game-client/docs/design-guideline.md` Part I gains a
    **field-wildlife clause**: in field worlds only, fodder may be living animals (the boar
    first) on a quadruped rig variant, with natural hide materials; eyes stay the ember-red
    hostile accent; how a quadruped is measured against the fodder size tier; and field worlds
    may be daylit. The Spire's undead-only rule is unchanged. Attributed to the owner's
    approval of this FS.

## User Stories

1. As a player in the hub, I want to walk east through a gate into a meadow, so that I can farm
   without queueing.
2. As a player, I want to enter a field with whatever I am wearing, so that there is no setup
   screen between me and play.
3. As a player queued for the Spire, I want to be told I cannot wander off into a field, so that
   my match does not find me somewhere I cannot be pulled from.
4. As a player, I want the field to be shared with others on my server, so that it feels like a
   real game world and not an instance.
5. As a player, I want to walk back out the way I came and stand at the same gate in the hub, so
   that the world's geography makes sense.
6. As a player, I want the XP I earned in the field to be on my character when I leave, so that
   farming is worth it.
7. As a player, I want the items I picked up in the field to be in my stash when I leave, so that
   I can equip them, sell them or carry them into the Spire.
8. As a player, I want dying in the Meadows to cost me nothing, so that it is a safe place to
   learn and to farm.
9. As a player who just died, I want to be back on my feet at the entrance in a few seconds with
   all my gear, so that I can keep playing.
10. As a player who lands the killing blow, I want the XP and the drop to be mine, so that
    effort is rewarded.
11. As a player who killed something, I want a short window where only I can pick up its drop, so
    that nobody snatches it from under me.
12. As a player who did not land the kill, I want an abandoned drop to become anyone's after a
    while, so that loot does not rot on the ground.
13. As a player, I want monsters to come back after a while, so that the field never runs dry.
14. As a player, I want field monsters to be easier than the Spire's, so that fields are the
    safe, lower-reward option and the Spire stays the prize.
15. As a player, I want field drops to be rarer than the Spire's, so that the Spire stays the best
    place for loot.
16. As a designer, I want field drop chances to follow the Spire's table automatically, so that
    tuning the Spire tunes the fields and the two never drift.
17. As a player, I want to recognise the boar and its elite at a glance, so that I know what I
    am fighting.
18. As a player, I want the Meadows to look cozy and daylit with a horizon, so that it feels
    like a different place from the Spire.
19. As a player whose connection drops in a field, I want to come back to the hub with what I
    earned settled, so that a bad connection costs me nothing.
20. As a player in a field, I want to log out to the roster and keep what I earned, so that
    leaving is never a trap.
21. As a player, I want no PvP in fields, so that sharing a field is co-operative.
22. As a player, I want my hub level to update the moment I return, so that I see my progress.
23. As a player, I want a field visit not to count as a game played or show a "Game Over"
    notice, so that my stats and inbox mean what they say.
24. As an operator, I want each pod to run its own fields with no cross-pod traffic, so that
    fields scale with pods like MMO servers.
25. As an operator, I want a pod crash to lose at most an unsettled visit, so that nothing a
    player risked is lost.
26. As a developer building the Forlorn Forest (FS-3QHQZ), I want to plug a generated layout and a
    new creature table into the field machinery, so that a second field needs no field-world
    changes.
27. As a player, I want to see when a drop is reserved for someone else, so that I do not keep
    clicking it.
28. As the owner, I want to approve the boar's contact sheet before it ships, so that the art
    meets the bar.

## Acceptance Criteria

- [ ] A pod boots with one Gentle Meadows channel beside the hub; it ticks with nobody in it and
      is never shut down (empty, last disconnect, end rule, seat release).
- [ ] `enter_field { field: "gentle_meadows" }` at the Meadows hub gate switches the player into
      the channel on the same connection and answers `world_entered` with `world_type: "field"`
      and `field: "gentle_meadows"`; the hub body is gone.
- [ ] Entry is refused, with the stated reasons, when not in the hub, with no character, for an
      unknown field, away from the gate, while queued, and when the loadout cannot be read; no
      body is created on any refusal.
- [ ] The loadout is read before the field's lock is taken (a stalled items-service read does
      not stall the field's tick for others).
- [ ] The field body wears the player's equipped loadout, items above their level carried, as a
      run's does.
- [ ] `leave_field` at the entrance gate settles the visit and seats the player at the matching
      hub gate with `world_entered` hub; away from the gate, or fallen, it is refused.
- [ ] Disconnect in a field settles the visit and moves the record to the hub; a reconnect within
      the grace is announced the hub.
- [ ] `leave_hub` from a field settles and leaves for the roster; `enter_hub` from a field settles
      and seats the player in the hub; `find_game` / `start_solo` from a field start no run.
- [ ] Every leave settles exactly once, even when a leave and a drop race.
- [ ] A visit settles as one `items.extracted` and one `match.ended` outbox row in one
      transaction, `session_id` = a fresh visit id, `world_type = "field"`, `win = false`,
      `escape = false`, `final_position = 1`, with the visit's XP, kills and deaths, the full
      equipment (never nil) and the full satchel.
- [ ] Two visits by the same character both grant their XP in character-service.
- [ ] stats-service marks a field `match.ended` processed and writes no stats, history or
      leaderboard change; a run's `match.ended` is processed exactly as before.
- [ ] notification-service sends nothing for a field `match.ended`; runs unchanged.
- [ ] A run's `match.ended` carries `world_type = "run"`.
- [ ] Field monster stats equal the Spire formula × 0.75 (elites × the elite multipliers on top),
      levels fall in 1–4, and no field monster is party-scaled.
- [ ] Field drop chance is the referenced live Spire row's chance × 0.35: changing the Spire row's
      chance in a test changes the field's with no field edit; no field drop table exists.
- [ ] Only the killer earns a field kill's XP; other players in the field earn nothing from it.
- [ ] A field drop pile refuses others with `loot_reserved` for 30 s and then lets anyone take
      from it; it is broadcast with `reserved_for` only during the window; it vanishes 120 s after
      landing; run piles are unchanged.
- [ ] A spawn point refills 45 s after its monster dies, waiting while a player stands within the
      exclusion radius; at boot every point is filled.
- [ ] A fallen field player drops and loses nothing, respawns at the entrance after 3 s at full
      health and mana, and no `end_game` is sent.
- [ ] No field state is published to Redis; no file under `internal/matchmaker` or
      `internal/match_queue`, nor their wiring, is changed.
- [ ] The client routes `world_type: "field"` to the field scene, which shares the run scene's
      combat, monster, pile and HUD drawing and shows none of the run-only surfaces.
- [ ] Walking into the entrance gate sends `leave_field` once; the fallen state counts down 3 s.
- [ ] A pile reserved for someone else is dimmed and offers no pickup.
- [ ] The Meadows draws as daylit greens on the exterior ground family, with sparse trees and
      rocks where the server's obstacles are, a horizon backdrop, and a road-and-signpost
      entrance.
- [ ] The design guideline carries the field-wildlife clause; the boar and elite boar are baked on
      the shared rig's quadruped variant with 8 directions and the four clips; the owner has
      approved the contact sheet.
- [ ] Every refusal reason has client copy; no raw reason code reaches the screen.

## Edge States

- **Empty field:** keeps ticking; monsters idle at their points; respawns still run (D21).
- **Queue unreadable at entry:** treated as not queued, as `start_solo` does.
- **Items-service down at entry:** refused `loadout_unavailable`; the player stays in the hub.
  (A run seated bare today would clear the stored loadout on settlement; the field avoids it by
  refusing. The run behaviour is out of scope.)
- **Items-service slow at entry:** the read is bounded by the existing loadout timeout and happens
  before the field's lock; the world keeps ticking.
- **Leave races disconnect / `leave_hub` / `enter_hub`:** the first to remove the body settles;
  the rest settle nothing.
- **Disconnect while fallen:** settles as-is; nothing is lost.
- **Disconnect, reconnect within grace:** the player is in the hub; the visit was already settled.
- **Grace runs out after a field disconnect:** the hub body is removed as for any hub member.
- **Hub full when a field player returns:** they are seated anyway; coming home is not arriving.
- **Two visits back to back within one outbox cycle (~5 s):** the second body is built from the
  loadout as it stood before the first visit settled. Nothing is lost: picked-up items are in the
  stash once the first settles; a found item worn in the first visit may come back unequipped
  (last loadout snapshot wins). Same as a run today; accepted.
- **Killer leaves before the window ends:** the pile stays reserved for them until 30 s, then is
  anyone's.
- **Killer dies:** still the killer; XP is credited while their body is in the field.
- **Kill by a projectile after the shooter left:** the killer has no body here; no XP, the pile is
  still rolled and reserved for them for 30 s.
- **Two players pick up the same item in one tick:** the item moves once, as in runs; the second
  pickup is refused.
- **Satchel or equipment change in the field:** settles in the snapshot (equipping a found item
  in a field makes it worn in the stored loadout).
- **Character at the level cap (20):** earns no XP, as in runs; items still settle.
- **Visit with no XP and no pickups:** still settles (the loadout snapshot is rewritten, XP grant
  skipped by character-service for 0).
- **Pod crash:** the unsettled visit is lost; nothing at risk; the next connection lands in the
  hub of whichever pod it reaches.
- **Friends on different pods:** walk into different channels (ADR-0030 known cost); no
  mitigation here.
- **Unknown archetype on the client:** drawn with the fallback look, as today.
- **A stale `enter_field` from a client already in the field:** refused `not_in_hub`.

## Out of Scope

- The hub gates themselves: their placement, art, signposts and hub-side proximity check
  (FS-0XMCP). This FS consumes them.
- The Forlorn Forest, its generator, zombies and the ghost (FS-3QHQZ), beyond the plug points in
  R3 and R32.
- Joining a friend's channel, party formation, the Spire party bonus, chained zones,
  per-player or per-party instances from fields.
- Field sleep when empty (resolved: always on).
- Gold, wallet or ledger effects (no consumer carries gold).
- Fixing the run path's own settlement quirks found while reading it (bare seating clearing the
  loadout; stats' doubled win count and inverted top-three) — reported, not changed.
- Any change to `internal/matchmaker`, `internal/match_queue` or their wiring; any new HTTP
  endpoint; any DB migration.
- Renaming backend "delver" identifiers.
