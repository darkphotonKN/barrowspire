# FS-KYPQ9: Remainder restyle: hub town props and dressing, skill effects, leftover sweep

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Hub town props and dressing", "Skill and combat effects in the world's art direction", "Cursors and world indicators in the world's art direction" → this FS (brownfield pairs: "Skill and combat effects → FS-none", "Custom cursors and entrance markers → FS-none") · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (2D only at runtime, build-time bake, draw order by footprint), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored in code, never sourced; applies to every prop, effect texture and cursor here), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from `BARROW` only) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Rendering terms" (incl. **Dressing**) · Builds on: [FS-2325V](2325V-pre-rendered-isometric-art.md) (shipped) · Neighbour: [FS-W6BP1](W6BP1-game-canvas-fantasy-reskin.md) (owns HUD panels and canvas type)

> Promoted `--from-thread` from an owner-approved charter (2026-10-05) and the coordinator's
> binding rulings after scope-it. The owner was unavailable; no question was put to anyone. The
> decisions converged without adversarial review **(not challenged)**. The cost of error is
> bounded: client presentation only, baked PNGs and tweens revert cleanly, no contract or data
> touched. Code citations are against `8a5e119` (feat/client-prerendered-art).

## Summary

FS-2325V made the hub and the run look like Ultima Online: baked, lit, gritty. A few things
were left in the old style, and they now stand out. This FS brings them up to the same look.
The hub's market stalls, carts, well, crates and fences become baked props, and the hub gets
more of them so it reads as a lived-in town at dusk: lamp posts and braziers that light the
ground, a hay cart, troughs, a woodpile, sacks, signposts, a washing line, flower boxes,
barrels, and smoke from the chimneys. None of it can be touched or walked into, and none of it
sits where people walk. In the run, the warrior's slash and charge, the sorcerer's fireball and
the archer's arrow get grounded, weighty effects built from baked textures. Fire lights the
ground around it. Hit flashes, the escape burst, the entrance arrows and the pixel-art cursors
are restyled to match. Nothing about how the game plays changes.

## Requirements

### §0. The boundary (binds every section)

1. **No file under `game-server/` changes.**
2. **No client→server message changes shape, meaning or timing.** `CastSkill`, `Attack`,
   `move`, `interact` and the hub's messages are sent exactly as today. No input binding is
   added, removed or rebound.
3. **No new state, WS field or signal.** Every visual in this FS fires off a signal the client
   already has. Each effect section below names its signal. An effect that would need a new
   signal (for example a rival's cast, or a hit-vs-fizzle reason) is out of scope, not designed
   around.
4. **No game logic changes.** No client collider, physics body, hit area or interactable is
   added for any prop or effect. Collision stays server-authoritative.
5. **Built in code, never sourced** (ADR-0021). Every new prop, effect texture and cursor is
   authored in `game-client/tools/bake/` and baked. Its manifest source reads
   `authored: <bake module>` and the project licence.
6. **The bake stays deterministic.** Seeded randomness only. `npm run bake -- --check` reports
   no drift after the new sheets are committed. Atlases stay ≤ 4096².
7. **Colour comes only from `BARROW`** (`src/utils/theme.ts`, via `BARROW_HEX`/`palette`), in
   `src/` and in the bake tool. A needed value that has no token becomes a token first
   (ADR-0013). Code this FS touches carries no `0x`/`#` colour literals. The one exception is
   the multiply identity (untinted white) for a partial tint (§G.1). It is a named constant with
   a comment, as in `LightMap`'s falloff, and it is never a palette colour.
8. **Runtime stays 2D** (ADR-0020). Effects are Phaser sprites, particles, tweens and light-map
   stamps over baked textures. Nothing renders 3D in the browser and no shader is added.
9. Every gameplay calculation keeps using world positions (CONTEXT.md "World position").
   Effects take world positions in and draw through the projection.

### §A. Hub town props and dressing (line: "Hub town props and dressing")

Signal for everything in §A: **the first hub state that carries `walls`**, which already
triggers `HubScene.drawScenery` once (`HubScene.ts` L511, guarded by `this.scenery`). No
per-tick signal is used.

1. **New baked sheets** in the bake tool's prop models (`tools/bake/page/models/props.js` or a
   sibling module), all registered in the catalogue and the manifest:
   - `market_stall`: timber frame, cloth awning, goods on the counter. Three awning variants
     (oxblood, arcaneDeep, barrowBrown), picked by index. The comment at HubScene L700–702
     ("a little colour is honest") still holds.
   - `cart` (spoked wheels, plank bed, shaft) and `hay_cart` (the same cart loaded with hay).
   - `well`: stone ring, timber hoist and roof, bucket.
   - `crate` and `crate_stack` (two or three crates).
   - `fence_x` and `fence_y`: one post-and-rail segment along each world axis, plus `fence_post`
     for run ends.
   - `water_trough`, `woodpile`, `sacks` (two variants: grain sacks, sacks with market goods),
     `signpost`, `washing_post` and `washing_line` (a cloth span between two posts),
     `flower_box`, `chimney`.
   - The existing `barrel`, `lamp_post` and `brazier` sheets are reused as they are.
2. **The existing placeholder props are replaced by their baked sheets** through the existing
   `addProp`/`place` path. The Graphics branches for stalls, carts, well and crates become the
   no-manifest fallback only. Crates draw `crate`/`crate_stack`, no longer `barrel`. Fence runs
   are laid as `fence_x`/`fence_y` segments with a `fence_post` at each end, cut along the run
   the way walls are cut into pieces. Fences get rails on both axes (today only horizontal runs
   do).
