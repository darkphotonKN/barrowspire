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

- **Player** — a human who plays Barrowspire, on screen and in code alike, so it needs no
  translation (like **Gold**). Scope is deliberately wide: a player is a player in the hub,
  inside a run, and on the leaderboard, whether or not they have ever entered one. Maps to
  `Member` (REST/auth) and `player` (WS). Not a **character**: a player owns characters and
  brings one into a world at a time; the figure on the canvas is the character, the person
  behind it is the player. Replaces **delver** (retired 2026-10-29: it tied the person to one
  kind of place, the Spire, when runs may lead elsewhere) and **operator** (sci-fi residue,
  removed by FS-SWMNW/FS-W6BP1). Neither is kept as a synonym. "Delver" survives only as a
  **rank** title on the profile (member status 1, beside "Warden"): a rank is a title a player
  holds, not the word for the player.
- **Delve** — both the act of entering a run (*"Delve"*, the primary CTA, replacing "Play") and
  the run itself (*"your last delve"*). The player-facing name for what
  [`SPECIFICATION.md`](SPECIFICATION.md) calls an **escape run** and the WS protocol calls a
  **game** / **session**. All three name one thing at different layers; none of them is wrong in
  its own layer. The Spire's own word: a visit to a field world is not a delve.
- **Field world** — a shared, always-open place outside the Spire where players farm XP and
  plunder with nothing at risk: no queue, and death costs nothing (FS-X2F2H). Two are scoped:
  - **Gentle Meadows** — east of the hub: cozy greens, sparse trees, a horizon; low-level animals.
  - **Forlorn Forest** — west of the hub: a gloomy branching trail; zombies, and rarely a ghost
    (FS-3QHQZ).
- **Gate** — a place in the hub a player walks into to go somewhere (FS-0XMCP). The **Spire
  gate** (north, the tower's entrance) opens the gather / go-alone panel; a **field gate** (west
  trail to the Forlorn Forest, east road to Gentle Meadows) takes the player into that field. Once
  FS-0XMCP ships, the Warden no longer opens the queue: he only tells the story.
- **The Spire** — the place players descend into. The antagonist-realm and the source of relics.
  Note the article: *the* Spire, never bare "Spire".
- **Barrowspire** — the product. The world entire, not a location within it. Never used as a
  synonym for the Spire.
- **Barrow** — the deep, buried, grave-earth register of the setting. Appears as a modifier
  (*barrow-deep*, *barrow earth*, the *barrow ramp* palette) rather than as a standalone noun for
  a place.
- **Lich Lord** — the ruling antagonist of the Spire. Named sparingly; dread over exposition.
- **Relic** / **plunder** — what a player carries out. `items` on the wire, item cards in the
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
  player's torch pool). It is declared per prop type in the sprite manifest, or attached to the
  player. Purely visual: it has no effect on what anyone can see or hit.
- **Light-map**: the camera-fixed layer that multiplies the lit world: filled each frame with the
  world's **ambient** (fixed per world type), plus an additive pool per light source in view.
  Built once and restamped, never rebuilt (`src/render/lighting/`).
- **Marker**: an overlay a character is read by — a name plate, the HP bar, a creature's glowing
  eyes. Markers draw above the light-map and vignette and carry the readability floor, so the
  world may stay dark (`src/render/markers/`). A marker is not the thing it marks: a corpse shows
  none.
- **Field marker outline**: the dark outline every marker wears in a field world
  (`FIELD_MARKER_OUTLINE`), so it keeps the 3:1 readability floor on bright, daylit ground. It is
  why a field's daylight need not be capped for the floor. Runs and the hub draw markers without
  it.
- **Wall piece**: one tile of a server wall as drawn. A server wall rect is cut into wall pieces
  along its centreline, each sorted by its own footprint, with a **post** at each end. "Back"
  pieces stand full height (north and west sides); "front" pieces are the low cut-away.
- **Occluder**: a tall drawn thing (tree, lamp post, back wall piece, roof piece, door, arch) that
  fades while its sprite overlaps the player's and its footprint sorts nearer the viewer.
- **Dressing**: a decorative prop placed by the client (a cart, stall, trough, signpost, lamp post,
  chimney smoke in the hub; rubble, bone piles, broken crates, roots, chains, braziers in a run,
  called **run dressing**). It is never interactable, never blocks movement, and never stands
  where it would get in the way: off the hub's walking ground (its paths, FS-KYPQ9 §A), and
  outside a run floor's **keep-out**, which is computed from that floor's broadcast (walls, door
  thresholds, stairs, chest, escape door, switch, map edge; FS-8RBQY §C.5) rather than
  hand-copied. The server knows nothing of it. A prop that would need collision or a click is not
  dressing.
- **World kind**: which world the server put the player in, `"hub" | "run"` (`WorldKind`,
  mirroring `world_type` on the wire). Server-decided. Not the same as a world theme. Gains
  `"field"` with FS-X2F2H.
- **World theme**: how the client draws a run: `"exterior" | "tower"` (FS-8RBQY §A). It picks the
  ground plan, wall-piece sheets, roofs and indoor mask on or off, ambient, perimeter wall and run
  dressing. A client constant, never on the wire, never a game rule. Always say *world* theme:
  bare "theme" in this client means the design-token theme (`src/utils/theme.ts`, `BARROW`,
  `docs/theming_plan.md`), which every world theme draws its colours from.
