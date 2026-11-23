# FS-1D6BX: Sacks and per-kind container views

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Sacks as a floor container alongside chests"; `game-client/SPECIFICATION.md` "### Presentation" → "Distinct look per container kind" → this FS · Brownfield: retrofits [FS-2325V](2325V-pre-rendered-isometric-art.md) §D (container-open presentation: the satchel) and the FS-none "Container loot drops from the template pool" (both stay `[x]`) · Interacts with: [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (chest drop, drop piles R46/R61), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (field container roll R32, field piles R56–60), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (Forest clearing chests and restock R19) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art is built in code, never sourced) · Sibling tuning (not this FS): `docs/issues/I-UNANCHORED-2-containers-can-roll-empty.md` (absorbed in part, see D1), `docs/issues/I-UNANCHORED-3-loot-scarcity-tuning.md`, `docs/issues/I-UNANCHORED-4-fabled-drops-only-from-the-boss.md` · Vocabulary: game-service and game-client `CONTEXT.md` (*sack*, *coffer*, *satchel*, *bone heap*, *container view*)

## Summary

A floor can now hold a **sack**: a second kind of container that spawns where a chest would, at
a share, and is stingier than a chest. Every container kind now looks like itself when opened.
A chest opens into a **coffer** (a plain open box facing the player, with the items inside). A
sack opens into the **satchel**, today's leather view, with its flap lifting. A slain monster's
drop pile opens into a **bone heap** with the items lying on top. Only the sack's view animates.
Looting is unchanged in every view.

## Decisions folded from scoping (2026-10-31) and the charter

Scoping decisions (Kranti):

- **Three kinds, three looks.** Chest: chest prop, coffer view, no animation. Sack: new sack
  prop, satchel view, keeps the flap opening. Drop pile: existing bone heap, bone-heap view, no
  animation.
- **The name is "sack".** "Bag" collides with **Bag**, the carried inventory (FS-HRH2J).
  "Pouch" and "loot bag" were rejected too.
- **The views are an art swap only.** Same triggers, hover tips, `Interact` message, pending
  (`lootedAt`) guard and item slots as the satchel.
- **The sack share** is one tuning constant, about 1 in 3, applied wherever chests spawn.
  Rejected: 50/50, and runs only.
- **Generosity order** is chest > sack > drop pile. Drop piles stay kill-drops only.
- **The rate cuts are not this FS.** The chest's own odds, monster chances, the Forest spawn
  rate and the Fabled rule are tweaks and fixes (I-UNANCHORED-2/3/4).
- **Roll shape:** an empty roll first, then a 1–N count, with the weapon/armor/consumable split
  (0.2 / 0.3 / 0.5) untouched. Rejected: a per-item keep chance (emptiness and count can't be
  tuned apart), and a weighted count table (more to tune).

Charter defaults (chosen by the charter run, Kranti delegated the calls; each overridable):

- **D1, charter default: the per-kind roll seam lands here.** The sack must roll lower than a
  chest, so this FS brings in the per-kind *empty chance* and *count range* that I-UNANCHORED-2
  described. Chest values are behaviour-preserving (empty 0, count 2–4). The sack's starting
  values are empty 0.8, else exactly 1 item. *Reason:* without the seam the sack capability
  can't land, and putting it here keeps chests unchanged, so the chest's *fix* (its non-zero
  empty chance) and every number cut stay in I-UNANCHORED-2/3 as Kranti split them.
  I-UNANCHORED-2 shrinks to "set the chest's empty chance and count", which is a pure tuning
  change.
- **D2, charter default: an unknown kind draws and opens as a chest (coffer).** *Reason:* the
  server already defaults an empty kind to `chest`, and the chest is the common case.
- **D3, charter default: a sack has two frames, closed and open, like a chest.** An opened sack
  stays on the floor drawn open, emptied or not. *Reason:* it mirrors the chest's lifecycle
  exactly (only a drop pile disappears when emptied), which keeps one rule per placed container.
- **D4, charter default: the coffer is seen from the front, slightly above the front rim, so the
  floor of the box and the items on it are visible.** *Reason:* "facing the player like the
  satchel" means the same framing. The exact perspective is settled at the contact sheet.
