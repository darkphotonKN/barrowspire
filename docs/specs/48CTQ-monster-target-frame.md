# FS-48CTQ: Monster target frame on floor 1

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" → "Monster target frame" → this FS (brownfield pair: "Monsters with level and elite nameplates → FS-77AB6", which stays the rule everywhere the frame is off) · Related ADRs: [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) Decision 12 (the target frame as a per-floor opt-in), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) (a monster hidden by fog is not shown anywhere) · Builds on: [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 37–39 (plates, elite marker, hover and click targeting), [FS-KE075](KE075-floor-1-dungeon.md) (floor 1's dungeon), [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (fog), [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) (fullscreen button, view widths) · Revives: the idea parked 2026-11-01 ("monster health bar": bars hidden except on damage or hover, elites always, boss top bar), as revised by the owner · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Target frame**, **Marker**

## Summary

On floor 1 monsters no longer carry a name and a health bar over their heads. Instead, one frame
at the top centre of the screen names a single monster with its level and health: the monster
under the pointer, or, with nothing hovered, the one the player last hit, until it dies or three
seconds pass without another hit. A rare floor-1 demon, once engaged, holds the frame whenever
nothing is hovered, with a wider bar. An elite's prefix is set apart in the hostile accent, as on
its plate today.

The owner's reference point is Diablo II ("類似d2"): hover or attack a monster and its name and
bar show at the top centre; an elite's name stands out by colour. That is the behaviour taken.
The look stays ours: the frame uses the game's HUD chrome and palette (`design-guideline.md`
"UI Chrome"), not Diablo's.

Floors 2–3 and the field worlds keep today's plates and bars over every monster. Which mode a
floor uses is a client table, so a later floor opts in by adding itself (ADR-0061 Decision 12).

Charter run, 2026-11-06, item C. The charter's C1–C3 were replaced the same day by the owner's
revision ("怪物名字血條滑鼠移上去才會看到 或是攻擊他的時候顯示在畫面中間上方"), relayed by the
coordinator; every requirement below cites it as **charter default (owner revision)**, the floor
limit as **(owner: floor 1 only)**, and anything this spec settled as **derived here**. Recorded
without adversarial review: no `challenge-me` pass.

Amended 2026-11-06 after review (fix round 1): §C.6 counts a cast sent over a hovered monster as
an intent, so ranged classes hold the frame (S1); §D.10 latches engagement and counts `move` only
within the demon's aggro radius (S2). Both honour the owner's references above. The Facts lines
the amendment touched cite floor1/fix-48CTQ at 26387087.

