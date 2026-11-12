# FS-2325V: Pre-rendered isometric art in the game canvas

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Isometric projection of the game world", "Pre-rendered world and prop art", "Pre-rendered character and creature art", "Light-map lighting with placed light sources", "Container-open presentation" → this FS · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (medium, projection, bake, boundary), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (characters authored in code; §E revised 2026-09-27), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only colour) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Rendering terms" · Builds on: [FS-W6BP1](W6BP1-game-canvas-fantasy-reskin.md) (palette, type, overlay lighting)

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

## Change: Wider doors → FS-MMA2H

## Change: Wall shadow layer → FS-V8FT3

## Change: Class run, backpedal and pointer facing → FS-JS7C8

## Change: The archer's draw stays on the aim line
Status: work-order
Date: 2026-11-12

> Written `--from-thread` by write-a-spec on 2026-11-12 (FS-JS7C8 charter "角色小跑步"). The
> owner, after playing FS-JS7C8 slices 1–4: "射出弓箭時人物的手臂不自然 拉弓讓手臂過度伸到背後"
> (when the archer shoots the arm looks unnatural: the draw takes the arm too far behind the
> back), and the owner's diagnosis: "應該是左手拿弓的位置太靠近左側導致右手拉弓時伸到左手破圖"
> (the left hand holding the bow sits too far to the left, so the right hand reaches across
> toward it as it draws and the figure breaks). Requirements marked **(owner)** are those words;
> **(charter default)** settles what they left open, with its reason. Every number is a starting
> value. Anchored here because §E.2 owns each class's attack clip ("archer shot"); the pose gains
> acceptance criteria it never had, so it is a behaviour change, not a tune (no tunable is named).
>
> **Edited in place on 2026-11-12 (owner, still a work-order): the Bone Archer draws the same
> way.** After approving the delver archer's new draw, the owner said: "拉弓姿勢可以用在怪物身上"
> (the bow-draw pose can be used on the monster too). R7 no longer limits the change to the delver
> archer; the Bone Archer (FS-B4SG9) takes the same draw on its own rig and keeps its own timing
> (R7, R9). Requirement numbers are kept; retired text reads *Retired 2026-11-12*.

### Facts

1. The archer's attack is `ATTACKS.shot` (`game-client/tools/bake/page/characters/clips.js`):
   7 keys over `BOW_STANCE` (hips −0.5, spine −0.25, chest −0.25 rad about y, so the left shoulder
   leads) with the bow arm `bowArm(raise, ry)` = `upperArmL [0, ry, raise]` (ry −0.57, −0.4 on the
   first key; raise 1.47 is level) and a straight `foreArmL`.
2. The draw hand is solved, not keyed: the bow hook (`bowInHand`, `tools/bake/page/characters/cast.js`)
   takes the arrow line from the bow's own frame (its string rest point toward its grip) and puts
   the right hand `drawLen` × `fx.ik` back along it (`drawLen` = 0.36 rig heights; `ik` 0.5, 1,
   1.02 while drawn and 1.3 on the loose), the elbow bending toward a pole behind and above. So
   wherever the bow hand sits, the drawing hand follows the line back from it.
3. The same upper body is drawn by `attack`, by `walk_attack` (FS-HF0WW, layered over the walk)
   and by FS-JS7C8's `backpedal_attack`; the Shadow Shot release plays the archer's `attack`
   (`src/render/combat/playerCombat.ts`); its hold stands in idle (FS-JTNPR R10) and draws nothing.