- **D5, charter default: a field sack restocks like a field chest.** *Reason:* "wherever chests
  spawn" makes it a chest in every respect but its roll and look.
- **D6, charter default: the share applies at every chest spawn point.** That is the run floor's
  one container and each Forest clearing chest, including the one the Forest guarantees (a
  guaranteed container may be a sack). Meadows places no chests and is untouched. *Reason:* the
  smaller rule. One draw per spawn point, no special case.
- **D7, charter default: `SackShare = 0.33` lives in `loot_tuning.go`**, beside the per-kind roll
  constants. *Reason:* all loot numbers in one file. `ForestChestShare` stays where it is.
- **D8, charter default: the coffer and bone-heap views keep the satchel's panel footprint and
  item slot layout.** *Reason:* hit-testing and slot rules are reused untouched, so only the art
  changes.
- **D9, charter default: an empty container opens and says so** with the existing "(Picked clean)"
  status in all three views, never a refusal or nothing. *Reason:* with containers that can be
  empty, the player must tell empty from refused.
- **D10, charter default: the sack prop is baked through the existing bake pipeline**
  (`game-client/tools/bake`, a model beside `chest` in `models/interactables.js`, states
  `closed` / `open`). The coffer and bone-heap views are drawn in code like the satchel's
  textures (`ui/satchel.ts`). A code placeholder ships until the bake lands, as the chest's and
  pile's did. **The look is gated on Kranti's approval of the contact sheet.** *Reason:*
  ADR-0020 / ADR-0021, and the standing art-delegation rule.

## Requirements

### Server (game-service)

1. **Sack kind.** `ContainerKind` gains `ContainerKindSack` (`"sack"`). It is data on
   `ContainerComponent`, and behaviour stays in systems and the session (ECS rule).
2. **Wire.** The state serializer emits `containers[].kind = "sack"` for a sack. Chest and drop
   pile are unchanged, and an empty kind still serializes as `chest`. No HTTP, OpenAPI or proto
   change.
3. **Spawn share.** Wherever a chest is placed (the run floor's container in `buildFloor` →
   `CreateContainer`, and each Forest clearing chest in the field build), the spawn draws once
   against `SackShare` and places a sack instead of a chest when it hits (D6). The placement
   position, keep-out area and closed/unopened state are the chest's.
4. **Per-kind roll.** A placed container rolls its contents on first open through a per-kind roll:
   first the kind's **empty chance** (hit: no items), else a count uniform in the kind's
   **count range**, split across weapon/armor/consumable exactly as today (D1).
5. **Kind values.** The chest's are empty chance 0 and count 2–4 (today's behaviour,
   unchanged). The sack's are empty chance 0.8 and count 1–1. All are named constants in
   `loot_tuning.go`, never literals in the roll.
6. **Sack odds stay below chest odds.** The sack's expected item count stays strictly below
   the chest's for any values set. A test pins this ordering, not the numbers.
7. **Field roll.** A field sack rolls like a field chest: the item level comes from the field's
   band, the per-kind roll runs, then each item is kept at the place's `DropFactor`
   (FS-X2F2H R32, FS-3QHQZ R19).
8. **Item level and source.** A sack's drop is the chest's drop (`chestDropAt`: a standard source,
   never a ring).
9. **Opening.** A sack opens, and is taken from, exactly as a chest is: one roll on first open,
   `IsOpen` stays true, and anyone may take from it. An empty roll still marks the container
   opened, with an empty item list (D9).
10. **Restock.** A field sack restocks on the field chest's delay and rule (D5).
    `restockFieldChests` treats a sack as a chest. A run's sacks never restock.
11. **Drop piles unchanged.** A drop pile's contents and lifecycle are untouched.

### Client (game-client)

12. **Kind type.** `ContainerKind` is `"chest" | "sack" | "drop_pile"`. A kind the client doesn't
    know draws and opens as a chest (D2).
13. **Sack on the floor.** A sack draws with the sack prop, closed or open from `is_open` on every
    state (D3), in the run (`BarrowspireScene`) and in field worlds (`fieldPiles`). It is reached,
    opened and taken from exactly as a chest is, including the field's open-on-state window
    (`CHEST_OPEN_WINDOW_MS`).
14. **Sacks count as interactables.** Wherever the client treats a chest as a placed interactable
    (light pooling, run and Forest dressing keep-outs), a sack counts as well.
