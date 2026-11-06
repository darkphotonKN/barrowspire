# FS-C4JWH: Art loaded per scene, and freed when the next scene does not use it

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Art loaded and freed per scene", "Loading bar on entering a world" → this FS · Related ADRs: ADR-0059 (residency and eviction, to be recorded)

## Scoping notes (raw)

Charter run, stage 2 (spec and slice), 2026-11-06. The decisions below were locked in the charter
and approved by Nick (「核准」), the approval covering this lock. Not challenged (no `challenge-me`
pass). Client only.

The ask: load the art atlases per scene instead of all at boot, and free the ones the next scene
does not use. Today PreloadScene loads every atlas once, 473 MB decoded, and it is kept.

### Facts (verified 2026-11-06; line numbers on local main 6812be5a)

- Who loads art: `preloadArt` (`src/render/art/phaser.ts:90`) queues every atlas not yet a
  texture. PreloadScene.ts:107, MainMenuScene.ts:115 and CharacterCreationScene.ts:81 call
  `preloadMenuArt` (`menuFigure.ts:47-49`); in practice PreloadScene loads everything.
  HubScene.ts:754, FieldScene.ts:209 and BarrowspireScene.ts:1332 call `preloadArt` directly.
- Atlas groups are the manifest keys `<group>-<n>`; boss, creatures, fodder and wildlife have 2
  pages each. Decoded MB (w×h×4): boss 122.7, creatures 53.5, fodder 39.6, wildlife 34.1, folk
  22.9; knight 48.0, mercenary 47.4, archer 45.0, wizard 36.8; the 13 other groups together 23.2
  (tower, architecture, building, forest, props, nature, spire, interior, town, ground, fx, icons,
  containers). Total 473.1.
- Sheets on the scene-scoped groups: folk = folk_quartermaster, folk_resident_skirt,
  folk_resident_trousers, folk_spirewarden; wildlife = creature_boar_base, creature_boar_elite;
  fodder = creature_ghost_base, creature_zombie_base; creatures = creature_ghoul_base,
  creature_troll_base; boss = creature_demon_base.
- All four class sheets are needed in every world scene: other players, rivals, party busts
  (PartyFrames → `partyBustFrame`). Monster sizing reads `char_knight_base`
  (`monsters.ts:50`, `:142`).
- Field id is known before preload: `world_entered.field` → `scene.start` data
  (`PhaserGame.tsx:127-130`); FieldScene reads it in `create` (`FieldScene.ts:212`). Two fields:
  gentle_meadows (wildlife: boar, elite boar), forlorn_forest (fodder: zombie, ghost; plus the
  small forest and tower groups).
- Run: theme is the client constant `"tower"` (`worldTheme.ts:157`), same set groups every floor.
  Monsters ghoul and troll (creatures) and the demon (boss): the demon always on the top floor, 1 %
  on any other floor; the client learns of it only from the game-state broadcast; climbing stays in
  the same scene.
- Transitions: `enterWorld` (`PhaserGame.tsx:117-131`) stops the old world scene, then starts the
  next. World scenes show nothing while they preload; only PreloadScene has the "LIGHTING THE
  TORCH" bar (`PreloadScene.ts:78-103`).
- Missing atlas: `registerArt` (`phaser.ts:117-149`) snapshots the loaded atlases.
  `ArtLibrary.sheet()` returns undefined for a sheet with a missing page, so it draws
  `PLACEHOLDER_TEXTURE` with one log line (`library.ts:100-155`). `CharacterAnimator` decides
  `baked` once, at construction (`character.ts:195`). `registerFrames` skips an animation key that
  already exists (`phaser.ts:192`).
- Phaser 4.2.1 removal: `TextureManager.remove` → `Texture.destroy` → `gl.deleteTexture` frees
  the GPU memory. A sprite still on a removed frame throws on its next render
  (`SubmitterQuad.js:189`, `frame.source.glTexture`). Animations keep pointers to dead frames and
  must be removed with their texture. Cursors are data-URL copies (`cursors.ts`); the React
  ItemIcon reads the PNG through the DOM.
- Scene end seam: `src/scenes/sceneEnd.ts` `onSceneEnd(scene, release(end))`.

### Decisions (charter defaults, approved)

- D1 Resident: the four class sheets and every small group (~23 MB) stay resident, loaded by
  PreloadScene at boot. Why: every scene uses them; splitting the small ones saves little.
- D2 Scene-scoped: folk, wildlife, fodder, creatures, boss. Why: most of the memory.
- D3 Scene → groups beyond resident: hub folk; gentle_meadows wildlife; forlorn_forest fodder; run
  creatures + boss; MainMenu, CharacterCreation resident only. Why: what each draws today.
- D4 Boss loaded with the run at entry, not on demand. Why: on demand would show a placeholder
  until it arrives, since `baked` is decided at construction. Deferred until a 2× boss.
- D5 Eviction: after the new scene's preload completes and before its create builds anything,
  remove the scene-scoped groups the new scene does not need, with their animations. Why: the old
  scene has already stopped, so nothing draws them; re-entering the same scene needs no reload. A
  game destroy frees everything anyway.
- D6 Loading UI: a world scene's preload shows a progress bar in PreloadScene's style, only when
  something actually has to download; otherwise straight in. Why: the canvas is blank today while a
  world scene preloads.
- D7 Download failure: as today, placeholder plus one warning; the game never blocks.
- D8 Mapping: one declarative table in `src/render/art`. No manifest or bake change.
- D9 A sheet outside its scene's table (a dev bug): placeholder plus warning, and a test that walks
  every scene's sheet usage against the table, so it cannot ship.
- D10 ADR (ADR-0059): the residency and eviction rule. Resident vs scene-scoped, evicted at the next scene's
  preload completion, animations removed with their texture, nothing may hold a frame of a
  scene-scoped group across scenes.
- D11 Verification: headless-browser measurement of decoded texture memory per scene, and a
  round trip hub → meadows → hub → forest → hub → run → hub with no errors and no placeholder where
  there was art before.

Estimates (from the manifest, not measured): hub ~220 MB, meadows ~235, forest ~240, run ~375.

### Bounds and out of scope

- game-client only. No server, bake, art or manifest-format change.
- Out: 2× folk or monsters; loading the boss on demand; ASTC compression.

### Open at lock (for write-a-spec)

- How the table's coverage test learns which monsters each scene meets (the server owns spawns).
- Whether a group the table does not name is resident or scene-scoped by default.
- Where the field scene reads its id before preload (Phaser passes the start data to `init`, not
  `preload`).
- registerArt's per-atlas "did not load" warning would fire for every out-of-scene atlas.