4. The Bone Archer (FS-B4SG9) shares `BOW_STANCE`, `bowArm` and the bow hook, with its own keys
   (`ATTACKS.boneShot`, `ik` up to 1.3). Its draw has the delver's fault, measured on its own rig
   (the ghoul's hunched skeleton, cast.js `skeleton`) on 2026-11-12: the bow hand about 0.11 H
   left of the aim plane, the full draw 0.165 H from the jaw, the drawing hand and forearm 0.09 H
   across the centre plane, the elbow 0.17 H behind the chest (its back is 0.077 deep), the loose
   0.126 H past the anchor (I-2325V-9).
5. **Pre-existing.** The shot's keys, `BOW_STANCE`, `bowArm` and the bow hook are unchanged on
   FS-JS7C8's branch against main (its bake diff does not touch them); they date from I-2325V-5
   (2026-09-27) and were baked at 2x by FS-HF0WW. Main's archer draws the same way.

### Requirements

1. **(owner)** At the draw, the bow hand (left) is held forward on the aim line, in front of the
   chest toward the aim, never out to the left side; the bow arm stays extended toward the aim.
2. **(owner)** The drawing hand (right) pulls straight back along that line to an anchor by the
   jaw or ear on the drawing side, and never crosses the body, the head or the bow arm.
3. **(charter default)** At full draw the drawing elbow is at about shoulder height and in line
   with the arrow, never swung behind the line of the back. Reason: the coordinator's reading of
   the owner's "過度伸到背後"; it is how a drawn bow is held.
4. **(charter default)** The loose and follow-through keep 1–3: the hand may open off the anchor,
   never travel across the body or behind the back. Reason: the loose key (`ik` 1.3) carries the
   hand furthest back.
5. **(owner)** The pose holds in every one of the 8 baked facings, since one pose can read clear
   in one facing and cross the body in another. The checks run on the 3D pose (one pose is baked
   to all 8), and the owner judges all 8 on the contact sheet.
6. It applies wherever the shot's upper body is drawn: `attack` (so the Shadow Shot release),
   `walk_attack` and `backpedal_attack`.
7. **(owner, 2026-11-12: "拉弓姿勢可以用在怪物身上")** The Bone Archer draws the same way: R1–R5
   hold on every key of its shot (`ATTACKS.boneShot`, its sheet's `attack`) on its own rig, in
   every facing. It takes the delver's draw (the aim stance, the bow arm angled in to the aim
   line with the wrist turning the bow along the facing, the drawing elbow's pole, the loose by
   the ear), each angle set on its own rig where its proportions need it, and keeps what is its
   own: its rig and proportions, its crouch (the knees bent, the hunch), its jaw dropping as it
   draws, and its clip's length and timing (7 keys at 12 fps over the 0.6 s wind-up, FS-B4SG9 §E
   R26: nothing nocked on the first key, nocked before it draws, the pull growing to the full
   draw and held, the loose on the last key). Its idle, walk and death do not change.
   *Retired 2026-11-12: "The delver archer only. The Bone Archer's sheet keeps its bytes" (the
   charter default, which left the Bone Archer to the owner's call).*
8. **(owner)** The archer is re-baked once, with FS-JS7C8's archer re-bake (FS-JS7C8 R48), and its
   contact sheet shows main's `attack` beside the new `attack`, `walk_attack` and
   `backpedal_attack` for comparison. It ships on the owner's approval (§E.7, ADR-0021 §5).
9. **(owner, 2026-11-12)** The Bone Archer is re-baked on its own, after the archer's: only its
   `creatures` atlas and the manifest change; every other atlas, the delver archer's included,
   keeps its bytes. Its contact sheet shows its old `attack` beside the new one in the 8 facings,
   with its `idle` and `walk` to show nothing else moved. It ships on the owner's approval
   (FS-B4SG9 §E R29, ADR-0021 §5).

### Acceptance Criteria

- [ ] A clip test on the archer's rig measures, on every drawn key of `shot` (`ik` > 0): the bow
      hand ahead of the chest along the aim and near the aim line; the drawing hand on the arrow
      line, ending by the jaw or ear on the drawing side; the drawing hand and forearm never
      crossing the body's centre plane toward the bow side; the drawing elbow within a band of
      shoulder height and not behind the back. Bands are starting values; today's values are
      recorded first, so the change is seen as numbers.
- [ ] The same test holds for every frame of `walk_attack` and `backpedal_attack` on the archer.
- [ ] The bow arm still points along the facing at the draw; the bow and its string still draw.
- [ ] ~~The Bone Archer's atlas is byte-identical (`npm run bake -- --check`).~~ *Retired
      2026-11-12 (R7).*
- [ ] The contact sheet shows main's archer `attack` beside the new one, in 8 directions, and the
      owner approves it.
- [ ] The same test holds on the Bone Archer's rig (built as cast.js `skeleton` builds it) on
      every key of its shot, the rig turned to each of the 8 facings; today's values are recorded
      first. Its shot keeps FS-B4SG9 §E R26 (7 keys over the 0.6 s wind-up, nothing nocked on the
      first, the full draw held, the loose on the last).
- [ ] The Bone Archer's re-bake changes only its `creatures` atlas and the manifest; every other
      atlas keeps its bytes; `npm run bake -- --check` reports no changes after it.
- [ ] The Bone Archer's contact sheet shows its old `attack` beside the new one in 8 directions,
      with its `idle` and `walk`, and the owner approves it.

### Edge States

- **A facing where the bow crosses the body when seen.** Two 3D poses that never intersect can
  still overlap on screen in a facing where the bow arm points at the camera; that is depth, not a
  crossing. The owner judges it on the contact sheet.
- **The leg-clearance guard and the frame box.** A new bow-hand position must stay inside the
  sheet's frame box (`boxed` clips may not widen it) and keep FS-HF0WW §C passing.
- **The Bone Archer's grip sits off its hand's line.** The bow hook solves the drawing arm so the
  hand's axis lands on the arrow line; the grip (rig.js `gripAt`) sits off that axis, by 0.008 H
  on the delver and 0.018 H on the hunched skeleton, whose arm chain hangs 0.01 H behind the
  model's centre. "On the arrow line" is held to each rig's own grip offset plus a small margin.
- **The Bone Archer's frame.** Its `attack` sizes its frame (it is not `boxed`), so the new
  pose may change the frame and its atlas; its crown is measured on `idle`, which does not
  change, so its size tier (FS-B4SG9 §E R27) stays.

### Out of Scope

- Any other class's or creature's attack; the bow model; the Shadow Shot hold pose. *Retired
  2026-11-12: "The Bone Archer's shot (R7)".*

## Change: The class attacks move with weight and cut deep
Status: work-order
Date: 2026-11-12

> Written `--from-thread` by write-a-spec on 2026-11-12, during FS-JS7C8's class re-bakes
> (I-JS7C8-6..8). The owner, after the archer's re-bake: "法師 騎士 傭兵 現在的攻擊動作像機器人一樣
> 再順便幫我重新設計一個流暢一點的樣子" (the wizard's, knight's and mercenary's attacks look like a
> robot; redesign them to be smoother while you are at it). Then, on the slashes: "現在砍的動作感覺都只
> 砍了一半就收回 可以砍得深一點 右上砍到左下" (today's slashes look as if they cut only halfway and pull
> back; cut deeper, from upper right to lower left). Then, on repeated slashes: "砍的動作是不是要有一些
> 變化才不會像機器人 我是說連續按時要有兩三個軌跡" (should the slashes vary so they do not look robotic:
> when clicking repeatedly there should be two or three paths), and his choice the same day: "那先兩種
> 軌跡就好" (two paths for now), in the standing attack and both attacks on the move, for the
> slashing classes; on path 2: "但反手的軌跡不要角度都一樣 有一點變化" (but the backhand should not run at
> the same angle; vary it a little); and on the two fighters: "傭兵有拿盾動作可以跟騎士做一點變化" (the
> one with the shield can differ a little from the other; in the code the knight carries the
> kite shield and the mercenary none, so read as: the knight's and the mercenary's swings differ,
> each fitting its kit). Then, the same day: "先改回只有一刀好了 我再看看狀況 不過一刀還是要有各職業風格" (back to a single cut for now, I will see how
> it goes; but the one cut should still have each class's style): R8 and R9 (the second path and
> the chain) are **parked**, kept below as he left them; R2's deep cut and R10's kit styles stand.
> Requirements marked **(owner)** are those words; **(charter default)** settles
> what they left open, with its reason (the coordinator's charter of 2026-11-12); every number is a
> starting value the owner judges at the contact sheet. Anchored here because §E.2 owns each
> class's attack clip ("warrior slash, mage cast"; the mercenary's cut is the knight's slash keyed
> on his own rig, FS-MAMHR §H); the clips gain acceptance criteria they never had, so it is a
> behaviour change, not a tune.