3. **The keep-out rule.** Every prop this FS places or moves must stay clear of all of these.
   A prop's footprint is the square `x ± r, y ± r` (the same shape `blocked()` tests), with `r`
   taken from the `r` column of §A.4 (restyled props) or §A.5 (new dressing). **A fence run
   clears only if every segment clears**, not just its start point: the footprint is the square
   `± r` swept along the whole run, from `(x, y)` to its far end along its axis.
   - **K1 buildings:** `blocked(x, y, r)` is false. `blocked()` and `ROOF_EAVE` are **not
     relaxed** (coordinator ruling 4).
   - **K2 trodden paths:** the square does not overlap any `PATHS` rect (HubScene L112–116).
   - **K3 spawn:** the centre is more than `60 + r` from (1000, 800).
   - **K4 NPC talk range:** the centre is more than `NPC_TALK_RANGE (80) + r` from each function
     NPC, at (860, 680) and (1140, 680).
   - **K5 hearth:** the centre is more than `80 + r` from `HEARTH` (1000, 640) (HubScene L84).
   - **K6 resident wander regions:** the square does not overlap any of Cottar (560, 560,
     260×200), Herbwife (1120, 540, 260×220), Woodcutter (700, 820, 300×140) or Bellringer
     (1180, 820, 280×140). Rects are top-left x, y and w×h, as `WanderSystem.choose` reads them.
   - **K7 map:** the square stays inside the 2000×1000 hub.

   K3–K6 are read-only facts copied from the server (`hub_map.go`, `constants/game.go`). They
   live in one client constant, for example `HUB_KEEP_OUT`, with a comment naming those files.
   A vitest checks every placement in §A.4 and §A.5 against it. The scene still calls
   `blocked()` at draw time for every prop, as it does today.
4. **Restyled props: kept and moved.** Props that already pass the keep-out rule keep their
   coordinates. The ones that sit inside a wander region today move. Residents would otherwise
   walk visibly through a solid-looking baked stall.

   | Prop | Today | After | r | Why |
   |---|---|---|---|---|
   | well | (820, 460) | unchanged | 22 | clear |
   | market stall | (700, 500) | unchanged | 40 | clear |
   | market stall | (1240, 560) | **(1220, 460)** | 40 | was inside Herbwife's region |
   | market stall | (1340, 900) | **(630, 950)** | 40 | was inside Bellringer's region |
   | cart | (540, 430) | unchanged | 26 | clear |
   | cart → **hay cart** | (1420, 900) | **(400, 880)** | 26 | was inside Bellringer's region; charter makes one cart the hay cart |
   | crates | (1300, 470), (1330, 500) | unchanged | 14 | clear |
   | crate | (520, 760) | **(530, 730)** | 14 | sat on the west fence run's end post |
   | crate | (880, 900) | **(1050, 910)** | 14 | was inside Woodcutter's region |
   | crate stack | (910, 872) | **(1110, 935)** | 14 | was inside Woodcutter's region |
   | fence run | (300, 760, 220, horizontal) | unchanged | 20 | every segment clear (x 300–520 at y 760) |
   | fence run | (1620, 300, 180, horizontal) | **(1740, 300, 180, horizontal)** | 20 | its west end stood behind the east house; every segment clear (x 1740–1920 at y 300) |
   | fence run | (700, 940, 260, horizontal) | **(240, 950, 240, horizontal)** | 20 | was inside Woodcutter's region; the moved run is clear along every segment (x 240–480 at y 950) |

   Coords revised by coordinator: originals hidden behind east roofs. The moved stall and hay
   cart (and, in §A.5, the east trough, the market goods, the east signpost, the east flower box
   and the barrel by the east stall) stood west or north of the east and south-east houses, where
   the fixed camera sees only the roof. They now stand in the open south-west yard, beside the
   main path's south end, and on the east house's east face. The same visibility pass also
   moved the props the default view showed mostly covered by a roof, a tree or another prop: the
   second fence run (its west end behind the east house), the crate on the west fence's end
   post, the crate behind the south tree, the trough behind the well, the two grain sacks and
   the north-east flower box behind the stalls. Every new spot clears K1–K7, and every placed
   prop shows at least 70% of its body in the whole-hub view.

   All three fence runs were re-checked by sweeping the `r = 20` square along each whole run
   against K1–K7. All three pass.

   Lamp posts (`LAMP_POSTS`), trees and bushes are already in the target look. This FS does not
   touch them and does not move them, so the keep-out vitest does not cover them.
