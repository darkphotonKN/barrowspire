# FS-B4SG9: Ranged monsters and the Bone Archer

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Enemies" → "Monsters that shoot from range"; `game-client/SPECIFICATION.md` "### Presentation" → "Ranged monsters drawn with their shots" → this FS · Builds on: [FS-77AB6](77AB6-monsters-and-combat.md) (monster sheets, the monster AI, the CombatSystem, projectiles that snapshot their attacker), [FS-KE075](KE075-floor-1-dungeon.md) §C (the dungeon population), §D (paths), §J (guarded chests), [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) §C–§D (every Spire floor is a dungeon; the rolled mix), [FS-Q14EV](Q14EV-expanded-baked-enemy-roster.md) §A (the roster pipeline), [FS-1819Q](1819Q-dev-gallery.md) (the gallery rule) · Pointer stubs: `## Change: Ranged monsters and the Bone Archer → FS-B4SG9` on FS-77AB6 and FS-KE075 · Related ADRs: [ADR-0062](../adr/0062-monsters-path-on-the-floor-cell-grid-with-a-star.md) (paths; aggro stays distance-only), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (interest), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) and [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (baked, authored in code, contact-sheet gate), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only)

> Promoted `--from-thread` on 2026-11-11 from the coordinator's locked decisions under the owner's
> charter "一樓壓力" (owner approved 2026-11-11). There was no interview and nothing was asked of
> anyone. The decisions were not challenged (no `challenge-me` pass).
>
> **Markers.** **(charter default: …)** is a locked decision of the charter, with its reason.
> **(owner decision YYYY-MM-DD: …)** is a later call of the owner's, recorded where it applies.
> **(derived here: …)** is a rule this FS had to add to make a locked decision buildable; each is
> a named tunable or a small rule the owner may revise. **[open]** is a call left to the owner
> (§Open questions); the FS states what the code does today and no slice changes it.
> Every number is a *starting value*, expected to move in play.

## Summary

Floor 1's monsters all walk up and hit. This adds the first monster that does not: the **Bone
Archer**, the ghoul's skeleton holding a bow. It closes to shooting range, stands, draws for a
moment the player can read, and looses an arrow at where its target stands. Strafing dodges the
arrow, a wall stops it, and the archer itself is frail, so it is the thing to kill first.

Underneath, monsters gain a **shot**: sheet data that makes an archetype ranged. The Bone Archer is
the only archetype with one in v1, and it lives on floor 1 only.

## Bounds

- **May change:** game-service `internal/game`, `internal/systems`, `internal/components`,
  `internal/types`; game-client; `game-client/tools/bake`.
- **May not change:** proto, api-gateway, OpenAPI, the generated client, any database or
  migration, any other microservice, the existing text of a shipped FS.
- A new value of an existing string field on the WebSocket state (`archetype`,
  `projectile_type`) is not a shape change and is inside the bounds. No field is added.

## Requirements

### §A. A monster's shot (game-service)

1. **A shot is sheet data.** A monster sheet may carry a **shot**: the projectile type the client
   draws, its speed, its radius and its max flight. A sheet with a shot is a **ranged monster**;
   its `AttackRange` is its shooting range. A sheet without one strikes in melee exactly as
   today. Which archetypes shoot is this data, never a check on the archetype, as the demons'
   claw is (FS-VHGE7 §B R15). The numbers live in `monster_tuning.go` with every other sheet
   value (FS-77AB6 R25) and are copied to the monster at spawn like its timings.
