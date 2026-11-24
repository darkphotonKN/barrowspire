# FS-4EC7Z: Dungeon encounters

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Encounters" (dungeon NPC encounters · hired NPC allies · contract marks); `game-client/SPECIFICATION.md` "### Escape run" (dungeon NPC encounters and hired allies · contract mark heading and result) → this FS · Siblings (same scoping session, 2026-11-25): [FS-5FZ4J](5FZ4J-sealed-floors.md) (sealed floors: plates, traps, poison, hidden rooms), [FS-9JV5K](9JV5K-wandering-merchant.md) (the merchant), [FS-X2CMM](X2CMM-class-books.md) (Strike a Deal and Take a Contract, the Ledger pages that hire and that place a mark; Pick the Lock) · Related: [FS-MRZH7](MRZH7-function-npc-markers.md), [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md), [FS-67QQY](67QQY-faces-on-the-human-cast.md) (the town cast whose models are reused), [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md) (champion scaling the mark borrows, the floor pool), [FS-CH21F](CH21F-party-member-overhead-bars.md) (overhead bars) · Related ADRs: [ADR-0092](../adr/0092-a-floors-way-up-never-needs-a-class-a-book-page-or-a-second-delver.md) (an ally is a shortcut, never the way), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (the run's roster is its party), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (art built in code), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md), [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) (on-demand art), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md)–[ADR-0086](../adr/0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (the UI scene)

> Promoted `--from-thread` on 2026-11-25 from the scope-it session's raw notes. **(owner)** marks
> Kranti's words or approval; **(charter default)** the defaults approved under the 2026-11-25
> charter, with their reason; **(promotion default)** what the notes left open and this promotion
> settled, as the smaller v1.

## Summary

Spire floors from 2 up sometimes hold a group of humans: **Lost Pilgrims** who beg to be defended
from a wave and open a better chest if one lives; **Captives** in a cage whose key lies elsewhere
on the floor, who fight beside the party once freed; and **Cutthroats** who talk first and may turn
on the party, or tell it where a secret door is. Freed or hired humans are **hired allies**: they
follow, fight, hold a pressure plate and trigger traps, and stay behind when the party climbs. The
mercenary's **contract** (placed by a class book page, FS-X2CMM) spawns a **mark**, a hard, poisoned
duelist somewhere far on the floor; killing it grants **Contract Settled**, +15% damage for the rest
of the delve. This FS builds the encounters, the ally and mark mechanics as server entry points
with tests, and their client presentation. Wiring the Ledger's pages to them is FS-X2CMM's.

## Requirements

Numbers are tunables in one place beside the other spawn rates, so a local build can force an
encounter kind.

### §A. Encounters on a floor (game-service)

1. **Frequency** (charter default): at most one encounter a floor, on about **40%** of floors 2+,
   never floor 1, never the top floor, on sealed dungeon floors only. Kind drawn uniformly from
   {Lost Pilgrims, Captives, Cutthroats}. A contract's mark (§E) is extra to this.
2. **The encounter room**: a room that is not the start, stairs, switch, escape door, a seal
   piece's, a hidden room or a respite's (FS-5FZ4J, FS-9JV5K), chosen from the rooms at or past the
   median walk distance from the start where one qualifies (promotion default: an encounter is
   something found, not met at the door). It holds the encounter's NPCs and no rolled monsters.
3. **An encounter NPC** is a humanoid body: health (an encounter sheet per kind), a transform, a
   velocity, a **stance** (`peaceful`, `caged`, `ally`) and a **look** (§G). It is not a monster
   and not a delver. **Delvers never damage one** (attacks, areas, projectiles, reflects and traps
   pass it by); **monsters may**: a monster's target choice counts encounter NPCs in reach as it
   counts delvers (nearest), except caged ones. An encounter NPC killed is removed; it gives no
   experience and drops nothing. Bodies collide as other bodies do.
4. **Talking** (charter default: the existing interaction, a short line over the head): an interact
   on an encounter NPC in reach is a **talk**, answered on the state by the NPC's **line** (a key,
   §F R26) and, per kind, what the talk starts. Talking to an ally or a caged captive only sets a
   line.
5. **Party-size scaling** (promotion default, as the owner asked the wave and the mark to scale):
   numbers below that name "living delvers" read the count of delvers in play at the moment the
   thing is spawned. Levels follow the floor's monster level (FS-C8VM7), as every monster does.

### §B. Lost Pilgrims (game-service)

