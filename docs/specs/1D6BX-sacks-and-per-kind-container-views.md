# FS-1D6BX: Sacks and per-kind container views

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Sacks as a floor container alongside chests"; `game-client/SPECIFICATION.md` "### Presentation" → "Distinct look per container kind" → this FS · Brownfield: retrofits [FS-2325V](2325V-pre-rendered-isometric-art.md) §D (container-open presentation: the satchel) and the FS-none "Container loot drops from the template pool" (both stay `[x]`) · Interacts with: [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (chest drop, drop piles R46/R61), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (field container roll R32, field piles R56–60), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (Forest clearing chests and restock R19) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art is built in code, never sourced) · Sibling tuning (not this FS): `docs/issues/I-UNANCHORED-2-containers-can-roll-empty.md` (absorbed in part, see D1), `docs/issues/I-UNANCHORED-3-loot-scarcity-tuning.md`, `docs/issues/I-UNANCHORED-4-fabled-drops-only-from-the-boss.md` · Vocabulary: game-service and game-client `CONTEXT.md` (*sack*, *coffer*, *satchel*, *bone heap*, *container view*)

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