5. **New dressing.** All baked, all through `place()` and `blocked()`. Coordinates are world px
   (server space). `r` is the radius used for `blocked()` and the keep-out check. **Tall** props
   join `occluders` and fade over the delver (FS-2325V §C.5). **Lit** props stamp the hub
   light-map through their manifest light, on the existing `place(…)` → `lightMap.add` path.

   | Dressing | Sheet | At | r | Tall | Lit |
   |---|---|---|---|---|---|
   | lamp post, west of the spawn walk | `lamp_post` | (925, 760) | 12 | yes | yes |
   | lamp post, east of the spawn walk | `lamp_post` | (1085, 760) | 12 | yes | yes |
   | brazier at the north end of the main path | `brazier` | (1000, 430) | 16 | yes | yes |
   | brazier between the west house and the Cottar's quarter | `brazier` | (515, 600) | 16 | yes | yes |
   | water trough by the well | `water_trough` | (750, 450) | 20 | no | no |
   | water trough by the hay cart | `water_trough` | (310, 840) | 20 | no | no |
   | woodpile at the edge of the Woodcutter's quarter | `woodpile` | (660, 880) | 24 | no | no |
   | grain sacks by the west stall | `sacks` (grain) | (620, 490) | 12 | no | no |
   | grain sacks by the north stall | `sacks` (grain) | (1150, 460) | 12 | no | no |
   | market goods by the south-west stall | `sacks` (goods) | (600, 840) | 12 | no | no |
   | signpost beside the north end of the main path | `signpost` | (1085, 520) | 10 | yes | no |
   | signpost beside the south end of the main path | `signpost` | (1050, 880) | 10 | yes | no |
   | washing line along the north-west house's south face | `washing_post` ×2 + `washing_line` | posts (640, 405) and (720, 405) | 8 per post | yes | no |
   | flower box, north-west house | `flower_box` | (880, 402) | 10 | no | no |
   | flower box, north-east house | `flower_box` | (1230, 402) | 10 | no | no |
   | flower box, north-east house | `flower_box` | (1290, 402) | 10 | no | no |
   | flower box, east house's east face | `flower_box` | (1822, 460) | 10 | no | no |
   | barrel by the west cart | `barrel` | (575, 475) | 12 | no | no |
   | barrel by the south-west stall | `barrel` | (610, 810) | 12 | no | no |
   | barrel by the west fence | `barrel` | (340, 800) | 12 | no | no |

   - Wall-hugging dressing (washing line, flower boxes) sits **just outside eave clearance**, so
     it reads as standing against the wall while `blocked()` stays false. It is not promised to
     line up with a baked window. A wall-hugging prop that cannot clear the eave is dropped, not
     forced in (coordinator ruling 4). Every entry above clears it.
   - The washing line's footprint is its two posts. The line and cloth draw between them and
     sort by the span's midpoint.
   - Variant picks (sacks, stall awnings, crate vs stack) are by index or `tileHash(x, y,
     SCENERY_SEED)`, so every client sees the same hub.
6. **Chimneys and smoke.**
   - Each hub house (five, grouped from walls by `house_id` through `housesFrom`) gets one
     `chimney` on its roof. The chimney sits on the camera-facing slope, so the stack visibly
     rises from the roof, at a spot derived from the house bounds and `tileHash`, so it is the
     same on every client. It is drawn and sorted with that house's roof pieces and joins the
     roof's `parts`, so it hides whenever the roof hides (`hideRoofOverhead`).
   - Revised by coordinator: north-half stacks read as ground pillars from the SE camera.
   - The chimney is part of the building's drawn roof, not a ground prop. It is therefore the
     one placement that does not go through `blocked()` (it would always be blocked) and is not
     subject to §A.3. It has no footprint on walking ground.
   - Each chimney carries one continuous smoke emitter at its top: soft grey puffs from a baked
     `fx_smoke` texture tinted `slate`/`vellumFaint`, alpha ≤ 0.35, drifting with one fixed
     wind direction for the whole hub. Each puff lives 4000 ms and grows at most to 1.6× as it
     disperses. At most 10 puffs are alive per chimney.
   - Smoke draws **under** the light-map, so it darkens with dusk like everything else, and it
     stamps no light.
   - The emitter stops and is destroyed on scene SHUTDOWN/DESTROY and whenever scenery is
     rebuilt.
7. **Dressing is decoration only** (CONTEXT.md "Dressing"):
   - never `setInteractive`, never given a hit area or cursor change;
   - never added to any physics group or collider;
   - adds nothing to any message;
   - a delver can walk through it visually, which is why placement keeps it off walking ground
     and not because anything would stop them.

   A prop that would need collision to make sense is an escalation, never a client collider.
8. **Light budget.** The hub's lit props become its existing sources plus four new ones (two
   lamp posts, two braziers), plus the delver's pool. They go through the existing cull. Name
   plates stay markers above the light-map (FS-2325V §C.9), so new light never washes them out.
9. **Fallback.** With no manifest, or a sheet missing, each prop falls back exactly as today:
   the Graphics placeholder where one exists, and nothing drawn for new dressing types that have
   no placeholder. Chimney smoke needs the `chimney` sheet and is skipped without it.

### §B. Effect rules: "no silly animations" (lines: "Skill and combat effects in the world's art direction", "Cursors and world indicators in the world's art direction")

Every effect in §C–§H obeys these rules. They are written so a test can check them.

1. **One effects module.** Effect definitions live in `src/render/effects/` as a typed data
   table, one entry per effect, giving duration, easing, colour tokens, particle counts and
   scale range. Scenes call the module through thin hooks. The table is what vitest asserts on.
2. **Fixed durations.** Each one-shot effect has one fixed duration in ms, a literal in the
   table, never randomised. The table values:

   | Effect | Duration |
   |---|---|
   | warrior slash | 220 ms |
   | warrior charge dust burst | 450 ms (drag trail 350 ms) |
   | fireball cast | 160 ms gather, cast light 200 ms |
   | fireball impact | flare 120 ms, light decay 500 ms, falling embers 600 ms, scorch fade 1200 ms |
   | fireball trail particle | 300 ms life |
   | arrow release | 140 ms |
   | arrow trail particle | 180 ms life |
   | arrow impact | 300 ms |
   | hit feedback | 220 ms |
   | death dust settle | 600 ms |
   | escape | 1000 ms |
   | entrance marker breath | 2400 ms period (continuous) |
   | chimney smoke puff | 4000 ms life (continuous) |

   **No one-shot effect exceeds 1200 ms.**
