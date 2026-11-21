# FS-04EEA: Class tree abilities

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Classes" (class tree abilities); `game-client/SPECIFICATION.md` "### Escape run" (class tree abilities) → this FS · Depends on: [FS-8RZ51](8RZ51-passive-skill-tree.md) (the tier-3 node that grants the ability, held on the seated delver and on the wire), [FS-Q18Q3](Q18Q3-ability-bar.md) (the key-3 square, its cooldown sweep, and the cooldown and cost fields on the wire) · Siblings (same scoping session, 2026-11-21): [FS-8RZ51](8RZ51-passive-skill-tree.md), [FS-Q18Q3](Q18Q3-ability-bar.md), [FS-E1ZDG](E1ZDG-specializations.md) (Settle the Debt meets the Sellsword's 5 parry charges) · Interacts with: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) §Requirements 9–11 (costs in the class resource), [FS-MAMHR](MAMHR-mercenary-class.md) §B.6–7, §D.19, §E.25 (the cut's cooldown slot, hybrid scaling, parry charges), [FS-77AB6](77AB6-monsters-and-combat.md) (attack table, damage formula, monster wind-up), [FS-JS7C8](JS7C8-class-run-attack-walk-pointer-facing.md) (the attack slow), [FS-JTNPR](JTNPR-shadow-shot.md) (the hold pattern Arrow Rain's aim follows), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) §Requirements 36 (the burning trail, the precedent for a lasting floor effect) · Related ADRs: [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming is client presentation; the server holds resolved casts), ADR-0020 and ADR-0021 (art is built in code), ADR-0013 (colours are `BARROW` tokens), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md), [ADR-0085](../adr/0085-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md), [ADR-0086](../adr/0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (the UI scene over every world; which piece lives where) · Vocabulary: pending via `domain-model` (*tree ability*, *stun*, *volley*); existing terms from [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Classes and abilities" (*ability*, *class resource*, *parry charge*, *resolved cast*, *attack slow*, *charge*)

## Summary

Each class gets one more active ability, its **tree ability**. The tier-3 node of the class's
passive tree grants it (FS-8RZ51), so a character who spends points as they earn them has it at
level 10. It is cast with **key 3**, beside the class's right-click ability, which stays as it is.
The warrior gets **Earthbreaker**, a ground slam that hurts and briefly stuns everything around
them. The mage gets **Blink**, a short teleport toward the cursor that cannot pass through walls.
The archer gets **Arrow Rain**, five volleys of arrows on a chosen spot over 1.5 s. The mercenary
gets **Settle the Debt**, a flurry all round them that spends every parry charge held and hits
harder for each one.

The server resolves each as one `cast_skill`, as it does every other cast (ADR-0030). The client
sends it on key 3 and draws it. The key-3 square on the ability bar, its cooldown sweep and the
cooldown and cost it shows belong to FS-Q18Q3.

**Lane:** every slice is **agent lane**, server and client alike (charter of 2026-11-21). No
`human` label.

## Requirements

### §A. Granting and casting (game-service)

1. **Four new skill ids.** `skillAliases` gains `earthbreaker`, `blink`, `arrow_rain` and
   `settle_the_debt`. Each maps to its own new attack kind and nothing else maps to it. *Charter
   default — reason: one id per ability, named for it.*
2. **Each class names its tree ability** in its class config, beside the ability FS-8AY7S
   §Requirements 12 names: `warrior` → Earthbreaker, `mage` → Blink, `archer` → Arrow Rain,
   `mercenary` → Settle the Debt.
3. **A tree ability resolves only for a caster who has it.** A cast of one of the four ids is
   refused unless both hold:
   - the caster's class names that tree ability (R2); and
   - the caster holds their class tree's tier-3 node, as FS-8RZ51 seats it on the delver.

   A refused cast does nothing at all, exactly as an unaffordable cast does (FS-8AY7S
   §Requirements 10): no effect, no cost, no cooldown, no message back. *Charter default — reason:
   the ability is earned in the tree.* This is the first class check on `cast_skill`; every other
   skill id stays open to every class, as today (FS-JTNPR Out of Scope).
4. **The common resolve path.** A tree ability goes through the same resolve path as every other
   cast: refused inside its cooldown or short of its cost (with no effect, no cost, no cooldown);
   otherwise it resolves on the tick it is taken, pays its cost once and starts its cooldown. A
   resolving tree ability, like every cast, stops a warrior's charge in flight, and starts its
   caster's attack slow (FS-JS7C8: every row a player casts).
