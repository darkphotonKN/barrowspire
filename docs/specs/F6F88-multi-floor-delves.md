# FS-F6F88: Multi-floor delves

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout" → "Multi-floor delves"; `game-client/SPECIFICATION.md` "### Escape run" → "Floor transitions" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (a floor change is not a world switch), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) · Siblings (same scoping session, 2026-10-08): [FS-77AB6](77AB6-monsters-and-combat.md) (consumes floor depth and the floor-build seam), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md), [FS-BDA7X](BDA7X-character-leveling.md) · Known defects in the same loop: [FS-QG1HR](QG1HR-simulation-and-lifecycle-defects.md) D4, D5 · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*floor*, *floor depth*, *stairs*, *ascent*, *floor entity* pending via domain-model)

> **Decision provenance.** Decisions marked **(orchestrator default, user may revise)** were open
> questions in the draft that the user delegated; they were settled when this FS was promoted,
> not in conversation with the user. Everything else came from the scoping session.

## Summary

A run stops being one flat map and becomes a climb: **three floors**, the party starting on
floor 1 and pushing up toward floor 3, the top. Each lower floor has **stairs up**; the party
climbs **together**, and only when every delver still in the fight has gathered at the stairs.
Every floor has its own escape door and switch, so a party can get out at any floor: climbing
higher is the greed-and-risk choice, because monsters get harder as the floor rises (FS-77AB6)
and harder monsters drop better items (FS-4R9M9).

A floor change happens **in place**: the same run session and ECS world clear the floor, run
the existing map generator again, and set the party down on the new floor. Delvers keep what
they wear and carry. Whatever was left on the ground stays behind. The client marks the climb
with a short transition and always shows which floor the party is on ("Floor 2 of 3").

**Lane:** the game-service half is the backend human lane (root `CLAUDE.md`). The game-client
half is the agent lane.

### Why in place, not a new world per floor (decision record)

A new session per floor would turn every climb into a world switch: remove every delver from
one world, build another, and re-add them, with roster, extraction and run-end bookkeeping
handed across. Regenerating in place keeps the run one session from queue to resolution, so
run-end rules, elimination order, the escaped count and extraction stay where they are today.
The cost moves to one place, the floor clear, and it has to be leak-free. That is why
§Requirements 9–14 and the leak acceptance criteria are the heart of this FS.

## Requirements

### Floors

1. A run has **3 floors**. Floor 1 is where the run begins and floor 3 is the **top**. The
   count is one server constant, not per run. **(orchestrator default, user may revise)**
2. The run always knows its **floor depth**: the current floor number, 1-based, starting at 1.
   Depth only goes up. **No going back down**, and a floor is never revisited, so a floor keeps
   no state once the party leaves it. **(orchestrator default, user may revise)**
3. Floor depth is **world state readable by systems** (ECS: plain data on a run-level entity
   that survives floor changes, such as the match-progress entity, not a field only the session
   struct can see). FS-77AB6 reads it to add its floor offset to monster level, raise the elite
   chance, and guarantee the demon on the top floor.
4. The hub has no floors. Nothing in this FS changes a hub session.

### Floor layout

5. Every floor is built by the **existing run map generator**: the 3 random buildings, 1 chest,
   1 locked escape door and 1 switch that unlocks it, placed as today. Chest drop rates and the
   loot roll do not change by floor. **(orchestrator default, user may revise)**
6. Every floor **except the top** also gets **one stairs entity (up)**. The top floor has none.
   **(orchestrator default, user may revise)**
7. Stairs are placed through the same occupied-area check as the other map objects, so they do
   not overlap a building, the chest, the escape door or the switch. A non-top floor **always**
   has stairs: if the random placement attempts run out, the stairs still go somewhere
   reachable rather than being skipped (the chest may silently fail to place today; stairs may
   not, because a floor without them strands the party).
8. Building a floor is **one seam**, the *floor build step*, which takes the floor depth and
   produces that floor's entities. The first floor and every later floor go through it, so
   there is exactly one place where a floor is made. FS-77AB6 extends this seam to spawn the
   floor's monsters. **This FS must work with no monsters at all**: with FS-77AB6 unbuilt, the
   seam builds the layout above and nothing else.

### Floor regeneration (in place)

