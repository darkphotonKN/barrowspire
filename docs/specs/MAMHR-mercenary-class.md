# FS-MAMHR: Mercenary class

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Classes" → "Mercenary class"; `game-client/SPECIFICATION.md` "### Character" → "Mercenary class" → this FS · Character-service (no SPECIFICATION.md of its own) carries its class allowlist change under this FS · Depends on: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (the generic class resource, the parry-charge resource kind, the resource fields on `current_player`, the bottom-left bars with the merc's 3 pips, the bottom-right ability card) · Siblings (same scoping session, 2026-10-30): [FS-JTNPR](JTNPR-shadow-shot.md) · Interacts with: [FS-77AB6](77AB6-monsters-and-combat.md) (attack table, damage formula, monster wind-up), [FS-BDA7X](BDA7X-character-leveling.md) (class growth row, `create-character`), [FS-2325V](2325V-pre-rendered-isometric-art.md) (character art pipeline), [FS-F6F88](F6F88-multi-floor-delves.md) (delvers persist across floors), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (worn attributes, Gravewarden's Oath) · Related ADRs: [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (the parry window is its server-authoritative exception), ADR-0020 and ADR-0021 (character art is built in code, never sourced)

> **Amendment, 2026-10-31 (playtest tuning).** The parry now reads on the merc himself. His
> sheet carries a fifth clip, **`parry`**: he raises the arming sword into a guard, blade up and
> across before him, feet set, a slight lean back. It reaches the guard in about 125 ms, inside
> the 0.25 s window, and holds its last frame. His own client plays it from the right-click for
> exactly as long as the stance tell shows (the click's grace, then `parry_open`), so §G.35's
> signals are unchanged. The **stance tell** loses its drawn crosswise blade: the baked sword now
> does that job, and the steel glint stays. The parry flash is unchanged. While moving (§C.13
> still holds: no root), the guard **overrides the walk for the whole body** and slides with him
> for its quarter second. A baked sprite is one image per frame, so it cannot split the legs from
> the arms. A cut thrown inside the stance plays its swing over the guard, and raising the guard
> cuts a running swing short: the newest action shows. Teammates still see none of it (§G.38):
> the guard is driven from `current_player` only, never `other_players`. Nothing else in this FS
> changes; read §G.35 and §H with this note.

## Summary

A fourth class, the **Mercenary** (server id `mercenary`): dextrous but still strong, a sword
fighter who takes the barrow's blows on the blade and gives them back. Left-click is a narrow,
heavy sword **cut** scaling on Strength and Agility together. Right-click raises a short
**parry stance**: a monster strike that lands inside it is negated and grants one **parry
charge**. At three parry charges the next left-click becomes the **riposte**, a wide, long cleave
toward the cursor that hits everything in its arc and spends all three. The parry window, the
whiff lockout and the parry charges are server state (ADR-0030's exception); the client draws the
stance, the parry flash, the armed tell and the riposte slice.

## Requirements

Values marked **(charter default)** were set by the user-approved charter of 2026-10-30, with the
reason given. They are starting values, expected to move in play. Values marked **(derived)**
follow from existing code or another requirement, not from a new decision.

### §A. The class (game-service, character-service, api-gateway)

1. The server class id is `mercenary`, alongside `warrior`, `mage` and `archer`. The display name
   "Mercenary" belongs to game-client.
2. game-service's class table gains `mercenary` (**charter default**; reason: it sits between the
   warrior and the archer):
   - Stats: Strength 7, Agility 7, Intelligence 2, Vitality 7.
   - Health 130 / 130.
   - Combat: Attack 12, Defense 7, AttackSpeed 1.2, AttackRange 1 (AttackRange **derived**: melee,
     as the warrior).
   - Growth per level past the first: Strength +1, Agility +2, MaxHealth +10. No other growth
     (no Vitality, Intelligence, or pool growth: parry charges are fixed at 3).
   - Class resource: **parry charges**, the FS-8AY7S resource kind with max 3 and no regen,
     starting at 0 when the delver is seated in a run. The merc has no mana and no stamina.
   - Starting skill: the cut (§B).
3. A `mercenary` character in play is seated as a mercenary. It must never fall through to the
   unknown-class fallback (seated as a mage). **Ordering (derived):** character-service may not
   accept `mercenary` before game-service knows the class.
4. character-service's closed class set gains `mercenary`. `class_id` is `VARCHAR(32)`: **no
   migration** (charter default).
5. The api-gateway's class field doc strings (`CharacterCreate.Class`, `Character.Class` in
   `api-gateway/internal/gateway/character/wire.go`) name the four classes. `openapi.yaml` and
   the generated client follow by `make openapi && make client`, committed with the wire change.
   **Generated files are never hand-edited** (charter default).

