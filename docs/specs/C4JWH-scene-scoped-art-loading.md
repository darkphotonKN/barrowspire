# FS-C4JWH: Art loaded per scene, and freed when the next scene does not use it

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Art loaded and freed per scene", "Loading bar on entering a world" → this FS (amended 2026-11-06, A1: the bar's show delay, minimum visible time and fades, and a world's fade-in) · Related ADRs: [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (resident and scene-scoped groups, eviction), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (2x sheets, the memory they cost), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art, "texture memory needs budgeting"), [ADR-0056](../adr/0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md) (scene cameras), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (every object rounded to the backing px; A1.5's fade leaves the camera as it is) · Surface: game-client only (client art code and scenes; no bake, art, manifest or server change)

## Summary

Today the client loads every baked atlas at boot, 473 MB of decoded texture memory, and keeps it
all for the whole game, though no scene draws more than a part of it. After this work, boot loads
only the art every scene shares: the four class sheets and the small set groups, about 200 MB. Each
world adds the creatures and townsfolk it draws: the hub its folk, a field its wildlife or its
dead, a run its creatures and the boss. When the next scene has loaded, the scene-scoped art it
does not use is freed from the GPU with its animations. A world that has something to download
shows the boot screen's torch bar while it does, instead of a blank canvas.

Charter run, 2026-11-06. Nick approved the locked decisions D1–D11 as charter defaults
(「核准」); every requirement below carries the decision it comes from. Where this spec had to
settle something the charter left open, it says so ("derived here") and gives the reason.
Recorded without adversarial review: no `challenge-me` pass.

## Facts this spec rests on

Verified 2026-11-06. Line numbers are on local main 6812be5a. Phaser facts are from the installed
Phaser 4.2.1 source (`game-client/node_modules/phaser/src/`).

- **Who loads art.** `preloadArt` (`src/render/art/phaser.ts:90`) queues the manifest, then every
  atlas it names that is not yet a texture. PreloadScene (`PreloadScene.ts:107`), MainMenuScene
  (`:115`) and CharacterCreationScene (`:81`) call `preloadMenuArt` (`menuFigure.ts:47-49`), which
  calls `preloadArt` unless the manifest is cached, so in practice PreloadScene loads everything.
  HubScene (`:754`), FieldScene (`:209`) and BarrowspireScene (`:1332`) call `preloadArt` directly
  and find it all loaded.
- **Atlas groups** are the manifest's atlas keys `<group>-<n>`. boss, creatures, fodder and
  wildlife have two pages each; every other group one. Decoded size, width × height × 4, from
  `public/art/manifest.json`:

  | Group | MB | Sheets on it |
  |---|---|---|
  | boss | 122.7 | creature_demon_base |
  | creatures | 53.5 | creature_ghoul_base, creature_troll_base |
  | fodder | 39.6 | creature_zombie_base, creature_ghost_base |
  | wildlife | 34.1 | creature_boar_base, creature_boar_elite |
  | folk | 22.9 | folk_quartermaster, folk_resident_skirt, folk_resident_trousers, folk_spirewarden |
  | knight, mercenary, archer, wizard | 48.0, 47.4, 45.0, 36.8 | the class sheets |
  | the 13 others | 23.2 together | tower 5.2, architecture 3.6, building 3.1, forest 2.3, props 2.3, nature 1.6, spire 1.5, interior 1.3, town 1.1, ground 0.5, fx 0.4, icons 0.3, containers 0.0 |
  | all | 473.1 | |

- **Every world scene needs all four class sheets**: other players, rivals and the party busts
  (`PartyFrames` → `partyBustFrame`, `partyFramesLayout.ts:206`) draw any class. Monster sizing
  reads `char_knight_base` (`PLAYER_REFERENCE_SHEET`, `monsters.ts:50`, read at `:142`).
- **Who draws the scene-scoped sheets.** The folk only through `folkLook` (`hubFolk.ts`), imported
  by HubScene alone. The creatures only through `MONSTER_LOOKS` (`monsters.ts:70-88`), drawn by
  the `MonsterRoster` of BarrowspireScene and of the field (`fieldCombat.ts`). The archetype comes
  from the server: game-service's `MonsterArchetype` (`internal/components/monster.go`) spawns
  boar in gentle_meadows (FS-X2F2H §H R61), zombie and ghost in forlorn_forest (FS-3QHQZ §C R29),
  ghoul, troll and the demon in a run. An archetype the client has no look for is drawn as the
  troll (`FALLBACK_LOOK`, `monsters.ts`).
- **The field id is known before preload.** `world_entered.field` goes into `scene.start` data
  (`PhaserGame.tsx:127-130`). Phaser hands that data to `init(data)` and `create(data)`, not to
  `preload()` (`SceneManager.bootScene`: `scene.init.call(scene, settings.data)`, then
  `scene.preload.call(scene)`). FieldScene reads it in `create` today (`FieldScene.ts:212`). Two
  fields: gentle_meadows and forlorn_forest (`fieldLook.ts:133`).
