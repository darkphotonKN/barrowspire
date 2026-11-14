# ADR-0071 — The blood demon's art is its own atlas group, fetched on demand when one first appears; the `boss` group keeps the green demon

Status: accepted
Amended by: ADR-0081 — Decision 2 (a Spire variant group is also fetched when a floor map's pool names it) and Decision 4 (a Spire variant group is evicted by a floor map whose pool does not name it); the blood demon's group is unchanged.
Date: 2026-11-08
Scope: `game-client` only: which atlas group the blood demon's sheet is packed in
(`tools/bake/page/characters/cast.js`), and when the client loads it (`src/render/art/`, the
monster roster). Not the server, the wire, or any other sheet's art.
Specified by [FS-VHGE7](../specs/VHGE7-blood-demon-and-demon-fire-claw.md) (amended 2026-11-08,
A1, §F).
Amends: [ADR-0059](0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md)
Decision 2 ("whole, at entry, never on demand while it runs") and Decision 6 (a sheet outside its
scene's table entry draws as the placeholder), for a group the table names as on demand. Its
Decisions 1, 3, 4 and 5 stand unchanged: the on-demand group is scene-scoped, is evicted with its
animations once the next scene has loaded, and no frame of it outlives its scene.
Builds on: [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md)
Consequences ("texture memory and atlas packing need budgeting"), [FS-C4JWH](../specs/C4JWH-scene-scoped-art-loading.md)
(the scene art table, eviction, the measured figures)

## Context

Kranti's decision on 2026-11-08, after the review of FS-VHGE7's bake slice (I-VHGE7-6): "load the
blood demon's art on demand". Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **The `boss` group grew 2.6x.** FS-VHGE7 §E packed the blood demon's sheet into `boss` beside the
  green demon's, and gave both a `claw` clip. Decoded (width × height × 4, from
  `public/art/manifest.json`; FS-C4JWH's headless measurement matched the manifest's arithmetic to
  0.1 MB): `boss` went from 122.7 MB on 2 pages to 323.6 MB on 6. The blood demon's 264 frames are
  454 × 356 px, the green demon's 398 × 317.
- **The run now holds more than the whole game used to.** The run loads `creatures` and `boss` at
  entry, for every floor (ADR-0059 Decision 2, FS-C4JWH §B R9): 200.0 MB resident + 53.5 creatures
  + 323.6 boss = 577.1 MB, against the 376.5 MB FS-C4JWH measured and above the 473.1 MB
  load-everything figure that FS-C4JWH was written to get away from.
- **Most runs never show it.** The blood demon rolls 2 %, 5 % and 10 % on floors 1–3 (FS-VHGE7
  §A R6): about 16 % of runs meet one. The green demon is on every top floor.
- **ADR-0059 deferred exactly this.** Its Consequences: "The boss loads with every run … Loading it
  on demand would need the animator to re-decide `baked` when art arrives; deferred until a 2x boss
  makes it worth it." No boss is 2x, but the second sheet costs more than a 2x would have, so the
  condition is met in substance.
- **A sheet's look is fixed when its animator is built.** `CharacterAnimator` decides `baked` at
  construction (`character.ts:195`), so art that arrives after a creature is first drawn needs its
  animator rebuilt; and a sheet with a page missing draws `PLACEHOLDER_TEXTURE` (FS-C4JWH §E R20).
- **The client already has a look that needs no download.** The green demon's sheet is on `boss`,
  loaded with the run; FS-VHGE7 R27 drew the blood demon as that sheet under an oxblood-family tint
  before its own was baked.
- **The client learns of a blood demon only from the game state.** Nothing tells it ahead; on an
  open floor every monster is sent, on a dungeon floor only those within the 1600 px interest radius
  (`state_serializer.go:643`, FS-KE075 §G).

## Decision

1. **The blood demon's sheet is its own atlas group.** `creature_blood_demon_base` is packed in a
   group of its own, outside `boss`; the `boss` group keeps the green demon, its `claw` clip
   included. The group is set where every group is, on the sheet's cast entry; the bake and the
   manifest's format do not change.
2. **That group is scene-scoped and on demand.** No scene's `preload()` queues it, and boot does not
   load it. A scene that draws monsters queues its pages, on its own loader while it runs, the first
   time a game-state snapshot lists a `blood_demon`, whether or not that monster is in sight. Nothing
   new comes from the server. The scene art table (`sceneArt.ts`) names the group as on demand,
   with the archetype that fetches it and the stand-in it draws meanwhile, so the on-demand groups
   are read and tested in the same one place as the preloaded ones (ADR-0059 Decision 2's table).
3. **Until the group is in, the blood demon draws a named stand-in, never the placeholder and never
   nothing.** The stand-in is `creature_demon_base` under a tint from the canvas palette, on a group
   the scene already holds. When every page has landed and its frames are registered, each blood
   demon drawn is re-dressed on its own sprite, with a new animator for its own sheet, between one
   frame and the next: it is never removed, hidden or drawn without a texture. A drawing of the
   stand-in is the look, not a miss, and logs no placeholder warning.
4. **Eviction is ADR-0059's, unchanged.** The group is scene-scoped and in no scene's preload set,
   so the next scene's completed preload evicts its pages, animations first. Leaving the run frees
   it; climbing a floor keeps it.
5. **An on-demand download is called off with its scene and never blocks it.** A scene stopped while
   the pages download calls them off as it does its preload's, so none lands on the next scene. A
   page that fails leaves the stand-in for the rest of that scene, with one warning, and no retry
   until a later scene sights one again. No bar or fade shows for an on-demand load.
6. **Another sheet may go on demand by a table change.** It needs the same three things: a group of
   its own, a stand-in on a group its scenes hold, and a table entry naming it on demand. That needs
   no new ADR. Changing what triggers a fetch, or letting a sheet draw nothing or the placeholder
   while it loads, does.

## Consequences

- **A run without a blood demon holds about 397 MB, not 577.** Estimates from a dry run of the
  bake's packer (`tools/bake/lib/pack.mjs`) on today's two sheets, which reproduces today's six
  `boss` pages exactly: `boss` 143.2 MB on 3 pages (the green demon was 122.7 before its claw
  clip), the blood demon's group 172.8 MB on 4. The run is 396.7 MB until a blood demon appears.
  FS-VHGE7 § Amendment A1 records these and the re-measure.
- **A floor with a blood demon still holds about 570 MB** (569.5 estimated), above 473 MB, for the
  rest of that run. Accepted: it is about one run in six, and the alternative is paying it on every
  floor of every run. A 2x boss, or a third on-demand boss in the same run, would need this
  budget looked at again.
- **The blood demon can be seen as the stand-in.** For as long as its pages download (about
  173 MB decoded; PNG bytes are far fewer, and a second meeting usually comes from the browser's
  HTTP cache), it is the green demon under an oxblood wash. On an open floor the fetch starts as
  the floor's first snapshot arrives; on a dungeon floor when it comes within 1600 px, well before
  its 320 px aggro radius. A slow connection may fight a whole blood demon as the stand-in; it is
  still a boss, still named "Blood Demon", only plainer.
- **The download competes with play.** It lands mid-floor, on the game's own loader, while the
  scene runs; texture upload of four large pages may cost a frame or two when they land. Accepted;
  not measured yet.
- **The animator is rebuilt once per blood demon per scene**, the cost ADR-0059 named for
  on-demand loading, paid only on this one look. The roster, not the animator, owns the swap.
- **A transition still briefly holds both scenes' groups** (ADR-0059): run → hub with a blood
  demon met holds its group until the hub's load completes.
- **The coverage test (FS-C4JWH §E R21) learns on-demand groups**: a look on an on-demand group
  passes only with a stand-in on a group its scene holds.
- **Code-review can flag** a blood demon drawn as the placeholder or hidden while it loads, a
  scene preloading the on-demand group, or a download that survives its scene's stop.
- **The green demon stays loaded at entry.** On-demand loading for it, or for any group but this
  one, is not decided here; Decision 6 says how it would be.