### §B. The cut: left-click and hybrid scaling (game-service)

6. The merc's left-click is the **cut**, cast as `cast_skill` with skill id `cut`. It is a cone
   (charter default; reason: the average keeps coefficients comparable with single-stat attacks):
   - 70° arc (half-angle 35°) centred on the aim point.
   - 55 px reach.
   - Physical, coefficient 1.8.
   - Scaling on **(STR + AGI) / 2**.
   - Cooldown 0.25 s, shortened by worn attack speed like every cooldown (**derived**: every
     left-click today is 0.25 s). No resource cost (left-click is free, FS-8AY7S).
   - It hits every valid target in the cone, each resolved on its own, as the slash does.
7. **Hybrid scaling.** The damage formula's scaling input becomes able to name two stats whose
   mean scales the hit. For the cut and the riposte the scaling value is
   `((STR + worn STR) + (AGI + worn AGI)) / 2`, kept as a real number, never truncated, so an odd
   sum still counts its half. Every existing single-stat attack resolves exactly as before
   (same numbers, same tests).
8. At level 1, unequipped, with no crit and no mitigation, a cut lands
   `12 × 1.8 × (1 + 7/20) = 29.16` raw, above the warrior slash's 25.2: narrower but heavier.
9. The id `cut` is new. It is not an alias of `slash` (`strike` already is). A non-mercenary
   casting `cut` is resolved like any other skill they send today; class gating of skill ids is
   not added here.

### §C. The parry stance: right-click (game-service, ADR-0030's exception)

10. The merc's ability is the **parry stance**, cast as `cast_skill` with skill id `parry`. The
    target point is ignored: the stance is not directional. It costs nothing and has no cooldown
    row; the whiff lockout (§C.15) is what limits it.
11. The stance **opens on the tick its cast arrives** (ADR-0030) and stays open for **0.25 s**
    (charter default; reason: short, and no extra movement logic). It covers every monster strike
    resolved on its opening tick and on each tick until 0.25 s have elapsed.
12. **Same-tick ordering.** A parry cast and a monster strike on the merc resolved in the same
    tick: the stance opens first, so the strike is inside it. Entity order never decides a parry.
13. **No root** (charter default; reason: no extra movement logic). The merc moves freely while the
    stance is up. The stance is also unaffected by the merc's other casts: a cut or riposte thrown
    while it is open does not close it (**derived** from the same reason: no extra logic).
14. **A parry.** A monster strike that resolves on the merc while the stance is open:
    - is **negated**: no damage, no crit roll, and so nothing for Gravewarden's Oath to reflect;
    - grants **1 parry charge**, capped at 3;
    - leaves the stance open for the rest of its window. Several strikes inside one window are
      each negated and each grant a parry charge, up to the cap.
    - Every monster strike can be parried, **elites and the boss included** (charter default;
      reason: until the boss has mechanics of its own).
    - Only a strike that lands counts. A strike that whiffs on reach as its wind-up ends never
      reaches the merc and is not a parry.
15. **The whiff lockout.** A stance that closes having negated nothing starts a **1.0 s whiff
    lockout** (charter default), counted from the moment the window closes. A `parry` cast during
    the lockout is refused and does nothing. A stance that negated at least one strike starts no
    lockout: the merc may raise it again as soon as it closes.
16. A `parry` cast while the stance is already open is refused: it neither extends nor restarts the
    window.
17. The stance protects only the merc who raised it. A strike on a teammate standing beside them
    is unaffected.
18. Parry charges, the stance and the lockout exist only for a mercenary. Another class sending
    `parry` gets nothing.

### §D. Parry charges (game-service)

19. Parry charges are the merc's FS-8AY7S class resource (kind: parry charges, max 3, no regen).
    They change only by a parry (+1, capped) and a riposte (−3). Nothing regenerates or decays
    them.