- **Field look**: how the client draws a field world, keyed by field id (`FieldLook`,
  `FIELD_LOOKS` in `src/render/world/fieldLook.ts`; FS-X2F2H, FS-3QHQZ). The field counterpart of
  a world theme: it picks the ground, the fixed daylight, the horizon, and what stands on the
  server's walls, either **dressing** (the Meadows' groves and rocks) or **tree stands** (the
  Forlorn Forest), plus optional verges and mist. A client constant, never on the wire. A field
  with no entry is drawn as the Meadows. Not a world theme: a field never has a world theme.
- **Tree stand**: a server wall as the forest's field look draws it: trees planted across the
  wall's footprint, about one per cell, each pick hashed from the cell and the world seed so
  every client plants the same forest (FS-3QHQZ §Requirements 23–24). It is a server wall, with
  collision, so it is **not dressing**: what the player sees blocking the trail is exactly what
  the server collides against. Trees on its north- and west-facing edge are always bare, so no
  crown hides the trail.
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
- **Bag**: the ordered list of items the player's character carries but does not wear, drawn as
  the 30-cell grid (6 × 5) in the gear overlay's right panel, under the gear slots (FS-HRH2J). It
  holds at most **bag capacity**, 30 items (`BAG_CAPACITY` in `src/ui/bag.ts`, game-service's
  `BagCapacity`). New items go on the end, and nothing reorders it. In a run or a field world it
  is the WS `inventory` (plus items taken and still pending), and a pickup or unequip into a full
  bag is not sent ("Your bag is full."). In the hub it is every owned item the loadout does not
  wear, read over REST and not capped, so it can read over capacity (e.g. `34 / 30`). Same
  meaning as game-service's **bag**
  ([`game-service/CONTEXT.md`](../game-server/game-service/CONTEXT.md) "Carried items").
  **Not the container view**: the satchel/coffer panel shows a container's contents, never the
  bag, even though code still says `satchel` in places (`satchelIcon`, the container view's
  leather). Say **bag** in prose, specs and new names. Not "inventory" either: that is the wire
  field, and items-service's word for everything an account owns.

- **Ability card**: the HUD panel at the bottom right of a run or a field world showing the
  player's class ability: its name, the right-mouse glyph and a line on how it works (FS-8AY7S).
  Never in the hub. The ability itself is game-service's term
  ([`game-service/CONTEXT.md`](../game-server/game-service/CONTEXT.md) "Classes and abilities").
- **Resource bars**: the player's own Health bar and, below it, their class resource bar at the
  bottom left of a run or a field world, each labelled with its own name ("Health:", "Mana:",
  "Stamina:", "Parry:"). The mercenary's bar is drawn as 3 pips. Teammates show an overhead health bar only;
  the player has no bar over their own head (FS-8AY7S).

- **Aim line**: the line an archer sees while holding to aim Shadow Shot, faint until a release
  would fire. Drawn for the aiming player only; the server never knows about it (ADR-0030).
- **Stance tell**: the raised blade over a mercenary while their parry stance is open.
- **Armed tell**: the blade carried at a mercenary's hip while they hold 3 parry charges (riposte
  armed).
- **Riposte slice**: the wide sword arc drawn when an armed mercenary cuts. Not the **cut**, the
  narrow arc of their ordinary left-click.

## Mapping table

| Screen says | REST / auth | WS protocol | SPECIFICATION.md |
|---|---|---|---|
| player | `Member`, `member_id` | `player`, `player_id`, `current_player` | "player" |
| a delve | — | `game`, `session_id`, `find_game`, `end_game` | "escape run" |
| the Spire | — | the instance world | "escape run" (the instance) |
| Gentle Meadows, the Forlorn Forest | — | `world_type` `field` | "field world" |
| relic, plunder | `/api/items/*` | `items[]` | "loadout", "items" |

## Voice rules that ride on the vocabulary

- **Grim and terse.** Dread over spectacle; rumor over exposition.
- **Money clarity overrides lore.** Real-money and subscription flows use unambiguous verbs —
  "Subscribe", "Pay", the actual price. Never hide a paid action behind flavor. Reserve
  "Acquire" / "Claim" for in-game-gold purchases. (Design guideline, Part II, Voice & tone.)
- **No lore in error messages that must be acted on.** A player who cannot log in needs to know
  why, not that the gates are barred.

## Open

- ~~**Delve** and **the Spire** assume every run leads into the Spire.~~ Resolved 2026-10-29
  (FS-X2F2H): "delve" stays the Spire's own word. The places elsewhere are **field worlds**, not
  runs, and a field visit is not a delve.
- ~~**World theme** names only how a run is drawn. Whether each field world gets its own world
  theme (the forest on the exterior theme's ground family) or a separate term is decided at
  write-a-spec for FS-X2F2H / FS-3QHQZ.~~ Resolved 2026-10-30 (FS-3QHQZ amendment): a separate
  term. A field is drawn by its **field look**, keyed by field id; **world theme** stays "how the
  client draws a run".
- **Class display names.** The class-select screen says WARRIOR / MAGE / ARCHER (`classLore.ts`),
  the art sheets say knight / wizard / archer, and the design talk says Knight / Wizard. Which
  name the screen uses is unsettled. The Mercenary (FS-MAMHR) is "Mercenary" in every layer.
- The **HUB** world (refactor plan) has no lore name yet — "hub" is an engineering word. It needs
  one before the HUB client ships, and the answer is not obvious: the settlement above the Spire,
  the camp, the hall. Deliberately unresolved rather than guessed.
- **Escaping vs dying.** The end-of-run overlay distinguishes them (`current_player === null` ⇒
  escaped) but the vocabulary does not. The guideline offers *"Few return whole"* for death; the
  successful case has no term.
- `game-server/game-service/CONTEXT.md` is still empty. When it is populated, the protocol column
  of the mapping table above becomes a link rather than a restatement.
