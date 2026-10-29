# FS-JTNPR: Shadow Shot

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Classes" → "Archer's Shadow Shot" (supersedes "Archer's triple-arrow volley"); `game-client/SPECIFICATION.md` "### Escape run" → "Shadow Shot aimed by holding" → this FS · Depends on: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (stamina, the class resource it is priced in; the ability card that names it) · Siblings (same scoping session, 2026-10-30): [FS-MAMHR](MAMHR-mercenary-class.md) · Interacts with: [FS-77AB6](77AB6-monsters-and-combat.md) (attack table, projectiles; this FS replaces its `triple_arrow` row), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) §Requirements 35 (projectile pierce from the Lantern of the Drowned), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) (the effects table, projectile flights, the arrow) · Related ADRs: [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming is client presentation; resolved casts are server state), ADR-0013 (colours are `BARROW` tokens) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Classes and abilities" (*ability*, *Shadow Shot*, *resolved cast*, *stamina*), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*ability card*)

> **Amendment, 2026-10-30 (playtest tuning).** The cost is raised from 40 to **90 stamina**,
> a flat number. At 40 an archer with 100 stamina and 20/s regen could fire almost without a
> break, the 1.2 s cooldown being the only limit. At 90 one shot leaves about 10 of 100, and
> the next waits about 4 s for regen, so the pool, not the cooldown, paces the shot. Every
> cost figure below reads 90, except the interim-pricing passages (R5's last two sentences, the
> Interim-pricing edge state), which are history from before stamina landed and keep the 40.
> Nothing else in this FS changes. The client prices the shot from `ability_cost` on the wire.

## Summary

The archer's right-click is today a triple-arrow volley: three quick arrows in a spread. Shadow
Shot replaces it with one deliberate shot. The player holds right-click to aim: the archer
stops, stands still and turns to follow the mouse while an aim line shows where the shot will
fly. Releasing looses a single slow, heavy bolt trailing shadow. It hits far harder than an
arrow but travels slowly enough that a moving target can step out of its path, so landing it
takes skill.

All of the aiming is the client's. The server never learns that a hold began: it receives one
`cast_skill` with skill id `shadow_shot` and the target point on release, and resolves one
projectile against cooldown and cost exactly as it resolves any other aimed skill (ADR-0030).

**Lane:** every slice of this FS is **agent lane**, server and client alike. The user directed
agents to build both in this run.

## Requirements

### The shot (game-service)

1. **One attack row replaces the volley.** The CombatSystem's attack table gains a Shadow Shot
   row and loses the triple-arrow row. The row (charter default; reason: "slow and heavy"):

   | Field | Value |
   |---|---|
   | Delivery | one projectile (no spread) |
   | Damage type | physical |
   | Scaling stat | Agility |
   | Coefficient | 3.2 |
   | Cost | 90 of the archer's class resource (stamina; amended from 40) |
   | Cooldown | 1.2 s |
   | Projectile speed | 260 px/s |
   | Projectile range | 650 px |
   | Projectile radius | 10 px |
   | Projectile kind on the wire | `shadow_shot` |

   For comparison, the left-click arrow is 480 px/s, 550 px, radius 8, coefficient 1.4; the
   volley it replaces was three arrows at coefficient 1.2 each, 10 mana, 0.4 s.
2. **The skill id is `shadow_shot`** (charter default, with R3; reason: nothing else sends the
   old ids). `skillAliases` maps `shadow_shot` to the
   new row and nothing else maps to it.
3. **The volley is gone, not remapped** (charter default; reason: nothing else sends them). The
   `triple_arrow` and `multishot_arrow` aliases are removed from `skillAliases`, and the
   `AttackTripleArrow` attack kind is deleted with its row. A `cast_skill` naming either old id is
   then an unknown skill, refused like any other unknown id (`ErrUnknownSkill`); nothing special
   answers it.
