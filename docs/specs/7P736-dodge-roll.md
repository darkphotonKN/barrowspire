# FS-7P736: Dodge roll

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (dodge roll); `game-client/SPECIFICATION.md` "### Escape run" (dodge roll) → this FS · Charter: the 2026-11-25 dungeon-crawler pace charter, item C (charter child C: roll, economy, wolf) · Siblings (same charter): item A, one slower movement baseline through `PACE_SCALE` (session A's pace branch); item B, smaller, varied rooms · Interacts with: [FS-Q18Q3](Q18Q3-ability-bar.md) (cooldowns on the wire as `{remaining, total}`), [FS-JS7C8](JS7C8-class-run-attack-walk-pointer-facing.md) (pointer facing, the attack slow and pin), [FS-04EEA](04EEA-class-tree-abilities.md) (the dash and Blink, the other moves that carry a body), [FS-5FZ4J](5FZ4J-sealed-floors.md) (traps, plates, pits), [FS-X2CMM](X2CMM-class-books.md) (cast times a move cancels), [FS-MQYEX](MQYEX-timed-container-open.md) (timed opens a move cancels), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (the roll costs no class resource) · Related ADRs: [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (the server holds what resolves), ADR-0020 and ADR-0021 (art is built in code), ADR-0013 (colours are tokens), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md)–[ADR-0086](../adr/0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (the HUD is a UI-scene piece) · Vocabulary: *roll*, *rolling*, *roll cooldown* (game-service and game-client `CONTEXT.md`)

> Promoted `--from-thread` on 2026-11-25 from the charter's locked decisions (R1–R5, owner-approved
> through the charter) by charter child C. **(owner)** marks the charter's locked words;
> **(charter default)** what the charter left open and this promotion settled as the smaller v1,
> with its reason.

## Summary

Every delver can roll: press Space and the delver tumbles 2.5 squares in the direction they are
moving (or facing), untouchable for the 0.4 s it takes, then waits 3 s to roll again. It is free.
It is the one quick move in a run made slow on purpose: it dodges a blow you saw coming, and it
does not carry you through rooms faster. The server decides it, as it does movement; the client
predicts it so the press feels instant.

## Requirements

### §A. The roll (game-service)

1. **A `roll` action** from a delver in play in an escape run starts a roll, unless one of R6's
   refusals holds. **(owner: Space, free)** It costs nothing: no class resource, no item.
   *(charter default: escape runs only, not the hub or a field: they have no fights to dodge.)*
2. **Payload `{dir_x, dir_y}`**: the direction the client chose (R13). The server normalises it.
   A zero, non-finite or missing vector refuses the roll (R6). *(charter default — reason: the
   server holds no facing for a delver (pointer facing is the client's, FS-JS7C8), so the client
   names the direction and the server judges everything else.)*
3. **Fixed distance and time (owner):** a roll covers **2.5 cells (200 px at 80 px cells) in
   0.4 s**, a straight line at a constant 500 px/s. Neither the pace scale (charter item A), worn
   move speed, an attack slow, an attack pin, a passive nor any other speed modifier stretches or
   shortens it. The two numbers are named tunables (`RollDistance`, `RollDuration`).
4. **Swept against walls (owner):** the roll moves the body through the movement system's swept
   collision each tick, as the warrior's dash does. A wall, a shut door, a shut barrier (gate,
   secret door, pit), a stone block or the world's edge stops it where it touches: the roll ends
   there, early. *(charter default: other bodies, delvers and monsters, do not stop it; it passes
   through them as the dash does — reason: a roll that a monster's body stops is no dodge.)*
5. **Invulnerable for the whole roll (owner):** from the tick it starts to the tick it ends, no
   hit lands on the rolling delver: no monster strike, shot, area or cone, no trap's hit, no
   burning ground. A hit refused this way does nothing (no damage, no stun, no kicker, no reflect);
   it is not a miss that something else can catch. A lasting status already on the delver (poison)
   keeps ticking. *(charter default — reason: the owner's "invulnerable for the whole roll" is
   about blows; a poison taken before the roll is not a blow.)*
6. **Refused, silently** (nothing happens, nothing is spent, no reply, as an unaffordable cast
   today): not in play; not in an escape run; inside the roll cooldown; already rolling; inside a
   warrior's dash or any other charge in flight; a bad direction (R2).
7. **Roll cooldown (owner: 3 s)** starts on the tick the roll starts. It is a named tunable
   (`RollCooldown`) and is not shortened by attack speed or any cooldown modifier. It carries
   across floors as other cooldowns do.
8. **While rolling** the delver resolves no attack, ability, page cast or interact: those
   requests are dropped as they arrive (not queued). Walking input is ignored for the roll's
   length; the velocity the client holds applies again on the tick after it ends. *(charter default
   — reason: one move at a time keeps the dodge readable and the prediction simple.)*
9. **The ground reacts as to a walk (owner):** a roll that carries a body onto a trap springs it,
   and onto a plate weighs it, exactly as walking there would (FS-5FZ4J). R5 still spares the
   roller a sprung trap's hit; what a trap does besides its hit (a tripwire waking an ambush, a gas
   vent's poison) happens as usual. *(charter default — reason: R4 and R5 both hold; the
   invulnerability covers blows, not consequences.)*