2. **The Bone Archer's sheet** (level 1):

   | Field | Value | Source |
   |---|---|---|
   | Archetype string | `bone_archer` | derived here: the `_` reads as a space on the elite plate (FS-M8CSE R21) |
   | Name | Bone Archer | charter default |
   | HP | 30 | charter default: frailer than the ghoul's 40, a priority target |
   | Damage | 7 | charter default |
   | Move speed | 130 | charter default: slower than the ghoul's 150 and a delver's 200 |
   | Shooting range (`AttackRange`) | 320 px | charter default |
   | Aggro radius | 360 px | charter default |
   | Leash radius | 560 px | charter default |
   | Attack interval | 2.0 s | charter default: one arrow every 2.0 s |
   | Wind-up | 0.6 s | charter default: a telegraph the player can read |
   | Defense / magic resistance | 2 / 0 | derived here: the ghoul's; it is the ghoul with a bow |
   | Shot: projectile type | `bone_arrow` | derived here: so the client can draw a hostile arrow apart from a party archer's (§D R22) |
   | Shot: speed | 420 px/s | charter default |
   | Shot: radius | 8 px | derived here: the delver arrow's |
   | Shot: max flight | 850 px | owner decision 2026-11-11 ("弓手的箭最大飛行距離 照你建議"): the smallest multiple of 50 px at which a delver at the base 200 px/s, running straight away from 320 px from the first tick of the draw, is hit. Derivation and its limit below |
   | Damage type | physical | derived here: as every monster strike (FS-77AB6 R19) |

   Level, the level curve and the 5% base crit are FS-77AB6's (R5, R20, R21), unchanged.

   **Max flight, derived by test.** The rule is R8's "strafing dodges it, running straight away
   does not", and it holds from the start of the draw, not only from the release. At 30 ticks a
   second the wind-up's clock sums tick lengths and runs one tick over 0.6 s, so the draw lasts
   19 ticks (0.633 s) and the arrow leaves on the 20th tick. A delver who starts 320 px away and
   runs straight away at 200 px/s through all 20 is 453 px away when it leaves. The arrow (radius
   8) closes on their body (radius 20) at 220 px/s and reaches them on its 59th tick, after
   **826 px of flight**, 847 px from the archer. 800 px ends the arrow one tick short; 850 px is
   the next multiple of 50. This replaces the first value, 700 px, which was derived from a
   delver who starts to run on the release tick (caught after 611 px) and so let one who ran
   from the start of the draw get away.

   **This holds at the base move speed only, and is left as it is.** A delver with move-speed
   gear (up to +30%, 260 px/s) can still outrun an arrow by running straight away from the start
   of the draw: by the same arithmetic they are 493 px away at release, the arrow closes at
   160 px/s and would need about 1 220 px of flight. No rule and no number is changed for them.
3. **Elites, experience and loot follow the ghoul's rules. No new rule.** **(charter default)**
   A Bone Archer rolls elite at the floor's elite chance with the same prefixes and multipliers
   (FS-77AB6 R23), so "Dread Bone Archer" exists. It has its own experience row, base 10, and its
   own drop row, the ghoul's `GhoulMonsterDrop`. **(derived here: rows of its own, because an
   archetype without a row gives no experience and drops nothing.)**
4. **Approach.** A ranged monster with a target walks toward it, by path on a dungeon floor
   (FS-KE075 §D, unchanged), until **both** hold: the target is within its shooting range, and it
   has **line of sight** (R5). Then it stops and faces the target. When either stops holding
   while it is not winding up, it walks again. There is no band between the two states, as melee
   has none. **(charter default: with no line of sight it walks until it has one; reuse the
   existing monster pathfinding.)**
5. **Line of sight** is a straight flight of its projectile, at the shot's radius, from where the
   monster stands to where its target stands, crossing walkable cells only: the nav grid's
   existing straight-walk test (`NavGrid.Clear`) with the shot's radius as the half-size. Bodies
   never block it. On a floor with no grid it always holds. Line of sight gates the shot only.
   **Aggro, retaliation and the leash are unchanged and stay distance-only** (FS-77AB6 R26,
   ADR-0062 Decision 6). **(derived here: the test; the charter names the behaviour.)**
6. **Stand and shoot.** In range and in sight, with its attack interval elapsed, it starts a
   wind-up and the interval restarts, as a melee strike's does. So arrows leave 2.0 s apart.
   Between arrows it stands idle, facing its target. It never backs away, kites or strikes in
   melee: a delver standing against it is shot at point-blank. **(charter default: v1 stands and
   shoots.)**