Amended 2026-11-06 after the owner's floor-1 playtest: the hit area covers the drawn body
("怪物的hover的觸發範圍感覺有點小 滑鼠移動到上半身會沒觸發看血量 一定要接近腳的位置才會觸發
有辦法擴及全身嗎", relayed by the coordinator). §C.5.1 now defines the one hit test the hover, the
strike-mark and the click share: a living, shown monster's footprint or its body column. This
departs, for living monsters only, from shipped FS-2325V §C.6 ("hit-testing for any clickable
world object uses its footprint, not its sprite bounds"), which is recorded here and not edited;
every other world object keeps its footprint. The roster is shared, so the change reaches every
run floor and the field worlds, plates or frame alike. The Facts line this amendment added cites
floor1/monster-hover-body at 4b3ed5d4.

## Facts this spec rests on

Verified 2026-11-06 on local main 48ece46c; client paths under `game-client/src/`.

- Plates: `nameplate` composes `Ghoul · Lv 14` and `elitePlate` splits an elite's prefix for the
  hostile accent (`render/creatures/monsters.ts:194-223`); `mark` draws the bar over a living
  monster in `MARKER_BAR` colours and hides plate and bar on a corpse (`:576-600`).
- **No hit attribution on the wire.** `MonsterState` carries no attacker
  (`game-server/game-service/internal/types/game.go:327-344`) and `ProjectileState` no owner
  (`internal/types/messages.go:37-42`); the client flashes a monster on any drop in its health
  (`monsters.ts:402`). What the client does know is its own intent: a click on a monster within
  60 px sends `attack {enemy_entity_id}` (`utils/gameSession.ts:109-110`; `STRIKE_RANGE`,
  `render/combat/playerCombat.ts:120-127`), but every class's left click also sends a world-point
  `cast_skill` (slash, arrow, cut, fireball; `playerCombat.ts:260-285`) that names no monster, so
  a ranged class names its target only by where the pointer is.
- **No target or aggro on the wire.** `MonsterState` has `action` (`idle | move | attack | dead`),
  health and `boss`. The demon's aggro radius is 320 px and its leash 700 px
  (`game-service/internal/game/monster_tuning.go:238-242`); it is 1% on floor 1 and guaranteed on
  floor 3 (FS-77AB6). Its `action` flickers: unaggroed it wanders and reports `move`
  (`internal/systems/monster_ai.go:113-115`, `:233-236`), and it reports `idle` between wander
  legs (`:233-235`) and between melee swings (`:124-128`).
- Hovering a living monster already shows the strike-mark cursor (FS-77AB6 §39).
- **The hit test before the playtest amendment** (verified at 4b3ed5d4): a monster was hit only on
  a ground circle around its feet, 20 world px times its tier's aim (`footprintHitArea`,
  `render/world/footprint.ts`; `footprintRadius`, `render/creatures/monsters.ts`), per FS-2325V
  §C.6, so the upper body hit nothing; a corpse kept that circle and only ignored its events.
  Phaser 4.2.1 input is top-only by default: of the objects hit, the last drawn takes the pointer
  (`InputPlugin.topOnly`, `sortGameObjects` by `camera.renderList`), and no hidden object is
  hit-tested (`InputManager.inputCandidate`). Chests, sacks, doors and stairs answer `E`, never the
  pointer (`scenes/BarrowspireScene.ts`, `keydown-E`).
- **The top centre today**: while the local player is resolved, the spectate HUD at y 10
  ("Watching …" and "Tab: next player", to about y 62, `SPECTATE_HUD_Y`,
  `scenes/BarrowspireScene.ts:225`, `:4835-4852`); notices centred at y 100 (`showNotification`,
  `:4289-4306`, 20 px text, 10 px padding, so about y 78–122); the floor-change card at the screen
  centre. The floor indicator and escaped count sit at the top right under the fullscreen button
  (`TOP_RIGHT_HUD`, `:283-287`), and FS-SRA9J's minimap under them, from x ≥ 854 at the 1080
  minimum. Logical view 1080–1280 × 720 (`render/viewport/viewport.ts:22-24`).

## Requirements

### §A. Where the frame applies (the per-floor switch)

1. **A marker mode per world and floor**, in one client table: `overhead` (today's plates and bars)
   or `frame` (this FS). The table names run floor 1 as `frame`; every other run floor, the field
   worlds and anything not named are `overhead`. A later floor opts in by a table entry, with no
   other change. **(charter default, owner: floor 1 only)**
2. **On `overhead` floors nothing changes**: plates, bars, the elite marker and the boss's plate
   stay exactly as today, and no frame is shown. **(owner: floor 1 only)**

### §B. No overhead plates on a frame floor

3. **No overhead name, level or health bar over any monster** on a `frame` floor: normal, elite and
   boss alike. The elite's sprite tint or aura (FS-77AB6 §38) stays, since it is the sprite, not a
   plate. Party members' overhead names and bars (FS-CH21F) are untouched. **(charter default,
   owner revision, C1)**

### §C. The target frame

4. **One frame at the top centre** shows one monster: its name with its level (`nameplate`), an
   elite's prefix lettered in the hostile accent (`elitePlate`), and its health bar in
   `MARKER_BAR`'s colours, updated every snapshot. **(charter default, owner revision, C2)**
5. **Which monster** (highest first): **(charter default, owner revision, C2, C3)**
   1. the **hovered** monster: a living, shown monster under the pointer, by the same hit test as
      the strike-mark cursor and the click. The pointer is on a monster when it is on its
      footprint (as before) or in its **body column**: the screen-space column from its feet up to
      its crown, 0.4 of its crown either side of its feet, or half its body length for a
      quadruped, at the monster's drawn size. A corpse and a hidden monster are hit nowhere, so
      where bodies overlap the living, shown monster drawn in front takes the pointer, and a
      corpse never takes it from one behind. A sheet with no crown (no baked art) keeps the
      footprint alone. **(owner, playtest 2026-11-06: the hit area covers the drawn body; the
      column, not a pixel alpha test, derived here: a column holds steady across a walk cycle's
      frames and reads no texture per pointer move)**
   2. else an **engaged boss** (§D);
   3. else the **last-hit** monster (§C.6), while it lives and for 3 s after the player's last hit
      on it;
   4. else nothing: the frame is hidden.
6. **The last-hit monster** is the monster named by the local player's latest **intent**. An
   intent is either an `attack` naming a monster (a melee strike), or a cast the player sends while
   a living, shown monster is hovered, which names that monster: the left-click primary of every
   class, a right-click ability sent at once (the warrior's dash, the mage's triple fireball), or a
   fired Shadow Shot, the hover read as the cast is sent. The archer's right-press (which only
   starts the hold and sends nothing) and the Mercenary's parry (which strikes nothing) are not
   intents. The monster becomes the last-hit monster the moment the intent is sent; its 3 s restart
   on every drop in its health that arrives within 1 s of an intent naming it. A drop with no such
   intent (a teammate's hit, a cast with nothing hovered) restarts nothing. **(derived here: the
   wire has no attacker, Facts; "only the player's own hits count" is honoured by counting only
   hits the player aimed at that monster, by click or by pointer, so a ranged class holds the frame
   as a melee one does (review S1); exact attribution would need a server field, out of scope)**