### Facts

1. The knight's attack is `ATTACKS.slash` (`game-client/tools/bake/page/characters/clips.js`):
   7 keys at 12 fps (0.583 s) over a fixed `STANCE` (hips −0.28 rad about y, the left foot
   forward). Only the arm and chest move: the pelvis never turns, the weight never shifts back,
   and the blade goes from ready (key 0) to overhead (keys 1 and 2, almost the same pose) to
   forward-across at chest height (key 3, a 0.035 H lunge) in one frame, then out to the right
   side and back to ready. The mercenary's cut is the same keys with his free arm swung out
   (`attackExtra`, `tools/bake/page/characters/classStyles.js`).
2. The wizard's attack is `ATTACKS.cast`: the same 7 × 12 fps, over a fixed stance (hips −0.15);
   the sceptre gathers, goes overhead (key 2) and thrusts forward at key 3, the orb's glow
   peaking there (`fx.glow` 5), with both hands going forward.
3. The server resolves a hit on the tick the cast arrives; no client event is tied to a frame of
   the clip. The clip's strike is its key 3 (0.25 s in): the slash's blade crossing the front, the
   cast's thrust and glow peak.
4. The same upper body is drawn by `attack`, by `walk_attack` (FS-HF0WW) and by `backpedal_attack`
   (FS-JS7C8 §B): those take the attack's keys from the waist up and the walk's legs below
   (`layerPoses`), so the change reaches all three. The attack sizes the class's frame box (it is
   not `boxed`); the two attacks on the move are `boxed` inside it.