7. **The wind-up is the telegraph.** For the whole wind-up it stands still, reports the `attack`
   action, and **keeps turning to face its target**, so the draw points where the arrow will go.
   **(derived here: a melee wind-up does not turn; a draw that points somewhere else is not a
   readable telegraph.)**
8. **Release.** When the wind-up ends, a monster that still has a target looses one projectile
   from where it stands at **where that target stands on that tick**. No lead, no spread, no
   range or sight check at release: a target that stepped behind a wall during the draw is shot
   at, and the wall takes the arrow. A monster with no target then looses nothing. **(charter
   default: aimed at where the target stands at release, no lead; strafing dodges it, running
   straight away does not.)**
9. **The arrow is an ordinary projectile.** It is fired through the `CombatSystem` on the tick,
   carries a snapshot of its archer taken at release (damage at level, elite multiplier included,
   physical, 5% crit, `FromMonster`), and from the next tick is moved by the existing
   `ProjectileSystem`, whose impact goes back to the `CombatSystem`. Nothing else reduces health.
   An arrow in the air when its archer dies still lands (FS-77AB6 R1, R9, R10). **(charter
   default: all damage goes through the CombatSystem and a projectile snapshots its attacker;
   projectiles are in the tick order already.)**
10. **What an arrow hits.** By the existing rules, with no new code path: it stops at a wall and
    at its max flight, passes through monsters, corpses and delvers out of play, and lands on the
    **first delver in play it reaches**, whoever it was aimed at. It never pierces. **(charter
    default: arrows stop at walls; reuse the existing projectile system.)**
11. **Tick order is unchanged** (FS-77AB6 R27): monster AI → movement → projectiles → combat. A
    shot loosed in combat on one tick first moves on the next.
12. **Dead and interrupted.** A monster that dies mid-wind-up looses nothing (FS-77AB6 R30). A
    target that dies, escapes, leaves or passes the leash ends the hunt as today; the monster
    walks home by path.
13. **Parry and reflect are not changed by this FS.** **[open]** As the code stands, a
    projectile impact is never tested against the mercenary's parry stance (only a targeted
    strike is), and any hit from a monster, an arrow's included, is reflected by Gravewarden's
    Oath. No slice here touches either, and no test here pins either (§Open questions 1–2).

### §B. Bone Archers on floor 1 (game-service)

14. **Floor 1 only.** Bone Archers are placed by the dungeon population on a floor of depth 1 and
    nowhere else: not on floor 2 and up (every Spire floor is a dungeon since FS-M8CSE §C, so
    this is a depth test), not in a field, the hub or the dev test room, and not on a floor 1
    built of buildings after a failed generation (FS-KE075 R17). **(charter default: floor 1
    only.)**
15. **Ordinary rooms: 1 in 4 ghouls.** Each monster rolled for an ordinary room that comes up a
    ghoul is, with probability 0.25, a Bone Archer instead. The roll is independent per monster.
    An ordinary room is any room that is not the start, a treasure room or a hall (FS-KE075 R18);
    top-ups go to ordinary rooms and roll the same way. The troll share and the Barrow Thrall and
    Spire Wraith shares are untouched: only a roll that came up ghoul can turn. **(charter
    default: 1 in 4; derived here: an independent roll, and that top-ups count as room monsters.)**
16. **Hall packs: exactly one.** In each hall pack, one of the pack's ghouls is a Bone Archer: a
    pack is 1 troll, 1 Bone Archer and 1–3 ghouls, its size unchanged. The archer is the first of
    the pack's ghouls, so a pack that could not fit every member keeps its archer for as long as
    it fits any. It rolls level and elite as the ghoul it replaces would. **(charter default: in
    a hall's pack one ghoul is; derived here: which one a short pack keeps.)**
17. **None in corridors, none among treasure guards.** A corridor's rolled monsters and a
    treasure room's elites roll as today and are never Bone Archers. **(charter default: none in
    corridors; derived here: treasure guards, which the charter does not name.)**