20. **Kept until spent.** They persist across floors (the delver entity survives a floor change,
    FS-F6F88) and out of combat.
21. **Lost on death.** A merc who dies has their parry charges set to 0 and their stance and
    lockout cleared, on the tick of death.
22. Each run starts the merc at 0 parry charges.

### §E. The riposte (game-service)

23. When the merc's cut resolves while they hold **3 parry charges**, it resolves as the
    **riposte** instead (charter default; reason: it was the next attack):
    - a cone of **240°** (half-angle 120°) centred on the aim point (toward the cursor);
    - **90 px** reach;
    - physical, coefficient **3.0**, same hybrid scaling as the cut;
    - hits every valid target in the arc (a cleave);
    - **spends all 3 parry charges**, whether or not it hits anything.
24. The riposte is armed on the server only. There is no `riposte` skill id: the client cannot ask
    for one, it asks for a cut and the server decides. A cut refused by its cooldown is not a
    riposte and spends nothing.
25. The riposte shares the cut's cooldown slot (0.25 s).
26. At level 1, unequipped, no crit, no mitigation, a riposte lands
    `12 × 3.0 × 1.35 = 48.6` raw per target: clearly bigger than a slash (25.2) or a cut (29.16).

### §F. The wire (game-service → game-client)

27. The parry charge count reaches the client through FS-8AY7S's class resource fields on
    `current_player` (current, max 3). This FS adds no second copy of it.
28. `current_player` gains, **for a mercenary only** (absent for other classes, absent from
    `other_players`):
    - `parry_open`: whether the stance is open this tick;
    - `parry_lockout`: seconds left on the whiff lockout, 0 when none;
    - `parries`: how many strikes this merc has parried in this run, monotonic. The client flashes
      a parry whenever it rises, including at the cap, where the charge count does not move.
29. Teammates receive none of the above, matching FS-8AY7S (others get health only).

### §G. The client (game-client)

30. **Class select.** Character creation offers the Mercenary as a fourth class (charter default):
    - name `MERCENARY`, English title `THE MERCENARY`, title `OATHLESS BLADE`;
    - blurb in the grim voice (game-client `CLAUDE.md` "Wording & Tone"): *"Sworn to no banner,
      bound by no oath but the coin. He turns the barrow's blows aside on a notched blade, and
      when the dead have spent their strength, answers every one of them at once."*;
    - primary stat `Strength 7 / Agility 7`, weapon `Notched Arming Sword`, playstyle
      `Parry, Riposte, Close Steel`;
    - stats card: HP 130, ATK 12, DEF 7, range 1, speed 200; the resource entry reads as parry
      charges (3), in whatever form FS-8AY7S gives class resources on the lore card;
    - random names: Corvane, Hask, Ulric, Brannoch, Vesh, Mordaunt.
    - Four class cards fit the creation layout without overlap at the scene's supported sizes.
31. `ClassKey` gains `mercenary`. Every client class list that today names the three classes knows
    the fourth: the hub's known-class list, the placeholder texture set, `characterSheet()`.
    Until the baked Mercenary sheet is approved (§H), the merc draws on a placeholder: its own
    placeholder texture in `characterTextures.ts` and the knight sheet in `characterSheet()`.
32. **Left-click.** A merc's left-click sends `cut` toward the cursor and plays the **cut effect**
    at once (client prediction, as the slash does): a narrow sword arc matching §B.6's 70° and
    55 px.
33. **Riposte.** When the latest state shows 3 parry charges, the left-click still sends `cut`,
    but the client plays the **riposte slice** instead: a clean, wide slice across §E.23's 240°
    and 90 px toward the cursor, with the class attack clip. Reading as clearly bigger than a cut
    is the bar.
34. **Riposte-armed tell.** While the state shows 3 parry charges, the merc's own figure carries a
    visible tell (for example a glint along the blade) so the player knows the next left-click is
    the riposte. It clears when the count drops.
35. **Right-click.** A merc's right-click sends `parry`, unless the latest state shows the stance
    open or a lockout running, in which case it sends nothing (the server would refuse it). The
    **stance tell** shows from the click for as long as the server reports `parry_open`.
36. **Parry flash.** Whenever `parries` rises, the merc's figure plays a short, bright parry flash
    (steel on steel). A first state after connecting or reconnecting sets the baseline and
    flashes nothing.