9. A floor change happens **inside the same session and ECS world**: same session id, same
   world identity on the broadcast, no world switch, no `world_entered`, no reconnect.
10. **Floor entities are cleared.** Everything that belongs to the floor is removed from the
    entity manager: walls, building doors, the chest and every item still inside it, the escape
    door, the switch, the stairs, projectiles in flight, any item entity no delver is wearing or
    carrying, and (once FS-77AB6 lands) every monster. "Floor entity" is defined by exclusion:
    anything that is not a delver's own entity, not an item that a delver's equipment or satchel
    references, and not the run-level entity holding floor depth and match progress.
11. **Delver records persist.** Every delver's entity survives the floor change, including dead
    and escaped delvers, so the escape flag, elimination order, stats and run-end accounting are
    exactly as they were before the climb.
12. **Carried items persist.** Every item entity referenced by any delver's equipment slots or
    satchel (`ItemIDList`) survives, with the same entity id and the same stats. Items left on
    the ground or in a chest are lost. **(orchestrator default, user may revise)**
13. **Per-floor bookkeeping resets.** Anything the session keeps about the current floor starts
    fresh: the occupied-area list the placement check reads, the escape door and switch ids,
    the interaction rate-limit caches, and every stored reference to a floor entity. A stale
    occupied-area list is the dangerous one: it makes the new floor's buildings fail to place.
    Each delver's attack target and attack-in-progress state are cleared, since their target
    may no longer exist.
14. **Session-scoped data is not rebuilt.** The item template pool and the rarity list are
    loaded once per run and reused on every floor. A floor change makes no call to the items
    service.
15. **Living delvers are moved to the new floor.** Every living, non-escaped delver gets a new
    position from the run's existing spawn rule and has their velocity zeroed. Dead and escaped
    delvers are not placed on the new floor: they appear in no later state broadcast as a
    present body (escaped delvers are already left out of the broadcast today; dead delvers
    must be too, after a climb), while their records persist per §11.
16. **A floor change is atomic with respect to the tick.** No state broadcast contains entities
    from two floors or a half-built floor. The change is applied between ticks, never during
    one.

### Stairs and ascent

17. Stairs are interacted with through the existing `interact` action, under the same range
    rule as every other interactable: the interacting delver must be within the default
    interact range of the stairs, or the existing "too far" refusal applies.
18. **The party ascends together.** When a delver interacts with the stairs, the ascent happens
    only if **every living, non-escaped delver in the run** is within the stairs' interact
    range at that moment. Otherwise the interaction is refused and nobody moves.
    **(orchestrator default, user may revise)**
19. Dead and escaped delvers never block an ascent. A lone surviving delver ascends alone.
20. A delver mid-reconnect still has an entity in the run, so still counts and the party waits
    for them. The wait is bounded by the reconnection grace: once the timeout removes the
    entity, they no longer count. **(orchestrator default, user may revise)**
21. A successful ascent increments floor depth by one and regenerates the world (§9–16) for the
    new depth. Exactly one ascent happens however many delvers interact with the stairs at the
    same moment.
22. A refused ascent tells the interacting delver why, through the existing `interact` error
    reply shape (`success: false`, `message`), plus two extra fields so the client can write
    its own copy: `reason: "party_not_gathered"` and `missing`, the number of living,
    non-escaped delvers not yet within range.

### Run end and escape

23. Escape works on **every floor**: unlock the floor's escape door with its switch, go
    through, escape. A delver who escapes on floor 1 is out; the rest may keep climbing.
24. Floors do not change the run-end rule. The run ends under whatever rule `RulesSystem`
    enforces at the time (FS-77AB6 moves it to co-op: every delver escaped or dead). A floor
    change never ends the run, and reaching the top floor does not end it either: the party
    still has to escape.
25. Items carried up from a lower floor are extracted on escape exactly like items found on the
    floor where the delver escapes: §12 keeps their entities, so the run's end-of-match state
    sees them.

### State broadcast (wire contract)

The game uses the WebSocket state broadcast, not HTTP, so this FS has no §API surface. These
fields are the contract between the two halves:

26. Every run-world state broadcast carries `floor` (current depth, 1-based integer) and
    `floor_count` (total floors, integer). Hub broadcasts omit both.