18. **The hall's archer is a guard.** It is placed as a member of the hall pack, so it is one of
    the hall chest's guards by the existing rule, and the chest waits on it like any member.
    FS-KE075 §J's guard definition, the refusal and the wire are unchanged; where §J R58 reads "a
    hall's troll and ghouls" it means the hall's pack. **(charter default.)**
19. **Counts are unchanged.** An archer takes a ghoul's place, so the floor total (45–70), the
    per-room counts, spacing, the delver exclusion and the trim order stay FS-KE075's. The share
    and the per-pack count are named constants beside the dungeon population's, so a developer
    can force archers in a local build (FS-77AB6 R25).

### §C. The Bone Archer on the client (game-client)

20. **Known archetype.** `bone_archer` joins the client's archetype type and `MONSTER_LOOKS`, on
    the sheet `creature_bone_archer_base` at the **fodder** tier. Everything a monster already
    has follows with no new code: nameplate `Bone Archer · Lv N`, the elite prefix split
    ("Dread" + "Bone Archer"), the elite wash, HP bar, target frame, hover and click to attack,
    the damage flash, death and corpse.
21. **The draw is the telegraph.** While the server reports `attack`, the sheet's `attack` clip
    plays in the facing the server sends, which now turns during the wind-up (R7). On this sheet
    that clip is the shot: nock, draw, loose (§E R26). No new action, clip name or wire field.

### §D. The bone arrow on the client (game-client)

22. **A hostile arrow.** `projectile_type: "bone_arrow"` has its own flight: the arrow's shape in
    the hostile channel (bone shaft, ember/oxblood accent), tokens only (ADR-0013), never the
    party arrow's colours, never amber or arcane green. The guideline's "A hostile's attack
    effect is in the hostile channel too" applies. It is drawn where the server says, eased like
    every projectile, and ends where the server removes it.
23. **Gallery card, same change.** The flight is a new piece in the tracked `effects` family, so
    its card is added to `src/dev/gallery/effects.ts` in the same change (FS-1819Q §A;
    `game-client/CLAUDE.md` "Dev gallery"). **(charter default.)** A monster sheet is not in a
    tracked family today (`families.ts`: `effects`, `item-icons`), so the sheet itself needs no
    card.

### §E. The art (game-client bake)

24. **A new baked sheet, `creature_bone_archer_base`**: the ghoul rig holding a bow. It is built
    from the ghoul's own builder (same proportions, bones, rags and hostile eyes), with the
    existing `longbow` gear in the bow hand and its live string. Authored in code, never sourced
    (ADR-0021). **(charter default: the look is the existing Ghoul holding a bow.)**
25. **Pipeline.** One `CAST` entry, 8 directions × `idle`, `walk`, `attack`, `death` at the
    standard `ANIMATIONS` rates, an `authored:` provenance line, deterministic bake
    (`npm run bake -- --check` exits 0 after the committed bake), per FS-Q14EV §A.2, §A.4, §A.5,
    §A.8–§A.12. It packs into the **`creatures`** group, which the run already loads, as the
    Barrow Thrall and Spire Wraith did (FS-M8CSE §H); the `creatures` atlases reflow and are
    re-committed. **(derived here: the group.)**
26. **The shoot clip** is the sheet's `attack`: from the hunched stance it raises the bow, nocks
    and draws with the string pulled to the hand and the arrow showing, and looses on its last
    frames. It lasts the wind-up, 0.6 s within one frame (the standard 7 frames at 12 fps is
    0.58 s). Idle and walk carry the bow in hand with no arrow nocked. Death is the ghoul's, bow
    in hand, eyes out by the last frame.
27. **Still reads as a hostile, and as the one with the bow.** It stays in the fodder size band
    (guideline "Enemy design language": 0.85–1.0× a delver), its outline keeps the ghoul's hunch
    ("Silhouette breaks the human line"), and at 1× in the 8 directions the bow is visible in
    idle and walk, so a player can pick it out of a pack before it draws.