15. **One view, three faces.** The container view picks its face by the opened container's kind:
    - chest → **coffer**: a square open box seen from the front, slightly above (D4), with the
      items inside. It pops in with no lid or opening animation.
    - sack → **satchel**: today's view, flap animation unchanged.
    - drop pile → **bone heap**: a heap of bones with the items lying on top. It pops in with no
      opening animation.
16. **Identical behaviour across faces.** Every face keeps the satchel's triggers, close rules,
    item slots and footprint (D8), hover tips (`itemTip`), "Requires level N" marking, bag-full
    pre-check (`mayTake`), `lootMessage` and pending guard. "Rummaging..." and "(Picked clean)"
    show in every face (D9).
17. **Art is code-built.** The sack prop is baked in `tools/bake` with `closed` / `open` states,
    plus a code placeholder until the bake lands. The coffer and bone-heap faces are drawn in code
    beside the satchel's textures. Nothing is sourced (ADR-0020/0021). The look is gated on the
    contact sheet (D10).
18. **Design guideline.** `game-client/docs/design-guideline.md` is amended. The "World-object UI"
    container-view entry names all three faces and their rules (only the satchel animates). The
    props list adds the sack (closed/open).

## User Stories

1. As a delver, I want some floors to hold a sack instead of a chest, so that finds vary.
2. As a delver, I want a sack to look like a sack on the floor, so that I can tell it from a chest at a glance.
3. As a delver, I want sacks to hold less than chests, so that a chest stays the better find.
4. As a delver, I want to open a sack the same way I open a chest, so that there's nothing new to learn.
5. As a delver, I want an opened chest to show a plain open box facing me, so that it reads as a chest's contents.
6. As a delver, I want the chest's box to appear without a lid animation, so that looting a chest is instant.
7. As a delver, I want an opened sack to show the leather satchel with its flap lifting, so that a sack feels like rummaging in a bag.
8. As a delver, I want a slain monster's remains to open into a bone heap with the items on top, so that a kill's loot looks like it came off the body.
9. As a delver, I want the bone heap to appear without animation, so that grabbing a kill's drop is quick.
10. As a delver, I want hover tips, level marking and click-to-take to work the same in every view, so that I never relearn looting.
11. As a delver, I want an empty container to open and say "(Picked clean)", so that I know it was empty rather than that my open failed.
12. As a delver, I want an opened sack to stay on the floor drawn open, so that I can see it's been searched.
13. As a delver in the Forest, I want clearings to sometimes hold sacks, so that fields vary like runs do.
14. As a delver in the Forest, I want a sack to restock like a chest, so that the clearing is worth revisiting later.
15. As a party member, I want anyone to be able to take from a sack, so that sacks share like chests.
16. As a delver with a full bag, I want the bag-full refusal in every view, so that I'm never told something different per container.
17. As a game designer, I want the sack share and each kind's empty chance and count as named constants, so that I can tune scarcity without touching the roll.
18. As a game designer, I want chests to roll exactly as before until I retune them, so that this feature changes nothing it doesn't mean to.
19. As a game designer, I want a test that pins sack odds below chest odds, so that retuning can't invert them.
20. As a game designer, I want the weapon/armor/consumable split untouched, so that my item-type ratios hold.
21. As the client, I want an unknown container kind to fall back to a chest, so that a newer server never breaks an older client's world.
22. As an art reviewer, I want the sack prop and the coffer and bone-heap faces on a contact sheet, so that I approve the look before it's final.
23. As a future reader, I want the design guideline to name the three faces, so that a later art pass keeps them distinct.

## Acceptance Criteria

