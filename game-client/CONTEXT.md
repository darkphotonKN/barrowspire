# CONTEXT — game-client

Ubiquitous language for the **game-client** bounded context. One term per line: **Term** —
one-line definition. Keep consistent with the code and this member's
[`SPECIFICATION.md`](SPECIFICATION.md).

## The client is a translation boundary

game-client is where three vocabularies meet, and it is the only context that holds all three:

- **`Member`** — owned by auth-service. The account. Every `/api/member/*` route, `authStore`,
  and the JWT subject.
- **`player` / `game` / `session`** — owned by game-service's WebSocket protocol. `player_id`,
  `current_player`, `other_players`, `find_game`, `game_found`, `session_id`, `end_game`.
- **The lore vocabulary below** — owned here. It is what the **screen says**.

**The lore layer is presentational and stops at the pixel.** Identifiers, types, stores, REST
routes and WS actions keep their existing names; nothing in this glossary renames a field, an
endpoint, or a wire message. The mapping is written down here so the translation is one
documented hop rather than folklore that each new component re-invents.

This is a genuine bounded-context boundary, not a redundancy to clean up: auth-service has no
opinion about barrows, and game-service has no opinion about what a player is called. The
translation belongs to the surface that renders words.

## Terms

- **Delver** — the presentation name for a human who plays Barrowspire. Scope is deliberately
  wide: a delver is a delver in the hub, inside a run, and on the leaderboard, whether or not
  they have ever descended. Maps to `Member` (REST/auth) and `player` (WS). Replaces **operator**
  everywhere it appears — that word is sci-fi residue from the pre-fork game and is being removed
  by FS-SWMNW/FS-W6BP1, not kept as a synonym.
- **Delve** — both the act of entering a run (*"Delve"*, the primary CTA, replacing "Play") and
  the run itself (*"your last delve"*). The player-facing name for what
  [`SPECIFICATION.md`](SPECIFICATION.md) calls an **escape run** and the WS protocol calls a
  **game** / **session**. All three name one thing at different layers; none of them is wrong in
  its own layer.
- **The Spire** — the place delvers descend into. The antagonist-realm and the source of relics.
  Note the article: *the* Spire, never bare "Spire".
- **Barrowspire** — the product. The world entire, not a location within it. Never used as a
  synonym for the Spire.
- **Barrow** — the deep, buried, grave-earth register of the setting. Appears as a modifier
  (*barrow-deep*, *barrow earth*, the *barrow ramp* palette) rather than as a standalone noun for
  a place.
- **Lich Lord** — the ruling antagonist of the Spire. Named sparingly; dread over exposition.
- **Relic** / **plunder** — what a delver carries out. `items` on the wire, item cards in the
  marketplace.
- **Gold** — the in-game currency, in copy and in code alike (wallet-service and ledger-service
  both use it). One of the few words that needs no translation.

## Rendering terms (canvas presentation, [ADR-0020](../docs/adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) / FS-2325V)

These are engineering words, not lore. They name how the canvas draws the world, and like the lore
layer they **stop at the pixel**: none of them appears on the wire or in game rules.

- **World position**: an entity's `x, y` as the server sends it. Flat, top-down, authoritative.
  **Every** gameplay calculation in the client uses world positions: distance, range, proximity,
  bounds. Unqualified "position" in client code means this.
- **Screen position**: where a sprite is drawn, obtained only through the projection. It is never
  used for a gameplay calculation, and a distance measured between two sprites is a defect. The
  classic mistake is `Distance.Between(spriteA, spriteB)`.
- **Projection**: the pair `worldToScreen` / `screenToWorld` that maps world positions onto the
  2:1 isometric diamond and back. `screenToWorld` exists only to turn a pointer into a world
  target. The projection is presentation; changing it can never change game behaviour.
- **Tile**: the unit of the isometric diamond (64×32 px on screen). A world span of
  `WORLD_PX_PER_TILE` server pixels projects onto one tile. There is no tile grid on the server;
  "tile" is a drawing unit, never a game unit.
- **Footprint**: the patch of ground an object occupies in world space. Draw order sorts by
  footprint (`x + y`) and clicks hit-test against it. A sprite's pixel bounds are taller than its
  footprint and are used for neither.
- **Bake**: the build-time step that renders 3D models through the isometric camera into 2D sprite
  sheets. "Bake" always means build time, never in-browser at load.
- **Sprite manifest**: `public/art/manifest.json`, the bake's index. It records, per sheet: frame
  size, anchor, directions, frame counts, fps, declared light source, asset source/licence, and
  two measured values: a ground sheet's mean colour and a standing sheet's head height (`crown`).
  The client learns about art only through it.