28. **Manifest coverage.** `src/render/art/manifest.test.ts` asserts the sheet exists, has 8
    directions and the four clips, an `authored:` source and the `creatures` group.
29. **Owner review gate (HITL).** The bake writes the review contact sheets to
    `tools/bake/review/`. Work on the sheet stops there until the owner approves it (ADR-0021,
    FS-Q14EV §A.14).

## User Stories

1. As a delver, I want some of floor 1's skeletons to carry bows, so that a fight is not only
   things walking at me.
2. As a delver, I want to tell a Bone Archer from a Ghoul before it shoots, so that I can choose
   to kill it first.
3. As a delver, I want the archer to draw visibly before it looses, so that I can react.
4. As a delver, I want the draw to point where the arrow will go, so that the telegraph is honest.
5. As a delver, I want to dodge an arrow by stepping sideways, so that moving well is rewarded.
6. As a delver, I do not want to outrun an arrow by running straight away, so that fleeing in a
   line is not a free answer.
7. As a delver, I want a wall to stop an arrow, so that cover works.
8. As a delver, I want the archer to walk round a corner to find me rather than shoot the wall
   forever, so that cover is a pause and not a win.
9. As a delver, I want the archer to die quickly once I reach it, so that closing the distance
   pays.
10. As a delver, I want a hostile arrow to look different from my party archer's, so that I know
    which arrows to avoid.
11. As a delver, I want an arrow meant for my teammate to hit me if I stand in its way, so that
    positioning matters for the party.
12. As a delver, I want arrows to pass through other monsters, so that a pack in front of the
    archer does not make it harmless.
13. As a delver, I want a hall's chest to stay shut until the hall's archer is dead too, so that
    the guards are one fight.
14. As a delver, I want a Bone Archer to give what a Ghoul gives, so that it is worth killing.
15. As a delver, I want an elite Bone Archer to read as an elite, so that I know it hits harder.
16. As a delver who shot an archer from far away, I want it to come for me, so that I get no free
    kill.
17. As a delver on floor 2 or above, I want no Bone Archers, so that v1's pressure stays on the
    first floor as designed.
18. As a delver in a corridor, I want no archer waiting down its length, so that corridors stay
    what they are.
19. As a reconnecting delver, I want archers and arrows in flight to be where the server has
    them, so that nothing is lost.
20. As the owner, I want every number of the archer in one file, so that I can tune it in play.
21. As the owner, I want to force archers in a local build, so that I can check them quickly.
22. As the owner, I want to approve the sheet on a contact sheet before it ships, so that the look
    is mine.
23. As a client developer, I want the bone arrow in the dev gallery, so that I find it before
    building another.
24. As a server developer, I want "shoots" to be sheet data, so that the next ranged monster is a
    row, not a branch.

## Acceptance Criteria

### Server (Go tests next to the code)

- [ ] The `bone_archer` sheet carries exactly R2's values; a level-1 Bone Archer spawns with 30 HP,
      7 damage and speed 130; an elite takes FS-77AB6's multipliers and a prefixed name.
- [ ] Killing one gives the ghoul's experience (base 10) and rolls the ghoul's drop row.
- [ ] A sheet without a shot behaves exactly as before: the existing monster AI tests pass
      unchanged.
- [ ] With a target at 500 px in open ground it walks; at 320 px or less, in sight, it stands and
      faces the target.
- [ ] In range and in sight it reports `attack` for 0.6 s, standing still, then one projectile of
      type `bone_arrow` exists at its position moving at 420 px/s toward where the target stood on
      the release tick.
- [ ] A target that moved during the wind-up: the archer's facing follows it, and the arrow is
      aimed at its release-tick position, not its position when the wind-up began.
- [ ] Successive arrows from one archer at a standing target leave 2.0 s apart.
- [ ] An arrow reaching a delver in play damages them through the `CombatSystem` by the monster
      formula (the archer's damage at level, mitigated by the delver's defense); nothing else
      reduces their health.