5. **Costs are paid in the caster's class resource** (FS-8AY7S §Requirements 9–11):

   | Tree ability | Class | Cost | Cooldown |
   |---|---|---|---|
   | Earthbreaker | warrior | 40 stamina | 10 s |
   | Blink | mage | 30 mana | 8 s |
   | Arrow Rain | archer | 35 stamina | 12 s |
   | Settle the Debt | mercenary | every parry charge held, at least 1 | none of its own; the cut's 0.25 s slot (§F) |

   *Charter default — reason: starting values to tune.* Settle the Debt is the first cast that
   spends a variable amount (§F.30).
6. **Worn attack speed shortens every tree ability's cooldown,** as it shortens every cooldown
   today: `cooldown / (1 + worn attack speed % / 100)`, the attack speed already capped.
   *Charter default — reason: FS-MAMHR §B.6, every cooldown.*
7. **No aiming state on the server** (ADR-0030). The server holds no hold, preview or aim for any
   tree ability. Arrow Rain's circle and Blink's target are judged from the cast's target point on
   the tick it resolves, and nothing the client did before the cast changes the outcome.

### §B. Earthbreaker (game-service)

8. **The slam.** A resolving Earthbreaker hits every valid target whose centre lies within
   **90 px** of the warrior's position, all the way round (no arc). Each is resolved on its own
   through the damage formula, with its own crit roll, as a cone's targets are. The cast's target
   point is ignored.