37. **HUD.** The merc's parry charges show as FS-8AY7S's 3 pips, labelled "Parry:". The merc's
    ability card (FS-8AY7S) names the ability **Parry**, shows the right-mouse glyph, and
    describes it in the grim voice: raise the blade as a blow lands to turn it aside and earn a
    parry charge; three make the next cut a riposte. The card greys out while `parry_lockout` is
    above 0.
38. Teammates see the merc as they see any delver: position, facing and body clips. They see no
    parry flash, stance tell, armed tell or riposte slice (no class's attack effects are broadcast
    today).

### §H. Baked Mercenary art (game-client bake pipeline)

39. A new **Mercenary** model is built in code in the bake pipeline
    (`game-client/tools/bake/page/characters/`), on the shared delver rig, registered in the cast
    as its own sheet. Never sourced (ADR-0020, ADR-0021; fidelity bar: Ultima Online).
40. The look reads at a glance as neither knight nor archer: a sellsword in mismatched, worn
    half-armour and leather, one-handed arming sword, no shield, no helm crest. Colours are
    `BARROW` tokens and blends only. 8 directions; idle, walk, attack and death clips (design
    guideline).
41. **Gate (charter default):** the user approves a contact sheet of the Mercenary (8 directions ×
    each clip, at game scale) **before** `characterSheet()` and the menus switch the merc to it.
    Until then the merc stays on its placeholder (§G.31). The rest of the class never waits on
    this.
42. Once approved, the merc draws from its baked sheet everywhere a class draws from one: the run,
    the hub, the roster, character creation and the loadout.

## User Stories

1. As a player, I want to pick a Mercenary at character creation, so that I can play a fighter who
   is neither the knight nor the archer.
2. As a player, I want the Mercenary's card to carry a name, a title and a grim blurb like the other
   classes, so that it feels like it belongs in the barrow.
3. As a player, I want to see the Mercenary's stats on the creation screen, so that I know what I am
   choosing.
4. As a mercenary, I want my left-click to be a narrow, heavy cut, so that I hit hard where I aim
   instead of sweeping like the knight.
5. As a mercenary, I want both my Strength and my Agility to make the cut stronger, so that the class
   rewards the dextrous-but-strong build it claims.
6. As a mercenary, I want right-click to raise a short parry, so that timing a monster's wind-up is
   my skill.
7. As a mercenary, I want a blow that lands inside my parry to deal me nothing, so that a good read
   is rewarded at once.
8. As a mercenary, I want each parried blow to grant a parry charge, so that defending builds toward
   my attack.
9. As a mercenary, I want to parry several blows in one window and earn a parry charge for each, so
   that reading a pack pays more.
10. As a mercenary, I want a parry that catches nothing to lock me out for a moment, so that mashing
    right-click is not a strategy.
11. As a mercenary, I want a parry that lands to leave me free to raise it again at once, so that a
    good rhythm is never punished.
12. As a mercenary, I want to keep moving while my parry is up, so that I am not rooted under a
    pack.
13. As a mercenary, I want elite and boss blows to be parriable, so that the skill carries into the
    fights that matter.
14. As a mercenary, I want my next left-click at three parry charges to become a riposte, so that I
    can spend them where I choose.
15. As a mercenary, I want the riposte to cleave a wide arc toward my cursor and reach further than a
    cut, so that it answers a whole pack.
16. As a mercenary, I want the riposte to hit far harder than a cut, so that it feels earned.
17. As a mercenary, I want to bank a riposte across a floor change and out of combat, so that I can
    save it for the next pack.
18. As a mercenary, I want to know when my riposte is armed, so that I never waste it by accident.
19. As a mercenary, I want to see a flash when I parry, even at three parry charges, so that I know
    the blow was turned.
20. As a mercenary, I want to see my parry charges as three pips, so that I can read my progress
    toward a riposte at a glance.
21. As a mercenary, I want my parry's card to grey out while I am locked out, so that a refused parry
    is never a surprise.
22. As a mercenary, I want my parry charges to be lost when I die, so that death costs what it
    should.
23. As a teammate, I want a merc's parry to protect only the merc, so that I still have to look after
    myself.
24. As a teammate, I want to recognise a merc by their look, so that I can read our party at a glance.
25. As the owner, I want the Mercenary's art built in code on the shared rig and approved on a
    contact sheet before it ships, so that it meets the fidelity bar.
