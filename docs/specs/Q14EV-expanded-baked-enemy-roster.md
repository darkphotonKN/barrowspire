# FS-Q14EV: Expanded baked enemy roster

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Expanded baked enemy roster" → this FS · Related ADRs: [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored in code on the shared rig, never sourced; spring-lagged secondary motion; contact-sheet gate), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (build-time bake, 2D at runtime), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from `BARROW` only) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I, "Characters / Enemies" and "Enemy design language" · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Rendering terms" (Bake, Sprite manifest, Marker) · Builds on: [FS-2325V](2325V-pre-rendered-isometric-art.md) §E (shipped: the shared rig, clips, the ghoul and troll reference pair, the contact sheet)

> Promoted `--from-thread` from the coordinator's locked decisions (2026-10-08). The owner was
> unavailable and no question was put to anyone. The decisions converged without adversarial
> review **(not challenged)**. The cost of error is bounded: client bake output only. No scene draws
> these sheets yet, and baked PNGs revert cleanly. Code citations are against `8a5e119`
> (feat/client-prerendered-art).

## Summary

The Spire gets four new hostiles, baked to 8-direction sprite sheets on the same code-authored rig
as the delvers, the ghoul and the troll. Three are undead fodder and brutes: a legless wraith, a
grave-knight revenant, and a skeletal grave-hound that runs on all fours. The fourth is the first
boss, a winged bog-green demon twice a delver's height that roars before it strikes. This FS
produces the art and stops there. No scene spawns or draws these creatures, because the server
spawns no enemies yet. The owner judges each slice on its contact sheet.

## Requirements

### §0. The boundary (binds every section)

1. **No file under `game-server/` changes.** No WebSocket message, REST call or gameplay stat is
   added or changed.
2. **No scene draws the new sheets.** `HubScene`, `BarrowspireScene` and the menus are unchanged.
   Integration waits for a server that spawns enemies (Out of Scope).
3. **Built in code in the bake tool** (ADR-0021): on the shared rig in
   `game-client/tools/bake/page/characters/`, with shaped skinned geometry, procedural textures and
   hand-keyed clips. No third-party model, texture or animation.
4. **Colours from `BARROW` only** (ADR-0013), through `palette.js` (`mix`, `shade`, `normalized`).
   No hex literal appears in any new or changed bake module.
5. **Existing art stays byte-identical.** Every atlas PNG already in `public/art/` keeps its
   `sha256`, and every existing sheet entry in `public/art/manifest.json` keeps its exact contents.
   The manifest only gains entries (§A.3).

### §A. Roster pipeline (binds §B and §C)

1. **Sheets.** Each creature is one sheet named `creature_<name>_base`, and the names are fixed:
   `creature_demon_base`, `creature_wraith_base`, `creature_revenant_base`,
   `creature_gravehound_base`.
2. **Registration.** Each sheet is a `CAST` entry in `characters/cast.js` (or in a sibling module
   whose builders `cast.js` imports into `CAST`), so `characterSheets()` in `catalogue.js` picks
   it up the same way as `creature_ghoul_base`.
3. **New atlas groups, never the existing `creatures` group.** The packer shelf-packs a group
   tallest-first, so adding a sheet to `creatures` would reflow `creatures-0.png` and
   `creatures-1.png` and break §0.5. The demon packs into a new group `boss`. The wraith,
   revenant and grave-hound pack into a new group `bestiary`. Groups pack independently, so
   neither touches any other atlas.
4. **Clips.** Every creature gets 8 directions × `idle`, `walk`, `attack`, `death`, using
   `characters/clips.js` `ANIMATIONS` frame counts and rates unless a creature's own section
   below says otherwise. A creature that overrides a clip carries its own animation specs, as
   folk do with `FOLK_ANIMATIONS`.
5. **Provenance.** Each manifest entry reads `"source": "authored: tools/bake/page/characters/<module>.js#<fn>"`
   and the project's own licence, exactly like `creature_troll_base`.