3. **Easing allowlist.** Only `Linear`, `Sine.*`, `Quad.*` and `Cubic.*` easings. **No
   `Bounce`, `Elastic` or `Back` easing** of any variant, anywhere in `src/render/effects/` or
   in an effect call site in the scenes.
4. **No squash-and-stretch, no scale bounce.**
   - No tween sets `scaleX` and `scaleY` to different values.
   - No tween on `scale` uses `yoyo` or `repeat`.
   - Scale only ever grows monotonically, for dust and smoke dispersing, and ends at ≤ 1.6×.
   - Projectile cores and the arrow never scale.
   - `yoyo` is allowed on **alpha only**, and only for the entrance marker's breath (§H.1).
5. **No camera shake.** The cap is **zero**. No `cameras.main.shake` (or any camera
   shake/flash/zoom punch) is called by any effect, in either scene.
6. **No confetti.** No radial `explode`/burst throws particles outward in all directions. A
   one-shot emits at most **12** particles. Trails emit at most one particle per 40 ms per
   projectile, except the arrow's air-streak (§F.2): two per ≥ 40 ms, at most 12 alive.
   Debris falls under gravity or settles. It never sprays outward.
7. **Colour channels.** Every colour is a `BARROW` key (typed `keyof typeof BARROW_HEX`), with
   no hue-cycling tint arrays. **Transient effects** (everything in §C–§G, and the entrance
   marker in §H.1) use at most 3 colours each. **Baked cursor textures (§H.2) are exempt from
   the cap.** They are static art, not effects, and still use only `BARROW` keys.
   - **Fire:** `ember`, `amberBright`, `barrowDeep`/`pitch` for smoke and scorch. The
     `amberBright` in the fireball core (§E.2) is **torch warmth**, the same family as a flame
     on a brazier. It is not the amber accent that marks things the player can act on. The
     accent rule below, and its test, constrain only the `amber` key.
   - **Steel and dust:** `slate`, `slateLight`, `vellumDark`, `vellumFaint`, `barrowBrown`.
     `vellum`/`vellumDark` are also allowed for the steel smear, the dust that must read on the
     run's ground (§D, §G.2) and the arrow's air-streak (§F.2). Revised by coordinator: FS tints
     were invisible at game scale over the run's ground.
   - **Hit:** `oxblood` only.
   - **Escape:** `vellum`/`vellumFaint`.
   - **`amber` is used only where the delver can act** (guideline "Gameplay accent"): the
     entrance marker and the cursor's strike-mark. No projectile, spark or impact is amber. No
     effect is white or uses an unlisted saturated value.
8. **Sorting.** World effects sort by footprint through the projection, like props. Only the
   light-map stamps sit in the light layer. No effect draws above the HUD.
9. **Teardown.** Every effect's sprites, emitters, tweens and light handles are destroyed:
   - when their duration ends;
   - when their owner goes (a projectile leaving state, a rival leaving the list);
   - on `resetRun` (`BarrowspireScene.ts` L341–401, next to `projectileSprites.clear()` L386);
   - on scene SHUTDOWN/DESTROY.
10. **Textures are baked.** The bake emits one `fx` sheet set: `fx_slash` (a ground smear),
    `fx_dust`, `fx_ember`, `fx_fire_core`, `fx_smoke`, `fx_scorch`, `fx_glow` (a soft ground
    decal), `fx_escape_column`, `fx_arrow` (shaft, iron head, fletching, side-on), and the
    cursors (§H.2). The no-manifest fallback for an effect is **to play nothing**, logged once.
    It never brings back the old circles.

### §C. Short-lived light on the light-map (line: "Skill and combat effects in the world's art direction")

1. `LightMap` (`src/render/lighting/LightMap.ts`) gains **short-lived sources** alongside
   `add()`. A call returns a handle the caller can move (update `x`/`y`), fade (intensity
   0..1), and `remove()`. An optional lifetime removes the source by itself.
2. Short-lived sources are culled and stamped with the same code as fixed sources (`cullInto`,
   `stamp`). The light-map is still built once and restamped per frame, never rebuilt
   (FS-2325V §C.7).
3. At most **16** short-lived sources are lit at once. Past the cap, the oldest is dropped
   first. Fixed sources and the delver's pool are never dropped.
4. All short-lived sources are cleared on scene SHUTDOWN, and on `resetRun` in the run.
5. A short-lived source has no flame halo. Indoors, its pool follows the existing rule: it
   lights the floor under a roof and shows no halo.
6. Colours are `BARROW` tokens: `ember` for fire, `vellum` for the escape column.

### §D. Warrior: slash and charge (line: "Skill and combat effects in the world's art direction")