- [ ] A delver who strafes across the line at 200 px/s from 320 px is not hit; a delver who runs
      straight away from 320 px at 200 px/s is hit, whether they start to run as the arrow leaves
      or on the first tick of the draw.
- [ ] An arrow stops at a wall and at 850 px of flight; it passes through a monster, a corpse and
      a delver out of play; a second delver standing in the line is the one hit.
- [ ] In range with rock between: it starts no wind-up and walks its path until the straight
      flight is clear, then stands and shoots.
- [ ] A target that breaks line of sight during a wind-up: the arrow is still loosed and stops at
      the wall.
- [ ] Killed mid-wind-up: no arrow. Killed with an arrow in the air: the arrow still lands.
- [ ] Target lost at the wind-up's end (dead, escaped, left, past the leash): no arrow.
- [ ] Hit by a delver from beyond its aggro radius, it takes them as its target and walks to
      shooting range.
- [ ] It never moves away from its target and never queues a melee strike.
- [ ] On a seeded floor 1: over many floors, the share of ordinary-room ghoul rolls that are Bone
      Archers is near 0.25; troll, Barrow Thrall and Spire Wraith shares are unchanged.
- [ ] Every placed hall pack that fitted at least one of its ghouls holds exactly one Bone Archer;
      a short pack keeps it.
- [ ] No Bone Archer is ever placed in a corridor, as a treasure guard, on a floor of depth ≥ 2,
      or on a floor 1 without a dungeon layout.
- [ ] A hall's chest refuses with `container_guarded` while only the hall's Bone Archer stands,
      and opens once it is dead; the existing §J tests pass unchanged.
- [ ] The floor total stays within 45–70 and the existing population tests pass.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

### Client (vitest)

- [ ] `monsterLook("bone_archer")` is `creature_bone_archer_base` at the fodder tier; the
      archetype type includes it.
- [ ] `elitePlate` on "Dread Bone Archer" gives prefix "Dread" and rest "Bone Archer · Lv N".
- [ ] A `bone_archer` reporting `attack` plays the `attack` clip in the facing sent, and follows a
      facing that changes during it.
- [ ] `projectileFlightOf("bone_arrow")` is its own flight, not the fireball fallback and not the
      party arrow's.
- [ ] The gallery's effects registry has a card for the bone arrow, and the registry's
      completeness test passes.
- [ ] `npm test` and the lint fence pass in game-client.

### Art

- [ ] `creature_bone_archer_base` is in the manifest: 8 directions, `idle`, `walk`, `attack`,
      `death`, `authored:` source, group `creatures`.
- [ ] Its `attack` clip lasts 0.6 s within one frame, with the string drawn and the arrow showing
      before the loose.
- [ ] `npm run bake -- --check` exits 0 after the committed bake.
- [ ] The owner has approved the contact sheet.

### In play (HITL, on floor 1)

- [ ] A Bone Archer is picked out of a pack by its bow before it draws.
- [ ] The draw reads; stepping sideways during or after it avoids the arrow; running straight away
      does not.
- [ ] Standing behind a wall, arrows stop on it and the archer comes round.
- [ ] A hall's chest says "It will not open." until the hall's archer is dead as well.
- [ ] The arrow reads as hostile next to a party archer's.

## Edge States

- **No grid.** A ranged monster on a floor with no nav grid treats line of sight as clear and
  steers straight, as every monster does there. v1 never places one on such a floor.
- **Target in the same or a neighbouring cell.** It is in range and in sight: it stands and
  shoots at point-blank. The arrow starts at the archer's centre and lands on the next tick.
- **Target hovering at 320 px.** It alternates between a step and a stand, as a melee monster does
  at its reach. Once a wind-up starts it finishes where it stands.
- **Target out of range or sight when the interval elapses.** No wind-up starts. The interval is
  not consumed: it shoots as soon as it next stands in range and in sight.
- **Target swaps during a wind-up.** If its target is gone and the AI has taken another by the
  time the wind-up ends, the arrow goes at the one it has then.