6. **Size is a threat tier**, measured from the baked manifest's `crown` against the mean `crown`
   of the three delver sheets (`char_knight_base`, `char_archer_base`, `char_wizard_base`):

   | Creature | Tier | `crown` / delver mean |
   |---|---|---|
   | wraith | fodder | 0.85–1.05 |
   | grave-hound | fodder | ≤ 1.0 (it runs low; its back sits well under a delver's head) |
   | revenant | brute | 1.3–1.55 |
   | demon | boss | ≥ 1.8 (aim for about 2.0 at the skull, before horns) |

   The upper bounds leave room for a hood, a helm crest or horns. A revenant is also visibly
   wider than a delver on the contact sheet.
7. **Silhouette breaks the human line** (guideline "Enemy design language"). With colour removed,
   each creature's 1× outline reads "not a delver": the wraith has no legs and trails rags, the
   revenant is lopsided, the hound is on four legs, and the demon has wings, horns, a tail and
   reverse-jointed legs.
8. **Eyes.** Each creature's eyes use the existing `hostileEye` material (`materials.js`, an
   ember red mixed from the oxblood family). They are the creature's only emissive surface. No
   other material on these four sheets sets an emissive colour. That keeps the eyes eligible for
   the marker treatment (drawn above the light-map, FS-2325V §C.9) when a scene integrates these
   creatures. Integration itself is out of scope here. Eyes go dark over the death clip and are
   out by its last frame, so a corpse never reads as a live threat.
9. **Spring-lagged secondary motion** uses the rig's existing `spring` bones and
   `simulateSprings`. Rags, wing membranes and tails lag the body, then settle. They never snap
   to a pose.
10. **Readable wind-up.** Every attack holds a pull-back, raised arm or rear-up long enough to
    read before the strike lands (guideline "Motion tells intent").
11. **Deaths are final and gore-free.** No blood, no spray, no severed parts. Each creature's
    death is specified in its own section.
12. **Deterministic.** Running `npm run bake` twice in a row produces identical bytes. After the
    committed bake, `npm run bake -- --check` exits 0 with no drift.
13. **Manifest coverage test.** `src/render/art/manifest.test.ts` gains assertions over the baked
    manifest. Each of the four sheets exists, has 8 directions, has the four clips, has an
    `authored:` source, sits in its §A.3 group, and meets its §A.6 crown ratio.
14. **Owner review gate (HITL).** Each slice's bake writes the review contact sheets to
    `tools/bake/review/` (`lib/contact.mjs`, gitignored). That means `contact-sheet.png` at 1×
    plus one `contact-<sheet>-2x.png` per sheet, covering every creature in the slice × 8
    directions × each clip. Work stops there until the owner approves. If the owner rejects it,
    the fix is more modelling or animation work in the slice (ADR-0021 Consequences), not a
    change of method.

### §B. The demon boss and the guideline amendment

1. **Guideline amendment first (owner request, 2026-10-08).** Edit
   `game-client/docs/design-guideline.md` "Enemy design language" before the demon is baked:
   - The "Undead and barrow-born only" rule stays the rule for **fodder and brutes**.
   - Add a **boss-tier exception:** infernal beings the Spire summons (demons) may appear, but
     only as bosses.
   - Add a **green-hide clause:** a dark, desaturated hide green is allowed as a body material for
     a boss. Emissives stay ember red. Green is never an emissive and never a marker colour, since
     arcane green means *safe*.
   - State in the text that the owner requested the amendment (2026-10-08).
   - The "Enemies" bullet under "Characters / Enemies" that lists undead themes is adjusted so it
     does not contradict the exception. Nothing else in the guideline changes.
2. **Form.** Horned skull. Membranous bat wings, each on its own bone chain (upper arm, forearm,
   and three or more finger bones), with the membrane skinned between the fingers so it stretches
   and folds without tearing. Digitigrade (reverse-jointed) legs: the rig gains an extra
   lower-leg segment between shin and foot, as a creature variant of `createRig`, so the ankle
   sits high and the leg reads as backward-bent. A tail on a bone chain. Ordinary arms ending in
   clawed hands, separate from the wings.
