# ADR-0020 — Game-canvas art is pre-rendered 3D, baked at build time into isometric 2D sprites; the projection is presentation only

Status: accepted
Date: 2026-09-27
Scope: `game-client` in-game canvas (Phaser scenes, sprites, tiles, lighting). Not the web/platform DOM UI. Not `game-server`.
Builds on: [ADR-0013](0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only colour), which stands unchanged
Realized by: FS-2325V
Amended by: ADR-0021 — Decision 6 (characters are authored in code, not sourced)

## Context

Recorded without adversarial review. The decision came from a throwaway spike and three direct
choices by the owner, with no `challenge-me` pass.

The target look for The Age of Barrowspire is Ultima Online: realistic, gritty, dark Arthurian,
warm where torches burn, viewed from a fixed isometric camera. The current recorded direction
points somewhere else. `docs/theming_plan.md` chose **pixel art** as the medium, and Part I of
`game-client/docs/design-guideline.md` mandates it (nearest-neighbour, dithering, 9-slice pixel
borders) and forbids re-projecting the world. The owner's verdict on the shipped result is that it
is "too pixel art and cute." Neither of those docs is an ADR, so this record does not supersede
either one. It does override their medium and perspective clauses, and they must be rewritten to
match (see Consequences).

A spike asked one question: can Phaser reach a UO-like look without a hand-painted asset pipeline?
It modelled everything that stands up (people, half-timbered walls, trees, furniture, bag items)
in three.js. It rendered each model through an orthographic camera at 30° elevation and 45°
azimuth, which is exactly the 2:1 isometric diamond, and handed Phaser the results as plain 2D
sprite sheets: 8 directions, an idle frame, and an 8-frame walk cycle. This is how UO produced its
own art. The findings:

- **Environment:** reached the target. Noise-textured ground with screen-space grass, flagstones,
  a patterned rug, timbered walls with leaded windows, and furniture read as UO.
- **Lighting:** a multiply light-map with flickering torch pools and a night toggle works over 2D
  sprites and is cheap.
- **Container gump:** a satchel whose flap lifts and whose items drop in and can be dragged
  worked as a 2D UI object.
- **Characters:** the pipeline is fine, but procedural primitive mannequins cannot reach UO-level
  anatomy, faces or cloth. Character quality depends on the source models, not on the pipeline.
- **Bake cost:** baking in the browser cost roughly 10 s per load.
- **Game logic:** unaffected. The spike kept every game rule (collision, distance, bounds,
  proximity) in flat world coordinates, and the 3D existed only during the bake.

The owner chose isometric projection over keeping today's top-down camera, real rigged models over
procedural placeholders or painted sheets, and a build-time bake over an in-browser bake.

The hard constraint is that **no server code and no game logic changes.** The Go services
(`game-service` ECS, hub, matchmaking) own the world in flat 2D coordinates, and that stays true.

## Decision

**In-game art is modelled in 3D and pre-rendered into 2D sprite sheets at build time. Phaser draws
only 2D sprites, on a 2:1 isometric projection that exists purely in the client's presentation
layer.**

1. **Medium.** Pre-rendered 3D replaces pixel art for the in-game canvas. Sprites are rendered
   with realistic lighting, soft shadows and texture grit, then drawn with linear filtering.
   Nearest-neighbour, dithering and pixel-grid rules no longer apply to the canvas.
2. **Projection.** The canvas uses a 2:1 isometric diamond (64×32 px tile). The bake camera is
   orthographic at 30° elevation and 45° azimuth, so baked sprites align with the grid exactly.
3. **The world stays 2D. The projection is one function.** Server-authoritative `x, y` remain the
   single source of truth. The client applies `worldToScreen` only when placing things on screen,
   and applies `screenToWorld` only when turning a pointer position into a world target. Every
   gameplay calculation in the client (distances, ranges, proximity, bounds) uses world
   coordinates, never sprite pixel positions. Nothing sent to the server changes shape or meaning.
4. **Input keeps its world semantics.** A movement key sends the same world-space intent it sends
   today. On an isometric screen, "up" therefore renders as a diagonal, as it does in UO. Mapping
   keys to screen axes instead would change what the client asks the server to do, which is game
   logic and out of bounds.
5. **Build-time bake.** A bake tool outside `src/` renders models to PNG sprite sheets plus a
   manifest (frame size and anchor per sheet). The PNGs and manifest are committed. three.js is a
   dev-only dependency and never ships to players. Runtime cost is image loading only.
6. **Real rigged models for characters.** Heroes and creatures come from rigged, animated 3D
   models (glTF). They are sourced under a licence that permits redistribution in a game, and the
   licence is recorded next to each asset. Animations (idle, walk, run, attack, death) are baked
   per direction. Procedural geometry is acceptable only for environment props where it already
   meets the bar.
7. **Draw order.** World objects sort by `x + y` of their ground footprint. Hit-testing uses the
   footprint, not the sprite's pixel bounds.

## Consequences

- **The server and game logic are untouched by construction.** The projection sits between world
  state and pixels, so a server change never has to happen for art reasons, and an art change can
  never alter game behaviour. Any diff in this effort that touches `game-server/`, or changes the
  semantics of a client→server message, is out of scope and should be rejected in review.
- **Some client presentation code must change.** `BarrowspireScene` (and the hub scene when it
  adopts the art) currently treats world coordinates as screen pixels. Specifically:
  - sprite placement, the camera and its bounds move to projected coordinates;
  - depth sorting changes from `y` to `x + y`;
  - `pointer.worldX/Y` must go through `screenToWorld` before being sent as `target_x/y`;
  - the five `Phaser.Math.Distance.Between` calls on sprite positions must measure between world
    positions instead.

  This is plumbing, not rules: each call keeps its meaning.
- **Occlusion becomes a design problem.** Tall walls and trees can hide players standing behind
  them. Candidates are cut-away front walls (as in the spike) or fading occluders near the player.
  The FS must choose one.
- **The design guideline and theming plan must be rewritten.** Part I's "Art Technique — Pixel
  Art", "Still pending on assets", "Perspective" and "UI Chrome (align to pixel art)" sections, and
  the Alagard revisit note, no longer describe the target. The palette, gameplay-accent channels,
  lighting readability floor and typography carry over.
- **ADR-0013 still holds.** Hex literals in `src/` remain forbidden. Baked PNG pixels are asset
  data, not styling, and the fence does not police them. Colours authored in the bake tool should
  still come from the `BARROW` palette so art and UI stay one ramp.
- **Character art is gated on sourcing.** Finding rigged models that fit a dark Arthurian look,
  under a usable licence, is now on the critical path. Environment and lighting work can proceed
  before characters are sourced.
- **Asset volume grows multiplicatively.** The count is characters × animations × 8 directions ×
  frames. Layered equipment on characters (a UO-style paperdoll) multiplies it again. Texture
  memory and atlas packing need budgeting, and equipment layering should be designed in before
  loadout visuals are built, not retrofitted.
- **Art review moves into diffs.** Committed PNGs make every art change visible and revertible.
  The cost is repository weight; the bake should be deterministic so re-bakes do not churn
  unchanged sheets.