- [ ] `containers[].kind` can be `"sack"`. Chest and drop pile serialize unchanged.
- [ ] A run floor's container is a sack at `SackShare` (statistical test with an injected rand), else a chest.
- [ ] Each Forest clearing chest point holds a sack at `SackShare`, else a chest. The guaranteed container can be either.
- [ ] A chest rolls 2–4 items exactly as before (an existing-behaviour test stays green).
- [ ] A sack rolls empty at 0.8, else exactly 1 item, with the 0.2/0.3/0.5 split.
- [ ] A test asserts the sack's expected count is below the chest's, from the constants.
- [ ] A field sack keeps each rolled item at the place's `DropFactor`.
- [ ] An empty roll leaves the container opened with an empty item list.
- [ ] A field sack restocks after `ChestRestockDelay`. A run sack never restocks.
- [ ] The client draws a sack (closed/open by `is_open`) in a run and in a field world, and opens it into the satchel with the flap animation.
- [ ] A chest opens into the coffer with no opening animation. A drop pile opens into the bone heap with no opening animation.
- [ ] In all three faces: the hover tip, level mark, bag-full pre-check, loot message, pending guard, "Rummaging..." and "(Picked clean)" behave as the satchel's do (tests on the Phaser-free rules).
- [ ] An unknown kind draws and opens as a chest.
- [ ] Sacks count as interactables for light pooling and dressing keep-outs.
- [ ] The sack prop is in the bake catalogue (`closed` / `open`) with a code placeholder.
- [ ] A contact sheet of the sack prop and the coffer and bone-heap faces is produced for Kranti's approval.
- [ ] The design guideline names the three faces and adds the sack prop.

## Edge States

- **Empty container:** opens, shows "(Picked clean)". A chest or sack stays drawn open, and an
  emptied drop pile stops drawing (as today, FS-4R9M9 R46).
- **Sack restocks while its view is open (field):** behaves as a restocking chest does today in
  `fieldPiles`. The open-window rule holds, and a shut state seen after an open closes the view.
- **Refused open** (out of reach, interact cooldown): nothing opens, for a sack as for a chest.
- **Concurrent takers:** unchanged. The server's take is authoritative, and the pending guard is
  per item.
- **Unknown kind from a newer server:** drawn and opened as a chest (D2).
- **Boss pile with 2–3 items:** fits the bone heap's slots, which are the satchel's (D8).
- **Floor change while a view is open:** closes as today. The view's face is chosen per open, so
  nothing carries over.
- **Bake not landed yet:** the sack draws with its code placeholder. Nothing blocks on the bake.

## Out of Scope

- The chest's own empty chance and count cut, every monster drop chance, the boss, the Forest
  spawn rate and the Forest guarantee (I-UNANCHORED-2/3).
- Boss-only Fabled (I-UNANCHORED-4).
- Seeding drop piles at floor build. Piles stay kill-drops only.
- Any change to looting rules, slots, tooltips or the take message.
- Sacks in the hub, and Meadows chests (it has none).
- HTTP endpoints, OpenAPI, the generated client, protos, DB migrations.
- A lid animation for the coffer, or any animation for the bone heap.

## Change: The container view closes when its player is hit
Status: work-order
Date: 2026-11-11

Owner decision (Nick, 2026-11-11: "開啟箱子時被攻擊可以自動關閉箱子嗎", decisions approved "好"). Written
`--from-thread`: the thread is the owner's locked decisions, so no interview was held. It lands
here because R16 is what changes: the view's close rules, the same in every face, are this FS's.
[FS-MQYEX](MQYEX-timed-container-opening.md) owns the act of opening a shut container and is not
changed; its D4 reading of "a hit" is borrowed.

Locked (owner):

- **L1.** While a container view is open in a run (the coffer, the satchel or the bone heap), a
  hit that costs the local player health closes it.
- **L2.** A hit is health actually lost. A parried strike that costs nothing closes nothing, and
  neither does a heal. Damage over time closes the view each time it costs health.
- **L3.** No notice is shown. E on the container opens its view again at once: the container is
  already open, so there is no timed open.
- **L4.** Only the container view closes. The gear and bag overlay and every other window stay
  as they are.
- **L5.** Client only. The server keeps no view state and is not changed.

Derived here (the owner was silent; each overridable):

- **E1: run worlds only.** A field world's container view is unchanged. *Reason:* the owner spoke
  of the tower's chests, and a field's deaths cost nothing; the smaller reading.
- **E2: the client reads the hit from its own health in two states in a row**, the reading the
  hurt flash already makes, and keeps one record of it. *Reason:* the state carries no hit
  event, every landed hit costs at least 1 health (FS-MQYEX D4), and the state comes every tick.