3. **Size.** Boss tier (§A.6): at least 1.8× a delver, aiming for about 2.0× at the skull.
4. **Hide colour.** A dark, desaturated bog/lich green mixed from `BARROW` tokens, for example
   `arcaneDeep` pulled toward `charcoal`/`barrowDeep` and shaded down. **Never the `arcane` token
   as-is**, and never brighter or more saturated than it. Testable: the hide's base colour has
   lower HSL saturation than `arcane` and lower lightness than `arcaneDeep`. Wing membranes,
   horns, claws and wing bones use darker hide, bone and charcoal blends from the same rule.
5. **Secondary motion.** Wing membranes or the trailing finger bones, plus the tail chain, are
   `spring` bones (§A.9). The tail sways and lags on the walk. The wings lag and settle after
   each wing beat or flare.
6. **Clips.**
   - `idle`: wings half-furled, slow breathing, tail sway.
   - `walk`: a heavy, slow gait on the digitigrade legs, with wings held close.
   - `attack`: **a readable wind-up roar comes first.** The head draws back, the jaw opens and the
     wings flare, held for at least 0.4 s of the clip before the strike starts. Then the strike (a
     clawed swipe or a two-handed slam) and recovery. The demon's `attack` carries its own frame
     count and fps to fit the roar. It is not the 7-frame default. The roar stays inside
     `attack`, so the sheet keeps the same four clips as every other creature.
   - `death`: falls heavily, wings collapsing over or beside the body, eyes going out (§A.8).
7. **A sheet larger than one atlas page.** Every frame of a sheet shares one box, sized to the
   widest pose (here the flared roar). At about 2× height with wings, 8 directions × four clips
   will very likely overflow one 4096² page, and today `pack.mjs` throws on that. If the demon
   overflows:
   - `packAtlases` places an oversized sheet one **animation** per block, on as many pages of the
     sheet's group as needed. Each animation's frames stay on one page.
   - The manifest's `ArtAnimation` gains an optional `atlas`, written only for an animation that
     sits on a page other than the sheet's `atlas`. A sheet that fits one page writes no
     per-animation `atlas`, so §0.5 holds for every existing entry.
   - `validateManifest` (`src/render/art/manifest.ts`) accepts the optional field and rejects it
     when it names an unknown atlas or when a frame falls outside that atlas. `ArtLibrary` and the
     Phaser frame registration (`src/render/art/library.ts`, `phaser.ts`) resolve a frame's
     texture from the animation's `atlas`, falling back to the sheet's. `lib/contact.mjs`'s
     `index.html` reads the same field.
   - These are additive art-library changes with unit tests. No scene changes.

   If the demon fits one page, skip this item and record that in the issue.

### §C. Wraith, revenant, grave-hound, and the quadruped rig variant