7. **The frame never names** a dead monster, a monster hidden by fog (FS-SRA9J §D: a monster whose
   sprite is hidden is not a candidate), a monster no longer in the snapshot, or a party member.
   When the monster it names dies or leaves, it moves to the next in §C.5 or hides. **(derived
   here)**
8. **Fades**: in over 120 ms when it appears, out over 200 ms when it hides; switching from one
   monster to another changes the content at once, with no fade. **(derived here: "fades in and
   out quickly")**

### §D. The boss

9. **The boss uses the frame**, never a head plate, on a `frame` floor. **(charter default, owner
   revision, C3)**
10. **Engaged** is latched. A living boss **becomes** engaged when its health is below its maximum
    (only the party can hurt it), or its action is `move` within its aggro radius (320 px) of a
    living party member, or `attack` within its leash radius (700 px) of one. Once engaged it
    **stays** engaged, whatever its action, until it is back at full health **and** beyond 700 px
    of every living member, or it dies, or it leaves the snapshot; then it engages again only by the
    same rule. A boss merely hidden by fog keeps its latch, but the frame names only a shown one
    (§C.7), and of two engaged bosses the shown one. **(derived here: the wire carries no aggro
    target, Facts; this reads "aggroed on the party or damaged by it" from what is sent. The
    server's `move` while wandering unaggroed and its `idle` between wander legs and between swings
    would otherwise flip the frame, so the rule latches and counts `move` only within the radius at
    which the demon would aggro (review S2); values from `monster_tuning.go:238-242`)**
11. **Engaged, it holds the frame whenever nothing is hovered**, ahead of the last-hit monster. A
    hovered monster still wins. (C3)
12. **A boss frame is wider**: its bar is 1.5 × the normal frame's width and twice its height.
    **(derived here: "wider or more prominent")**
13. On floor 1 the boss is the 1% demon; floor 3's guaranteed demon keeps today's plate, since
    floor 3 is `overhead` (§A.1).

### §E. Placement and look

14. **Anchored at the top centre**, its top at y 10, centred on `viewport.centerX`, re-anchored by
    `relayoutHud` on a resize. A normal frame is at most 280 logical px wide and 52 tall; a boss
    frame at most 420 wide and 60 tall. **(charter default, owner revision, C4; derived here from
    the HUD: it ends above the notice band (y ≈ 78), and at the 1080 minimum a boss frame spans
    x 330–750, clear of the minimap and top-right column from x ≥ 854)**
15. **Hidden while the spectate HUD is up** (the local player has resolved and watches a
    teammate), since both claim the top centre and a resolved player has no hits of their own.
    **(derived here)**
16. **Under the floor-change veil and card**: the frame draws in the HUD band (depth ≥ 1000) but
    is hidden while the floor-change veil is up. **(derived here)**
17. **Chrome**: a `palette.hudPanel` backing with the HUD's rim, the body serif for the name line,
    the hostile channel for the name and the elite prefix in the hostile accent, per
    `design-guideline.md` "UI Chrome" and "Gameplay accent"; colours from tokens only (ADR-0013).
    Diablo II is a behaviour reference, not a look. **(owner reference point)**

## User Stories

1. As a delver on floor 1, I want no plates over every monster's head, so that the dungeon reads as a dark place, not a spreadsheet.
2. As a delver, I want to see a monster's name, level and health when I point at it, so that I can judge a fight before I start it.
3. As a delver, I want the monster I am fighting to stay in the frame after I move the pointer away, so that I can watch its health while I dodge.
4. As a delver, I want the frame to let go three seconds after I stop hitting, so that it does not keep naming a monster I walked away from.
5. As a delver, I want the frame to clear when my target dies, so that I know the fight is over.
6. As a delver, I want only my own hits to hold the frame, so that my teammates' fights do not take my frame away.
7. As a delver, I want pointing at another monster to show it at once, so that I can check the next threat mid-fight.
8. As a delver, I want an elite's prefix set apart by colour, so that I can tell an elite from its kin at a glance.
9. As a delver facing the demon, I want its name and a wide bar at the top of the screen while we fight it, so that the boss fight feels like one.
10. As a delver, I want the frame to stay clear of the fullscreen button, the floor indicator, the minimap and the notices, so that the HUD stays readable.
11. As a delver on floors 2 and 3, I want the plates I know, so that only floor 1 changes.
12. As a delver, I want the frame never to show a monster I cannot see in the fog, so that the frame does not give it away.
13. As a delver watching my party after dying, I want the spectate line not to be covered, so that I know whom I am watching.
14. As a developer, I want the mode to be one table entry per floor, so that a later floor can adopt the frame without code changes.
15. As a delver, I want to point at any part of a monster I can see, its head as well as its feet, so that checking its health or striking it takes no careful aim at the floor.
16. As a delver in a crowd, I want the monster in front to be the one I point at, so that a tall one behind does not take my hover.

## Acceptance Criteria

- [ ] The marker-mode table names run floor 1 `frame` and nothing else; floors 2–3 and fields are `overhead`; a test adds a floor to the table and sees the frame there.
- [ ] On floor 1 no monster, elite or boss draws an overhead name, level or bar; the elite tint stays; party members' overhead names and bars are unchanged.
- [ ] Hovering a living monster shows it in the frame with `nameplate` text and its bar; an elite's prefix is in the hostile accent.
- [ ] After an intent at a monster (an `attack`, or a cast sent while it is hovered) and with nothing hovered, the frame shows it; a drop in its health within 1 s of an intent restarts 3 s; with no further own hit it hides 3 s after the last one. An archer's or mage's cast at a hovered monster 250 px away, hit within 1 s, holds it 3 s after the pointer leaves; a cast with nothing hovered holds nothing.
- [ ] A teammate's hit on the last-hit monster does not restart its 3 s; a teammate's target is never shown unless hovered.
- [ ] Hover wins over an engaged boss, which wins over the last-hit monster (selection tests over every pair).
- [ ] Pointing at a living monster's head or upper body hovers it and a click there strikes it; its feet still do; empty space beside or over its body does not; where bodies overlap the monster drawn in front takes the pointer; a corpse or a hidden monster takes none.
- [ ] A boss becomes engaged when damaged, moving within 320 px or attacking within 700 px of a living member; it stays engaged through wander, pause and swing-idle cycles until it is at full health beyond 700 px of every living member, dies or leaves; its frame bar is 1.5 × wider and twice as tall.
- [ ] Dead, fog-hidden, departed monsters and party members are never named; the frame moves on or hides when its monster dies or leaves.
- [ ] The frame fades in over 120 ms and out over 200 ms, switches content without a fade, and is hidden while the spectate HUD or the floor-change veil is up.
- [ ] Layout test at 1080 and 1280: top at y 10, centred; normal ≤ 280 × 52, boss ≤ 420 × 60; no overlap with the notice band, the top-right column, the fullscreen button or the minimap.
- [ ] Floors 2–3 screenshots still match FS-KE075's captures (plates as today).
- [ ] Typecheck and the full vitest suite pass.
- [ ] Nick's browser check (I-48CTQ-3) passes.

## Edge States

- **Pointer over a corpse:** not a candidate; the frame falls through to the boss or last-hit monster. A corpse is hit nowhere, so a living monster behind it takes the pointer.
- **Bodies overlap:** the monster drawn in front takes the pointer. A tall one behind takes what of its column stands clear of the front one's, which can be empty floor beside the front monster's head or shoulders: the column is a box, not the drawn pixels.
- **A monster's body over a party member, or a party member over a monster:** whichever is drawn in front takes the pointer. A party member's footprint answers nothing (FS-77AB6 §40), so a monster standing behind an ally is not hovered or struck over the ally's feet.
- **A HUD panel over a monster's body:** a monster's own press checks only the menu (`BarrowspireScene.strike`), not the satchel, chat window or party panel the scene's press handler checks, so a press on one of those panels over a monster may strike it. Not new, but the taller column covers more of the screen. Left as found.
- **Pointer over a party member:** no frame (allies are never named).
- **Last-hit monster leaves interest (beyond 1600 px):** gone from the snapshot, so the frame hides or moves on.
- **Last-hit monster walks into fog:** its sprite is hidden, so the frame hides or moves on; hovering it is impossible.
- **Two attacks at different monsters within 1 s:** the latest intent names the last-hit monster.
- **A cast lands on a monster that was not hovered as it was sent** (an arrow at empty ground that strays into one, an area skill catching a bystander, the pointer moved off before the press): it holds nothing; accepted for v1.
- **The demon wanders near the party but never aggroes:** a `move` beyond 320 px does not engage it, so it never takes the frame unless hovered.
- **Boss engaged, then the party runs past 700 px at full health:** it stops being engaged; damaged, it stays engaged until it heals to full with the party beyond 700 px, or dies.
- **Boss engaged, pausing between wander legs or between swings (`idle`):** it stays engaged.
- **Local player dies mid-fight:** the spectate HUD takes the top centre and the frame hides.
- **Window resized:** the frame re-anchors at the new centre.
- **Monster health above max or missing max:** the bar clamps to 0–1 as `mark` does today.

## Out of Scope

The frame on floors 2–3, the field worlds or the hub; hiding party members' plates; a server field
for hit attribution or aggro target; counting a cast with nothing hovered; a target frame for
players; a target lock key or click-to-select; damage numbers; new art; changing the elite tint or
the strike-mark cursor; a pixel-exact (alpha) hit test on monsters.