- **Light source**: a point that lights the light-map (torch, brazier, window, lantern, the
  delver's torch pool). It is declared per prop type in the sprite manifest, or attached to the
  delver. Purely visual: it has no effect on what anyone can see or hit.
- **Light-map**: the camera-fixed layer that multiplies the lit world: filled each frame with the
  world's **ambient** (fixed per world type), plus an additive pool per light source in view.
  Built once and restamped, never rebuilt (`src/render/lighting/`).
- **Marker**: an overlay a character is read by — a name plate, the HP bar, a creature's glowing
  eyes. Markers draw above the light-map and vignette and carry the readability floor, so the
  world may stay dark (`src/render/markers/`). A marker is not the thing it marks: a corpse shows
  none.
- **Wall piece**: one tile of a server wall as drawn. A server wall rect is cut into wall pieces
  along its centreline, each sorted by its own footprint, with a **post** at each end. "Back"
  pieces stand full height (north and west sides); "front" pieces are the low cut-away.
- **Occluder**: a tall drawn thing (tree, lamp post, back wall piece, roof piece, door, arch) that
  fades while its sprite overlaps the delver's and its footprint sorts nearer the viewer.
- **Dressing**: a decorative prop placed by the client (a cart, stall, trough, signpost, lamp post,
  chimney smoke in the hub; rubble, bone piles, broken crates, roots, chains, braziers in a run,
  called **run dressing**). It is never interactable, never blocks movement, and never stands
  where it would get in the way: off the hub's walking ground (its paths, FS-KYPQ9 §A), and
  outside a run floor's **keep-out**, which is computed from that floor's broadcast (walls, door
  thresholds, stairs, chest, escape door, switch, map edge; FS-8RBQY §C.5) rather than
  hand-copied. The server knows nothing of it. A prop that would need collision or a click is not
  dressing.
- **World kind**: which world the server put the delver in, `"hub" | "run"` (`WorldKind`,
  mirroring `world_type` on the wire). Server-decided. Not the same as a world theme.
- **World theme**: how the client draws a run: `"exterior" | "tower"` (FS-8RBQY §A). It picks the
  ground plan, wall-piece sheets, roofs and indoor mask on or off, ambient, perimeter wall and run
  dressing. A client constant, never on the wire, never a game rule. Always say *world* theme:
  bare "theme" in this client means the design-token theme (`src/utils/theme.ts`, `BARROW`,
  `docs/theming_plan.md`), which every world theme draws its colours from.
- **Exterior theme**: the run look as it shipped before FS-8RBQY: barrow-dirt ground with tufts
  and pebbles, flagstone house floors, timber-frame walls, roofs, the enter-a-house indoor mask.
  Kept for a future outdoor place. Not "grass": grass is the hub's ground.
- **Tower interior theme** (short: **tower theme**): the default run look: the inside of the
  Barrowspire. Stone flags and timber planks, partition walls, a perimeter wall with arrow slits,
  darkness beyond, no roofs, a darker ambient. The whole floor is indoors, so "indoor" carries no
  meaning in this theme.
- **Room**: in the tower theme, the space enclosed by one group of server walls sharing a
  `house_id`. The same server thing the exterior theme draws as a **house** (and game-service
  calls a building). One entity, three names by layer; the screen word follows the world theme.
- **Partition wall**: a server wall as the tower theme draws it: masonry, cut into wall pieces
  with the same geometry and cut-away rule as a house wall. It is a server wall, with collision.
- **Perimeter wall**: the tower's outer wall, drawn by the client alone around the outside of the
  play area. Not a server wall: no entity, no collision, not in `walls[]`. Its south and east runs
  are always low so it never covers anything in play.
- **Floor band**: `lower` / `middle` / `upper`, a run floor's place in the climb, derived from
  `floor` and `floor_count` (FS-8RBQY §C.1). The only input that varies the tower look per floor.
  Not the same as **floor**, the wire number it is derived from.
- **Container view**: the on-screen satchel/coffer panel showing a container's contents. Not the
  same thing as a **container**, which is the WS entity in `containers[]`. Opening the view is
  presentation; clicking an item in it sends exactly the message the item row always sent.

## Mapping table

| Screen says | REST / auth | WS protocol | SPECIFICATION.md |
|---|---|---|---|
| delver | `Member`, `member_id` | `player`, `player_id`, `current_player` | "player" |
| a delve | — | `game`, `session_id`, `find_game`, `end_game` | "escape run" |
| the Spire | — | the instance world | "escape run" (the instance) |
| relic, plunder | `/api/items/*` | `items[]` | "loadout", "items" |

## Voice rules that ride on the vocabulary

- **Grim and terse.** Dread over spectacle; rumor over exposition.
- **Money clarity overrides lore.** Real-money and subscription flows use unambiguous verbs —
  "Subscribe", "Pay", the actual price. Never hide a paid action behind flavor. Reserve
  "Acquire" / "Claim" for in-game-gold purchases. (Design guideline, Part II, Voice & tone.)
- **No lore in error messages that must be acted on.** A delver who cannot log in needs to know
  why, not that the gates are barred.

## Open

- The **HUB** world (refactor plan) has no lore name yet — "hub" is an engineering word. It needs
  one before the HUB client ships, and the answer is not obvious: the settlement above the Spire,
  the camp, the hall. Deliberately unresolved rather than guessed.
- **Escaping vs dying.** The end-of-run overlay distinguishes them (`current_player === null` ⇒
  escaped) but the vocabulary does not. The guideline offers *"Few return whole"* for death; the
  successful case has no term.
- `game-server/game-service/CONTEXT.md` is still empty. When it is populated, the protocol column
  of the mapping table above becomes a link rather than a restatement.