1. **Wraith (fodder).** It floats and has no legs: the leg bones carry no mesh, and the body
   hovers with its lower edge clear of the ground. Tattered hooded rags trail from the shoulders
   and hem as ragged panels on `spring` bones (the skirt/cloak builders' `ragged` hem). Long,
   thin reaching arms through `createRig` proportion overrides. Its `walk` is a bobbing glide with
   rags streaming behind, not a stepping gait. Its `attack` draws both arms back, then reaches
   forward. Its `death` **unravels**: the rags slacken and fall away and the form sinks and
   collapses into a heap of cloth. No body is left, just the rag.
2. **Revenant (brute).** An undead grave-knight in rusted plate (the existing plate and rust
   procedural textures, desaturated per the guideline's grave materials, never clean metal), with
   a broken, gapped helm. It is asymmetric: one arm heavier and lower, gripping a notched blade
   whose tip drags along the ground on `walk`. Its `walk` is heavy and slow. Its `attack` heaves
   the blade up and back (the wind-up) before a downward cleave. Its `death` **topples with
   weight**: a stagger, then a fall that lands hard, with the blade dropping.
3. **Quadruped rig variant.** The grave-hound needs a four-legged variant of the shared rig. It
   stays within ADR-0021 §1, which allows creature variants that change proportions and add
   bones: it is built with `createRig` overrides plus added bones, keeps the rig's bone-naming
   and `applyPose`/`simulateSprings`/baker path, and adds no second skeleton system.
   - The spine runs horizontal. The forelimb chain carries the forelegs and the hind-limb chain
     carries the hind legs. Hind legs are digitigrade (the §B.2 extra segment is reused). A neck,
     a jaw bone and a tail chain are added.
   - The quadruped has its **own walk cycle**, not `walkCycle()`: a 4-beat lateral-sequence walk
     (left hind, left fore, right hind, right fore), each foot planted in turn, over the walk
     clip's frames.
   - The forelimb rest pose points down at the ground. A test or contact-sheet check confirms no
     leg crosses through the body in any of the 8 facings.
4. **Grave-hound (fodder).** A skeletal hound: bare ribcage and spine, long skull with a jaw,
   bone legs, a thin bony tail on `spring` bones. Low and fast. Its `walk` uses a higher stride
   rate than a delver's (its own `walk` fps or frame spacing), so on the contact sheet it reads
   fast and low. Its `attack` crouches back on the haunches (the wind-up), then lunges with the
   jaw open. Its `death` **scatters its bones**: the frame gives way and the skull, ribs and leg
   bones fall apart and spread on the ground.

## User Stories

1. As the owner, I want a boss that clearly outclasses fodder and brutes at a glance, so that a
   delver knows when the run has escalated.
2. As the owner, I want the boss to be an infernal demon summoned by the Spire, so that the
   Spire's power reads as something beyond the barrow dead.
3. As the owner, I want the guideline to state the boss-tier and green-hide exceptions in my
   name, so that future creature work does not take the demon as licence for demon fodder.
4. As a delver, I want to see the demon roar before it strikes, so that I can read the attack
   and react instead of being hit unseen.
5. As a delver, I want the demon's eyes to glow the same ember red as every hostile's, so that
   the danger channel stays consistent even on a green-hided boss.
6. As a delver, I want never to see green glowing on a hostile, so that green keeps meaning
   *safe*.
7. As a delver, I want the wraith to float with trailing rags and no legs, so that I tell it from
   a delver in one glance even at the canvas edge.
8. As a delver, I want the revenant to be bigger, wider and lopsided with a dragging blade, so
   that I recognise a brute before I read any name plate.
9. As a delver, I want the grave-hound to come in low and fast on four legs, so that it reads as
   a different kind of threat from the walking dead.
10. As a delver, I want every creature to face the way it moves in all 8 directions, so that its
    approach and intent are readable.
11. As a delver, I want each creature's death to be distinct (unravel, scatter, topple, collapse),
    so that I know it is finished and which one fell.
12. As a delver, I want deaths without gore, so that the barrow keeps its dead quietly, as the
    guideline sets out.
13. As a delver, I want the creatures' eyes to stay readable in the dark, so that a threat in
    shadow is still visible. (This is met when integration draws eyes as markers. This FS
    reserves eyes as the only emissive part.)
14. As the owner, I want a contact sheet of every new creature × 8 directions × each clip at 1×
    and 2×, so that I can approve or reject the art before anything depends on it.
15. As the owner, I want each slice to stop at my contact-sheet review, so that a rejected look
    is fixed before the next creature builds on it.
16. As a client developer, I want the new sheets in their own atlas groups, so that existing
    atlases stay byte-identical and a later scene can load bosses separately.
17. As a client developer, I want manifest tests that pin each new sheet's clips, directions,
    provenance and size tier, so that a later bake cannot silently drop or shrink a creature.
18. As a client developer, I want the bake to stay deterministic, so that `bake --check` keeps
    guarding the committed art.
19. As a client developer, I want a quadruped variant of the shared rig rather than a second
    skeleton system, so that future beasts reuse one pose, spring and bake path.
20. As a client developer, I want an oversized sheet to spill across atlas pages by animation
    with an optional manifest field, so that a boss can exceed one page without changing any
    existing entry.
21. As a client developer, I want every colour mixed from `BARROW` tokens, so that the fence
    (ADR-0013) holds and the art stays on one ramp.
22. As the server developer, I want this work to touch nothing under `game-server/`, so that the
    backend learning surface is untouched.
23. As a future integrator, I want each creature to carry the standard four clips, so that a
    scene plays moving, idle, attacking and dead without new animation states.

## Acceptance Criteria

- [ ] `game-client/docs/design-guideline.md` "Enemy design language" carries the boss-tier
      exception (demons, bosses only) and the green-hide clause (dark, desaturated body green
      for a boss; emissives ember red; green never emissive or marker), attributed to the
      owner's request of 2026-10-08. The "Enemies" summary bullet does not contradict it.
- [ ] `public/art/manifest.json` has `creature_demon_base` (group `boss`) and
      `creature_wraith_base`, `creature_revenant_base`, `creature_gravehound_base` (group
      `bestiary`). Each has 8 directions and `idle`, `walk`, `attack`, `death`.
- [ ] Each new entry's `source` starts with `authored: tools/bake/page/characters/` and its
      licence is the project's own.
- [ ] Every atlas present before this FS keeps its `sha256`, and every pre-existing sheet entry
      is unchanged. `git diff public/art/manifest.json` shows only additions.
- [ ] Crown ratios meet §A.6, asserted in `manifest.test.ts`.
- [ ] The demon's `attack` opens with a roar wind-up held ≥ 0.4 s before the strike.
- [ ] The demon's hide base colour is less saturated than `arcane` and darker than
      `arcaneDeep`. The `arcane` token is not used unmixed on any of the four sheets.
- [ ] The only emissive material on the four sheets is `hostileEye`, and the eyes are out on
      each death clip's last frame.
- [ ] The grave-hound walks on the quadruped rig variant with a 4-beat lateral-sequence gait.
- [ ] If the demon overflows one atlas page: per-animation `atlas` is packed, validated, resolved
      by the art library and Phaser registration, and unit-tested. Existing entries carry no such
      field.
- [ ] `npm run bake -- --check` exits 0 after the committed bake.
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint` and `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.
- [ ] The owner approved each slice's contact sheet (`tools/bake/review/contact-sheet.png` and
      the per-sheet `-2x.png`s).

## Edge States

- **Oversized sheet.** The demon's flared-wing box overflows one 4096² page. Handled by §B.7.
  The bake must never throw for it, and an animation alone too large for a page still throws
  (a real defect: trim the box or the frames).
- **Atlas reflow.** If a new sheet lands in an existing group, existing PNGs change. Prevented by
  §A.3 and caught by the sha256 acceptance check.
- **Concurrent bake edits.** Both slices, and any other in-flight bake work, write
  `tools/bake/page/catalogue.js` and `public/art/manifest.json`. Slices run in order (slice 2
  after slice 1), and each rebakes from the merged tree, never hand-merging manifest JSON.
- **Unused atlases at load.** The Phaser preloader loads every atlas the manifest lists, so the
  new `boss-*` and `bestiary-*` PNGs download on scene load although nothing draws them yet.
  This is accepted until integration. It costs bandwidth only and nothing draws wrong.
- **A sheet missing at runtime.** No scene asks for these sheets. If a future scene does before
  they are baked, `ArtLibrary` already returns its placeholder (FS-2325V §B.6).
- **Owner rejects a contact sheet.** The slice stays open. Rework the model or clips and rebake.
  Slice 2 does not start on a rejected slice 1.
- **Non-determinism.** Spring simulation and procedural noise must be seeded and
  frame-rate-independent of the host. If `--check` shows drift on an unchanged tree, that is a
  defect in the new module.
- **Wing or limb clipping.** A wing passing through the body or a hound leg crossing the torso
  in some facing is a contact-sheet rejection, not an accepted artefact.
- **Eyes in green.** Any green emissive or green eye is a guideline violation and fails review.

## Out of Scope

- Scene integration: spawning, drawing, animating or targeting these creatures in `HubScene`,
  `BarrowspireScene` or menus, and drawing their eyes as markers above the light-map at runtime.
- Any server change: enemy spawning, AI, stats, loot, or new WebSocket fields.
- Gameplay stats (HP, damage, speed values). Size tiers here are visual only.
- Equipment layering on creatures, alternate skins, and name plates.
- Re-baking or restyling the existing ghoul and troll.
- Demons below boss tier, which the amended guideline forbids.