- **E3: health that fell only to the new max health in the same state is not a hit.** A hit is
  health below both the health before and the max health now.
  *Reason:* taking off gear that raised max health clamps health to the new maximum and lowers it
  no further (the server's gear system); the player did that in the gear overlay, beside the open
  view. Health under the new maximum was lost to something else.
- **E4: the hit is judged before the state's containers are read.** A view the same state opens
  for a pending reach was not open when the hit landed, and stays. *Reason:* FS-MQYEX R26 reads
  the open container first; that flow is left exactly as it is.

### Requirements

19. **A hit closes the view.** In a run, when a state has the local player's `current_health`
    lower than the state before it had, and the view is open, the view closes, whichever face it
    wears. Nothing is sent and no notice, sound or effect is added.
20. **Only health lost to a hit.** A state with the health the same or higher closes nothing: a
    parried strike, a heal, a potion. A state in which health fell only to the new
    `max_health` closes nothing (E3); one in which it fell below it does.
21. **Each time.** Every state that costs health closes an open view, so a view opened again
    under damage over time closes on the next state that costs health.
22. **Two states of one start.** The first state after the scene starts is compared with nothing
    and closes nothing: joining, and a reconnect mid-run (a restart of the scene), whatever the
    health in it.
23. **Opening again.** E on the container opens its view at once, as for any open container
    (FS-MQYEX R21). Nothing blocks or delays it after a hit.
24. **Nothing else closes or changes.** The gear and bag overlay, the menu, chat and the party
    panel are untouched. A pending reach, the open bar and a running timed open are untouched:
    the server cancels the timed open and the client follows it through `timed_open` going
    absent (FS-MQYEX R23, R26). The view's other close rules (walking out of reach, the container
    gone, a floor change, Q, E) are as they are. A view that is not open is not closed again.
25. **Run only.** Field worlds and the hub are unchanged (E1). The server is unchanged.

### Acceptance Criteria

Client (`npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client`), each through the run
scene's state handling:

- [ ] With the view open, a state with the player's health lower closes it, for a chest, a sack and a drop pile; no notice is raised and nothing is sent.
- [ ] A state with the health unchanged (a parried strike), and one with it higher (a heal), leave the view open.
- [ ] After a hit closed it, E opens the view at once; the next state that costs health closes it again, and one that costs none leaves it open.
- [ ] The first state of a start, with the health below max health, leaves an open view open; so does the first state after the scene restarts with the health lower than the last state before it.
- [ ] A floor change with the health lower closes the view once, as a floor change does; a view opened on the new floor stays open through a state with that same health.
- [ ] A state in which health fell to the new `max_health` (100/100 → 80/80) leaves the view open; one in which it fell below it closes it, also below full health (60/100 → 50/80).
- [ ] With no view open, a state that costs health closes nothing: also when the hit kills the player, and when the state has the player escaped or carries no `current_player`.
- [ ] A hit during a timed open leaves the open bar and the pending reach as the state has them: the bar stays while `timed_open` is sent and the view opens when the container does; with `timed_open` gone and the container shut the reach is given up as before.
- [ ] A hit with the gear and bag overlay up leaves the overlay as it is.
- [ ] `FieldScene` is not changed.

Live check (one browser, one run): opening a coffer beside a monster, the first hit that costs
health closes it with no notice, and E opens it again at once.

### Edge States

- **The hit kills the player.** The view closes on that state like any hit. Nothing else is done.
- **The player is dead, escaped or watching a teammate.** Their own health no longer falls;
  nothing closes. Another player's health is never read.
- **A state without `current_player`, or without `current_health`.** Nothing is judged and the
  last health seen is kept for the next state that has one.
- **A hit and a gear change in one state.** Health is below both the health before and the new
  max health: a hit (R20, E3), also when health was under the old max and fell by less than max
  health did (60/100 → 50/80).
- **A hit on the state that opens the view** (a teammate finished the container on the tick the
  player was hit). The view opens and stays; the next hit closes it (E4).
- **The view is open on one container while the player reaches for another.** The hit closes the
  view; the reach and its timed open go on as the states say (R24).
- **A dropped frame.** The next state is compared with the last one seen: health lost meanwhile
  closes the view one state late.
- **Health lost to something that is not a strike** (Fall where you stand). Health fell: the view
  closes. The player is out of play either way.

### Out of Scope