- **The run.** Its theme is the client constant `"tower"` (`RUN_WORLD_THEME`, `worldTheme.ts:157`),
  the same set groups on every floor. The demon is always on the top floor and has a 1 % chance on
  any other; the client learns of it only from the game-state broadcast, and climbing stays in the
  same scene.
- **Transitions.** `enterWorld` (`PhaserGame.tsx:117-131`) stops every other world scene, then
  starts the next. Only one scene runs at a time; the menu scenes start each other with
  `this.scene.start`. A stop destroys the stopped scene's display list (`DisplayList.shutdown`
  destroys every child). A world that arrives during boot is held until the menu stands up
  (`bootGate.ts`), so PreloadScene has finished before any world scene preloads.
- **The loader.** `preload()` runs, then `loader.start()`. With nothing queued, `start` completes at
  once, synchronously, and `create` follows (`LoaderPlugin.start`, `list.size === 0`). Otherwise
  `COMPLETE` fires once every file has finished or failed, and the scene manager's own `COMPLETE`
  listener, added after `preload()` returns, then calls `create` (`SceneManager.bootScene`,
  `loadComplete`), so a `COMPLETE` listener added inside `preload()` runs first. `PROGRESS` reports
  files done over files queued (`updateProgress`), not bytes; `FILE_PROGRESS` reports one file's
  bytes. A scene stopped mid-load has its loader reset and its `create` hook removed
  (`SceneManager.stop`, `LoaderPlugin.shutdown`).
- **World scenes show nothing while they preload.** Only PreloadScene draws a bar: the soot
  backdrop, a torch pool, a stone trough, "LIGHTING THE TORCH" and "THE SPIRE IS WAITING", filled
  from the loader's `progress` (`PreloadScene.ts:26-103`), laid out on the stage by `centreStage`
  (FS-ZAJMH R11).
- **A missing atlas.** `registerArt` (`phaser.ts:117-149`) snapshots which atlases are textures
  and warns once for every manifest atlas that is not. `ArtLibrary.sheet()` returns undefined for a
  sheet with a page missing, so `resolve` draws `PLACEHOLDER_TEXTURE` and warns once per name
  (`library.ts:100-155`). `CharacterAnimator` decides `baked` once, at construction
  (`character.ts:195`). `registerFrames` adds a frame only if its texture lacks it, and skips an
  animation key that already exists (`phaser.ts:192`).
- **Removal in Phaser 4.2.1.** `TextureManager.remove(key)` → `Texture.destroy` → each
  `TextureSource.destroy` → `renderer.deleteTexture(glTexture)`: the GPU memory is freed, and every
  frame of it destroyed. A sprite still on a removed frame throws on its next render
  (`SubmitterQuad.js:189` reads `frame.source.glTexture`). `AnimationManager.remove(key)` deletes
  one animation; nothing removes an animation when its texture goes, so its frames would point at
  a dead texture and `registerFrames` would skip re-creating it.
- **Copies outside the texture manager.** Cursors are data-URL copies (`cursors.ts`). The React
  `ItemIcon` reads the PNG through the DOM. The bust portrait caches only numbers read from a
  frame's pixels, keyed by texture and frame (`bustPortrait.ts:34`), which stay true when the same
  PNG is loaded again.
- **Scene end seam.** `src/scenes/sceneEnd.ts` `onSceneEnd(scene, release(end))`, `end` being
  `"shutdown"` or `"destroy"`.

## Requirements

### A. Which art a scene holds

1. An **atlas group** is a manifest atlas key without its page number. Each group is either a
   **resident group** or a **scene-scoped group** (ADR-0059).
2. The scene-scoped groups are folk, wildlife, fodder, creatures and boss. (D2, charter default:
   they are 272.8 of the 473.1 MB.)
3. Every other group is resident: the four class groups and the 13 small ones, 200.4 MB, loaded
   by PreloadScene at boot and kept for the game. (D1, charter default: every scene draws them, and
   splitting the small ones saves little.) A group the table does not name is resident. (Derived
   here: a group the bake adds later then costs memory, which the measurement shows, and never
   draws as a placeholder by omission.)
4. One declarative table in `src/render/art` names, per scene, the scene-scoped groups it holds
   beyond the resident ones. (D8, charter default: one place to read and to test; no manifest or
   bake change.)

   | Scene | Scene-scoped groups |
   |---|---|
   | MainMenuScene, CharacterCreationScene | none |
   | HubScene | folk |
   | FieldScene, gentle_meadows | wildlife |
   | FieldScene, forlorn_forest | fodder |
   | BarrowspireScene (the run, every floor) | creatures, boss |

   (D3, charter default: it is what each scene draws today.)
