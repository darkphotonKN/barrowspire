# FS-V8FT3: Wall shadow layer

> Status: draft · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Wall shadow layer → FS-V8FT3`: [FS-2325V](2325V-pre-rendered-isometric-art.md) (timber wall pieces and posts, the bake's shadow catcher, the painted ground), [FS-8RBQY](8RBQY-tower-interior-run-look.md) (masonry partition walls and posts), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md) (exterior wall pieces, door heads, the two looks), [FS-KE075](KE075-floor-1-dungeon.md) (a dungeon floor's wall runs and chunked ground) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0036](../adr/0036-buildings-have-an-exterior-and-an-interior.md), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md)

## Scoping notes (raw)

Locked 2026-11-11 by `/scope-it`, pre-answered: the owner's approved charter "牆影不疊深" is the
session. Nothing was asked. Not challenged: client presentation only, cheap to be wrong, and the
owner looks at it in the browser before it ships.

**Why (owner, playtest 2026-11-11).** Along the tower's walls that run along world y the floor
shows rows of dark diagonal lines. Cause: each wall piece's baked sprite carries its own soft
ground shadow at 50% (`tools/bake/page/baker.js`, a `ShadowMaterial({ opacity: 0.5 })` catcher);
a piece is baked 2.4% longer than a tile (`LENGTH = 1.024`, `models/architecture.js`,
`models/tower.js`, `models/building.js`); neighbours' shadows overlap at every joint and the overlap
is painted twice. The tower's outer wall already avoids it (`contactShadowOnly`, `models/tower.js`).
Owner: "有陰影可以但是重疊會加深要怎麼移除", chose option A (the client draws the wall shadows in
one layer), and widened it: "不只塔的 村莊的也要調整".

**Shape (five-bin sort).** No thin line owns "wall shadows"; it is not a capability of its own
either (re-skin test: it is how four shipped looks draw a wall's shadow). It changes acceptance
criteria of several owners: FS-2325V (a world sheet carries its own ground shadow; timber
`wall_*`/`post_*`; the ground painted once), FS-8RBQY (masonry `tower_wall_*`/`tower_post_*`,
"same contact shadow as the existing world sheets"), FS-9PN7X (exterior pieces and door heads,
"every pre-existing atlas sha256 unchanged"), FS-KE075 (§H.44 ground chunks, §H.46 wall runs). So:
behavior change spanning several capabilities = one change FS, no thin line, a pointer stub on each
owner. No line added, reworded or struck. No tuning, no content, no removal.

**Locked decisions (owner approved 2026-11-11).**

- In scope: the tower's masonry walls (the dungeon's walls), the timber walls of village and
  fallback-floor houses, building exterior walls, and the corner posts of all of these.
- Wall pieces and posts no longer bake a long shadow.
- The client draws the shadow of each wall run from where it stands and how tall it is: one shadow
  per run, so a joint is never painted twice.
- Every wall shadow is drawn opaque first, and the layer is then given 50% once (the baker's
  opacity), so corners and posts where shadows overlap do not darken either.
- Shadow direction and length follow the bake's light, so they agree with the baked shadows of
  props and chests.
- A full-height (back) wall and a cut-away (front) wall each cast by their own height.
- The shadows are painted into the ground layer, not kept as a second standing layer (floor 1's
  ground chunks already hold about 65 MiB of RGBA).
- Hard edges in v1; the owner will look and decide on softening.
- A wall fading over the player (the occluder rule) does not fade its shadow.
- Shadows of walls inside a village building are drawn as any other and are simply not seen while
  its roof covers them; the fog lies over the shadows as over the ground.

**Out of scope (owner).** Roofs, door leaves, props, chests, characters and monsters keep their
baked shadows; the tower's outer (perimeter) wall; field worlds (no walls); the light's direction
and strength; anything in `game-server/`.

**Bounds.** May change game-client wall and ground drawing, `game-client/tools/bake` wall-piece
models, and re-bake the wall-piece atlases. May not touch `game-server/`, proto, gateway, or the
existing text of a shipped FS.

**Rejected.** Baking a contact-only shadow per piece as the perimeter does (the owner wants the
long shadow kept). A second standing shadow layer over the ground (texture memory). Keeping the
baked shadows and trimming each piece's to its own tile (the soft edge still stacks at a joint and
at every corner).

**Facts read for the lock** (worktree at `ccea4130`).

- Light: `LIGHT_DIR = (-1, 2.83, 1)` normalised, three.js axes (+x world x, +z world y, +y up),
  `baker.js`. A point h tiles up shadows h/2.83 tiles toward +x and h/2.83 toward -y: due
  screen-right. Back wall 3.6 tiles: about 51 world px each way, 81 screen px. Front 1.1: about
  15.5 world px, 25 screen px.
- The baker's module imports three.js, so the client's parity test (`bake.test.ts`) cannot read
  `LIGHT_DIR` or the catcher's 0.5 from it as it reads `projection.js` and `dimensions.js`.
- A sheet with `shadow: false` hides the catcher and frames by the model alone (`bakeProps`); a mesh
  with `userData.noShadow` casts on nothing, its own faces included (`prep`).
- Tower and exterior pieces carry the timber piece as an invisible frame guide, so their frame and
  anchor equal the timber piece's (`models/tower.js`, `models/building.js`).
- Sheets by atlas group (`catalogue.js`): `architecture` holds `wall_{back,front}_*`, `post_*` and
  the roof pieces; `tower` holds `tower_wall_*`, `tower_post_*`, the tower ground, the perimeter,
  dressing and stairs; `building` holds `wall_exterior_*`, `tower_wall_exterior_*`, the four door
  heads, `tower_cap` and the gables.
- Ground: `GroundLayer` (`scene.ts`) paints once into render textures and skips a paint asked again
  with the same houses, look and seed; a dungeon floor's chunks are 512 px, made only where a tile
  falls (FS-KE075 §H.44); the hub's ground is one texture.
- Phaser 4.2.1 `DynamicTexture.draw`: "alpha ... Only used when drawing Texture Frames ... Game
  Objects use their own alpha"; `stamp(key, frame, x, y, { alpha })` draws one frame at an alpha.
- Buildings have two looks (ADR-0036): south and east walls are full height from outside, cut away
  from inside. From outside a roof or cap covers the footprint; from inside the blackout covers
  everything outside it (FS-9PN7X §D.1).

**Open at the lock (for write-a-spec).** Which look's height a building's wall casts by, given a
static ground. How the client reads the light without a hand-kept copy. Whether the foot of a
partition needs a contact shadow once the long one is gone. Door heads (wall over a door gap).
Shadow on a dungeon floor's void. Repaint cost against §H.44's "painted once".