9. **Its hit:** physical, coefficient **1.5**, scaling on **Strength** (worn Strength added), the
   same as the warrior's slash. *Integrator correction 2026-11-21 — reason: the warrior's slash
   scales on Strength. (Was: the cut's hybrid, the mean of Strength and Agility.)*
10. **Every target the slam hits is stunned** (§C): for **1.0 s**, or **0.5 s** on a boss
    (`Boss` set, which includes a top floor's champion). A target the hit kills is not stunned.
    A hit refused before the roll (a delver with player damage off, a dead target) stuns nothing.
    *Charter default — reason: the smallest useful stun.*
11. **A slam that hits nothing still resolves:** it pays its 40 stamina and starts its cooldown,
    as a cone that hits nothing does today.

### §C. The stun (game-service)

12. **A stun is server state on a monster.** No monster stun existed before this FS. The
    scoping notes suspected a `stunsafe` flag in the monster code; none exists in game-service
    or game-client (checked 2026-11-21), so there is nothing to reuse. The stun is new monster
    state, kept as data on the monster and run by the MonsterAISystem. Only Earthbreaker
    applies one. Delvers are never stunned.
13. **What a stunned monster does not do.** For as long as its stun runs, a monster:
    - does not move: no chase, wander or walk home, and its velocity is 0;
    - does not strike, claw or shoot;
    - does not start a wind-up, a slam or a monster ability.
14. **A stun cancels a wind-up in progress.** When a stun lands on a monster that is winding up a
    strike, a slam, a ranged shot or a monster ability that has not yet left the ground, the
    wind-up ends with nothing landing from it. The cooldowns that wind-up started (its attack
    interval, slam cooldown or ability cooldown) stay spent. A leap already in the air lands as it
    would, and a death burst's fuse burns on: neither is a wind-up the monster can still stop.
15. **What runs during a stun.** The monster's cooldowns and timers keep counting down. It keeps
    or takes up its target as it would unstunned, so once the stun ends it acts on whoever it is
    after. It may face its target once the stun ends, not during it.
16. **A second stun does not stack.** A stun landing on a stunned monster leaves it with the
    longer of its remaining stun and the new one.
17. **The wire.** A stunned monster's `action` in the state broadcast is **`stunned`** for every
    tick its stun runs, and goes back to whatever it is doing once the stun ends. A dead monster
    reports `dead`, stunned or not. This adds one value to the existing monster `action` field.
    No other field changes.

### §D. Blink (game-service)

18. **The move.** A resolving Blink moves the mage, on the tick it resolves, toward the cast's
    target point by up to **180 px**: the distance is the smaller of 180 px and the distance from
    the mage to the target point.
19. **Never through a wall.** Along the straight line from where the mage stands, the mage lands
    at the farthest point, within that distance, that the mage's body can reach **without
    crossing anything that blocks a walk**: a wall, a closed door, the world's edge, or (on a
    dungeon floor) a cell that is not walkable. The first blocker on the line ends the Blink, even
    if open ground lies beyond it. No wall or door, however thin, is skipped: the test is
    continuous along the line, not sampled at steps. *Charter default — reason: an escape tool
    that can't skip map geometry.*
20. **Bodies do not block a Blink.** It passes monsters and other delvers as the warrior's charge
    does. If the mage lands overlapping a body, the ordinary body collision separates them on the
    ticks after.
21. **A Blink that goes nowhere resolves to nothing.** If the target point is under the mage, or
    a blocker sits at the mage's edge on the line so the body cannot move at all, the Blink does
    nothing: no move, no cost, no cooldown, as a targeted strike with nothing in reach today.
22. **A Blink is not a dash.** It is not a charge, carries no `DashComponent`, is never carried by
    the MovementSystem over later ticks, and lays no Ashwalk Greaves trail.

### §E. Arrow Rain (game-service)

23. **The circle.** A resolving Arrow Rain marks a circle of radius **70 px** centred on the cast's
    target point if that point is within **300 px** of the archer, and otherwise on the point
    300 px from the archer along the line toward it. *Charter default — reason: the aim is a
    ground circle the client draws (ADR-0030); the server holds only the resolved circle.*
24. **Five volleys across 1.5 s.** The rain lands **5 volleys**, the first **0.3 s** after the tick
    it resolves and one every 0.3 s after it, the fifth at 1.5 s. Each volley hits every valid
    target whose centre lies within 70 px of the circle's centre at that moment, each once, each
    resolved on its own with its own crit roll. *Charter default ("5 volleys across 1.5 s") —
    timing is this FS's choice: arrows take a moment to fall, and the fifth lands at 1.5 s.*
25. **Each volley's hit:** physical, coefficient **0.5**, Agility scaling, can crit. The attack is
    captured when the rain resolves, as a projectile's is when it is fired. Every hit and kill
    credits the archer who cast it.
26. **The rain is a floor entity**, as the burning trail is (FS-4R9M9 §Requirements 36): it has
    no place of its own beyond its circle, and a floor change clears it. It keeps falling if its
    archer dies, escapes or leaves before the fifth volley, and still credits them, as a
    projectile in flight does (FS-JTNPR §Requirements 7).
27. **Walls do not stop it.** The circle is not checked for line of sight from the archer, and a
    volley hits every valid target inside it, either side of a wall. *Smaller v1; see Edge States.*
28. **A rain is not on the wire.** The state broadcast carries no rain. The archer's client draws
    it from the cast it sent (§G.45).

### §F. Settle the Debt (game-service)

29. **Its gate.** A Settle the Debt cast resolves only if the mercenary holds **at least 1 parry
    charge** and the cut's cooldown slot is free. Otherwise it is refused like an unaffordable
    cast: no effect, nothing spent, no cooldown.
30. **It spends every parry charge held.** A resolving Settle the Debt sets the mercenary's parry
    charges to 0, whether or not it hits anything. Call the number spent *n*. Parry charges
    change only by a parry (+1, capped), a riposte (−3) and now Settle the Debt (−n): FS-MAMHR
    §D.19 gains a third way.
31. **The flurry.** It hits every valid target whose centre lies within **90 px** of the
    mercenary, all the way round, each **once**, each resolved on its own with its own crit roll.
    Each hit is physical, coefficient **1.0 × n**, on the cut's hybrid scaling (FS-MAMHR §B.7). The
    cast's target point is ignored. *Charter default — reason: damage per charge spent.* One hit
    at 1.0 × n, not n hits at 1.0: the damage formula's mitigation is a ratio, so the totals
    match, and one hit keeps one crit roll and one number per target.
32. **Any count.** *n* is whatever the pool held, 1 up to the pool's max. The max is 3 today, and
    a Sellsword's is 5 (FS-E1ZDG). Nothing in this FS assumes 3.
33. **It shares the cut's cooldown slot.** Settle the Debt has no cooldown of its own. A resolving
    Settle the Debt starts the cut's 0.25 s slot (shortened by attack speed, R6), so a cut inside
    it is refused, and a Settle the Debt cast while that slot runs is refused. A riposte uses the
    same slot already (FS-MAMHR §E.25).
34. **Beside the parry and the riposte.** Settle the Debt leaves an open parry stance and a whiff
    lockout as they are. Cast while the riposte is armed (3 parry charges held), it spends those 3
    and the riposte is no longer armed.

### §G. Key 3 and the casts (game-client)

**Where each piece lives** (ADR-0086's rules). *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*

| Piece | Lives in | Rule |
|---|---|---|
| Key 3's binding and the `cast_skill` it sends | the world scene (run, field) | a world-play message stays the world's (ADR-0085 Decision 1); 1–3 are shared by state, the world's while the UI scene's menu is closed (ADR-0084 Decision 4) |
| The Arrow Rain aim circle | the world scene | a world effect, like the aim line (ADR-0086 2.2) |
| The jump rule (R41) | each world scene | draws a world body (ADR-0086 2.1) |
| Every tree-ability effect and the stun tell | the world scene | world effects, or drawn over a monster (ADR-0086 2.1, 2.2) |
| The key-3 square and its tooltip | the UI scene | FS-Q18Q3's; fixed to the screen (ADR-0086 1.1). This FS's names and lines (R50) reach it as typed data through the UiBridge, never a function |

No tree-ability code goes in `UIScene` or a `ui/uiScene*` module, and no new UiBridge request is
needed: the world reads the UI scene's reported state (`menuOpen`, `typing`, the gear overlay) to
guard key 3 and to cancel the Arrow Rain aim, as it does for key 1 and the Shadow Shot hold.

35. **Key 3 casts the tree ability.** The run's named actions (`runActions.ts`, FS-P9G8R R26) gain
    a tree-ability action bound to key **3**, read from that table everywhere it is bound or
    shown. It works wherever the class's right-click ability works: runs and fields, through the
    shared player combat. Each of those world scenes binds it as it binds key 1: a key event,
    never a `JustDown` poll (the UI scene polls 1–3 for its menu rows), and never bound in the UI
    scene. *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*
36. **When a press sends.** A press of key 3 sends exactly one `cast_skill` for the player's own
    tree ability when all of these hold, and otherwise sends nothing and plays nothing:
    - the player is in play (not resolved, not spectating);
    - the UI scene reports its menu closed, no chat typing and the gear overlay closed (the menu
      reads 1, 2 and 3 as choices while open, ADR-0084 Decision 4) *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*;
    - the character has the tree ability, as FS-8RZ51 tells the client;
    - it is off cooldown and affordable, as FS-Q18Q3's wire fields tell the client:
      `current_player.tree_ability_cooldown {remaining, total}` and `resource.tree_ability_cost`,
      already in `gameState.ts` (Settle the Debt's cost reads 1) *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*;
    - no Shadow Shot hold is in progress.

    A key held down sends once; the keyboard's auto-repeat sends nothing more.
37. **Earthbreaker, Blink and Settle the Debt cast on the press,** with the world point under the
    cursor as the target (`cast_skill {skill_id, target_x, target_y}`). The server ignores the
    point for Earthbreaker and Settle the Debt; Blink aims at it.
38. **Arrow Rain is aimed by holding key 3** (ADR-0030, as Shadow Shot is by holding right-click):
    - the press sends nothing and starts the aim;
    - while it is held, a ground circle of 70 world px is drawn at the cursor, moved in to 300 world
      px from the archer along the line when the cursor is further (the same rule as §E.23), in
      the iso projection, coloured from a `BARROW` token, seen by the archer only, drawn by the
      world scene as a world effect (ADR-0086 2.2) *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*;
    - the release sends one `cast_skill {skill_id: "arrow_rain"}` with the circle's centre as the
      target, if R36's conditions still hold at the release;
    - there is no minimum hold: a tap casts at the cursor;
    - the archer keeps walking while aiming, and left- and right-click are ignored while the aim
      is held;
    - the aim is cancelled with nothing sent by everything that cancels a Shadow Shot hold
      (FS-JTNPR §Requirements 15): the archer resolving, a floor change, the UI scene reporting
      its menu or the gear overlay opened, the scene tearing down, the window losing focus. A
      cancelled aim leaves no circle behind.
    *Smaller v1: the archer is not stopped, unlike Shadow Shot.*
39. **A right-press during an Arrow Rain aim, or key 3 during a Shadow Shot hold, does nothing.**
    One hold at a time.
40. **The target-frame hook.** A sent Earthbreaker, Arrow Rain or Settle the Debt counts as a cast
    that can strike (the combat port's `castSent`, FS-48CTQ §C.6). A Blink does not.
41. **A body that jumps is placed, not glided.** When any player's reported position moves more
    than **60 world px** between two consecutive states, the client places that player's drawn
    body at the new position at once, for every viewer, instead of gliding it there. The camera
    follows the own body as it follows any move. *Smaller v1: no new wire field marks a Blink; a
    walk or a dash never moves that far between two states.*

### §H. How they look (game-client)

42. **Effects play on the send,** with the class attack clip aimed at the target, as every
    ability's do today. They are the caster's own: no tree ability's effect is broadcast to
    teammates (as FS-MAMHR's attack effects are not), except what the state itself shows (a
    stunned monster, a mage's new position). Every effect here, the stun tell included, is drawn
    by the world scene, never the UI scene (ADR-0086 2.1, 2.2). *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*
43. **Earthbreaker:** a ground slam around the warrior, a shock ring out to 90 world px with
    cracks and dust, in the iso projection.
44. **Blink:** a blink-out where the mage's body stands at the send, and a blink-in where the
    body is placed when the jump arrives (R41). Both are the own mage's only.
45. **Arrow Rain:** on the release, 5 volleys of arrows falling into the circle, the first 0.3 s
    after the send and one every 0.3 s after it, each landing with an impact inside the circle,
    drawn with the baked `fx_arrow` body and existing fx textures. A floor change, the scene
    tearing down or the archer resolving ends the drawn rain.
46. **Settle the Debt:** a flurry of slashes all round the mercenary to 90 world px, heavier the
    more parry charges were spent (*n* read from the latest state at the send: 1, 3 and 5 must
    each read distinctly).
47. **The stun tell.** A monster whose `action` is `stunned` plays its idle clip (no new baked
    pose) and carries a stun tell over its head, drawn in code, for every viewer. The tell goes
    when the action changes. A monster action the client does not know is drawn as it is today.
48. **Built in code, from the effects table.** Every new effect is an entry in the effects table
    (`render/effects/table.ts`), coloured with `BARROW` tokens and inside the table's existing
    bounds (`table.test.ts`), built from existing fx textures. The Arrow Rain circle (R38) is a
    held drawing, like the Shadow Shot aim line, and may live outside the table but takes its
    colour from a token. No new baked texture, pose or sound.
49. **The contact-sheet gate.** The effects ship only once Kranti approves a contact sheet of them
    in the dev effects gallery: the Earthbreaker slam, the stun tell on a monster, the Blink out
    and in, Arrow Rain with its circle mid-rain, and Settle the Debt at 1, 3 and 5 parry charges.
    *Charter default — reason: art is built in code, through the contact-sheet gate.*
50. **Names and how-it-works lines.** The client's ability data gives each tree ability a name
    and one line in the lore voice, for FS-Q18Q3's tooltip on the key-3 square (the meaning is
    fixed; final wording follows `game-client/CONTEXT.md` and the design guideline's voice). They
    live in `ui/abilityCopy.ts` beside the right-click abilities' copy; the world hands the view
    built from them to the UI scene's HUD slot as typed data (ADR-0086 Decision 3). *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.*:

    | Tree ability | Line |
    |---|---|
    | Earthbreaker | Slam the ground: strike and stun all around you. |
    | Blink | Step through the dark toward where you point, never past a wall. |
    | Arrow Rain | Hold to mark the ground, release to rain arrows on it. |
    | Settle the Debt | Spend every parry charge on a flurry around you; each one cuts deeper. |

## User Stories

1. As a level-10 character, I want the tier-3 node of my tree to give me a new ability, so that
   the middle of the tree is a real step in power and play.
2. As a player, I want my new ability on key 3, so that it sits beside my right-click without
   replacing it.
3. As a player who has not taken the tier-3 node, I want key 3 to do nothing, so that I never
   cast something I do not have.
4. As a warrior, I want to slam the ground and hurt everything around me, so that I can answer
   being surrounded.
5. As a warrior, I want the slam to stun what it hits, so that I get a breath to reposition or
   finish a target.
6. As a warrior, I want the slam to cancel a monster's wind-up, so that a well-timed slam stops
   the blow coming at me.
7. As a warrior facing a boss, I want the slam to stun it only briefly, so that the fight keeps
   its danger without making me useless.
8. As a mage, I want to blink toward my cursor, so that I have a way out of a fight like the
   warrior's dash.
9. As a mage, I want a blink at a wall to stop short of it, so that I always land somewhere I
   could stand.
10. As a mage, I want a blink that cannot move me to cost me nothing, so that I keep my mana when
    I misclick against a wall.
11. As a mage, I want to blink through a crowd of monsters, so that being body-blocked is not a
    death sentence.
12. As an archer, I want to hold key 3 and see the circle where arrows will fall, so that I can
    place the rain before I commit.
13. As an archer, I want the circle to stop at the edge of my reach, so that I see exactly where
    the rain lands when I aim too far.
14. As an archer, I want to keep moving while I aim the rain, so that kiting still works.
15. As an archer, I want the rain to fall in five volleys over a moment, so that monsters walking
    into it still get hit.
16. As an archer, I want each volley to be able to crit, so that my crit gear pays off here too.
17. As an archer, I want a rain I cast to keep falling if I die, so that my last move still
    counts.
18. As a mercenary, I want to spend my parry charges on a flurry around me, so that charges have
    a second use besides the riposte.
19. As a mercenary, I want the flurry to hit harder for every charge I spend, so that saving up
    is rewarded.
20. As a mercenary, I want to cast it with a single charge, so that I can cash out early when I
    need to.
21. As a Sellsword holding 5 charges, I want the biggest flurry, so that the choice to cash out
    my stacks is worth it.
22. As a mercenary, I want the flurry to share my cut's rhythm, so that it fits the class's
    tempo and is not a free extra hit.
23. As a player with attack speed on my gear, I want it to shorten my tree ability's cooldown,
    so that my gear works the same way on every cooldown.
24. As a player, I want key 3 to do nothing while a menu or panel takes number keys, so that
    picking a menu choice never casts.
25. As a player holding key 3 down, I want one cast, so that the key's repeat does not spam the
    server or my effects.
26. As a teammate, I want to see monsters reeling when they are stunned, so that I know when it
    is safe to step in.
27. As a teammate, I want a blinking mage to jump, not glide through a wall, so that what I see
    matches where they are.
28. As a player, I want each ability to look like what it does, so that I learn it at a glance.
29. As a player hovering the key-3 square, I want the ability's name and how it works, so that I
    know what I am about to cast.
30. As a monster's target, I want a stunned monster to stand still and not hit me, so that the
    stun is real.
31. As the game-service maintainer, I want every tree ability through the same resolve path, so
    that cooldown, cost, credit and the attack slow need no special case.
32. As the game-service maintainer, I want no aiming state on the server, so that the server
    stays small (ADR-0030).
33. As the game-service maintainer, I want a cast of a tree ability the caster does not have to
    be refused silently, so that a modified client gets nothing from it.
34. As a designer, I want each tree ability's numbers in one attack row, so that tuning is one
    edit.
35. As Kranti, I want to approve the effects on a contact sheet before they ship, so that they
    meet the fidelity bar.

## Acceptance Criteria

### game-service

- [ ] `SkillAttackKind` maps `earthbreaker`, `blink`, `arrow_rain` and `settle_the_debt` each to its
      own new kind.
- [ ] Each class config names its tree ability (R2).
- [ ] A tree-ability cast by a caster of another class, or by a caster without the tier-3 node, does
      nothing: no effect, no cost, no cooldown.
- [ ] Each tree ability is refused inside its cooldown or short of its cost, with nothing spent and
      no cooldown started.
- [ ] Each resolving tree ability starts its caster's attack slow and stops a charge in flight.
- [ ] With 50% worn attack speed, Earthbreaker's cooldown is 10 / 1.5 s, Blink's 8 / 1.5 s, Arrow
      Rain's 12 / 1.5 s, and Settle the Debt's cut slot 0.25 / 1.5 s.
- [ ] Earthbreaker spends 40 stamina, starts a 10 s cooldown, and hits every valid target within
      90 px all round, physical, coefficient 1.5, on Strength.
- [ ] Earthbreaker hitting nothing still spends 40 stamina and starts its cooldown.
- [ ] A monster the slam hits and does not kill is stunned for 1.0 s; a boss (a champion included)
      for 0.5 s.
- [ ] A stunned monster does not move, strike, claw, shoot, or start a wind-up, slam or ability, and
      its velocity is 0.
- [ ] A stun landing mid wind-up (strike, slam, shot or monster ability) ends it with nothing
      landing; the cooldowns it started stay spent.
- [ ] A leap in the air and a death burst's fuse are not stopped by a stun.
- [ ] A monster's cooldowns count down during a stun, and it keeps its target.
- [ ] A second stun leaves the longer of the two remaining.
- [ ] A stunned monster's `action` is `stunned` on the wire for the stun's length; a dead one reads
      `dead`.
- [ ] Blink spends 30 mana and starts an 8 s cooldown; the mage moves min(180, distance to the
      target) px toward the target on the resolving tick.
- [ ] A Blink at a wall, a closed door, the world's edge or a non-walkable cell lands the mage at the
      last point before it; nothing beyond the first blocker is reached, and a wall thinner than
      a tick's step is never crossed.
- [ ] A Blink passes through monsters and delvers.
- [ ] A Blink with the target under the mage, or blocked at once, moves nothing, spends nothing and
      starts no cooldown.
- [ ] A Blink adds no `DashComponent` and lays no Ashwalk trail.
- [ ] Arrow Rain spends 35 stamina, starts a 12 s cooldown, and centres a 70 px circle on the target,
      or 300 px along the line when the target is further.
- [ ] Its 5 volleys land at 0.3, 0.6, 0.9, 1.2 and 1.5 s, each hitting every valid target inside the
      circle once: physical, coefficient 0.5, Agility, each with its own crit roll.
- [ ] A rain keeps falling and credits its archer after they die; a floor change clears it.
- [ ] Settle the Debt with 0 parry charges, or inside the cut's slot, does nothing.
- [ ] Settle the Debt with n parry charges (n = 1, 3 and 5 tested, the last on a pool of max 5)
      sets them to 0 and hits every valid target within 90 px all round once, physical,
      coefficient 1.0 × n, on the cut's hybrid scaling.
- [ ] Settle the Debt hitting nothing still spends every parry charge.
- [ ] After Settle the Debt, a cut inside the cut's slot is refused; Settle the Debt has no slot of
      its own.
- [ ] Settle the Debt cast at 3 charges disarms the riposte; an open parry stance and a lockout are
      left as they were.
- [ ] No component, field or message tracks a tree ability's aim.
- [ ] `go test ./...` and `golangci-lint run` pass in `game-service`.

### game-client

- [ ] Key 3 is bound from `runActions.ts`, in the run and field world scenes, guarded by the UI
      scene's reported menu, typing and gear-overlay state; the UI scene binds no tree-ability key
      and sends no `cast_skill` (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene)
      landed upstream).
- [ ] A press sends one `cast_skill` with the class's tree-ability id and the cursor's world point,
      only when every R36 condition holds; otherwise nothing is sent or played.
- [ ] Holding key 3 sends one cast; auto-repeat sends nothing.
- [ ] Key 3 while a menu that takes number keys is open picks the menu's choice and casts nothing.
- [ ] An archer's key-3 press sends nothing and draws a 70 px circle at the cursor, moved in to 300 px
      from the archer when further; the release sends `arrow_rain` with the circle's centre.
- [ ] An Arrow Rain aim is cancelled, with nothing sent and no circle left, by each of FS-JTNPR R15's
      cancels; the archer keeps walking while aiming.
- [ ] Clicks during an Arrow Rain aim, and key 3 during a Shadow Shot hold, send nothing.
- [ ] A player's body whose position moves over 60 world px between two states is placed there at
      once, not glided.
- [ ] Each tree ability's effect plays on its send, with the attack clip aimed at the target; Blink's
      blink-in plays where the body is placed.
- [ ] Arrow Rain draws 5 volleys at 0.3 s intervals from the send.
- [ ] Settle the Debt's flurry reads distinctly at 1, 3 and 5 parry charges.
- [ ] A monster with `action: "stunned"` plays its idle clip with the stun tell, for every viewer; the
      tell goes when the action changes.
- [ ] New effect entries pass `table.test.ts` and the token fence; no raw colour, no new baked
      texture.
- [ ] Each tree ability has its name and line in the client's ability data.
- [ ] Kranti approved the contact sheet (R49).
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Edge States

- **Tier-3 node not held.** The server refuses every tree-ability cast (R3) and the client sends
  nothing (R36). A modified client sending one gets nothing.
- **Wrong class's id.** A warrior sending `blink` is refused like a cast it cannot afford, with no
  error back. Other skill ids stay open to every class, as today.
- **Old client.** A client from before this FS never sends the new ids. An old client seeing
  `stunned` draws the monster as it draws an unknown action today.
- **Client ships before the server.** A new id the server does not know yet is answered as an
  unknown skill (`ErrUnknownSkill`), and the effect has already played. Ship the server slices
  first or together.
- **Cooldown jitter.** A press the client judged ready can land inside the server's cooldown; the
  server refuses it and the effect has played. This is the same optimistic send every ability
  makes (FS-JTNPR Edge States, "Cooldown").
- **Earthbreaker's scaling.** The charter's "cut/slash hybrid scaling" meant the warrior's own
  melee scaling: Strength alone, as the slash (R9, integrator correction 2026-11-21 — reason: the
  warrior's slash scales on Strength).
- **Stun on a monster mid-leap.** The leap lands where it was going and its area hits; the stun
  then holds the monster where it landed for whatever is left.
- **Stun on a death burst.** A Blightborn's corpse is dead; its fuse burns on.
- **Stun and the claw's show.** A demon showing its claw reports `stunned` instead for the stun.
  The claw has already landed.
- **Stun and leash.** A stunned monster beyond its leash stays put; it walks home, or keeps
  chasing, once the stun ends.
- **Stun across a floor change.** The monster stays on the old floor; nothing carries over.
- **Blink at the target under the mage.** Nothing happens, nothing is spent (R21). The client
  played the blink-out; no blink-in follows. Accepted, as a refused cast's effect is.
- **Blink pressed into a corner.** It moves along nothing; the line, not a slide along the wall,
  is the rule. It stops at the first blocker.
- **Blink onto stairs or an escape zone.** The mage stands there as if they had walked there;
  whatever that position triggers, it triggers on the ticks after.
- **Blink through an open door.** An open door does not block. A door that closes on the mage's
  landing is the existing depenetration's to resolve.
- **Blink in a field.** Fields have no cell grid; walls, closed doors and the world's edge block,
  as walking does there.
- **Arrow Rain through a wall.** The rain hits inside the circle either side of a wall (R27). An
  archer can rain on monsters behind a wall; they take it up as an attacker as for any hit.
  Accepted as a smaller v1.
- **Arrow Rain on a monster that walks in or out.** Each volley tests the circle at that moment.
- **Two archers' rains overlapping.** Each lands its own volleys; a monster in both is hit by both.
- **Archer dies mid-rain.** The rain keeps falling and credits them (R26). The archer's client
  stops drawing it when they resolve, so the last volleys may be unseen by them.
- **Floor change mid-rain.** The rain is cleared with the floor, and the client stops drawing it.
- **Settle the Debt at 0 charges.** Refused, nothing spent (R29); the client sends nothing.
- **Settle the Debt at 5 charges (Sellsword).** Coefficient 5.0. The Sellsword's per-charge cut
  bonuses (FS-E1ZDG) drop with the charges.
- **Settle the Debt and a parry on the same tick.** A monster strike parried on the tick the
  flurry resolves adds its parry charge to *n* only if that strike resolved first, which is the
  CombatSystem's entity order for intents. Accepted: the stance itself still opens before any
  strike (FS-MAMHR §C.12); only the count spent can differ by one.
- **Settle the Debt vs the riposte at 3 charges.** Both are coefficient 3.0 at 90 px; the flurry is
  all round and the riposte a 240° arc toward the cursor. Accepted at these starting values.
- **Cast in the hub.** Combat is refused in the hub, as every cast is today; the client has no
  key-3 cast there.
- **Window blur with key 3 held.** An Arrow Rain aim is cancelled; for the others the press was
  already sent.
- **Disconnect.** Nothing is queued; a rain already resolved falls on the server.

## Out of Scope

- The key-3 square, its cooldown sweep, its cost, greying, locked state and tooltip, and the
  cooldown and cost fields on the wire: FS-Q18Q3. This FS supplies the abilities, the casts, the
  effects and the name and line the tooltip shows.
- The passive tree, its tier-3 node, how it is allocated, persisted and sent: FS-8RZ51.
- The Sellsword's 5 parry charges and per-charge bonuses: FS-E1ZDG.
- Stuns from anything but Earthbreaker; stun immunity; diminishing returns on repeated stuns.
- Stunning or otherwise crowd-controlling delvers.
- Line of sight for Arrow Rain or Earthbreaker.
- Broadcasting tree-ability effects to teammates (beyond what the state shows), and an Arrow Rain
  on the wire.
- A wire field marking a Blink; a server-side Blink preview.
- New sounds for the tree abilities; new baked textures or poses.
- Rebinding key 3.
- A second tree ability per class, or a respec that removes one.