10. **It cancels what moving cancels (owner):** a book page's cast time (FS-X2CMM), a timed open
    (FS-MQYEX), and anything else a move from the spot cancels, the same way and for the same
    reason: the body left its spot.
11. **Floor change mid-roll:** the roll ends with the floor (as the dash does); its cooldown keeps
    running.
12. **On the wire** (fields added only):
    - `current_player.roll_cooldown: {remaining, total}` in float seconds, the same shape as
      FS-Q18Q3's `ability_cooldown`, present only while it runs.
    - `roll: {dir_x, dir_y}` on `current_player` and on each `other_players` entry while that
      delver is rolling, absent otherwise, so every viewer can draw it.

### §B. The client (game-client)

13. **Space rolls (owner).** The run binds the `roll` action to Space in `RUN_ACTIONS`, labelled
    "Space". The direction sent is the held movement keys' direction (the same vector the client
    sends in `move`), else the delver's facing (FS-JS7C8's pointer facing). Space does nothing in
    the hub, a field, while dead or spectating, while a text input (chat) has focus, or while the
    roll cooldown on the wire runs.
14. **Predicted (owner: as movement is):** on a press that the client judges allowed (no
    `roll_cooldown`, not rolling), the client starts the roll on its own body at once with the same
    numbers (R3) and the same wall sweep it predicts walking with, and reconciles with the server's
    position as it does for walking. A refused roll snaps back as any mispredicted move does.
    The numbers are the client's copy of R3 (distance, time): they are geometry the prediction
    must know before the server answers. The cooldown is never the client's: it reads
    `roll_cooldown`.
15. **A roll animation per class (owner), built in code:** each class's delver has a roll clip in
    its own look (the warrior a heavy shoulder roll, the mage a robe-tumbling roll, the archer a
    light tuck, the mercenary a low sword-held roll), baked from its rig in `tools/bake` like every
    clip. **Art never blocks (owner):** until a class's clip is baked, the client draws the roll in
    code from the walk sheet (a squash, a quick tumble of the sprite and a dust scuff where it
    starts), so the feature ships with or without the bake. Other delvers' rolls are drawn from
    `other_players[].roll`.
16. **A roll cooldown pip on the HUD (owner):** a small pip beside the ability bar, labelled
    from `RUN_ACTIONS.roll.label`. Ready, it is lit; while `roll_cooldown` runs, a sweep covers it,
    run down between states as FS-Q18Q3 R18–R20's sweep is. It lives in the UI scene (ADR-0084)
    and is fed through the typed bridge's run HUD message. Colours from `palette` / `BARROW`
    tokens.
17. **The controls panel** lists the roll with its key, as it lists the other run actions.

## User Stories

1. As a delver, I want to roll out of a blow I see coming, so that a slow, deliberate fight still
   rewards reading the monster.
2. As a delver, I want the roll to be free, so that it never competes with my class resource.
3. As a delver, I want a 3 s wait between rolls, so that rolling is a choice, not a way to travel.
4. As a delver, I want the roll to go where I am pressing, or where I face when I stand still, so
   that it goes where I meant.
5. As a delver, I want the roll to be the same length whatever I wear, so that I can learn it.
6. As a delver, I want to be untouchable for the whole roll, so that a well-timed roll always
   saves me.
7. As a delver, I want walls to stop my roll, so that I never roll through stone or out of the map.
8. As a delver, I want to roll through a monster, so that I can get out of a corner.
9. As a delver, I want a trap I roll onto to spring, so that rolling is never a way past the
   floor's rules.
10. As a delver, I want a roll onto a plate to hold it, as walking would.
11. As a delver casting a page, I want a roll to cancel it as walking would, so that I can abort
    a cast to dodge.
12. As a delver opening a chest, I want a roll to cancel the open, as walking away would.
13. As a delver, I want the roll to start the instant I press Space, so that it feels responsive.
14. As a delver, I want to see my roll's cooldown on the HUD, so that I know when I can roll again.
15. As a delver, I want each class to roll in its own way, so that the cast keeps its character.
16. As a teammate, I want to see another delver roll, so that I understand where they went.
17. As a delver typing in chat, I want Space to type a space, not roll.
18. As a spectator, I want Space to do nothing, so that I do not send actions for a dead delver.
19. As a server, I want to decide every roll, so that a modified client cannot roll farther,
    oftener or through walls.
20. As a designer, I want the distance, time and cooldown as named tunables, so that I can retune
    them without touching the rules.
21. As the pace charter's owner, I want the roll unaffected by the pace scale, so that slowing
    the walk never slows the dodge.

## Acceptance Criteria

### game-service
- [ ] A `roll {dir_x, dir_y}` from a delver in play in a run moves them 200 px along the
      normalised direction over 0.4 s (12 ticks at 30 Hz), the same with and without worn move
      speed, an attack slow or pin, and any pace scale.