1. **Slash.** Signal: the warrior's own left click, on the same branch that sends
   `CastSkill {skill_id: "slash"}` (`BarrowspireScene.ts` L2668–2688), and the rival click
   that sends `Attack` (L3360–3376).
   - A steel smear (`fx_slash`, tinted `vellumDark`/`vellum`) is laid on a world plane
     (`addWorldPlane`), so it lies on the isometric ground and not flat on the screen. It sorts
     over the delver and over anything on the aim within melee reach, so neither hides it.
   - It sweeps the arc toward the clamped target from the delver's world position, with a
     heavier leading edge, and fades out with `Quad.easeOut` over 220 ms.
   - Up to 4 `fx_dust` motes (`vellumDark`) settle at the delver's feet.
   - Revised by coordinator: FS tints were invisible at game scale over the run's ground.
   - No flash, no shake.
   - The effect plays the moment the message is sent, as today. It is not timed to the attack
     clip's strike frame.
   - `playWarriorSlashEffect` and `playAttackEffect` share this one implementation, fed world
     positions. The on-send `setTint(palette.damage)` on the clicked rival (L1476) is removed,
     so hit feedback comes only from a real HP drop (§G.1).
2. **Charge (dash).** Signal: the warrior's own right click, on the branch that sends
   `CastSkill {skill_id: "dash"}` (L2713–2720).
   - A low dust burst at the start point: up to 8 `fx_dust` motes (`vellumDark`/`vellumFaint`)
     that spread a little along the ground and settle rather than pop, over 450 ms.
   - A faint dust drag trail (`vellumDark`/`vellumFaint`), kicked back along a short segment
     behind the start along the charge direction on the ground plane, over 350 ms.
   - Revised by coordinator: FS tints were invisible at game scale over the run's ground.
   - No bright streak line. The `0x8a929a` and `torchCore` streak go.
   - The server moves the delver. The effect never predicts or marks where the charge lands.

### §E. Sorcerer: fireball (line: "Skill and combat effects in the world's art direction")

1. **Cast.** Signal: the mage's own click, on the branches that send
   `CastSkill {skill_id: "fireball"}` (L2696–2702) and `{skill_id: "triple_fireball"}`
   (L2721–2727). One cast effect per send.
   - A few `fx_ember` motes are drawn in toward the casting hand and brighten, over 160 ms.
   - A short-lived `ember` light at the caster lasts 200 ms (§C).
   - The `0xffa500` scale-flash goes.
2. **Flight.** Signal: a `ProjectileState` whose `projectile_type` is not `"arrow"`, in
   `updateProjectiles` (L2975). The first sight of an `entity_id` creates it, and each tick
   moves it.
   - The core is `fx_fire_core` (baked `ember` → `amberBright`), drawn at chest height as today
     (`standAt(…, 5)`). It is steady: no pulse, no yoyo, no scale tween. The three stacked hex
     circles and the 150 ms pulse go.
   - A trail of `fx_ember`/`fx_smoke` particles is emitted behind it, opposite the projected
     velocity: one per ≥ 40 ms, 300 ms life.
   - A short-lived `ember` light rides on the core and is moved every frame (§C).
3. **Impact.** Signal: the projectile's `entity_id` is absent from a state (hit or max range;
   the client cannot tell which, so both get one effect).
   - A brief flare at the last world position (120 ms).
   - The fireball's light jumps up, then decays over 500 ms, and is removed.
   - Up to 8 embers fall under gravity and fade (600 ms).
   - An `fx_scorch` smudge (`pitch`/`barrowDeep`) lies on the ground and fades over 1200 ms.
   - No radial burst, no white, no shake.

### §F. Archer: arrow (line: "Skill and combat effects in the world's art direction")

1. **Release at the bow.** Signal: the archer's own click, on the branches that send
   `CastSkill {skill_id: "arrow"}` (L2689–2695) and `{skill_id: "triple_arrow"}` (L2728–2734).
   One release per send.
   - At the bow (16 px along the aim from the delver's projected position, as today, lifted to
     bow height above the feet): a faint string-snap shimmer (`vellumDark`, no glow), plus 2–3
     tiny `fx_dust` fibre motes in `vellumDark`/`vellum`, 140 ms.
   - Revised by coordinator: FS tints were invisible at game scale over the run's ground.
   - No white streak, no `0xd4a373` puff.
2. **Flight.** Signal: a `ProjectileState` with `projectile_type === "arrow"`.
   - The baked `fx_arrow` sprite is drawn at chest height and rotated to the projected velocity
     exactly as today (L3023–3027). The hex-drawn Graphics arrow goes. Its shaft and fletching
     are pale enough to read at 1× on dark ground, and a very faint short `vellum` streak is
     baked behind the nock: a hairline that tapers out, no glow.
   - **A subtle trail travels with the arrow, clearly visible at 1×:** short-lived `fx_dust`
     air-streak motes (`vellumDark`/`vellum`, alpha ≤ 0.55) are emitted behind the arrowhead,
     two per ≥ 40 ms, at most 12 alive, 180 ms life. The trail follows the arrow and dies with
     it. Revised by coordinator: FS tints were invisible at game scale over the run's ground.
   - The arrow stamps no light.
3. **Impact.** Signal: the arrow's `entity_id` is absent from a state. A small dull puff of
   dust and splinters (`barrowBrown`/`vellumDark`, up to 6 particles) drops to the ground over
   300 ms. No white, no radial chips.
4. **Rival projectiles.** `ProjectileState` is global and carries no owner. A rival's
   fireballs and arrows therefore get flight, trail, light and impact like the delver's own.
   Release and cast effects play only on the delver's own send. They are not replayed when a
   projectile is first seen.

### §G. Hit, death and escape feedback (line: "Skill and combat effects in the world's art direction")