5. A class sheet is baked once per re-bake; FS-JS7C8 slices 6–8 re-bake the knight, the wizard and
   the mercenary at 1.5x (FS-HF0WW `## Change: Class sheets at 1.5x`).

### Requirements

1. **(owner)** The wizard's, knight's and mercenary's attacks read as one body moving, not a
   swap of poses. **(charter default)** Each has:
   - **anticipation**: a wind-up opposite the strike (the weight back, the weapon drawn back)
     before it;
   - **the body leading the weapon**: the pelvis turns into the strike before the chest does,
     the chest before the arm, the weapon last;
   - **arcs**: the weapon's tip travels a curved path, never a straight jump between two keys;
     the keys ease around the wind-up and the end and are far apart through the strike;
   - **weight**: in the standing `attack` the weight goes back at the wind-up and onto the front
     foot at the strike (in `walk_attack` and `backpedal_attack` the legs stay the walk's);
   - **follow-through** past the strike, then a recover.
   Cloth (cloak, robe) follows through the springs as it does today.
2. **(owner, 2026-11-12: "砍得深一點 右上砍到左下")** A slash (the knight's slash, the mercenary's cut)
   cuts a full diagonal: the wind-up raises the blade high on the character's own right, above
   the right shoulder; the strike cuts down and across the front of the body, the body turning
   into it, to low on the character's left, past the left hip; the follow-through carries to that
   low-left end before the recover, never turning back at the middle. Right and left are the
   character's own, so the cut reads the same in every facing. The strike key sits in the middle
   of that arc.
3. **(charter default)** The knight's shield arm counter-balances the cut (drawn in and up as the
   sword comes down); the mercenary's free arm swings out against it.
4. **(charter default)** The wizard's cast: the sceptre is drawn back by the right shoulder, the
   free hand reaching toward the aim; the strike thrusts the sceptre toward the aim, the orb's
   glow peaking, the free hand opening out to the side; then a follow-through and a recover.
5. **(charter default)** Kept: 7 keys at 12 fps (0.583 s), the strike at key 3, the clip names,
   the per-class attack ids and every other clip (R8 adds path 2's). Reason: the server's timing and the art budget
   stay put. If 7 keys cannot read smooth, the best 7 are keyed and the cost of a 14-frame attack
   is reported instead of growing it.
6. No weapon passes through the body or the head on any key of `attack`, `walk_attack` or
   `backpedal_attack` (checked on the 3D pose, the weapon sampled grip to tip).
7. Each class's attack is re-keyed with that class's FS-JS7C8 re-bake (slices 6–8), so each sheet
   is baked once; the knight's and the mercenary's attacks are separate keys, so one can be baked
   without moving the other's atlas. The contact sheet shows the old `attack` beside the new one
   in 8 facings, with the new `walk_attack` and `backpedal_attack`; each ships on the owner's
   approval (§E.7, ADR-0021 §5).
8. *Parked 2026-11-12 (owner: "先改回只有一刀好了 我再看看狀況 不過一刀還是要有各職業風格"); not built, no `backhand` clip is baked.*
   **(owner, 2026-11-12: "連續按時要有兩三個軌跡", "那先兩種軌跡就好")** The slashing classes (the
   knight, the mercenary) carry two swing paths. Path 1, the forehand, is R2's cut, in today's
   clips (`attack`, `walk_attack`, `backpedal_attack`). **(charter default)** Path 2, the backhand,
   cuts from low on the character's left back up across the front of the body to high on its
   right, ending near path 1's wind-up so a chain of swings flows; it keeps R1 (anticipation, the
   body leading, arcs, easing, follow-through) and R5's length, frame count and strike key, and
   is baked as `backhand`, `walk_backhand` and `backpedal_backhand` (the attack-on-the-move clips
   named as `walk_attack` is: the legs' clip, then the upper body's; a suffix after `_` is a
   palette variant, `character.ts` `clip`). The wizard has no second path.
   **(owner, 2026-11-12: "但反手的軌跡不要角度都一樣 有一點變化"; charter default for the numbers)**
   The backhand is not the forehand reversed: path 1 is steep, `FOREHAND_ANGLE` about 55° from
   the horizontal in the character's frontal plane; path 2 is flatter and rising,
   `BACKHAND_ANGLE` about 25°, from the left hip out in front of the body up to about the right
   shoulder's height or a little below, passing further out in front of the chest than path 1.
   The two tip paths' angles differ by at least 25° and path 2 does not retrace path 1's plane.