4. **No new server state** (ADR-0030). The cast is resolved on the tick it is taken, through the
   existing resolve path: inside its cooldown, or short of the resource, it does nothing at all
   (no projectile, no cost paid, no cooldown started). The server holds no aiming state, start
   tick, hold time or facing for Shadow Shot, and how long the client held cannot change the
   outcome.
5. **The cost is paid in the archer's class resource** (90 stamina, amended from the charter default of 40; stamina
   itself comes from FS-8AY7S). The target is 90 **stamina**, which FS-8AY7S introduces (a generic resource component replacing the mana component). If this row
   lands before FS-8AY7S's resource does, it is priced at 40 in whatever pool the attack table
   charges at that moment (today `manaCost`, against the archer's 100 mana), and FS-8AY7S's
   migration carries the 40 across to stamina with the other abilities' costs.
6. **Pierce applies** (charter default, with the R1 numbers; reason: slow and heavy, a shot
   worth carrying the unique on). A Shadow Shot fired by an archer wearing the Lantern of
   the Drowned carries the Lantern's extra pierce target (FS-4R9M9 §Requirements 35), as every
   projectile the wearer fires does today: it flies on through its first target and can hit one
   more distinct target.
7. **Ownership and credit are unchanged.** A Shadow Shot hit, kill or monster death credits the
   archer who fired it through the same attack snapshot an arrow uses, including when the archer
   has died while the bolt is in flight.

### Holding to aim (game-client)

8. **Right-press starts aiming** for an archer in play (not resolved, not spectating, no ESC
   menu or equipment panel open, the press not taken by the open satchel: today's right-click
   guards). Nothing is sent to the server when a hold starts.
9. **The archer stands still while aiming** (charter default; reason: the archer stands still).
   If they were striding when the hold began, the client sends one stop (`move {vx: 0, vy: 0}`),
   as it does when the ESC menu interrupts a stride. While aiming, movement keys send nothing.
   When the aim ends (fired or cancelled) and movement keys are still down, the stride resumes on
   the next frame from the keys as they stand; nothing has to be re-pressed.
10. **The archer pivots to the mouse.** While aiming, the local archer's sprite shows its idle
    clip turned to the 8-way facing of the cursor, following it every frame. No new baked pose
    (charter default; reason: a smaller v1). The facing is drawn locally only: teammates do not
    see the archer turn (ADR-0030 consequence).
11. **An aim line shows the shot.** While aiming, a thin line is drawn from the archer's bow
    (the arrow's release point and height, `BOW_LIFT`) toward the cursor, for the shot's full
    range (650 world px) so the player sees where it will stop. It is drawn in the iso
    projection like every other world effect, coloured from a `BARROW` token (ADR-0013), and is
    seen only by the aiming player. It is drawn **faint** until a release would fire (R13), and
    at full strength once it would.
12. **Holding only aims** (charter default; reason: ADR-0030, and it makes each shot deliberate).
    How long the button is held past the minimum changes nothing: no damage ramp, no faster bolt.
13. **A release fires only when it is ready.** A release fires when all of these hold, and
    otherwise cancels with nothing sent:
    - the button was held at least **0.3 s** (charter default; the client checks this; a modded
      client skipping it is accepted, ADR-0030);
    - at least 1.2 s have passed since the client last sent a Shadow Shot (the client's mirror
      of the server cooldown, the way the client gates today's abilities);
    - the archer can afford it, once the client can see the archer's stamina (FS-8AY7S; R18).
14. **Release sends one resolved cast.** A release that fires sends exactly one
    `cast_skill {skill_id: "shadow_shot", target_x, target_y}`, the target being the world point
    under the cursor at release. The release effect and the archer's attack clip, aimed at that
    point, play on that send, as every ability's do today.
15. **Cancelling sends nothing.** These end a hold with no shot and nothing sent: a release that
    is not ready (R13); the delver dying or otherwise resolving; the party climbing to a new
    floor; the ESC menu or the equipment panel opening; the run ending or the scene tearing down
    (including a disconnect); the right button released outside the game canvas; the browser
    window losing focus. A cancelled hold leaves no aim line behind and starts no cooldown.
16. **Left-click is ignored while aiming.** Outside a hold the left-click arrow is unchanged.
17. **Other classes are unchanged.** The warrior's dash and the mage's triple fireball keep their
    right-click exactly as today.

### Cost and the ability card (game-client, on FS-8AY7S)

18. **An unaffordable release sends nothing.** Once FS-8AY7S puts the archer's stamina on the
    wire, a release while the archer's current stamina is below Shadow Shot's cost sends nothing,
    plays nothing, and the aim line stays faint while it is short. Affordability is judged at
    release, not at the press, so stamina that regenerates during the hold counts. The client
    reads the same affordability FS-8AY7S's ability card greys from, so the two never disagree.
    Until stamina is on the wire, the client sends and the server's refusal (R4) stands.
19. **The archer's ability card names Shadow Shot.** FS-8AY7S's ability card shows, for the
    archer, the name **Shadow Shot** and a one-line description of how it works, in the lore
    voice: *Hold to aim, release to loose one slow, heavy bolt.* (final wording follows
    `game-client/CONTEXT.md` and the design guideline's voice; the meaning, hold to aim and
    release to fire one slow heavy shot, is fixed).

### How it looks (game-client)

20. **A shadow-trailed bolt in flight.** A projectile of kind `shadow_shot` is drawn with the
    baked `fx_arrow` body, turned to its heading and flown at the arrow's height (`BOW_LIFT`),
    trailing a dark, smoky shadow stream instead of the arrow's pale air-streak. Effects only:
    no new baked texture or pose (charter default; reason: a smaller v1). Projectile flights
    are global, so teammates see the bolt like the archer does.
21. **Its own release and impact.** The release at the bow and the impact where the bolt lands
    are Shadow Shot's own effect entries, darker and heavier than the arrow's, built from the
    existing fx textures.
22. **New effects are table entries.** The trail, release and impact are entries in the effects
    table (`render/effects/table.ts`), coloured with `BARROW` tokens and inside the table's
    existing bounds (`table.test.ts`). The aim line (R11) is a held drawing that follows the
    cursor, not a one-shot or stream; it may live outside the table but takes its colour from a
    token too.
23. **Unknown projectile kinds stay as they are drawn today.** Only `shadow_shot` gains a flight;
    the `arrow` and `fireball` flights are unchanged.

## User Stories

1. As an archer, I want to hold right-click to aim, so that I can line up one heavy shot.
2. As an archer, I want my character to stop while I aim, so that aiming feels like drawing a
   bow and not running and gunning.
3. As an archer, I want my character to turn to follow my mouse while I aim, so that I can see
   which way I am about to shoot.
4. As an archer, I want an aim line showing where the shot will fly and how far, so that I can
   judge whether it will reach.
5. As an archer, I want the aim line to tell me when a release will actually fire, so that a
   cancelled shot is never a surprise.
6. As an archer, I want a release to fire one slow, heavy bolt, so that a well-placed shot is
   rewarded with big damage.
7. As an archer, I want a quick tap of right-click to do nothing, so that I never waste stamina
   on a shot I did not mean.
8. As an archer, I want letting go too early to cost me nothing, so that I can abort a shot by
   releasing quickly.
9. As an archer, I want my movement keys to be ignored while I aim, so that a stray key does not
   break my aim.
10. As an archer, I want to start moving again the moment I release, with keys I am still
    holding, so that I can fire and reposition in one motion.
11. As an archer, I want my left-click arrow to be unaffected outside a hold, so that my basic
    attack still feels the same.
12. As an archer, I want the shot to be refused without cost when I cannot afford it, so that I
    keep what stamina I have.
13. As an archer, I want my ability card to say Shadow Shot and how it works, so that I know
    what my right-click does before I try it.
14. As an archer, I want the ability card and the aim line to agree on whether I can afford the
    shot, so that the HUD never lies.
15. As an archer wearing the Lantern of the Drowned, I want my Shadow Shot to pierce like my
    arrows do, so that the unique keeps its value on my ability.
16. As an archer, I want a hold to be dropped cleanly if I die, the floor changes, or I open the
    menu, so that I never fire a stray shot from a stale aim.
17. As an archer, I want alt-tabbing or dragging my mouse off the game mid-hold to cancel, so
    that I never fire at a point I cannot see.
18. As a teammate, I want to see the archer's shadow bolt fly, so that I know where the heavy
    hits are landing.
19. As a teammate, I want my own screen free of other archers' aim lines, so that the field stays
    readable.
20. As a monster's target, I want a slow bolt I can see coming, so that dodging it is a matter of
    movement.
21. As a warrior or mage, I want my right-click unchanged, so that the archer's rework does not
    touch my class.
22. As the game-service maintainer, I want the hold to stay entirely on the client, so that the
    server state does not grow for a presentation concern (ADR-0030).
23. As the game-service maintainer, I want the old volley ids gone rather than remapped, so that
    the alias table only names skills that exist.
24. As the game-service maintainer, I want Shadow Shot to go through the same resolve path as
    every aimed skill, so that cooldown, cost and credit need no special case.
25. As a designer, I want Shadow Shot's numbers in one attack row, so that tuning it is one edit.

## Acceptance Criteria

### game-service

- [ ] `attackTable` holds a Shadow Shot row with the values of R1, and no triple-arrow row.
- [ ] `SkillAttackKind("shadow_shot")` returns the Shadow Shot kind;
      `SkillAttackKind("triple_arrow")` and `SkillAttackKind("multishot_arrow")` return false.
- [ ] `AttackTripleArrow` no longer exists; no test or code references it.
- [ ] A Shadow Shot cast with the resource and off cooldown creates exactly one projectile of
      kind `shadow_shot` with speed 260, range 650 and radius 10, flying toward the target.
- [ ] The cast spends 90 of the archer's class resource (or of the interim pool, per R5) and
      starts a 1.2 s cooldown.
- [ ] A second cast inside 1.2 s, or a cast with under 90 of the resource, creates no projectile,
      spends nothing and starts no cooldown.
- [ ] Its hit deals physical damage scaled by Agility at coefficient 3.2.
- [ ] Fired by a Lantern wearer, the bolt passes through its first target and hits a second
      distinct one; without the Lantern it stops at the first.
- [ ] A `cast_skill` with `triple_arrow` is answered as an unknown skill.
- [ ] Monster death and kill credit for a Shadow Shot hit reach the archer who fired it.
- [ ] No component, field or message was added to track a hold.
- [ ] `go test ./...` and `golangci-lint run` pass in `game-service`.

### game-client

- [ ] An archer's right-press sends nothing and starts aiming; a warrior's or mage's right-press
      behaves exactly as before.
- [ ] While aiming, movement keys send no `move`; a stride in progress when the hold began gets
      exactly one `move {vx: 0, vy: 0}`.
- [ ] After a release or cancel with a movement key still down, the stride resumes without a
      re-press.
- [ ] While aiming, the archer's sprite shows its idle clip facing the cursor's 8-way direction,
      updating as the cursor moves.
- [ ] While aiming, an aim line runs from the bow toward the cursor for 650 world px, faint
      until a release would fire and full once it would.
- [ ] A release after at least 0.3 s, off the client cooldown and (once stamina is on the wire)
      affordable, sends exactly one `cast_skill {skill_id: "shadow_shot"}` with the cursor's
      world point, and plays the release effect and attack clip.
- [ ] A release under 0.3 s, inside 1.2 s of the last sent shot, or (once stamina is on the
      wire) unaffordable, sends nothing and plays nothing.
- [ ] Death, a floor change, the ESC menu, the equipment panel, scene teardown, release outside
      the canvas and window blur each end a hold with nothing sent and no aim line left.
- [ ] Left-click during a hold does nothing.
- [ ] No code sends `triple_arrow` or `multishot_arrow`.
- [ ] A `shadow_shot` projectile in state is drawn with the `fx_arrow` body and the shadow trail,
      and lands with the Shadow Shot impact; `arrow` and `fireball` flights are unchanged.
- [ ] The archer's ability card reads Shadow Shot with its how-it-works line (with FS-8AY7S).
- [ ] New effect entries pass `table.test.ts` and the token fence; no raw colour is introduced.
- [ ] `npx vitest run`, `npx tsc --noEmit` and `npm run lint` pass.

## Edge States

- **Quick tap.** Held under 0.3 s: cancelled, nothing sent, no cost, no cooldown. The aim line
  appeared faint and is removed.
- **Cooldown.** A hold may begin at any time. A release before 1.2 s have passed since the last
  sent Shadow Shot is cancelled like a tap; the line stays faint until the cooldown is over.
  Network jitter can make a release the client judged ready land inside the server's cooldown;
  the server refuses it (no projectile, no cost) and the release effect has already played. This
  is the same optimistic send every ability makes today and is accepted.
- **Short of stamina.** Before FS-8AY7S: the client sends and the server refuses. After it: the
  client sends nothing (R18), and the card shows the ability unaffordable (FS-8AY7S).
- **Modded client.** A client that skips the hold and casts at once is accepted: the 1.2 s
  cooldown and the 90 cost bound it, and the server already refuses casts inside the cooldown
  (ADR-0030).
- **Old client after the server ships.** An old client sending `triple_arrow` gets an unknown
  skill error and no shot. Server and client slices ship together.
- **Interim pricing.** If the server row lands while the archer still has the 100-mana,
  non-regenerating pool, an archer gets two Shadow Shots per run until FS-8AY7S lands stamina.
  Accepted as a transition state.
- **Died mid-hold.** The hold is cancelled the moment the client sees the delver resolved;
  nothing is sent (the server would refuse it anyway, FS-77AB6 §Requirements 17).
- **Died with a bolt in flight.** The bolt flies on and still credits the archer (R7).
- **Floor change mid-hold.** Cancelled as the client leaves the old floor.
- **ESC menu or equipment panel mid-hold.** Cancelled when it opens; closing it does not resume
  the hold.
- **Window blur, tab switch, release outside the canvas.** Cancelled: a release the client cannot
  see, or at a point outside the world view, never fires.
- **Disconnect mid-hold.** The scene tears down or the send fails; nothing is queued for later.
- **Cursor on the archer.** A release with the cursor on the archer's own footprint fires along
  +x, as every aimed skill does today when the aim is where the caster stands.
- **Hit while aiming.** Taking damage does not interrupt the hold (no flinch exists).
- **Server moves the archer while aiming.** Nothing in today's game does; should it, the aim
  line and facing follow the drawn body.
- **Spectating.** A resolved delver cannot start a hold (R8 guards).
- **Teammates.** They never see another archer's hold, facing or aim line; they see the bolt
  once fired.

## Out of Scope

- A damage ramp, a faster bolt or any reward for holding longer (would need the server to know
  the hold time; revisits ADR-0030).
- A server-enforced minimum draw time (ADR-0030 accepts the modded-client case).
- A baked draw-and-aim pose or any new baked texture for the bolt.
- Broadcasting an aiming archer's facing or aim line to teammates.
- Class restrictions on `cast_skill` ids (today any class may send any id; unchanged).
- The stamina pool itself, its size and regeneration, the resource bars and the ability card's
  layout, greying and cooldown display: all FS-8AY7S.
- Re-pricing or changing the warrior's dash or the mage's triple fireball.
- Rebinding the ability to a key other than right-click.