- [ ] A roll toward a wall stops at the wall and ends early; one toward a shut door, a pit or a
      stone block the same; the body never passes into them. It passes through a monster's body.
- [ ] No hit lands on a rolling delver: a monster strike, a monster projectile and a monster area
      ability each leave health unchanged and apply nothing; the same hit lands the tick after the
      roll ends.
- [ ] A roll onto a trap springs it (a tripwire wakes its ambush) and the trap's hit does not
      hurt the roller; a roll onto a plate weighs it.
- [ ] A roll cancels a running page cast and a timed open.
- [ ] Refused with nothing changed: not in play; in the hub or a field; inside the 3 s cooldown;
      already rolling; during a dash; a zero or non-finite direction.
- [ ] Attacks, casts and interacts sent during a roll are dropped; walking input resumes after.
- [ ] `current_player.roll_cooldown {remaining, total}` is present with total 3 while it runs and
      absent once ready; `roll {dir_x, dir_y}` is on the roller's `current_player` and on every
      other recipient's `other_players` entry while rolling, absent otherwise.
- [ ] A floor change mid-roll ends it; the cooldown carries.

### game-client
- [ ] Space in a run sends `roll` with the held direction, else the facing; nothing in the hub, a
      field, dead, spectating, with chat focused, or while `roll_cooldown` runs.
- [ ] A press starts the predicted roll on the local body at once, 200 px over 0.4 s, stopped by
      walls as walking prediction is; a server refusal snaps back.
- [ ] A rolling delver (self or other) is drawn rolling: the class's baked roll clip when the
      manifest has it, else the in-code tumble; nothing breaks with no roll clip baked.
- [ ] The HUD shows a roll pip labelled "Space", swept while `roll_cooldown` runs, lit when ready.
- [ ] The controls panel lists the roll and its key.

## Edge States

- **Press at the very end of the cooldown:** the client still sees `roll_cooldown` and does not
  send; the next press after the state clears it rolls. A press the server refuses (a clock
  edge) snaps back.
- **Standing still, no facing yet:** the facing defaults as the delver's sprite does (it always
  has one); the direction is never zero from a well-behaved client.
- **Roll into a corner:** the sweep runs X then Y as walking does; touching either axis ends the
  roll.
- **Roll started touching a wall:** it may end on its first tick; the cooldown still runs (it
  started).
- **Roll onto the stairs, the escape door or a fixture:** nothing happens beyond what walking
  there does (interacts stay explicit).
- **Afloat (Levitate) or Hardened:** the roll works as for anyone; the states keep running.
- **Rolling over a pit's edge:** a shut pit is rock to the sweep (R4); the roll stops at it.
- **Disconnect mid-roll:** the server finishes the roll as it finishes a dash; the body stands
  where it ended.
- **Two delvers rolling through each other:** bodies do not stop rolls; both carry on.
- **Death mid-roll:** impossible from a hit (R5); a poison tick that kills ends the roll with the
  delver.

## Out of Scope

- Rolling in the hub or a field.
- A roll that costs stamina or anything else, a roll that grows with level or gear, i-frames that
  vary by class.
- Rebinding Space (the `RUN_ACTIONS` table makes it a later one-line change).
- Monsters dodging, or monsters reacting to a roll.
- A roll sound beyond any the sound system already plays for movement.
- Mobile or gamepad input.

## Reconciled at build (I-7P736-2)

Date: 2026-11-26. R14 assumed the run client predicts walking with a wall sweep. It does not: the
run scene eases the drawn body toward the server's position each frame, and bodies move as the
snapshot says (`data/pace.ts`). So the roll brings the client's **first** sweep
(`src/render/world/rollPrediction.ts`). It runs from the server position at 500 px/s against the
floor grid's rock, the world's edge and shut doors, with the server's 20 px half-body. It holds its
end while the server reports `roll`, then hands back to the ease, which is what "reconciled as
walking is" means here. A roll the server never confirms (no `roll`, no `roll_cooldown`) lets go
300 ms after its end and the body eases back. Gates, secret doors, pits and stone blocks are not in
the client sweep: a roll into one draws past it until the ease pulls the body back. Also, Space is
held back while an archer draws Shadow Shot, and after the run's end.

## Reconciled at build (I-7P736-1)

Date: 2026-11-26. R4 lists a pit among the barriers that stop a roll, and the Edge States say a
roll "works as for anyone" when afloat. The two meet at an afloat (Levitate) roller, and the build
settles it: **an afloat roll passes shut pits, as its walk does** (FS-X2CMM §J R51). Walls, shut
doors, gates, secret doors, stone blocks and the world's edge still stop it. The reason: the roll
is swept against the same blockers the body's walk is, so a pit that is open ground to an afloat
walk is open ground to its roll. Holding a pit as rock to the roll alone would push a delver who
starts a roll while over a pit out of it, and would make the roll the one move that cannot cross
the chasm. The Edge State "Rolling over a pit's edge" holds for a grounded roller. Pinned by
`TestRoll_AfloatPassesShutPits` (game-service `internal/systems/roll_test.go`).