5. A field id the table does not know takes gentle_meadows' entry, as FieldScene's look falls back
   to it. (Derived here: the scene already treats an unknown field as gentle_meadows.)

### B. Loading

6. PreloadScene loads the manifest and every resident atlas behind its torch bar, and no
   scene-scoped atlas.
7. Each scene in the table queues, from its `preload()`: the manifest if it is not cached, every
   resident atlas that is not yet a texture, and every atlas page of its own scene-scoped groups
   that is not yet a texture. It queues nothing else.
8. FieldScene takes its field id from its start data before `preload()` runs (`init(data)`), so its
   preload queues that field's groups. (Derived here: Phaser hands start data to `init` and
   `create` only.)
9. The run loads creatures and boss when it is entered, for every floor. Climbing, in the same
   scene, loads nothing. (D4, charter default: loaded on demand, the demon would draw as a
   placeholder until it arrived, since `baked` is decided at construction; deferred until there is
   a 2x boss.)
10. `registerArt` warns once for each atlas the scene expected (resident or its own) that is not a
    texture, as it does today for any atlas. An atlas outside the scene's set is simply not loaded
    and is not warned about. (Derived here: otherwise every scene would warn for every group it
    does not use.)

### C. Eviction

11. After the new scene's preload completes and before its `create` builds anything, every page of
    every scene-scoped group that is a texture and not in the new scene's set is evicted. (D5,
    charter default: the old scene has already stopped, so nothing draws it; re-entering the same
    scene keeps its groups and needs no reload.)
12. Evicting a page removes, first, every animation registered on it (`AnimationManager.remove` for
    each sheet, clip and direction whose frames sit on that page), then the texture
    (`TextureManager.remove`), which frees its GPU memory. (D5, D10.)
13. The menu scenes follow the same rule: entering MainMenuScene or CharacterCreationScene evicts
    every scene-scoped group. (Derived here: one rule for every scene in the table; the menus draw
    only class sheets.)
14. A game destroy (leaving `/game`) frees every texture as Phaser does today; eviction adds
    nothing to it. (D5.)