27. Every run-world state broadcast carries `stairs`: an array of `{ entity_id, position: { x,
    y } }`, empty on the top floor. It follows the same per-tick full-state rule as escape doors
    and switches.
28. The client detects a floor change by `floor` increasing between broadcasts. No separate
    floor-change message is added; the per-tick state is the single source of truth, which
    keeps the transition correct across reconnects.

### Client

29. **Floor indicator.** While in a run, the HUD always shows the current floor as "Floor N of
    M", from `floor` and `floor_count`, in the neutral-HUD channel (vellum, body serif). It is
    hidden in the hub.
30. **Stairs.** Stairs render as an interactable (the amber channel, design guideline
    "Gameplay accent"), are reachable with the existing interact key when nearby like the
    switch and escape door, and are absent on the top floor. A placeholder drawn in code is
    acceptable here; baked stair art is out of scope (see §Out of Scope).
31. **Gather refusal.** A `party_not_gathered` refusal shows a short notice in the lore voice
    (`game-client/CLAUDE.md` "Wording & Tone"), using `missing`. For example, "The stair waits.
    2 of your party are not yet with you." Exact copy is the implementer's call within the voice
    rules.
32. **Transition.** When `floor` increases, the client plays a short transition: the view goes
    dark, the new floor is built, and it comes back up with a brief floor card ("The Second
    Floor" or similar, lore voice). The card uses the body serif, since the blackletter bound
    allows only the main-menu title and the end-of-run heading. The transition is
    presentation-only and never delays or drops state updates. On reconnect into a run already
    on floor 2 or 3, the client builds that floor directly with no transition.
33. **Per-floor rebuild.** Everything the scene builds once per world from server walls (roofs,
    house flagstone painted into the ground, entrance markers, occluders, wall light sources) is
    torn down and rebuilt for the new floor. One-shot notification memory (switch activated,
    escape door opened) resets so the new floor's switch and door notices fire again. No sprite,
    light, marker or occluder from the previous floor survives the transition.
34. Visuals follow `game-client/docs/design-guideline.md`, and colours come from tokens only
    (ADR-0013).

## User Stories

1. As a delver, I want a run to be a climb through several floors, so that pushing deeper feels like scaling the Spire rather than looting one room.
2. As a delver, I want to see which floor I am on at all times, so that I can judge how deep we are and how much risk we carry.
3. As a delver, I want to see how many floors there are, so that I know how far the top is.
4. As a delver, I want stairs up on every floor below the top, so that I have a clear way to climb.
5. As a delver, I want the stairs to look interactable, so that I can find them at a glance.
6. As a delver, I want no stairs on the top floor, so that I know I have reached it.
7. As a party, we want to climb together, so that nobody is stranded alone on a lower floor.
8. As a delver standing at the stairs, I want to be told how many of my party are still missing, so that I know to wait or call them over.
9. As a delver whose companion has died, I want to be able to climb without them, so that a death does not lock the party out of the next floor.
10. As a delver whose companion escaped, I want to keep climbing without them, so that one person leaving does not end the push for the rest.
11. As the last delver standing, I want to climb alone, so that surviving is still a choice to push or leave.
12. As a delver, I want every floor to have its own escape door and switch, so that I can take what I have and leave at any depth.
13. As a delver, I want every floor to have a chest, so that every floor is worth exploring.
14. As a delver, I want to keep my equipment and satchel when I climb, so that what I found below is still mine to extract.
15. As a delver, I want items I left on the ground to stay behind, so that choosing what to carry matters.
16. As a delver, I want the climb to be marked by a short transition and a floor card, so that arriving somewhere new feels like it.
17. As a delver, I want the new floor to be freshly laid out, so that every floor is new ground.
18. As a delver, I want nothing from the old floor (walls, roofs, lights, chests, monsters) to linger on the new one, so that the world reads correctly.
19. As a delver reconnecting mid-run, I want to land on whatever floor my party is on, so that I rejoin them where they are.
20. As a delver reconnecting while my party waits at the stairs, I want them to have waited for me, so that a short drop does not strand me below.
21. As a party, we want a companion who never reconnects to stop blocking the stairs once they time out, so that one dead connection cannot trap us.
22. As a delver who escapes on floor 2 with items found on floor 1, I want them extracted, so that the climb paid off.
23. As a delver, I want the run to end the same way it always does (all out or dead), so that floors do not add a hidden ending.
24. As a delver on the top floor, I want to still have to escape, so that reaching the top is not the same as getting out.
25. As a monster designer (FS-77AB6), I want the floor depth readable by systems, so that monster level, elite chance and the boss can scale with the climb.
26. As a monster designer (FS-77AB6), I want one floor-build step I can extend, so that monsters spawn on every floor without a second code path.
27. As a developer, I want floors to work with no monsters at all, so that this FS ships before or after FS-77AB6.
28. As a developer, I want a floor change to leak nothing across floors, so that long runs do not accumulate dead entities or stale collision.
29. As a developer, I want a floor change to make no items-service call, so that climbing cannot fail on a network hiccup.
30. As a developer, I want no broadcast to mix two floors, so that the client never renders a half-built world.

## Acceptance Criteria

### Floors and layout
- [ ] A new run starts at floor 1 of 3; the state broadcast carries `floor: 1`, `floor_count: 3`.
- [ ] Floor depth is readable from the ECS world by a system, without access to the session struct.
- [ ] Floors 1 and 2 each have exactly one stairs entity; floor 3 has none.
- [ ] Every floor is built by the same floor build step as floor 1: up to 3 buildings and 1 chest (placement may fail as today), and always 1 locked escape door and 1 switch that unlocks it.
- [ ] Stairs never overlap a building, the chest, the escape door or the switch, and a non-top floor without stairs is impossible (tested, including when placement attempts are exhausted).
- [ ] Hub broadcasts carry no `floor`, `floor_count` or `stairs`.

### Ascent
- [ ] Interacting with the stairs while every living, non-escaped delver is in range raises depth by one and regenerates the floor.
- [ ] Interacting while any living, non-escaped delver is out of range is refused with `success: false`, `reason: "party_not_gathered"` and the correct `missing` count, and nothing changes.
- [ ] Dead and escaped delvers never block an ascent; a single surviving delver ascends alone.
- [ ] An interacting delver who is out of range gets the existing "too far" refusal.
- [ ] Simultaneous stairs interactions from several delvers produce exactly one ascent.
- [ ] Ascending from floor 3 is impossible (there are no stairs to interact with).

### Regeneration is leak-free
- [ ] After a floor change, the entity manager holds **only**: the new floor's entities, every delver entity, every item entity referenced by a delver's equipment or satchel, and the run-level entity. Asserted by counting entities by kind before and after, including after two climbs in a row.
- [ ] No wall, building door, chest, chest content, ground item, escape door, switch, stairs or projectile from a previous floor exists after a change (asserted by entity id).
- [ ] Movement collision on the new floor is resolved only against the new floor's walls and doors. A delver moved to where an old-floor wall stood is not blocked by it. Any spatial index the movement system keeps is rebuilt from the current entity set and holds nothing from the previous floor (FS-QG1HR D4).
- [ ] The occupied-area list, escape door and switch ids and interaction caches hold nothing from the previous floor; the new floor's 3 buildings all place.
- [ ] Every carried item keeps its entity id and stats across the change; an item lying on the ground or left in the chest is gone.
- [ ] Every living, non-escaped delver is at a new in-bounds position with zero velocity and no attack target; dead and escaped delvers are not present as bodies in any later broadcast.
- [ ] Escaped count, elimination order and per-delver stats are unchanged by a floor change.
- [ ] A floor change makes no call to the items service (asserted with a counting fake).
- [ ] No broadcast contains entities from two floors (asserted by applying a change and checking the next serialized state holds only new-floor entities).
- [ ] The floor build step runs with no monster code present, and FS-77AB6 can add monster spawning to it without a second floor-building path.

### Escape and run end
- [ ] The escape door and switch work on every floor.
- [ ] A floor change never fires the run-end signal; reaching floor 3 does not end the run.
- [ ] The run's end-of-match state, computed from the world after a climb, lists items a delver picked up on an earlier floor in their equipment or inventory. (World-level test; see §Edge States on the known end-of-run ordering defect.)

### Client
- [ ] The run HUD shows "Floor N of M" from the broadcast, updates on a climb, and is hidden in the hub.
- [ ] Stairs render in the amber interactable channel, are reachable with the interact key when nearby, and are absent on the top floor.
- [ ] A `party_not_gathered` refusal shows a lore-voice notice that includes the missing count.
- [ ] A `floor` increase plays the transition and floor card (body serif, not blackletter); state keeps applying throughout.
- [ ] After a transition, no roof, ground flagstone, entrance marker, occluder, light source or entity sprite from the previous floor remains (asserted by counting scene objects by kind across a simulated floor change).
- [ ] The new floor's switch-activated and escape-door-opened notices fire again.
- [ ] Reconnecting into a run already on floor 2 or 3 builds that floor directly, shows the right indicator and plays no transition.
- [ ] No raw colour literals (ADR-0013 fence passes).

## Edge States

- **Party split across the map.** The stairs refuse with the missing count; the waiting delvers can stay or leave. There is no timer forcing the ascent.
- **A delver dies at the stairs while the party gathers.** The gather check is evaluated at the moment of interaction, so the dead delver drops out of the requirement immediately.
- **The last delver escapes on floor 1 while others are dead.** The run ends by the normal rule; floors play no part.
- **Delver mid-reconnect.** Counted until the reconnection timeout removes their entity (§20). If the party ascends after that, the delver is gone from the run anyway, which is today's timeout behaviour.
- **Reconnecting after the party climbed.** The client receives the current floor in the first broadcast and builds it directly (§32).
- **Two delvers interact with the stairs in the same tick.** One ascent (§21). The second interaction meets either the stairs entity being gone or a request already pending, and is a no-op rather than a second climb.
- **An interaction targets an entity cleared by the floor change** (chest, door, item id from a stale client frame). It meets today's "entity not found" path. No panic, no effect.
- **A projectile or attack in flight at the moment of change.** The projectile is a floor entity and is cleared; an attack targeting a cleared entity is dropped (§13).
- **Chest opened on floor 1, items not taken.** Lost with the floor.
- **Placement exhausted.** Buildings and the chest keep today's behaviour (may silently fail to place after 100 tries). Stairs may not fail (§7).
- **Item catalogue empty or items service down at run start.** Today the run starts with no loot pool; every floor then has empty chests. Floors still build and climbing still works (§14).
- **End-of-run ordering defect (not fixed here).** `endSession` calls `ReturnPlayersToHub`, which removes every delver's entity, **before** `getRawMatchState` reads the world. If that ordering is what it appears to be, the match-complete payload already has no players or extracted items today, with or without floors. §25 holds at the world level (the entities are there), but an end-to-end "climbed, escaped, items arrived in the stash" check cannot pass until that ordering is fixed. Raised in FS-4R9M9's notes; not absorbed here.
- **FS-QG1HR D5 (end signal every tick, double `Shutdown`).** Unchanged by this FS. Floors make runs longer but do not touch the end path; playtesting a second run after a multi-floor run will still hit D5 until it is fixed.
- **FS-QG1HR D4 (spatial hash).** The movement system's index is rebuilt per tick today, so regeneration adds no new leak there. If D4's fix or FS-77AB6 caches static wall and door cells at world build, that cache must be rebuilt by the floor build step. The leak criterion above holds that line.

## Out of Scope

- **Monsters, monster scaling, elites and the demon boss.** FS-77AB6 owns them; this FS provides floor depth (§3) and the floor build seam (§8) only.
- **Going back down, revisiting a floor, or keeping per-floor state.** Floors are one-way and disposable (§2).
- **Players on different floors at once.** The party moves together (§18).
- **Floor-specific layouts, themes, sizes or loot tables.** Every floor uses the existing generator and unchanged chest rates (§5). Per-floor seeding and a deterministic map seed are not added.
- **Per-floor ground variation on the client.** The baked ground keeps today's per-world-type seed.
- **Baked stairs art.** A code-drawn placeholder ships with this FS; a baked stairs prop via the ADR-0020 pipeline is follow-up art work.
- **Recording the highest floor reached** in the match-complete event, run history or leaderboards. Nothing in the proto or the items/stats services changes.
- **Choosing floor count per delve** (tiers at the Spirewarden) and floor progress persisted across runs. Rejected at scoping.
- **Fixing the end-of-run ordering defect and FS-QG1HR D4/D5.** Noted in §Edge States, owned elsewhere.
- **Timers, forced ascent or a vote.** The gather rule is the only trigger.