1. **Hit.** Signal: a drop in `current_player.current_health` (L2917–2927) or in a rival's
   `current_health` (L3431–3438).
   - The struck character is tinted part of the way toward `oxblood`: at most 50% of the way
     from untinted at the peak. It eases back to untinted with `Quad.easeOut` over 220 ms. This
     replaces the full `setTint(palette.damage)` flat fill.
   - The tint goes on the drawn character only. It does not touch world position, the camera,
     `standAt` or `markerBase`, so the name plate and HP bar do not jitter.
   - No knock-back offset, no numbers, no blood (guideline *Enemy design language*: no gore).
2. **Death.** Signal: the existing `isDead` transition (health ≤ 0), which already plays the
   baked death clip (FS-2325V §E).
   - When that clip completes, a low `fx_dust` settle (`vellumDark`/`vellumFaint`, up to 6
     motes) plays on the ground at the body's feet over 600 ms, sorted in front of the corpse.
   - Revised by coordinator: FS tints were invisible at game scale over the run's ground.
   - Nothing else: no flash, no burst, no markers on the corpse.
3. **Escape.** Signal: `current_player` becomes `null` (L2934–2938), or a rival drops out of
   `other_players` (L3290–3293).
   - The 30-particle radial burst (`playEscapeParticles`, L1780–1796, and its texture
     L1771–1777) is replaced by a quiet column of pale light (`fx_escape_column`,
     `vellum`/`vellumFaint`) at the escape point.
   - Up to 10 slow rising motes go with it, plus a short-lived `vellum` light (§C). All of it
     fades over 1000 ms.
   - A rival leaving the list may mean escape, death clean-up or disconnect, and the trigger is
     kept as it is. So the effect reads as *gone*, not as triumph.

### §H. Cursors and world indicators (line: "Cursors and world indicators in the world's art direction")

1. **Entrance marker.** Signal: unchanged. It is built once per building in `updateWalls`
   (L1994–2020), hidden in `enterBuilding` and shown in `exitBuilding` (L3585–3606).
   - The amber triangle and stroked ring are replaced by a soft amber ground glow (`fx_glow`,
     tinted `amber`), laid on a world plane at the same threshold point.
   - It breathes slowly and shallowly: alpha 0.55 ↔ 0.85, `Sine.easeInOut`, 2400 ms period.
   - No arrow, no outline, no scale change.
   - It stays amber because an entrance leads to a door the delver can act on.
2. **Cursors.** Signal: unchanged. `setupCustomCursor` (`BarrowspireScene.ts` from L2407)
   installs them at scene create, and the rival `pointerover`/`pointerout` swaps them
   (L3410–3421).
   - The canvas-drawn pixel-art gloved hand and pixel strike-mark (CELL 2,
     `imageSmoothingEnabled = false`) are replaced by two baked, linearly filtered 32×32
     cursors: `cursor_gauntlet`, an iron-and-leather gauntlet in
     `slate`/`slateLight`/`vellumDark`/`brass`, and `cursor_strike`, a brass ring with amber
     ticks and oxblood pips.
   - Each cursor's hotspot is taken from its manifest anchor and scaled with the image, so the
     click point is unchanged (gauntlet: fingertip; strike-mark: centre).
   - The browser fallback stays `default`/`crosshair` as today.
   - The comment citing the retired pixel-art rule goes.
3. **Hub cursor.** The hub installs the same `cursor_gauntlet` as its default cursor at scene
   create, so hub and run match. Hovering a dialogue option no longer switches to the browser
   `"pointer"` (HubScene L1173–1175). The option's existing text brighten to `vellum` is the
   hover cue. No strike-mark in the hub (nothing hostile).

### §I. Hub queue panel colour (line: "Hub town props and dressing")

1. The queue progress text (`showQueueProgress`, HubScene L874–892, signal: `queue_status`)
   changes from `amber` to `vellum` on its `charcoal` ground. The delver cannot act on it, so
   amber there breaks the guideline's accent rule. This is a palette fix only: copy, position,
   size, font, depth and trigger are unchanged. It is not a panel redesign (coordinator rulings
   1 and 2).

## User Stories