26. As the owner, I want the class to play while the art is still in review, so that the art never
    holds up the mechanics.
27. As a developer, I want the parry window decided on the server, so that the outcome is judged
    where monster strikes are resolved (ADR-0030).
28. As a developer, I want the riposte armed on the server with no skill id of its own, so that a
    modified client cannot throw one without the parry charges.
29. As a developer, I want hybrid scaling to leave every single-stat attack's numbers unchanged, so
    that adding a class does not rebalance the others.
30. As a developer, I want the gateway's class description and the generated client to come from the
    wire type, so that the contract never drifts from the code.

## Acceptance Criteria

**Class and creation**

- [ ] `POST /api/characters` with `class: "mercenary"` creates a character (201); an unknown class
      is still `400 · VALIDATION_FAILED`.
- [ ] A mercenary character in play is seated in a run as a mercenary with STR 7, AGI 7, INT 2,
      VIT 7, HP 130/130, Attack 12, Defense 7, AttackSpeed 1.2, 0 parry charges, no mana or stamina.
- [ ] A level-up adds STR +1, AGI +2, MaxHealth +10 and nothing else.
- [ ] `wire.go`'s class doc strings name the four classes; `openapi.yaml` and
      `game-client/src/api/generated/` are regenerated, not hand-edited, and committed together.
- [ ] No migration is added to character-service.
- [ ] Character creation shows four class cards, the Mercenary with name, title, blurb, stats and
      random names as §G.30, without overlap.
- [ ] The hub, the run, the roster and the loadout draw a merc as a merc (placeholder until §H is
      approved), never as a fallback class.

**The cut and hybrid scaling**

- [ ] A cut hits every valid target within 55 px inside a 70° arc around the aim, and none outside.
- [ ] A level-1 unequipped cut, no crit, no mitigation, deals 29 (29.16 rounded).
- [ ] Worn Strength and worn Agility each raise a cut's damage, through `(STR + AGI) / 2` with the
      half kept.
- [ ] Every existing attack's damage tests pass unchanged.

**The parry stance**

- [ ] A monster strike resolved on the merc in the stance's opening tick, or within 0.25 s of it,
      deals no damage and grants 1 parry charge.
- [ ] A strike resolved after 0.25 s deals damage normally.
- [ ] A parry cast and a strike resolved on the same tick: the strike is parried, whatever the
      entity order.
- [ ] Two strikes in one window: both negated, +2 parry charges. At 3 parry charges a parried strike
      is negated and the count stays 3.
- [ ] Elite and boss strikes are parried like any other.
- [ ] A parried strike on a Gravewarden's Oath wearer reflects nothing.
- [ ] A window that negated nothing starts a 1.0 s lockout from its close; a `parry` cast inside it
      changes nothing. A window that negated a strike starts none.
- [ ] A `parry` cast while the stance is open changes nothing.
- [ ] The merc moves at full speed while the stance is open.
- [ ] A strike on a teammate beside an open stance damages the teammate.
- [ ] A non-mercenary casting `parry` gets nothing.

**Parry charges and the riposte**

- [ ] With 3 parry charges, the merc's next resolved cut is a riposte: every valid target within
      90 px inside 240° around the aim is hit at coefficient 3.0, and the count goes to 0.
- [ ] A riposte that hits nothing still spends all 3 parry charges.
- [ ] A cut refused by its cooldown spends no parry charges.
- [ ] Parry charges survive a floor change and are 0 after the merc dies.
- [ ] A client cannot obtain a riposte by any skill id.

**Wire**

- [ ] `current_player` of a merc carries `parry_open`, `parry_lockout` and `parries`; other classes'
      and `other_players` entries carry none of them.
- [ ] `parries` rises by one for every parried strike, including at the cap.

**Client presentation**

- [ ] Left-click plays the cut effect, or the riposte slice when the latest state shows 3 parry
      charges; both send `cut`.
- [ ] The riposte-armed tell shows while the count is 3 and clears when it drops.
- [ ] Right-click sends `parry` and shows the stance tell while `parry_open`; it sends nothing while
      the stance is open or a lockout runs.