- Field worlds and the hub (E1); any server change; a view state on the server.
- A notice, sound, shake or animation when the view closes; a delay or lockout before E opens it
  again.
- Closing the gear and bag overlay, the menu or any other window on a hit.
- The hurt flash, which keeps its own reading of the same record.
- FS-MQYEX: the timed open, its cancel causes and the reach.

## Change: The container view closes when its player moves
Status: work-order
Date: 2026-11-24

Owner decision (Nick, 2026-11-24: "開寶箱後只要移動一步就要自動關寶箱"; the locked decisions
approved "核准"). Written `--from-thread` under a charter run: the thread is the approved
decisions, so no interview was held. It lands here because R16 is what changes: the view's close
rules, the same in every face, are this FS's. [FS-MQYEX](MQYEX-timed-container-opening.md) owns
the act of opening a shut container, its reach and that reach's own move rule (R26, D13), and is
not changed. The model is § Change: The container view closes when its player is hit.

Locked (charter defaults, owner-approved; each overridable):

- **A1, charter default: "moves" is the local player's position more than 4 px from where they
  stood when the view opened, whatever moved them** (a walk, a charge, a Blink, a shove).
  *Reason:* a delver walks 200 px/s and the server ticks at 30 Hz, so one tick of walking is about
  7 px and a single step closes the view; 4 px absorbs the server's small corrections.
- **A2, charter default: the baseline is the position at the moment the view actually opens, not
  the E press.** *Reason:* a reach's view opens on a later state than the press; measuring from
  the press is FS-MQYEX D13's stale-state trap.