1. As a delver in the hub, I want the market stalls, carts, well, crates and fences to look baked and lit like the houses around them, so that the town reads as one place and not two art styles.
2. As a delver in the hub, I want more of the everyday clutter of a town (troughs, a woodpile, sacks, barrels, a washing line, flower boxes), so that the hub feels lived-in and cosy.
3. As a delver in the hub after dusk, I want lamp posts and braziers that throw warm pools on the ground, so that I can see where the town gathers.
4. As a delver in the hub, I want smoke rising from the chimneys, so that the houses feel inhabited.
5. As a delver in the hub, I want nothing decorative standing on the paths, at the spawn, by the hearth or in front of the NPCs, so that I can walk and talk without weaving around clutter.
6. As a delver in the hub, I want no decoration to block me, react to my clicks or change my cursor, so that scenery never pretends to be something I can use.
7. As a delver watching hub residents, I want them never to walk through a solid-looking stall or cart, so that the town stays believable.
8. As a delver in the hub, I want tall dressing (signposts, lamp posts, washing-line posts, the well) to fade when I stand behind it, so that I never lose my character.
9. As a delver playing a warrior, I want my slash to read as a heavy blade sweeping the ground in front of me, so that a hit feels weighty and not like a thin screen line.
10. As a delver playing a warrior, I want my charge to kick up dust along the ground, so that I feel the burst of speed without a cartoon streak.
11. As a delver playing a sorcerer, I want embers to gather at my hand when I cast, so that the cast reads as drawing fire, not as a flat orange flash.
12. As a delver playing a sorcerer, I want my fireball to burn steadily, trail embers and light the ground as it flies, so that fire feels like fire in a dark barrow.
13. As a delver, I want a fireball's impact to flare, scorch the ground and let embers fall, so that it lands with weight and no confetti or shake.
14. As a delver playing an archer, I want a small release at my bow when I shoot, so that I feel the string let go.
15. As a delver playing an archer, I want my arrow to look like a real arrow with a faint trail behind it, so that I can follow its flight without it shouting.
16. As a delver, I want an arrow strike to puff a little dust and splinters, so that I know where it landed.
17. As a delver, I want to see a rival's fireballs and arrows fly, light and land the same way mine do, so that I can read incoming fire.
18. As a delver who takes damage, I want a brief darkening toward oxblood, so that I notice the hit without my lit character turning into a flat red shape.
19. As a delver, I want a fallen character to settle into a little dust when the death clip ends, so that death has weight and no gore.
20. As a delver who escapes, or who watches someone escape, I want a quiet column of pale light, so that the moment reads as *gone* and not as a party.
21. As a delver, I want the entrance glow to stay amber and breathe slowly on the ground, so that I can find a door without a bouncing arrow.
22. As a delver, I want a smooth gauntlet cursor, and a strike-mark over a rival, in the same art as the world, so that the pointer does not look like a leftover from a pixel game.
23. As a delver moving from hub to run, I want the same cursor in both, so that the two places feel like one game.
24. As a delver waiting in the delve queue, I want the progress text in neutral vellum, so that I do not mistake it for something I can click.
25. As a delver whose cast the server rejects, I want the same cast effect as today, so that nothing about input responsiveness changes.
26. As a delver on a modest machine, I want effects to stay cheap (capped particles, capped lights), so that a triple fireball does not stutter the frame.
27. As the game server, I want to receive exactly the messages I receive today, so that no server change is needed.
28. As a developer, I want every effect's duration, easing, colours and particle counts in one typed table, so that "no silly animations" is a test, not a matter of taste.
29. As a developer, I want every new prop and effect texture baked deterministically, so that a re-bake churns nothing in git.
30. As a reviewer, I want every hub dressing coordinate checked against the walking ground and the residents' quarters by a test, so that clutter never creeps onto a path.

## Acceptance Criteria

All commands run from `game-client/` with Node 22 on the path:
`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH` (the default Node is too old for Next).

- [ ] `git diff main... -- game-server/` and `git status --porcelain -- game-server/` are both empty.
- [ ] Diff review of `SocketManager` sends and every scene `sendMessage` call shows no change to action, payload, timing or input binding.
- [ ] `npm test` passes, including the new and updated tests below.
- [ ] `npm run lint` passes.
- [ ] `npm run lint:fence` passes.
- [ ] `npm run bake` then `npm run bake -- --check` exits 0 with no drift, and a second `npm run bake` leaves `git status -- public/art` clean.
- [ ] Every atlas in `public/art/` is ≤ 4096².
- [ ] The manifest schema vitest covers every new sheet (§A.1, §B.10, §H.2): frame size, anchor, directions and frame counts are set, and source reads `authored: <module>` with the project licence. Lit props declare a light whose colour is a `BARROW` key.
- [ ] Keep-out vitest: every placement in §A.4 (moved and kept props) and §A.5 (new dressing) clears K1–K7 using its table `r`, computed from `HUB_KEEP_OUT` and the hub building rects. Fence runs are checked along every segment, not only the start point. A deliberately bad placement fixture fails it: one prop inside a `PATHS` rect, and one fence run whose start clears but whose span crosses a `PATHS` rect.
- [ ] Grep and code review: no new prop calls `setInteractive`, adds a hit area, joins a physics group or changes the cursor, and every new ground prop goes through `blocked()`.
- [ ] Effects-table vitest (§B):
  - every one-shot duration is a fixed literal ≤ 1200 ms;
  - every easing is in the allowlist;
  - no entry has unequal `scaleX`/`scaleY`, a scale `yoyo`/`repeat`, or an end scale > 1.6;
  - every colour is a `BARROW` key, at most 3 per transient effect (baked cursor textures exempt);
  - the `amber` key appears only in the entrance-marker and strike-mark entries (`amberBright` in fire is not constrained by this check);
  - `oxblood` appears only in the hit and strike-mark entries;
  - no one-shot emits more than 12 particles.
- [ ] Source-scan vitest over `src/render/effects/**`, `src/scenes/BarrowspireScene.ts` and `src/scenes/HubScene.ts`: no `Bounce`, `Elastic` or `Back.` easing string, no `.shake(`, and no `explode(`.
- [ ] `grep -nE '0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}' src/render/effects` is empty. None of the replaced effect bodies listed in §D–§H (fireball, arrow, dash, escape, entrance marker, cursor) still contains a colour literal.
- [ ] `LightMap` vitest: a short-lived source stamps while alive; it is gone after `remove()` and after its lifetime; it moves when its handle moves; the 17th source drops the oldest; fixed sources are never dropped; the texture is not recreated.
- [ ] Manual check in the run (preview on :3939): each of slash, charge, fireball cast/flight/impact, arrow release/flight/trail/impact, hit, death dust, escape and the entrance glow plays on its named signal and matches §D–§H, with no visible bounce, squash, confetti, white or shake.
- [ ] Manual check: fireball light moves with the projectile and decays after impact.
- [ ] Manual check: `resetRun` and leaving the scene leave no orphan emitter, sprite or light (scene display list and light-map source count back to baseline).
- [ ] Manual check in the hub: every §A.4/§A.5 prop shows baked at its coordinate; lamps and braziers light the ground; chimney smoke rises under the light-map; residents never cross a prop; the queue text is vellum; the cursor is the gauntlet. Screenshots are judged against the shipped FS-2325V look and guideline Part I.
- [ ] `game-client/CONTEXT.md` defines **Dressing** under "Rendering terms".