- [ ] A rise in `parries` plays the parry flash; the first state after (re)connecting does not.
- [ ] The HUD shows the merc's parry charges as 3 pips labelled "Parry:", and the ability card names
      **Parry** with its description, greyed while `parry_lockout` > 0 (on FS-8AY7S's HUD).

**Art (gated)**

- [ ] A Mercenary model is built in code in `tools/bake/page/characters/`, baked to its own sheet,
      8 directions × idle, walk, attack, death.
- [ ] **The user has approved the Mercenary's contact sheet** before `characterSheet()` or any menu
      maps `mercenary` to it.
- [ ] After approval, every place a class draws from a baked sheet draws the merc from its own.

## Edge States

- **Several strikes in one window:** each negated, each +1 parry charge, capped at 3.
- **At 3 parry charges, another parry:** the strike is negated, no 4th parry charge, `parries`
  still rises (the flash plays).
- **Riposte armed, next cut hits nothing:** all 3 parry charges are spent anyway.
- **Riposte armed, cut refused by cooldown:** nothing is spent; the next resolved cut is the
  riposte.
- **Stance open when a cut or riposte resolves:** the stance stays open; both resolve.
- **Strike whiffs on reach:** not a parry; if it was the only strike, the window closes empty and
  the lockout starts.
- **`parry` during the lockout, or while the stance is open:** refused, nothing changes.
- **Merc dies with the stance open, a lockout running, or parry charges banked:** all cleared on
  the tick of death.
- **Merc escapes or is otherwise out of play:** casts are dropped as for every delver; nothing
  further changes parry state.
- **Floor change mid-window:** parry charges kept; the window and any lockout run out on their own
  clocks (the entity persists).
- **Disconnect and reconnect within grace:** parry state is the entity's and is unchanged; the
  client takes the first state as its baseline and flashes nothing.
- **Two mercs in one party:** each has their own stance, lockout and parry charges.
- **Projectile strikes:** monsters are melee today. If a ranged monster arrives, whether its
  projectiles are parriable is that feature's decision.
- **Hub:** the hub has no combat; the merc's casts there are treated as any class's casts are today.
  No pips, card or tells show there (FS-8AY7S).
- **Art not yet approved:** the merc plays on the placeholder; nothing else waits.

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `create-character` **(changed: accepted value)** | POST `/api/characters` | — | `CharacterCreate` unchanged in shape; `class` now accepts `mercenary` (doc string names the four classes) | 201 `Character` unchanged; `class` may be `mercenary` | unchanged from FS-BDA7X: an unknown class is still `400 · VALIDATION_FAILED` (character-service's rule) |
| `list-my-characters`, `get-character` | GET `/api/characters`, GET `/api/characters/{characterId}` | unchanged | — | `Character.class` may be `mercenary` (doc string only) | unchanged |

The game WebSocket changes (`cast_skill` ids `cut` and `parry`; `current_player` fields in §F) are
specified in Requirements.

## Out of Scope

- The class resource itself, its HUD bars and pips, the ability card and the trimming of resource
  fields to `current_player`: FS-8AY7S.
- Monster stagger, knockback or any other effect of a parry on the striker.
- Parrying projectiles (no ranged monsters exist).
- Directional parries (the stance protects from every side).
- Class gating of skill ids for other classes.
- Broadcasting attack effects, stance or riposte to teammates.
- A dedicated riposte body clip in the bake: the riposte uses the attack clip plus its slice effect.
- The next two non-classic classes (parking lot of the scoping session).
- Balance passes beyond these starting values.

## Rationale (folded from scoping)

- **Hybrid STR+AGI scaling** over AGI-only (undersells "still strong") or reusing the knight's slash
  (no identity).
- **A short parry window** over passive charge gain from hits (no timing skill) or right-click
  firing the riposte directly (the user wants it on the next attack). Monsters already telegraph
  with a wind-up, which makes a short window fair.
- **Whiff lockout** over losing a stored parry charge (feels bad at 2/3) or a flat cooldown (least
  skill). It stops mashing without giving the merc stamina.
- **A 240° front arc** over a full 360° spin (less aim).
- **Parry charges kept until spent** over decaying out of combat, so a riposte can be banked.
- **Not "the second AoE":** the wizard's `triple_fireball` is a 3-projectile spread, and the knight's
  basic slash is already a 120° cone. The riposte stands apart by width, reach, damage, and being
  earned.