9. *Parked 2026-11-12 with R8; I-2325V-13 is not built.* **(charter default)** The client alternates the local player's consecutive swings, path 1,
   path 2, path 1 …, on a sheet that carries `backhand`; once `SWING_CHAIN_GAP_MS` (800 ms) passes
   after a swing's clip ends with no new swing, the next starts at path 1. A charge (the warrior's
   dash) plays path 1 whole and starts the chain again. A sheet without `backhand` plays path 1
   every time. The choice of path is drawing only: the server, the hit area, damage, cooldowns and
   the wire do not change (others' swings are not drawn today, FS-JS7C8 Fact 7).
10. **(owner, 2026-11-12: "傭兵有拿盾動作可以跟騎士做一點變化"; charter default for the how)** The
    knight and the mercenary swing differently, each to its kit, both keeping R2 (and R8 if it is
    taken up again). The
    knight (sword and kite shield): heavier and compact; the shield stays up before the chest
    through the cut, never swinging wide nor dropping below the waist; the sword swings from
    beside the shield's edge, its arcs a little shorter and lower than the mercenary's; a strong
    hip turn and a firm step onto the front foot; little flourish. The mercenary (curved dueling
    sword, no shield): lighter and wider; bigger arcs with a wrist turn in the curved blade (a
    drawing cut), more turn of the trunk, the free hand thrown out to the opposite side on each
    cut, a quicker snap through the strike and a short flourish in the recover; his parry still
    raises over the run.

### Acceptance Criteria

- [ ] Clip tests on each class's rig and style, seen red against today's keys where today fails
      them: a wind-up opposite the strike (the tip drawn back against the facing, the weight
      back) before key 3; the pelvis reaching the strike's turn before the chest; the tip's path
      curved, no single key-to-key step carrying most of it; the strike at key 3, unchanged.
- [ ] A slash's tip passes above the character's right shoulder and below its left hip, the
      strike key between them (seen red against today's slash).
- [ ] No weapon sample lies inside the torso or the head on any key of `attack`, `walk_attack` or
      `backpedal_attack`.
- [ ] `attack` keeps 7 frames at 12 fps; `walk_attack` and `backpedal_attack` still last exactly
      as long.
- [ ] *Parked (R8):* The knight's and the mercenary's sheets carry `backhand`, `walk_backhand` and
      `backpedal_backhand` (7, 14 and 14 frames, as path 1's); the backhand's tip runs from below
      the left hip to above the right shoulder (seen red: no such clip).
- [ ] *Parked (R9):* The client alternates path 1 and path 2 on consecutive swings and starts at path 1 again
      after `SWING_CHAIN_GAP_MS`; a sheet without `backhand` plays path 1 every time (seen red
      first).
- [ ] Each class's contact sheet shows its old `attack` beside the new one, 8 facings, with
      `walk_attack` and `backpedal_attack` (for the slashing classes with the cut's tip trace), and
      the owner approves it.

### Edge States

- **The frame box.** A wider wind-up or follow-through may widen a class's frame (the attack
  sizes it); the frames are trimmed, so the atlas grows only by the pixels drawn. The re-bake
  records it.
- **A repeated swing.** Each swing starts its clip from key 0, as today (FS-JS7C8 R13); on a
  slashing class it is the other path's clip while the chain holds (R9).
- **A swing that starts or stops moving mid-way** swaps between the standing and the moving clip
  of the same path at the same point of the shot (FS-HF0WW R13).
- **Walking or stepping back while attacking.** The legs are the walk's; only the weight shift of
  R1 is lost there, by design.

### Out of Scope

- A third path; drawing other players' swings. The archer's shot (its own change above); the mercenary's parry (FS-MAMHR §G.35, a raise into
  a held guard, unchanged); the creatures' attacks; the server's timing or any hit rule.