## Edge States

- **Cast the server rejects** (no MP, on cooldown): the cast effect still plays on the send, as today. Showing it only on acceptance would need an echo, which is a new signal and out of scope.
- **Hit vs max-range fizzle:** indistinguishable (no reason field), so one impact effect for both.
- **Projectile first seen far from its caster** (30 Hz server, 60 Hz render): flight and trail start where the projectile is first drawn. Nothing is back-filled to the caster.
- **Projectile seen for a single tick:** created, then gone next tick. Impact plays at its one known position, and its light is created and removed cleanly.
- **Many projectiles at once** (`triple_fireball`, several mages): trails respect the per-projectile emit rate; lights respect the 16-source cap, oldest dropped first; off-screen lights are culled.
- **Reconnect or `resetRun` mid-flight:** projectile sprites, trail emitters and short-lived lights are destroyed with `projectileSprites.clear()`. No impact effect plays for projectiles cleared by a reset.
- **Scene SHUTDOWN/DESTROY with effects running:** every tween, emitter, sprite and light handle is destroyed. Nothing fires after shutdown.
- **Impact under a roof, delver outside:** the pool lights the floor and no halo shows through the roof (existing `haloWhen` pattern). Effect sprites under a hidden-roof house follow the roof's normal sorting.
- **Hit during the death transition:** the hit tint may overlap the start of the death clip. The tint still eases back to untinted and never sticks on the corpse.
- **Hit on a rival who leaves the list mid-tint:** the tint tween is destroyed with the sprite.
- **Escape at the map edge or off-screen:** the column plays at the world point and its light is culled like any other.
- **Rival leaves by disconnect:** the same quiet column plays (the trigger is unchanged), which is why it reads as *gone*.
- **Hub state arrives without walls:** scenery (props, dressing, chimneys, smoke) waits, as today.
- **Hub scene re-created** (return from a run): scenery and smoke emitters are built once per scene instance. A previous instance's emitters are destroyed on its SHUTDOWN.
- **Manifest missing or a sheet missing:** a restyled prop falls back to its existing Graphics placeholder. New dressing with no placeholder, chimney smoke and effects draw nothing, logged once. Cursors fall back to `default`/`crosshair`. Nothing crashes and gameplay is unaffected.
- **A server-side map change** (a building, path or wander region moved in `hub_map.go`): `blocked()` still refuses props inside walls at draw time. The keep-out constants are a hand copy, so a moved region needs the constant updated. The keep-out vitest is the place that drift is caught at review.
- **Browser refuses the custom cursor** (size or format): the CSS fallback (`default`/`crosshair`) applies, with the hotspot irrelevant.
- **Window resize:** the light-map refits as today (FS-2325V). Effects drawn in world space are unaffected.

## Out of Scope

- Anything under `game-server/`. Any new or changed WS field, message, REST call, input binding or game rule.
- **HUD panels:** the controls panel, end-of-run overlay, notifications, HUD readouts and `EquipmentPanel` stay with FS-W6BP1 (coordinator ruling 1). In-canvas world visuals only. The hub queue panel's colour (§I) is the one HUD-adjacent change, and it is palette-only.
- **The NPC dialogue panel's chrome** (already charcoal plus brass). Only its hover cursor changes (§H.3).
- **Rival cast effects:** a rival's cast flash, slash arc or charge dust. Also any **hit-vs-fizzle split** and any **rejected-cast feedback**. All three need new signals (coordinator ruling 8).
- **Fallback-only paths:** `createMapBackground` (sci-fi residue), `createMetalFloorTexture`, the placeholder delver, chest, escape-door and switch textures, the hub's non-baked `drawScenery` branches, `drawGround`, placeholder roofs and the hearth `flicker` (coordinator ruling 7).
- **Dead scenes:** `GameOverScene.ts`, `GameScene.ts` and `src/utils/Background.ts` are not restyled or deleted (coordinator ruling 7).
- **The ADR-0013 lint fence gap** (`0x` literals not matched; scenes exempted): not fixed here. Code this FS touches still uses `BARROW` tokens only (coordinator ruling 10).
- **Relaxing `blocked()` or `ROOF_EAVE`** to let dressing touch walls (coordinator ruling 4).
- **Moving lamp posts, trees or bushes**, which are already in the target look, or changing the hub building layout.
- Timing the slash to the attack clip's strike frame (it plays on send, as today).
- Knock-back of struck characters, damage numbers, blood or gore.
- Screen shake of any size.
- Real-time 3D, WebGL shaders, or dropping the bake for runtime effects (that would be an ADR, ADR-0020).
- Client colliders for props (collision is server-authoritative).
- Sound, a day/night cycle, a lore name for the hub.