- **Target running straight away with move-speed gear.** Above the base 200 px/s the max flight
  is not guaranteed to catch them: at the +30% cap (260 px/s) a delver who runs from the start
  of the draw outruns the arrow. Left as it is (R2).
- **Another delver in the line.** They take the arrow.
- **A pack between archer and target.** The arrow passes through the monsters.
- **Archer dies with an arrow in flight.** The arrow resolves with its snapshot (FS-77AB6 R9).
- **Delver dies, escapes or leaves with an arrow in flight.** The arrow passes through them.
- **Floor change with arrows in flight.** They are cleared with every non-delver entity, as today.
- **Hall pack with no room for any ghoul.** Only the troll is placed; the hall has no archer, and
  the chest waits on the troll alone, as FS-KE075's short-pack rule already gives.
- **Elite hall archer.** An elite guard like any elite member; nothing special.
- **A room that rolls only non-ghouls.** No archer; the 1 in 4 is per ghoul roll, not per room.
- **Interest.** An archer is a monster, cut beyond 1600 px; projectiles are always sent
  (FS-KE075 R36). An archer shoots from 320 px, so it is always inside its target's cut.
- **Reconnect.** Nothing about an archer or an arrow is client-held; the next snapshot rebuilds
  both.
- **Old client, new server.** A client without the look draws the archer as a troll (the
  unknown-archetype fallback) and the arrow as a fireball (the unknown-flight fallback). Ship the
  client's slices before the population slice reaches players (§Dependencies).
- **Mercenary parrying as an arrow lands; Gravewarden's Oath worn.** As the code stands: not
  parried; reflected. **[open]**

## Dependencies

- The client slices (§C, §D, §E) do not block the server slices in code, but the population slice
  (§B) is what makes archers appear, so it merges last, after the look and the flight.
- The sheet's contact-sheet approval gates §C's look.
- A sibling item of the same charter (the chest-open channel) works on FS-KE075's chest path on
  another branch. This FS does not touch `guarded_chests.go`'s rule, the refusal, or the client's
  chest code.

## Out of Scope

- Kiting, backing away, strafing or any movement while shooting; leading the target; volleys,
  spread or piercing arrows.
- Any ranged monster other than the Bone Archer; floors 2 and up; fields; the dev test room.
- Monster move speeds in general; any change to the ghoul, troll or other sheets.
- The guarded-chest rule, its refusal and its wire (FS-KE075 §J); a chest-open channel.
- Line-of-sight **aggro** (ADR-0062 Decision 6 stands).
- New loot, new drop values, new experience values, new elite rules.
- A parry or reflect rule for projectiles (§Open questions).
- A sound, a release flash, or a hit effect of its own for the bone arrow.
- A gallery family for monster sheets.
- Proto, api-gateway, OpenAPI, the generated client, databases, other services.

## Open questions

Left to the owner. None blocks a slice: each slice leaves the behaviour named here as it is.

1. **Does the mercenary's parry negate an arrow?** Today it would not: `parryStrike` is called
   only for a targeted strike (`CombatSystem.strike`), and a projectile impact goes straight to
   `applyHit`. FS-MAMHR R14 speaks of "a monster strike that resolves on the merc" and was written
   when every monster attack was melee. The parry is the mercenary's; the knight has none.
2. **Does Gravewarden's Oath reflect an arrow?** Today it would: `applyHit` reflects any hit
   `FromMonster`. FS-4R9M9 R34 names the effect `melee_reflect` and rests on "all monster attacks
   are melee in v1".
3. **Is "line of sight gates a monster's shot, never its aggro" worth an ADR** beside ADR-0062,
   whose Consequences say a line-of-sight aggro would be a new decision? This FS records it as a
   requirement (R5) and writes no ADR.
4. **Who runs the bake?** `npm run bake` needs Node, the repo's `playwright-core`, and an
   installed Google Chrome (or a Playwright Chromium, or `BAKE_BROWSER=<path>`) that it launches
   headless on SwiftShader against a local server; then a human reads the contact sheets.