15. Nothing outside a running scene holds a texture, frame or animation of a scene-scoped group.
    A scene's own sprites go with its display list when it stops. A cache may keep numbers read from
    a frame (the bust portrait's figure bounds), never the frame. (D10, ADR-0059.)
16. A page evicted and later queued again is a fresh texture: `registerFrames` adds its frames and
    animations anew, and the scene draws it as on a first load.

### D. The loading bar

17. A scene in the table whose `preload()` queued anything shows the torch bar while it loads:
    PreloadScene's backdrop, torch pool, trough, bar, "LIGHTING THE TORCH" and "THE SPIRE IS
    WAITING", filled from the loader's `progress`, on the stage as PreloadScene lays it out
    (`centreStage`). When the load completes, the bar and everything drawn with it are destroyed,
    before eviction and before `create`. A scene that queued nothing shows no bar and goes straight
    in. (D6, charter default: the canvas is blank today while a world scene preloads, and a bar
    over a load that takes no time would only flash.) *(Amended 2026-11-06, A1, Nick: 「那你調整看看」.
    The bar shows only over a load still running 300 ms in, stays at least 600 ms, fades in and out
    over 150 ms, and is destroyed after eviction and before `create`, which waits for it; a world
    fades in from black. Was: the bar shown from `preload()` whenever anything was queued, destroyed
    on the load's completion before eviction, and a hard cut into the world.)*
18. PreloadScene and the scenes draw the bar from one shared piece of code, and PreloadScene looks
    as it does today. (Derived here: "in PreloadScene's style" kept true by construction.)

### E. Failure and art outside the table

19. A download that fails behaves as today: the scene still starts, `registerArt` warns once for the
    atlas, its sheets draw as the placeholder, and nothing retries or blocks. (D7, charter default:
    the game never blocks on art.)
20. A sheet whose group is not loaded in the running scene (a scene drawing art outside its table
    entry) draws as the placeholder with one warning that names the sheet, and nothing throws.
    (D9, charter default: a dev bug must not crash the game.)
21. A test walks every scene's use of scene-scoped sheets against the table, so such a bug cannot
    ship. (D9.)
    - The hub: every sheet `folkLook` can return lies in the hub's groups.
    - Each field and the run: every archetype it meets, its elite sheet included, lies in its groups.
      The test lists the archetypes each scene meets, from game-service's spawns (gentle_meadows:
      boar; forlorn_forest: zombie, ghost; the run: ghoul, troll, demon).
    - Every archetype in `MONSTER_LOOKS` is met by at least one scene in that list, so adding a look
      forces saying where it appears.
    - The class sheets and `PLAYER_REFERENCE_SHEET` lie on resident groups.
    - Every group the table names exists in the manifest.

    (Derived here: the server owns the spawns, so the test is where the client states what each
    scene expects; the `MONSTER_LOOKS` rule keeps it from going stale silently.)

### F. Verification

22. In a headless browser on our own dev server, the decoded texture memory of the atlas textures in
    the texture manager (width × height × 4) is measured on each scene, and recorded in §
    Verification next to the estimates below. (D11.)
23. A round trip hub → gentle_meadows → hub → forlorn_forest → hub → run → hub runs with no thrown
    error, no console error, and no placeholder warning for any sheet that drew art before this
    work; after each entry the atlas textures present are exactly that scene's set. (D11.)
24. Nick checks it in a real browser (the final slice).

Estimated decoded texture memory per scene (charter estimates, then the manifest's arithmetic; not
measured):

| Scene | Charter estimate | From the manifest | Today |
|---|---|---|---|
| menus | | 200.4 MB | 473.1 MB |
| hub | ~220 MB | 223.3 MB | 473.1 MB |
| gentle_meadows | ~235 MB | 234.5 MB | 473.1 MB |
| forlorn_forest | ~240 MB | 240.0 MB | 473.1 MB |
| run | ~375 MB | 376.6 MB | 473.1 MB |

## Amendment 2026-11-06 (A1: the bar waits, stays, and fades; the world fades in)

Asked by Nick after seeing slice 3 locally, and approved (「那你調整看看」); amends D6 and §D R17.
Built as I-C4JWH-6.

**Why.** On a world switch the torch bar showed for a few hundred ms: even locally the folk,
wildlife and creature pages come back from the browser's HTTP cache, so an evicted page queued
again is a download to Phaser but over almost at once. A bar that appears and is gone before it
can be read looks like something flashing past, and the cut into the world after it is hard. The
common answer is a show delay plus a minimum visible time:

- Firefox's Acorn design system, "Loading indicators"
  (https://acorn.firefox.com/latest/foundations/global-patterns/loading-indicators-SKyqf3Lj):
  show an indicator only past about 200 ms, and keep it at least 400 ms once shown. (The page
  renders client-side and could not be fetched as text on 2026-11-06; the figures are the ones
  Nick's brief cites.)
- Learning Equality's design system, "Loaders" (https://design-system.learningequality.org/loaders):
  "Apply 300ms delay", because a loading state shown for a fast operation is more disruptive than
  none, and once it appears keep it "at least 400ms", "to prevent a brief flash of loading state
  causing a jarring visual experience" (fetched 2026-11-06).

The numbers here sit at or past both: 300 ms before the bar, 600 ms at least once it shows.

**A1 requirements.** They replace §D R17 where they differ; R18 stands.

- **A1.1 (show delay).** A scene whose `preload()` queued anything, and that passes a bar, shows
  the torch bar only if its load is still running 300 ms after `preload()` queued it. A load that
  completes within 300 ms shows no bar at all. The bar, when it shows, starts filled to the
  progress the load has made so far.
- **A1.2 (minimum visible time).** The bar fades in over 150 ms. Once shown it stays at least
  600 ms, counted from the start of its fade-in, and as long as the load runs; then it fades out
  over 150 ms and is destroyed. The earliest a world comes in behind a bar is therefore 1050 ms
  after its preload, and a load just past the delay costs about 750 ms more than its download.
- **A1.3 (eviction stays where it is).** Eviction runs when the load completes, as §C R11 and
  ADR-0059 Decision 3 say, under the bar if the bar is still up (it draws nothing of a
  scene-scoped group: its textures are the menu chrome's canvases). The scene's `create` waits
  until the bar has faded out and been destroyed; the scene stays LOADING until then, so a world
  switch stops it as it stops any scene still loading (`switchWorld`), its one-shots stay held
  (`holdOneShots`), and a run's held settlement keeps the hub behind the record (FS-GV8WN R23).
  With no bar, `create` runs on the load's completion, as before. The pacing enters only a scene
  still LOADING, so a hold that ever misses (Phaser attaching its listener another way) degrades to
  creating on the load's completion, never twice. (Derived here: the alternative,
  the bar outliving `create` drawn over the new world, needs an opaque layer of its own above every
  HUD depth and a stage that ignores the world camera's bounds and follow, since the bar's soot is
  the camera's background and its stage is a camera scroll; holding `create` keeps the bar and the
  world camera as they are, and the world's one-shots and DOM panels appear with the world, not
  over a bar.)
- **A1.4 (the world fades in).** A world scene (hub, field, run) fades in from black over 200 ms
  as its `create` runs: after the bar, or at once when no bar showed, a scene that queued nothing
  included. A menu scene fades in only after a bar; with none it comes up at once, as today.
  "Black" is the canvas's soot (`#121212`, the game's background and the bar's ground), so a fade
  never dips darker than the canvas between scenes.
- **A1.5 (the fade is the camera's own).** The fades are the main camera's fade effect
  (`Camera.fadeIn` / `fadeOut`, Phaser 4.2.1 `cameras/2d/effects/Fade.js`), a fill of the camera's
  rectangle drawn after every object the camera draws (`renderer/webgl/renderNodes/Camera.js`), so
  it covers the HUD, which each scene draws on its one camera. It changes neither zoom, origin nor
  scroll (ADR-0056, ADR-0057). A finished fade-in is reset (`fadeEffect.reset`), so no fill is
  drawn after it. DOM panels over the canvas are not faded.
- **A1.6 (input).** No fade blocks input. The world takes input from its `create`, while it fades
  in; before `create`, while loading or behind the bar, there is no world to take it.
- **A1.7 (one place).** The four durations (show delay 300, minimum visible 600, bar fade 150,
  world fade 200) are named constants in one module, `src/render/art/loadPace.ts`.
- **A1.8 (cancel).** A stop during the delay, the bar, either of its fades or the wait for
  `create` cancels every pending step: nothing fires on the stopped scene, its `create` never runs,
  and the bar goes with its display list. The pacing runs on the scene's clock, and its camera goes
  with the scene (`CameraManager.shutdown`). On a game destroy the pacing asks the scene's plugins
  nothing (`onSceneEnd`, "destroy").
- **A1.9 (boot).** PreloadScene is unchanged: its bar shows from its first frame, filled by its
  own load, and the menu comes after it as today.

**A1 acceptance criteria.**

- [x] A load that completes within 300 ms shows no bar; the world scene fades in over 200 ms.
- [x] A load still running at 300 ms shows the bar, fading in over 150 ms, filled to the progress so far.
- [x] A bar shown stays at least 600 ms, longer while the load runs, then fades out over 150 ms; create runs only after it is destroyed, then the world fades in over 200 ms.
- [x] Eviction runs on the load's completion, before the bar's fade-out and before create.
- [x] A world scene that queued nothing fades in; a menu that queued nothing does not.
- [x] A stop during the delay, the bar, its fade-out or the wait for create leaves no pending step, and create never runs; a game destroy asks the plugins nothing.
- [x] The durations are named constants in `loadPace.ts`.
- [x] PreloadScene unchanged.
- [x] In a headless browser: a cached switch shows no bar and fades; a download held about 1.5 s shows the bar at least 600 ms, then fades; a switch mid-delay or mid-bar leaves no error and the hub at exactly its set.

**A1 edge states.**

- **Re-entering from the browser's HTTP cache**: usually no bar; the world fades in.
- **A load that ends just past 300 ms**: the bar shows and stays its 600 ms; accepted, it is the
  flash this amendment removes.
- **The run ends while the bar is up**: as "A run that ends while it still downloads": the record
  opens when the run's create runs, up to about 750 ms later than before.
- **The game state while the bar is up**: the player is in the world on the server, as during the
  download before; the bar adds at most about 750 ms to that.
- **A hidden tab**: Phaser's loop stops, and the pacing waits on the scene's clock with it; the
  download goes on.
- **A failed download**: the load still completes; the same pacing, then placeholders (§E R19).
- **A switch while the world fades in**: the scene is RUNNING and stops as any running scene; its
  camera and the fade go with it.

## User Stories

1. As a player on a modest machine, I want the game to hold only the art the scene I am in draws, so that it loads and runs where 473 MB of textures would not fit.
2. As a player, I want the first screen after login to come up sooner, so that I am not waiting on creatures I will not meet until later.
3. As a player entering the hub, I want the townsfolk loaded with it, so that the hub looks as it does today.
4. As a player entering Gentle Meadows, I want the boars, elite ones included, drawn from the first frame, so that the field looks as it does today.
5. As a player entering the Forlorn Forest, I want the zombies and ghosts drawn from the first frame, so that the forest looks as it does today.
6. As a player in a run, I want the ghouls, trolls and the demon drawn as soon as they appear, on any floor, so that the boss never shows up as a grey box.
7. As a player climbing a floor, I want no wait and no loading screen, so that the climb stays one continuous run.
8. As a player entering a world whose art has to download, I want the torch bar I saw at boot, so that I see the game working rather than a blank canvas.
9. As a player entering a world whose art is already loaded, I want to go straight in, so that a bar does not flash for nothing.
10. As a player going back and forth between the hub and a field, I want each entry to work as the first did, so that freed art comes back whole.
11. As a player in any world, I want other players, rivals and my party drawn in their own class, so that freeing art never turns a person into a placeholder.
12. As a player whose connection drops a download, I want the world to start anyway with placeholders where art is missing, so that I can still play.
13. As a player leaving the game page, I want every texture freed, so that the tab gives its memory back.
14. As a player on the main menu or creating a character, I want the class figures there as today, so that the menus look the same.
15. As a developer adding a creature or a townsperson, I want a test to fail until I say which scene draws it, so that it cannot ship as a placeholder.
16. As a developer adding an art group, I want it resident unless I say otherwise, so that the mistake costs memory rather than art.
17. As a developer, I want one table that says which art each scene holds, so that I read and change it in one place.
18. As a developer, I want freed art to take its animations with it, so that a re-loaded sheet animates and no sprite plays from a dead texture.
19. As the owner, I want the memory each scene holds measured and recorded, so that I know what the change bought and can budget a 2x creature later.
20. As the owner, I want the rule for what stays loaded and what is freed written down, so that later work keeps to it.

## Acceptance Criteria

- [ ] After boot, on the main menu, the atlas textures are exactly the resident groups' pages; no scene-scoped page is a texture.
- [ ] On entering each scene in the table, the atlas textures are exactly the resident pages plus that scene's groups' pages, once its preload has completed and before its create builds anything.
- [ ] Each evicted page's animations are gone from the animation manager, and its texture from the texture manager.
- [ ] Re-entering a scene whose groups are loaded queues nothing and shows no bar; entering one that queues anything shows the torch bar, gone before create. *(Amended by A1: only over a load still running at 300 ms; see the A1 acceptance criteria.)*
- [ ] PreloadScene's boot screen looks as it does today.
- [ ] The field reads its id before preload; gentle_meadows loads wildlife, forlorn_forest fodder, an unknown field wildlife.
- [ ] The run loads creatures and boss at entry; a climb loads nothing.
- [ ] A failed atlas: one warning, placeholders for its sheets, the scene starts.
- [ ] A sheet whose group is not loaded draws the placeholder with one warning naming it, without a throw.
- [ ] The coverage test of §E R21 passes, and fails when a folk sheet or a monster look is moved to a group its scene does not hold, or when a `MONSTER_LOOKS` archetype is met by no scene.
- [ ] Decoded texture memory per scene measured in a headless browser and recorded in § Verification.
- [ ] The round trip hub → gentle_meadows → hub → forlorn_forest → hub → run → hub passes as §F R23 says.
- [ ] No change under `tools/bake/`, `public/art/` or `game-server/`.
- [ ] Typecheck, the full vitest suite, lint and lint:fence pass.
- [ ] Nick's browser check passes (the final slice).

## Edge States

- **A refresh into a world**: the world is held until the menu stands up (`bootGate.ts`), so the resident groups are loaded; the world scene loads only its own groups.
- **A world switch while the scene is still downloading** (corrected in review fix round 1): a world scene sits LOADING for its whole download, and Phaser 4.2.1 counts only a RUNNING scene as active (`Systems.isActive`), so the switch stops every world scene that is starting or running (`bootGate`'s `inFlight`), not only the active ones; a target still loading is stopped and started again, since Phaser's `start` lets a scene START..CREATING carry on and drops the new data (`SceneManager.start`). The stop resets the scene's loader and drops its create; the bar goes with its display list. Pages that finished stay textures until the next scene's preload completes, which evicts them if it does not use them. Pages in flight are not dropped by Phaser: `LoaderPlugin.reset` clears its Sets only, and a download that lands later still adds itself (`File.onLoad` → `nextFile` → `onProcess` → `fileProcessComplete` → `addToCache`). So the scene's own preload calls its downloads off on the stop (`File.resetXHR`, the XHR aborted, no `onProcessComplete`): none lands, and a next scene that wants the same page loads it once.
- **The world's one-shot messages while it downloads** (added in review fix round 1): what the server sends a world once, unasked, is held from `init` and handed to its listeners in arrival order at the end of `create` (`scenes/heldMessages.ts`): the hub's queue progress and handoff, ready check and party notices; the run's exit unlocking, end and settlement. The field has none (its messages answer the player's own asks, sent after create). The ready-check popup itself never depended on it: the socket writes the check to the party store, which the popup reads when it is built. The game state needs nothing: it is a full snapshot every tick.
- **A run that ends while it still downloads** (added in review fix round 2): the run's end sends `end_game`, this player's `settlement` and the hub together. Its own settlement, held before create, raises the result hold at once, so the hub waits behind the record exactly as when the run has loaded (FS-GV8WN R23): the run finishes its download, create hands the settlement over, the record opens, and closing it lets the hub in. A Leave while it still loads lets the hub in at once, and the switch stops the loading run. Another run's settlement holds nothing.
- **A failed folk download and the NPC bust**: the bust's figure cache keeps only a figure it read; a frame missing once is read again on the next visit.
- **The memory peak at a transition**: eviction waits for the new scene's load, so while it downloads the GPU holds the old scene's groups and the new one's (run → hub about 400 MB while folk loads). Still under today's constant 473 MB. Accepted (ADR-0059 Consequences).
- **Re-entering from the browser's HTTP cache**: an evicted page queued again is a download to Phaser, so the bar shows, briefly when the browser has the PNG cached. *(Amended by A1: no bar unless the load runs past 300 ms; the world fades in.)*
- **The bar's steps**: `progress` counts files, so the bar moves page by page (the run's four pages: quarters). Accepted: it is the boot bar's behaviour.
- **The manifest failed at boot**: a scene queues it again (as today), so its bar shows; if it fails again, the scene draws placeholders and warns, as today.
- **An archetype the client has no look for**: drawn as the troll (`FALLBACK_LOOK`); in a run the troll is loaded; in a field it draws the placeholder with one warning (§E R20).
- **The demon on a lower floor**: already loaded with the run (§B R9).
- **Main menu from the hub** (switching character): the menu evicts folk; the next hub entry loads it again, with the bar.
- **Party busts, rivals, other players**: class sheets, resident in every scene.
- **NPC dialogue bust**: cut from a folk frame inside the hub and destroyed with the hub's display list; the cached figure bounds are numbers and stay true for the re-loaded PNG.
- **Cursors and item icons**: data-URL and DOM copies, untouched by eviction; their groups are resident anyway.
- **Leaving /game**: Phaser's game destroy frees every texture; the scene end seam needs nothing new.
- **The legacy GameScene and GameOverScene**: not in the table and load no baked art; unchanged.

## Verification

Taken 2026-11-06 by the verification slice (I-C4JWH-4). Headless Chrome (the installed Google
Chrome, through playwright-core, `--disable-web-security`), 1280 × 845 viewport, device pixel ratio
1, on our own `next dev` (port 4014) against the local stack (gateway 7114, game-service 5668),
account `phaser4-trial@example.test`. The branch figures are on `feat/client-scene-art-loading` at
b6ed390b (the code of I-C4JWH-1..3); main's on local main 6812be5a, the same script on the same
server. Decoded memory is width × height × 4 of each texture source, summed over the texture
manager: "atlas" over the `art:<atlas>` pages, "all" over every texture (the light map, the mist,
render textures and the menu chrome's canvases too). Each figure was read 3 s after the scene
became active. The script is kept in the session scratchpad (`c4jwh/roundtrip.cjs`).

| Scene | Charter estimate | From the manifest | Measured atlas | Pages beyond the 17 resident | Measured all | Main atlas | Main all |
|---|---|---|---|---|---|---|---|
| menus | | 200.4 MB | 200.3 MB | none | 205.0–216.5 MB | 473.1 MB | 477.7–489.3 MB |
| hub | ~220 MB | 223.3 MB | 223.3 MB | folk-0 | 245.1–248.7 MB | 473.1 MB | 494.9–498.6 MB |
| gentle_meadows | ~235 MB | 234.5 MB | 234.4 MB | wildlife-0, wildlife-1 | 257.6 MB | 473.1 MB | 496.3 MB |
| forlorn_forest | ~240 MB | 240.0 MB | 239.9 MB | fodder-0, fodder-1 | 287.4 MB | 473.1 MB | 520.6 MB |
| run | ~375 MB | 376.6 MB | 376.5 MB | creatures-0, creatures-1, boss-0, boss-1 | 401.3 MB | 473.1 MB | 494.2 MB |

The 0.1 MB gaps against the manifest's column are its per-group rounding. Animations registered on
the branch: 248 on the menus, 344 in the hub (96 folk, no creature), 312 in either field (64
creature, no folk), 344 in the run (96 creature, no folk); on main 568 in every scene.

**The round trip** menu → hub → gentle_meadows → hub → forlorn_forest → hub → run → hub → menu
passed. After every entry the atlas pages were exactly the 17 resident ones plus that scene's own
(the table above), so every evicted group was gone before the next scene drew. The torch bar showed
on each entry that downloaded (the hub four times, folk-0; each field, its two pages; the run, its
four) and on none that queued nothing (both menu entries: 0 files). No `pageerror`; no console error
but the dev server's own `/favicon.ico` 404, on main as on the branch; no `art:` warning at all, on
either, so no sheet drew as a placeholder. The forest gate was reached by walking under the town's
south walls (the straight way west is walled by the Quartermaster's); a live run refuses
`leave_run`, so the run was left by Fall (`forfeit_run`) and then Leave. Not measured: how long the
bar shows (the local server serves the pages in well under a second), and the transition peak.
Nick's browser check (I-C4JWH-5) remains.

**After review fix round 1** (aa8257bc; the same account, browser and server, port 4014):

- The round trip again passed with the same figures to the 0.1 MB (menus 200.3, hub 223.3,
  gentle_meadows 234.4, forlorn_forest 239.9, run 376.5), each scene's pages exactly its set, the
  bar on every download and on nothing else, no page error, no console error but the favicon 404,
  no `art:` warning.
- **A world switch mid-download.** The run's boss pages were held back 12 s (`page.route`); the
  run was started from the hub and, while it sat LOADING (creatures-0 and creatures-1 in, the boss
  in flight), Fall was sent, so the server ended the run and sent the hub. The run scene was
  stopped (status SHUTDOWN), both boss requests were aborted (`net::ERR_ABORTED`) and never landed,
  and the hub held exactly the 17 resident pages and folk-0 (223.3 MB), 18 s later still. No page
  error, no console error (no "Texture key already in use"), no `art:` warning. Script:
  `c4jwh/midload.cjs` in the session scratchpad.

**After review fix round 2** (45bbb89d; same account, browser and server, port 4014), the run's
boss held back 12 s and Fall sent while the run sat LOADING, both ways out:

- **Closing the record**: the hub was held from the first moment (the result hold raised by the
  held settlement), the run finished its download, the settlement record opened, and closing it let
  the hub in; the run stopped, the hub at exactly the 17 resident pages and folk-0 (223.3 MB, folk
  downloaded again with the bar, since the run's load had evicted it).
- **Leave while it still loads**: the hub came in at once; the run, still LOADING, was stopped and
  both boss requests aborted (`net::ERR_ABORTED`); the hub at exactly its set.

Neither run logged a page error, a console error (the favicon 404 aside) or an `art:` warning.

**After Amendment A1** (I-C4JWH-6, 2d017420; headless Chrome through playwright-core,
`--disable-web-security`, 1280 × 845, device pixel ratio 1, our own `next dev` on port 4016 against
the local stack, account `phaser4-trial@example.test`). Each entry's timeline was read from the
page: the loader's start, the torch bar's line drawn and destroyed, each camera fade, `create`, and
each scene's shutdown, in ms from the stop of the scene before. Script: `c4jwh-pace/pace.cjs` in
the session scratchpad.

- **A cached or local switch** (menu → hub, hub → gentle_meadows, and gentle_meadows → hub twice,
  folk-0 again from the browser's cache): each load done 41–51 ms after it started; no bar; the
  scene's `fadeIn(200)` in the soot (18, 18, 18) and `create` on the load's completion; the fade
  reset about 200 ms later.
- **A download held 1.5 s** (`page.route` on `wildlife-*.png`, hub → gentle_meadows): the bar drawn
  312 ms after the load started (the scene's clock runs on Phaser's smoothed frame delta, so
  280–317 ms across the runs), faded in over 150 ms; the pages in at about 1560 ms, the fade-out
  begun at once (the bar up about 1250 ms), the bar destroyed 116–150 ms later, then `create` and
  `fadeIn(200)` in the same moment. The wildlife drew from the first frame.
- **A switch mid-delay**: the run's boss held 12 s, Fall sent 6 ms into the run's load, Leave the
  moment the hub was held: the run stopped 74 ms into its load and drew no bar at all.
- **A switch mid-bar**: the same, Fall sent 1.2 s in, with the bar up since about 300 ms: the bar
  went with the run's display list as the run stopped.
- After both: the run SHUTDOWN, its clock empty (no event active or pending), both boss requests
  aborted (`net::ERR_ABORTED`) and no `art:boss` texture after they were let go; the hub queued
  nothing (folk-0 still a texture), faded in, and held exactly the 17 resident pages and folk-0
  (223.3 MB). No page error, no console error, no `art:` warning in any run.
- Found on the way, and fixed in review fix round 1 (825ac405): `leaveTheBarrow` released the
  result hold, whose held hub goes through `switchWorld` and stops the run synchronously
  (`resetRun`: `runEnded` and `leavePending` false), then read `runEnded` and set `leavePending`
  on the stopped scene. A player reached it: a run that ended with the record open and the hub
  held, then Leave (the row's or the menu's), sent `leave_run` from the hub, and the next run's
  Leave stayed dimmed until that run stopped. The first note here said no player could reach it;
  that was wrong. Now `ResultHold.release` says whether it let a world in, a Leave that did is
  done, and each run starts with no Leave pending.

## Out of Scope

- Baking folk or monsters at 2x.
- Loading the boss on demand, or any per-floor art loading in a run.
- ASTC or any compressed texture format.
- Any server, bake, art or manifest-format change.
- Prefetching the next scene's art, or evicting before the new scene's load completes.
- Byte-level progress on the bar.
- A memory budget enforced at runtime.