- **A3, charter default: every world with a container view (runs and fields) and every face
  (coffer, satchel, bone heap, a field's drop pile).** The 60 px rule stays as it is. *Reason:*
  R16 keeps the close rules the same across faces, and the 60 px rule is already universal.
- **A4, charter default: no notice. E opens the view again at once.** *Reason:* the container is
  already open, so there is no timed open.
- **A5, charter default: only the container view closes.** The gear and bag overlay and every
  other window stay as they are. *Reason:* as the hit Change's L4.
- **Bounds:** game-client only, no server or wire change.

Derived here (the defaults are silent; each overridable):

- **M1: the position is read from the states, `current_player.position`, never the drawn body.**
  *Reason:* the run's drawn body eases toward the state's position (0.3 a frame) and trails a
  walking body by about 8 px, still settling after a stop, so it would close a view opened
  standing. A state is what the server moved, and one state of walking is A1's step.
- **M2: the baseline is the own position in the last state seen when the view opens.** For a
  container already open, E opens the view at once (FS-MQYEX R21), so that is the state held at
  the press. For a reach it is the state that shows the container open, the state that opens the
  view. In a field, a pile's view opens at the press and a chest's on the state that shows it
  open (`FieldPiles`), each the same way. *Reason:* A2: each is where the body last stood, as the
  client knows it, at the moment the view opens.
- **M3: judged on each state, against a view open before it, by straight-line distance in world
  px, strictly more than 4.** A view a state opens takes that state's position, so it never
  closes on the state that opened it. *Reason:* states are where positions come from (M1), and
  the hit rule is judged the same way, once per state.
- **M4: a state with no own position judges nothing and keeps the baseline.** A view opened with
  no position seen yet takes its baseline from the next state that has one. *Reason:* the smaller
  rule, as the hit Change keeps the last health seen.

### Requirements

26. **A move closes the view.** In a run or a field world, when a state has the local player's
    `current_player.position` more than 4 px, straight line in world px, from the view's
    baseline, and the view is open, it closes, whichever face it wears. Nothing is sent and no
    notice, sound or effect is added (A1, A4).
27. **The baseline.** Each open takes its own: the own position in the last state seen when the
    view opens (M2). A view opened again takes a new one.
28. **Whatever moved them.** A walk, a charge, a Blink placed at once, a knock-back, a crowd push
    or a wall push-out all count. The client asks only where the state has the body (A1).
29. **Within 4 px nothing closes.** A state 4 px or less from the baseline leaves the view open.
    The distance is always from the baseline, never from the state before, so drift that adds up
    past 4 px closes it.
30. **Opening again.** E on the container opens its view at once, as for any open container
    (FS-MQYEX R21), with a new baseline. Nothing blocks or delays it after a move (A4).
31. **Nothing else closes or changes.** The gear and bag overlay, the menu, chat and the party
    panel are untouched (A5). A pending reach, the open bar and a running timed open are
    untouched: FS-MQYEX R26 keeps judging the reach by its own rule. The view's other close rules
    (60 px from the container, the container gone, a floor change, a hit in a run, Q, E) are as
    they are. A view that is not open is not closed again.
32. **Every world, every face, one rule.** Runs (`BarrowspireScene`) and field worlds
    (`FieldPiles`) close by the same Phaser-free rule (A3). The hub has no container view and is
    unchanged.
33. **Client only.** The server, the wire and the generated client are unchanged.

### Acceptance Criteria

Client (`npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client`). Run criteria go
through the run scene's state handling, field criteria through `FieldPiles`:

- [ ] Run: with the view open on a chest, a sack and a drop pile, a state with the own position 5 px from the baseline closes it; no notice is raised and nothing is sent.
- [ ] Run: a state exactly 4 px from the baseline leaves the view open; states 2 px apart in one direction close it on the first past 4 px.
- [ ] Run: a view E opens on an already-open container takes the position in the state held at the press; a view a reach's state opens takes that state's position and stays open on it, also when that position is more than 4 px from the one held at the press.
- [ ] Run: a state that places the body at once (a Blink) and states of a charge close the view.
- [ ] Run: the drawn body still easing toward the state's position, with no new state, leaves the view open.
- [ ] Run: after a move closed it, E opens the view at once; a state at the same position leaves it open, and the next state more than 4 px from that position closes it.
- [ ] Run: a state with no `current_player` (escaped) closes nothing and keeps the baseline.
- [ ] Run: with the gear and bag overlay up, a move closes the view and leaves the overlay as it is.
- [ ] Run: with no view open, a move during a pending reach or a timed open leaves the reach and the open bar to FS-MQYEX R26 exactly as before.
- [ ] Run: the 60 px close and the hit close keep their tests green.
- [ ] Field: a drop pile's view, opened at the press, closes on a state 5 px from the press position and stays on one 4 px from it.
- [ ] Field: a chest's or sack's view, opened on the state that shows it open, takes that state's position; a later state more than 4 px from it closes it, and a `PILE_REACH` or restock close behaves as before.
- [ ] Field: after a move closed it, E opens the view again at once, with a new baseline.
- [ ] `game-server/` is not changed.

Live check (owner, one browser): in a run, opening a coffer and taking one step closes it with no
notice, E opens it again at once, and standing still keeps it open; in a field, a Forest clearing
chest and a field drop pile do the same.

### Edge States

- **E pressed while still walking.** The next state has the body farther on: the view closes.
  E opens it again once the player stands.
- **E pressed within a round trip of letting go of the keys** (open question for the owner). The
  server walks the body until the client's stop reaches it, so the state held at the press can be
  a stride behind where the body stops. The next state may land more than 4 px on and close a
  view opened standing; E opens it again. A2 does away with this for a reach, whose view opens on
  a later state, but not for a container already open, whose view opens at the press.
- **Pushed while looting** (a monster's knock-back, a crowd push, a wall push-out). Moved: the
  view closes.
- **Hit and moved in one state** (run). The view closes once.
- **The player dies with the view open.** The killing hit closes it (the hit Change). The body
  no longer moves, so nothing closes it again.
- **Watching a teammate.** Only the own position is read, never the watched player's.
- **Floor change.** The view closes as a floor change does; the new floor's position is never
  compared with the old baseline.
- **A dropped frame.** The next state is compared with the baseline: a move meanwhile closes the
  view one state late.
- **A reconnect.** The scene restarts with no view open; nothing carries over.
- **A field chest restocks while its view is open.** Closes as today (`FieldPiles`).

### Out of Scope

- Closing an open view when the player attacks. An attack that moves the body (a charge, a
  Blink) closes it by moving; one that stands still does not.
- Any server, wire or generated-client change.
- A notice, sound or effect on the close; a delay or lockout before E opens it again.
- Closing the gear and bag overlay, the menu or any other window on a move.
- The 60 px rule's distance, the hit rule, and FS-MQYEX's reach and timed open.
- The hub.