6. **Three pilgrims** stand in the encounter room, `peaceful`, cowering (they never attack).
7. **The plea**: when a delver first comes within 3 cells of any pilgrim (or talks to one), they
   say their plea and, **5 s** later, the **wave** comes: `2 + 2 × living delvers` monsters of the
   floor's pool (fodder, plus one brute when three or more delvers live), split between two spawn
   spots in the corridors outside two different doorways of the room (both outside one, if the room
   has one), aggroed on the nearest pilgrim or delver. Solo, the wave is 4: solvable by one
   (ADR-0092 does not bind this optional reward, but it holds).
8. **The reward**: when every wave monster is dead, if at least one pilgrim lives, they give their
   thanks line and a **better chest** (FS-5FZ4J §F R39's one-rarity-step-up chest) appears beside
   the nearest living pilgrim, shut, unguarded. If every pilgrim died, no chest; the wave's monsters
   are ordinary monsters to the end. Pilgrims stay where they are afterwards (peaceful, never
   following).

### §C. Hired allies (game-service)

9. **What an ally does** (charter default): an encounter NPC with stance `ally` has a **hirer**
   (a delver; for freed captives, the delver who freed them) and:
   - **follows** the hirer, keeping within 2–4 cells, pathing on the floor's grid as monsters do
     (FS-5FZ4J's barriers respected); if its hirer is out of play, it follows the nearest delver in
     play, and stands where it is when none is;
   - **fights**: it engages the nearest monster within 6 cells of itself or attacking its hirer, and
     strikes it in melee with its sheet's hit, on its sheet's cadence, through the normal hit path
     (monster mitigation applies);
   - **is a body on the floor**: it holds a pressure plate and fires a trap as a delver does
     (FS-5FZ4J §C R18, §D R25; poison applies to it too); a gas vent's cloud counts it;
   - **is targeted** by monsters as any encounter NPC is (R3);
   - **never climbs**: when the party takes the stairs it stays behind and is gone with the floor.
10. **At most 3 allies a party** (charter default), counted across hired cutthroats and freed
    captives. A hire or a freeing that would pass 3 is refused whole (`too_many_allies`).
11. **Credit** (charter default): an ally's kills give no experience to anyone; for loot they count
    as its hirer's kills (the kill record names the hirer as the killer for drop allocation, and the
    hirer's Blessing applies, FS-5FZ4J §G R44).
12. **Allies are run state for the floor only.** On a floor change every ally is removed with the
    floor (R9 "never climbs"); an ally whose hirer dies keeps following the nearest delver in play.

### §D. Captives and Cutthroats (game-service)

13. **Captives** (owner-approved proposal): two captives, stance `caged`, inside a **cage** fixture
    in the encounter room. The cage is locked. Its **cage key** lies elsewhere on the floor: 50% in
    another room (not the start, stairs, a hidden room or a respite's), 50% carried by one elite
    among the floor's monsters, dropped as a key fixture where that elite dies (promotion default:
    an even split of the owner's two places). An interact on the key takes it (party state on the
    floor, as FS-5FZ4J's stair key). An interact on the cage while the party carries the key, or a
    call to the **open-cage entry point** (FS-X2CMM's Pick the Lock), opens the cage and frees the
    captives: they become allies of the delver who opened it (R9–R10), and give their freed line. An
    interact on a locked cage without the key is refused (`cage_locked`).
14. **Cutthroats** (owner-approved proposal): three cutthroats, `peaceful`, in the encounter room.
    The first talk to any of them starts the **parley**: they say their greeting, and **3 s** later
    the group's fate is drawn once (50%):
    - **hostile**: every cutthroat becomes a monster of archetype `cutthroat` (its own sheet, at the
      floor's monster level, standard experience and drops) aggroed on the delver who talked, with
      the turn line;
    - **peaceful** (charter default: the peaceful branch needs a payoff): they give their tip line,
      and the floor's unopened secret door nearest to them is **revealed** to the party: detected
      (FS-5FZ4J §F R38) and marked `revealed: true` on its barrier, which the client shows on the
      minimap (§F R30). With no unopened secret door on the floor, the tip is a lore line only.
15. **Hiring** (the server side of Strike a Deal, FS-X2CMM): a **hire entry point**
    `hire(group, hirer)` turns a willing group into allies of the hirer for the rest of the floor.
    Willing: Cutthroats that have not turned hostile (before or after the parley's draw). Refused
    for any other group (`not_willing`), a group already allied (`already_hired`), or past the ally
    cap (`too_many_allies`). Hiring before the 3 s draw cancels the draw. This FS adds no client
    action that calls it; FS-X2CMM's page does, through `cast_skill`. Tests call it directly.

### §E. Contract marks (game-service)

16. **The contract entry point** (the server side of Take a Contract, FS-X2CMM): `takeContract(
    taker)` places the run's one contract: refused when a contract was already taken this delve
    (`contract_taken`), when the taker is not in play, or on a floor without stairs (the top floor;
    promotion default: there is no climb to lose it to, and the boss is the floor's mark). Run state
    on the run-level entity: the taker, the mark's entity, `state` (`active`, `settled`, `lost`).
17. **The mark spawns** on the taker's floor, in a room at least the median walk distance from the
    taker (charter default), not the start or stairs room, not a hidden or respite room, at a spot
    at least `MonsterDelverExclusion` from every delver. It is a monster of archetype
    `contract_mark` with a **look** drawn from two variants (`hooded_duelist`, `debtor_knight`) and a
    server name (*"The Hooded Duelist"*, *"The Debtor Knight"*).
18. **The mark is painful** (owner; specifics are charter defaults):
    - health: the champion's (FS-C8VM7, at the floor's champion level) × `(1 + 0.5 × (living
      delvers − 1))`; hits as the champion hits;
    - **poison blades**: each of its hits that costs health also poisons (FS-5FZ4J §D R29);
    - at **50%** health, once, it **calls three cutthroats** (`cutthroat` monsters, spawned beside it,
      aggroed on the nearest delver);
    - at **25%** health, once, it **flees** to the room farthest by walk from the nearest delver,
      ignoring attackers on the way, and on arrival **heals 20%** of its max health, then fights
      again.
19. **Settled**: the mark killed by any party member or ally → `state = settled`, and the taker
    (only) gains **Contract Settled** (owner: the mercenary only; charter default: +15% damage) until
    the delve ends for them: their outgoing damage × 1.15; kept across floors; lost on death; never
    stacks (one contract a delve). The mark drops nothing and gives an elite's experience
    (promotion default: the reward is the buff, no gold, owner).
20. **Lost**: the party climbs while the mark lives, or the taker dies (or leaves), → `state = lost`;
    a living mark stays a monster on its floor until the floor ends (or is removed with it).
21. **The heading** (charter default): while `active`, every **5 s** the taker's state carries the
    mark's rough direction from them as one of eight compass words (`north`, `north-east`, …),
    never its position or distance. The mark is cut by interest as every monster is; it is never
    on the minimap.

### §F. The wire (game-service → game-client)

22. **`encounter_npcs`** (run-only state key, cut by interest as monsters are): `[{ entity_id, kind,
    look, position, facing, health, max_health, stance, action, line?, line_at?, hirer_id? }]`.
    `kind` is `pilgrim | captive | cutthroat`; `look` names the art variant; `action` is `idle |
    move | attack | cower | dead`; `line` a line key and `line_at` the server time it was said (the
    client shows a line once per `line_at`); `hirer_id` the hirer's member id for an ally.
23. **`cages`**: `[{ entity_id, position, open }]` and the **cage key** as `encounter_keys: [{
    entity_id, position }]` while it lies, sent whole (landmarks, as FS-5FZ4J's pieces). A carried
    cage key is `cage_key_carried: true`.
24. **Hostile humans** (turned cutthroats, called cutthroats, the mark) ride `monsters[]` with
    archetypes `cutthroat` and `contract_mark` and a `look`, as any monster; the mark carries its
    server name and `boss: true` (the boss plate, as a champion's).
25. **`contract`** on the taker's `current_player` only: `{ state, heading? }`; absent for everyone
    else and when no contract was taken. **`contract_settled: true`** on the public player state of
    a delver who holds the buff.
26. **Line keys** (the client writes the copy): `pilgrim_plea`, `pilgrim_thanks`, `captive_plea`,
    `captive_freed`, `cutthroat_greet`, `cutthroat_turn`, `cutthroat_tip`, `ally_ack` (on being
    hired). The pilgrims' loss has no key: the client reads it off the state (§G R33).
27. **Replies** to interact or the entry points use the existing reply with reasons
    `cage_locked`, `too_many_allies`, `not_willing`, `already_hired`, `contract_taken`.
28. **A revealed secret door** carries `revealed: true` on its `barriers` entry (an addition to
    FS-5FZ4J §I R46, which this FS owns).

### §G. The client (game-client)

29. **Encounter NPCs are drawn** from their looks (§H), animated by `action`, facing as sent,
    depth-sorted as bodies are, joining the hide rule. A pilgrim, captive or cutthroat that is not an
    ally carries a name plate in the neutral ink (*"Pilgrim"*, *"Captive"*, *"Cutthroat"*); an ally
    carries the **ally plate**: its name in the ally ink and an overhead health bar (FS-CH21F's bar,
    shown for allies). E on an encounter NPC in reach talks.
30. **Over-head lines** (new): a short text line over the NPC's head for 4 s, in the world scene
    (ADR-0086: it follows a world object), shown once per `line_at`, never on a first broadcast.
    Copy (promotion default, the client's voice): `pilgrim_plea` *"Please, they're coming!"*,
    `pilgrim_thanks` *"Bless you. Take this."*, `captive_plea` *"The key! Find the key!"*,
    `captive_freed` *"We'll fight with you."*, `cutthroat_greet` *"Well, well. Visitors."*,
    `cutthroat_turn` *"Bad luck for you."*, `cutthroat_tip` *"There's a door in the wall. Look
    there."*, `ally_ack` *"Lead on."*.
31. **The cage** draws shut or open (captives drawn inside it while caged); the cage key draws where
    it lies and is an E target; *"The cage key."* when `cage_key_carried` turns true; `cage_locked`
    → *"Locked. Find the key."*.
32. **Hostile humans** draw from their looks on the monster path (`cutthroat`, `contract_mark`
    archetypes join the monster looks), the mark with the boss plate and its server name.
33. **The wave**: when a wave ends with every pilgrim dead (the pilgrims' entries all gone without
    a `pilgrim_thanks`), *"The pilgrims are lost."* (`refused` tone).
34. **The contract** (the taker only): while `active`, a small line under the HUD's notice area:
    *"Mark: last seen to the <heading>"*, updated as the heading changes; `settled` → *"Contract
    Settled."* (success) and a status mark beside the health bar with the hover line *"Contract
    Settled: +15% damage"*; `lost` → *"Contract lost."* (`refused`). None on a first broadcast.
35. **The minimap** shows a revealed (`revealed: true`) secret door as a small door glyph while it is
    shut.

### §H. Art (game-client bake)

36. **The encounter cast**, built in code from the town cast (FS-67QQY faces, the resident builds)
    with variant tints, gear and faces, Ultima Online fidelity, `BARROW` colours: **pilgrim** (hooded
    robe, staff, satchel), **captive** (ragged, bound wrists until freed), **cutthroat** (leathers,
    hood, dagger), and the mark's two looks, **hooded duelist** (dark hooded coat, twin blades) and
    **debtor knight** (dented plate, tabard of a ruined house, sword). Clips: idle, walk, attack,
    death, and `cower` for the pilgrim, in eight directions. One on-demand group (fetched the first
    time a state carries an encounter NPC or one of the two archetypes, with a stand-in until it
    lands, ADR-0071). Props: the **cage** (shut, open) and the **cage key**, in the sealed-floor
    props group. A contact sheet is made for the owner's gate.

## User Stories

1. As a delver, I want to meet groups of people on some floors, so that the Spire feels inhabited and unpredictable.
2. As a delver, I want pilgrims who ask for help, so that I can choose to defend them.
3. As a delver, I want a wave to come at the pilgrims from two sides, so that defending them is a real fight.
4. As a solo delver, I want a smaller wave, so that I can defend the pilgrims alone.
5. As a delver, I want a better chest when a pilgrim survives, so that defending them pays.
6. As a delver, I want caged captives whose key is somewhere on the floor, so that freeing them is a small quest.
7. As a delver, I want the cage key sometimes carried by an elite, so that I have to fight for it.
8. As a delver, I want freed captives to fight beside us, so that the floor gets easier.
9. As a delver, I want cutthroats who might turn on us after talking, so that every talk is a gamble.
10. As a delver, I want peaceful cutthroats to point out a secret door, so that the gamble can pay.
11. As a delver, I want allies to follow and fight, so that they are worth having.
12. As a delver, I want allies to hold a pressure plate, so that they help with the floor's seal.
13. As a delver, I want allies to trigger traps, so that they are bodies, not ghosts.
14. As a delver, I want allies to stay behind when we climb, so that they are a floor's help, not an army.
15. As a party, we want at most three allies, so that allies never replace delvers.
16. As a delver, I want my attacks never to hurt the NPCs, so that I can fight beside them.
17. As a delver, I want an ally's kills to count as mine for loot, so that hiring does not cost me drops.
18. As a mercenary, I want a contract to place a mark somewhere far on the floor, so that I have a hunt.
19. As a mercenary, I want a rough heading to the mark, so that I can hunt it without a map pin.
20. As a party, we want the mark to be hard, poisoned and tricky, so that the contract is a risk.
21. As a mercenary, I want Contract Settled when we kill it, so that the risk pays for the rest of the delve.
22. As a mercenary, I want to lose the contract if we climb without killing it, so that it is a real commitment.
23. As a delver, I want short lines over the NPCs' heads, so that I know what they want.
24. As the owner, I want the hire and contract entry points built and tested here, so that the class book only wires pages to them.

## Acceptance Criteria

### Server (Go tests next to the code)

- [ ] Encounter odds over a seed sweep (never floor 1 or the top), one per floor at most, the room rules, no rolled monsters in its room (§A R1–R2).
- [ ] Delvers never damage an encounter NPC (melee, area, projectile, reflect, trap); monsters target the nearest of delvers and uncaged encounter NPCs (§A R3).
- [ ] A talk sets the NPC's line and `line_at` (§A R4).
- [ ] Pilgrims: the plea on approach, the wave of `2 + 2 × living` 5 s later from two spots, the better chest when one lives, none when all died (§B).
- [ ] Allies follow within 2–4 cells, engage monsters within 6 cells, strike through the hit path, hold a plate, fire a trap, take poison, stay behind on a climb; the cap of 3; kills credit the hirer for loot with no experience (§C).
- [ ] Captives: the key in a room or on an elite (dropped on its death), the cage opens with the key or the open-cage entry point, captives become the opener's allies; `cage_locked` without the key (§D R13).
- [ ] Cutthroats: the parley's 50% draw after 3 s, hostile → `cutthroat` monsters aggroed on the talker; peaceful → the nearest unopened secret door detected and `revealed` (§D R14).
- [ ] `hire`: willing cutthroats become allies; each refusal reason (§D R15).
- [ ] `takeContract`: once a delve, refusals, the mark's room and spawn, health scaled by living delvers, poison on hit, the call at 50% once, the flee and 20% heal at 25% once, settled → the taker's +15% damage kept across floors and lost on death, lost on a climb or the taker's death, the 5 s compass heading to the taker only (§E).
- [ ] The wire keys of §F serialize as specified and are absent elsewhere.

### Client (vitest)

- [ ] The parser keeps `encounter_npcs`, `cages`, `encounter_keys`, `cage_key_carried`, `contract`, `contract_settled` (§F).
- [ ] Encounter NPCs draw by look and action with the right plate; allies show the ally plate and bar (§G R29).
- [ ] Over-head lines show once per `line_at` for 4 s and not on a first broadcast (§G R30).
- [ ] Cage, cage key, lines (§G R31); hostile humans on the monster path (§G R32); the pilgrims-lost line (§G R33); the contract line, settled mark and lost line (§G R34); the revealed door glyph (§G R35).

### Art

- [ ] The encounter cast, the mark's looks, the cage and the cage key are baked from code with `BARROW` colours; a contact sheet is made for the owner's gate (§H R36).

## Edge States

- **The encounter room is where the wave can't reach** (one doorway): both spawns come through it.
- **A pilgrim dies before the wave** (a stray monster): the wave still comes if any pilgrim lives
  when it is due; with none alive, no wave and no chest.
- **The party ignores the pilgrims.** Without a delver within 3 cells or a talk, nothing starts.
- **An ally on a plate when the party climbs.** It stays behind with the floor; the seal is broken
  already (a plate only matters until the seal breaks).
- **The hirer escapes.** Their allies follow the nearest delver in play; with none, they stand.
- **Allies and the gate.** Allies path around shut gates, pits and blocks like monsters.
- **The mark flees through a trap.** Monsters never fire traps; it passes.
- **The mark's call and flee on the same hit** (50% and 25% crossed together): both fire, the call
  first.
- **The taker disconnects.** The contract stands while they are seated (a reconnect is not a
  leave); it is lost if they leave the run.
- **Two contracts.** Impossible: once a delve.
- **The top floor.** No encounters (R1); no contract (R16).
- **An encounter NPC in a gas cloud.** Poisoned as an ally is (bodies on the floor); a peaceful one
  can die of it.

## Out of Scope

- The Ledger's pages (Strike a Deal, Take a Contract) and Pick the Lock on the client and their
  `cast_skill` wiring: FS-X2CMM. This FS exposes `hire`, `takeContract` and the open-cage entry
  point with tests only.
- Gold for hires or contracts (rejected, owner). Turncoat (rejected, owner).
- Encounters in the hub or the fields, ally commands, ally equipment, allies across floors.
