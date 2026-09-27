# FS-2325V: Pre-rendered isometric art in the game canvas

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Isometric projection of the game world", "Pre-rendered world and prop art", "Pre-rendered character and creature art", "Light-map lighting with placed light sources", "Container-open presentation" → this FS · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (medium, projection, bake, boundary), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (characters authored in code; §E revised 2026-09-27), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only colour) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Rendering terms" · Builds on: [FS-W6BP1](W6BP1-game-canvas-fantasy-reskin.md) (palette, type, overlay lighting)

> Scoped `--from-thread` with every visual/3D decision delegated by the owner. The decisions below
> converged without adversarial review **(not challenged)**. The cost of error is bounded: client
> presentation only, and baked PNGs revert cleanly.

## Summary

The game canvas stops looking like pixel art and starts looking like Ultima Online: a realistic,
gritty, warm-where-the-torches-burn world seen from a fixed isometric camera. Everything that
stands up (walls, trees, props, delvers, creatures, bag items) is modelled in 3D and **baked at
build time** into 2D sprite sheets. Phaser draws only those 2D sprites, on a 2:1 isometric
projection that exists purely in the client's presentation layer. The server, the wire protocol
and every game rule are untouched. A delver sees a lit, textured world, 8-direction animated
characters, and a leather satchel that opens when they loot a coffer. The game plays exactly as it
does today.

A throwaway spike proved the pipeline end to end: ground, hall interior, trees, lighting,
satchel, and a walk cycle all reached the target. The one weak point was characters built from
rigid primitives. Characters are still authored in code, never sourced (ADR-0021), but on a
skinned rig with shaped anatomy, generated materials and hand-keyed clips (§E).

## Requirements

### §0. The boundary (binds every section)

1. **No file under `game-server/` changes.**
2. **No client→server message changes shape or meaning.**
   - `move {vx, vy}` stays world-space. A movement key sends exactly what it sends today, and on
     the isometric screen "up" therefore renders as a diagonal, UO-style.
   - `target_x/target_y` remain world coordinates.
   - `interact`, `attack`, `equip` and `unequip` payloads are unchanged.
3. **Every gameplay calculation in the client uses world positions** (CONTEXT.md "World
   position"): distance, range, proximity, bounds. A distance measured between sprites is a
   defect.
4. The server remains authoritative for collision, visibility and state. The client only draws.

### §A. Guideline and projection (line: "Isometric projection of the game world")

1. **Design guideline Part I is rewritten first** to the pre-rendered isometric medium, before any
   art lands:
   - These sections no longer describe the target and are replaced: "Art Technique — Pixel Art",
     "Still pending on assets", "Perspective", and "UI Chrome (align to pixel art)", plus the
     Alagard revisit note.
   - These carry over unchanged: palette, gameplay-accent channels, the lighting readability
     floor, and typography.
   - `docs/theming_plan.md` is updated to match (medium, status).
2. A shared projection module lives at `src/render/iso/`. It exports:
   - `worldToScreen` and `screenToWorld`, exact inverses of each other;
   - a depth key from the footprint's `x + y`;
   - the projected camera bounds.

   The tile is 64×32 px on screen. `WORLD_PX_PER_TILE` maps server pixels onto a tile and is
   calibrated so a delver's collision footprint spans roughly one tile. Its value is derived from
   server entity sizes and recorded next to the constant.
3. **HubScene and BarrowspireScene are both migrated to the projection**, on their existing
   placeholder graphics:
   - every draw position goes through `worldToScreen`;
   - world objects depth-sort by footprint;
   - the camera follows and clamps in projected space.
4. Every `Phaser.Math.Distance.Between` call in BarrowspireScene that measures sprite
   positions measures world positions instead (≈7 sites). Any equivalent call in HubScene does the same.
5. Pointer targeting (`pointer.worldX/worldY` sent as `target_x/target_y`, BarrowspireScene
   ≈L3101–3163) passes through `screenToWorld` first.
6. Facing becomes 8-way, derived from the velocity the client already renders (it is 4-way
   `up/down/left/right` today). This is presentation only.
7. The projected map's out-of-diamond corners render as a dark fill, never as a void or stray
   background.

### §B. Bake pipeline and world/prop art (line: "Pre-rendered world and prop art")

1. **A bake tool lives at `game-client/tools/bake/`.** It is a three.js bake page driven by
   Playwright headless Chromium and run with `npm run bake`.
   - three.js and Playwright are devDependencies only; neither ships to players.
   - The camera is orthographic, 30° elevation, 45° azimuth, matching §A's projection exactly.
   - The renderer uses ACES tone mapping, a PMREM room environment (envMapIntensity 1.0 for
     metals, 0.3 otherwise), a warm key light from screen-left, and a shadow catcher.
   - It renders at 2× and downsamples to 1× with high-quality smoothing.
2. **Output goes to `game-client/public/art/`**: atlases no larger than 4096², plus
   `manifest.json` (CONTEXT.md "Sprite manifest"). Per sheet, the manifest records:
   - frame size and anchor (origin fraction);
   - directions, frame counts and fps;
   - an optional declared light source (offset, radius, colour, flicker);
   - the asset's source and licence.
3. **Bakes are deterministic**: seeded randomness, fixed camera, stable output. Re-running the
   bake with unchanged inputs produces byte-identical PNGs.
4. **World art baked in this section:**
   - ground tiles: grass, dirt, cobble and flagstone variants, plus transitions;
   - grass-tuft and pebble decals;
   - wall pieces: plain, brace, window (emissive leaded glass) and torch-sconce variants, each at
     back (full) and front (cut-away) heights, for both axes;
   - corner posts;
   - roof pieces;
   - trees (leaf-card foliage; oak variants including one autumn-warm, pines), bushes and rocks;
   - interactables, one frame per state:
     - door: locked, unlocked, open;
     - escape door: locked, unlocked, open;
     - switch: inactive, active;
     - chest/container: closed, open;
   - lamp post, brazier, table, chairs, barrels;
   - item icons for the container view (§D), including a generic fallback icon.
5. Colours authored in the bake tool are drawn from `BARROW` (`src/utils/theme.ts`), per
   ADR-0013. Baked PNG pixels are asset data and outside the hex fence.
6. **A loader module lives at `src/render/art/`.** It reads the manifest, registers atlases and
   animations in Phaser, and exposes a sprite/animation factory keyed by manifest names. Scenes
   never hard-code frame geometry.
7. Source models and textures live in a gitignored folder (`game-client/tools/bake/sources/`);
   only baked output and the manifest are committed.

### §C. Scene integration: world, occlusion, lighting (lines: "Pre-rendered world and prop art", "Light-map lighting with placed light sources")

1. **Ground** is client-side decorative, composed from §B ground tiles picked deterministically
   by hashing world tile coordinates, so every client sees the same ground.
   - House interiors (house bounds derived from walls grouped by `house_id`, as the scene already
     does) use flagstone.
   - Decals scatter deterministically.
2. **Server walls** (axis-aligned rects) are cut into one-tile wall pieces with corner posts;
   variants are picked deterministically per piece.
   - North- and west-facing house sides are full height; south and east sides are the low
     cut-away.
   - A wall rect whose length is not a whole number of tiles ends in a trimmed piece.
3. **Roofs:** the existing "roof hides while the delver is inside" behavior (`indoorMask`)
   carries over as roof sprites that hide and show.
4. **Doors, escape doors, switches and containers** render the baked frame for their current
   server state, and swap frames on state change. Their interaction behavior is unchanged.
5. **Occlusion:** a tree or tall prop whose sprite overlaps the delver's and whose depth key is
   greater fades to about 40% alpha, and restores when clear.
6. **Hit-testing** for any clickable world object uses its footprint, not its sprite bounds.
7. **The light-map lives at `src/render/lighting/`**: a camera-fixed multiply render texture,
   refilled each frame with the world's ambient, with additive radial stamps per light source.
   - Sources are the manifest-declared props in view (torch sconce, brazier, window, lamp post)
     plus the delver's torch pool, which replaces FS-W6BP1's overlay pool.
   - Flicker is time-based per source.
   - Flame particles and halos draw above the light-map.
   - The light-map is built once and only repositioned or restamped per tick; it is never
     rebuilt from scratch.
8. **Ambient is fixed per world type**: warm dusk in the hub, dark barrow in the run.
9. **The readability floor binds, and markers carry it** (revised 2026-09-28).
   - Hostile markers are drawn **above** the light-map and vignette, so darkness never dims them:
     the rival name plate and HP bar, and a creature's glowing eyes once creatures render.
   - Each marker keeps ≥ 3:1 contrast against the darkest lit ground at the canvas edge
     (ambient × baked ground mean × vignette).
   - The world itself may then stay dark. Ambient is not lifted for readability.
   - Why: lifting ambient cannot work. Against the baked ground, even full light under the
     vignette reaches only ≈1.8:1, because any multiply darkening lowers contrast. UO solves this
     the same way, with overlays that ignore lighting.
10. The static vignette from FS-W6BP1 stays, drawn above the light-map and below the HUD.
11. Both HubScene and BarrowspireScene use §C.

### §D. Container view (line: "Container-open presentation")

1. Opening a container shows the **container view**: a leather satchel panel. It pops in (short
   scale and alpha ease), its flap lifts (a vertical flip to a negative scale with a darkened
   underside), and item icons drop in with a short stagger. Closing reverses it.
2. The view **replaces the presentation** of the current chest item-row UI and nothing else.
   - It opens and closes on exactly the triggers the row UI uses today.
   - Clicking an item icon performs exactly what clicking that item's row does today, with the
     same message and the same optimistic `lootedAt` pending pattern.
3. Hovering an item shows its name.
4. Items with no mapped icon use the generic fallback icon.
5. The view lives in its own module (`src/ui/ContainerView.ts`), reached from BarrowspireScene
   through a thin hook.
6. The satchel art comes from the bake pipeline or is drawn procedurally in the module, and its
   colours come from `BARROW`.

### §E. Characters and creatures (line: "Pre-rendered character and creature art")

1. Characters and creatures are **authored in code in the bake tool** (ADR-0021). No
   third-party model or animation is used.
   - One shared humanoid skeleton (`Bone` / `SkinnedMesh`); creature variants change proportions
     and add bones (tail, jaw, hunch).
   - Smooth skinned bodies built from shaped geometry, so joints bend without seams. Not stacked
     rigid primitives.
   - Procedurally generated textures and normal maps (mail, plate, leather, wool, rust, grime);
     colours from `BARROW`.
   - Hand-keyed clips on the shared rig. Cloth, hair and tails get spring-lagged secondary motion.
   - Manifest source/licence reads "authored: <bake module>" and the project's own licence.
2. **Each class and creature gets:**
   - 8 directions;
   - idle and walk animations;
   - an attack animation (per class: warrior slash, archer shot, mage cast);
   - a death animation.
3. Coverage: the three playable classes (wizard, archer, knight; today's
   `createSoldier/Archer/Knight` textures), rivals (other players), and creatures present in the
   run.
4. Scenes play the animation matching what they already know: moving, idle, attacking, dead.
   They pick the direction from §A's 8-way facing. No new state is invented to drive animation.
5. Characters stand on their footprint anchor, and their baked shadow falls screen-right,
   consistent with props.
6. Sheet naming leaves room for equipment layers later; layering itself is out of scope.
7. **Owner review gate.** The bake emits a contact sheet: every class and creature × 8
   directions × each animation, at game scale. Scenes switch to character sheets only after the
   owner approves it.

### §F. Menus show the baked cast (added 2026-09-28; line: "Pre-rendered character and creature art")

1. Every character shown in a canvas menu comes from the baked class sheets that walk in the
   world:
   - the main-menu roster and hero display (`MainMenuScene`);
   - class selection in character creation (`CharacterCreationScene`);
   - the loadout (`LoadoutScene`).

   The `preview_*` pixel textures and their generators leave those scenes.
2. Menus present the character large and alive: the idle clip, slowly turning through the 8
   facings (a turntable). The selected class plays its attack once on selection. The same class
   → sheet mapping as §E is used, so what is picked is exactly what walks.
3. Scale: shown at 1x–1.5x of the baked frame, linearly filtered, standing on a lit plinth or
   ground patch with its baked shadow. Never upscaled past 1.5x.
4. Menu chrome follows the rewritten guideline: carved-stone and vellum panels with 1px brass
   borders, smooth fills, no pixel-grid frames, Pirata One only within the blackletter bound.
5. No menu flow, button, REST call or WS message changes. Presentation only.

### §G. Hub folk are baked (added 2026-09-28; line: "Pre-rendered character and creature art")

1. Hub residents (today drawn by `ensureVillagerTexture` from an `appearance` of
   `"<palette>_<build>"`) and the function NPCs (today a brass-tinted warrior) become baked
   characters on the shared rig (ADR-0021), with 8 directions, idle and walk.
2. Villagers: one sheet per build in use, with palette variants covering every `appearance`
   value the hub sends. An unknown value falls back to a default villager, never to pixel art.
3. Function NPCs get their own authored characters, distinct from delver classes and villagers,
   whose role reads from the silhouette (e.g. a quartermaster's apron and ledger, a delve-warden
   in grave-watch mail). Their name plates stay markers (§C.9).
4. Baked creature eyes are re-tinted into the hostile channel (the guideline's *Enemy design
   language*): ember red from the oxblood family, never amber.
5. The same contact-sheet approval as §E applies before the hub switches over.

## User Stories

1. As a delver, I want the world drawn from a fixed isometric camera, so that Barrowspire feels like the classic CRPG it is meant to be.
2. As a delver, I want walls, trees and props to look modelled and lit rather than pixelated, so that the world reads as gritty and real.
3. As a delver, I want to move with the same keys and have the game respond exactly as before, so that the restyle costs me nothing in play.
4. As a delver, I want clicking a spot to target that spot in the world, even though the view is angled, so that aiming still works.
5. As a delver, I want my character to face any of eight directions as I move, so that motion looks natural on a diagonal grid.
6. As a delver, I want my character to walk with a believable stride, so that movement feels grounded.
7. As a delver, I want my class to be recognisable at a glance (knight, archer, wizard), so that I can read a fight.
8. As a delver, I want attacks and deaths to animate, so that combat has weight.
9. As a delver, I want hostiles to stay readable even in dark corners, so that atmosphere never hides a threat.
10. As a delver, I want warm torchlight pooling around braziers, sconces and my own torch, so that the world feels lit from within.
11. As a delver in the hub, I want warmer ambient light than in the run, so that the two places feel different.
12. As a delver, I want to see into a house when I walk in, so that interiors are readable.
13. As a delver, I want trees and tall props in front of me to fade, so that I never lose sight of my character.
14. As a delver, I want doors, switches and escape doors to visibly change when their state changes, so that I know what I have unlocked.
15. As a delver, I want a coffer to open into a satchel that shows its plunder, so that looting feels tactile.
16. As a delver, I want clicking an item in the satchel to loot it exactly as the old list did, so that nothing about looting changes but its look.
17. As a delver, I want to hover an item to see its name, so that I know what I am taking.
18. As a delver, I want every client to see the same ground under the same house, so that the shared world is consistent.
19. As a delver on a normal machine, I want the game to load without a long in-browser bake, so that the art costs me no wait.
20. As the game server, I want to receive exactly the messages I receive today, so that no server change is needed.
21. As a developer, I want one projection module shared by hub and run, so that world↔screen maths lives in one tested place.
22. As a developer, I want scenes to read frame geometry from the manifest, so that re-baking art never needs code edits.
23. As a developer, I want the bake to be deterministic, so that a re-bake doesn't churn unchanged PNGs in git.
24. As a developer, I want art changes to show up as committed PNG diffs, so that they can be reviewed and reverted.
25. As the owner, I want every character built for Barrowspire rather than taken from a stock library, so that the game looks like nothing else.
26. As a reviewer, I want any diff that touches `game-server/` or changes a message to fail review, so that the boundary holds.
27. As the owner, I want the design guideline to describe the new medium before art lands, so that the SSOT and the code never disagree.
28. As the owner, I want a contact sheet of every character at game scale before it goes in, so that I judge the art the way players will see it.

## Acceptance Criteria

- [ ] `git diff main... -- game-server/` is empty at every slice boundary.
- [ ] No WS action or payload shape changes (diff review of `SocketManager` sends and scene `sendMessage` calls shows only argument sources changing, never fields).
- [ ] Design guideline Part I describes pre-rendered isometric art; the four named sections and the Alagard note are replaced; palette, accent channels, readability floor and typography are intact; `theming_plan.md` matches.
- [ ] `worldToScreen(screenToWorld(p)) ≈ p` and the reverse, within float tolerance, covered by vitest; depth-key ordering is covered by vitest.
- [ ] Both scenes render through the projection; no gameplay distance is computed from sprite positions (grep: no `Distance.Between` on sprite `x/y` in scenes).
- [ ] Clicking a world point sends the world coordinate under the cursor (manual check: click next to a known entity, compare the payload to the entity's world position).
- [ ] Facing resolves to 8 directions from velocity.
- [ ] `npm run bake` produces `public/art/` atlases (each ≤ 4096²) and `manifest.json`; a second run with no input change produces no git diff.
- [ ] The manifest validates against a schema test (vitest): every sheet has frame size, anchor, directions and frame counts, and every model-derived sheet has source and licence.
- [ ] three.js and Playwright appear only in `devDependencies`; the production bundle contains neither.
- [ ] `tools/bake/sources/` is gitignored.
- [ ] Ground is identical across two clients viewing the same place (same seed → same tiles).
- [ ] Walls render as pieces with cut-away fronts; roofs hide while the delver is inside and return on exit.
- [ ] Door, escape door, switch and container frames track server state.
- [ ] Occluding trees and props fade and restore.
- [ ] The light-map shows manifest-declared sources plus the delver pool; the hub and run ambients differ; hostile markers (name plate, HP bar) render above the light-map and keep ≥ 3:1 against the darkest lit edge ground, asserted against a fixed number.
- [ ] The container view opens and closes on the old triggers, animates the flap, and clicking an icon sends the same message as the old row (message captured and compared).
- [ ] Each class and creature has 8-dir idle, walk, attack and death sheets, authored in code on the shared skinned rig with no third-party model; the owner has approved the contact sheet; scenes play them from existing state.
- [ ] `npm run lint`, `npm run lint:fence` and `npm test` pass; the hex fence stays green.

## Edge States

- **Manifest missing or corrupt:** the loader logs via the scene's logger and the scene falls back to its placeholder graphics rather than crashing. A missing single sheet falls back per entity.
- **Unknown prop or entity type from the server:** drawn with a neutral placeholder on its footprint, never skipped silently.
- **Item with no icon mapping:** generic fallback icon.
- **Wall rect not a whole number of tiles, or thinner than one tile:** trimmed end piece; drawn thickness follows the rect.
- **Delver standing exactly on a house boundary:** the roof-hide rule uses the same inside test as today; the projection does not change it.
- **Many light sources on screen:** off-screen sources are culled before stamping.
- **Container view open when the container vanishes or the delver moves away:** the view closes on the same condition the row UI closes on today.
- **Container view clicked while a loot is pending:** same `lootedAt` pending guard as the row UI.
- **Window resized or Phaser scale refit:** the light-map and vignette stay full-canvas; the camera re-clamps in projected space.
- **Reconnect mid-run:** full-state render rebuilds sprites through the same code path; the light-map is reused, not rebuilt.
- **Character model not yet sourced (§E pending):** scenes keep today's character textures, positioned on the projection, until §E lands. §A–§D do not wait on §E.
- **Low-end GPU:** texture budget target ≤ 256 MB GPU. If exceeded, reduce atlas count per scene before reducing resolution.

## Out of Scope

- Anything under `game-server/`, and any change to WS actions, payloads, REST calls, or game rules.
- Equipment showing on characters (paperdoll layering). Only sheet naming leaves room for it.
- A day/night cycle; ambient is fixed per world type.
- Mounts.
- Drag-to-arrange, or any client-side inventory state in the container view.
- The web/platform DOM UI (Part II of the guideline).
- Sound.
- A lore name for the hub (CONTEXT.md open item).
