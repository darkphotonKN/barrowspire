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
  - **Dev test room** — not one of the two: a dev-only field for trying builds, drawn as the
    Meadows, whose gate a production build ignores (FS-BDRTJ).
- **Gate** — a place in the hub a player walks into to go somewhere (FS-0XMCP). The **Spire
  gate** (north, the tower's entrance) opens the gather / go-alone panel; a **field gate** (west
  trail to the Forlorn Forest, east road to Gentle Meadows) takes the player into that field. Once
  FS-0XMCP ships, the storyteller no longer opens the queue: he only tells the story. He is the **Elder** (once the Spirewarden), an ordinary townsman by the spawn.
- **Town** — the hub, as the owner and the lore say it (the Elder: "the town needs heroes now").
  The screen may say town; code keeps **hub** (`HubScene`, `HUB_KEEP_OUT`). One world, not a
  district of it.
- **Town building** — a building in town a player can walk into (FS-B0H2D): the Quartermaster's
  store, the Inn, the smithy. Each has a gap in its south wall and no door. Drawn as a **house**
  (rendering terms below); "town building" is the place, "house" the drawing.
- **The Inn** — the town's tavern: one cozy room, the innkeeper behind a counter, patrons at three
  tables, a hearth. Nothing to buy, no rooms to rent, no upstairs.
- **Innkeeper**, **patron**, **smith** — the people in the town buildings: game-service's **fixed
  residents** ([`game-service/CONTEXT.md`](../game-server/game-service/CONTEXT.md) "NPCs"),
  ambient NPCs that never move. Talkable, with lore lines written here, keyed by name; no sigil,
  no function. A patron is drawn at a stool by a table and never walks.
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
- **Settlement record** — the panel that opens when the player resolves (escapes or dies): what
  they carried out (finds marked), what they lost ("Kept by the barrow" for unsafe finds, "Used
  up" for what they drank), experience and level, kills and time, and a status line,
  **Settling…** until items-service confirms, then **Settled**. Toggled by the **Settlement**
  button; while open it holds the return to the town; gone once they leave the tower. It replaces
  the result card: never say "result card". (FS-GV8WN R19–R24)
- **Gold** — the in-game currency, in copy and in code alike (wallet-service and ledger-service
  both use it). One of the few words that needs no translation.
- **Purse line** — the player's gold as the gear and bag panel shows it, under the bag grid:
  the coin icon and the account's total, with "Available X · Held in bids Y" on hover. Read from
  the wallet on every open of the overlay and after a Take that carries gold; "—" when it could
  not be read. Not an item and takes no bag cell. (FS-7TGZ3)

## Chat terms (FS-WJGFJ; world chat FS-5SH4G; party chat FS-XGW7H; whisper FS-KCQ06; mute and report FS-4HEG7)

What the chat window says. Each maps to a game-service chat channel type on the wire; the
protocol words are in [`game-service/CONTEXT.md`](../game-server/game-service/CONTEXT.md) § Chat.

- **Chat window** — the bottom-left panel: **one** stream of every channel's messages, newest at
  the bottom, `Name: text` with no time, keeping 100 lines per channel. It is never cleared by a
  world switch; the player walks from town into the Spire and the lines stay.
- **Fold** — the window folded down to its input row by its button, and unfolded again. It stays
  as the player left it; a folded window still sends, and new lines do not unfold it.
- **Channel picker** — the drop-down at the input row's left, drawn on the canvas: which channel
  the next line goes to. Only the shown channels are listed (Trade is absent); one the server does
  not relay yet is dim and cannot be picked. Tab and Shift+Tab cycle it from the text field.
- **Prefix** — the mark at the start of a line that names its channel: `#` World, `$` Trade,
  `%` Party, `@` Whisper (then a name), none for Area. Picking a channel writes its prefix, and
  typing a prefix picks its channel. A closed channel's prefix is just text.
- **Channel** (on screen) — the kind of talk a line belongs to, told apart by colour, not by tab:
  **Area**, **World**, **Party**, **Whisper**, **Trade**. In client code this is the chat channel
  type; the client has no field-channel concept, so the bare word is safe *here* and only here.
  Trade exists as a filter and a colour before it can carry a message.
- **Area** — the people on the same server as you, wherever they stand: town, a field, or inside
  the Spire (ADR-0032). The window does not say where you are (FS-WJGFJ Amendment 2026-10-31).
- **World** — everyone online, across every server.
- **Party** — the members of your party, wherever each is: any server, town, a field or the Spire.
  Always pickable, party or not; a line sent with no party answers with one system line ("You
  are not in a party."). The client never checks the party itself (FS-XGW7H).
- **Whisper** — a private line to one named player, sent as `@name message`; clicking a sender's
  name pre-fills `@name`. An offline target answers with one system line, and the whisper is gone.
- **Recall** — ArrowUp and ArrowDown in the open input walk back and forth through the player's
  own last 50 sent lines, as a terminal's history; kept for the page's life only.
- **Channel filter** — the row of tab-shaped toggles above the stream, any combination shown. A toggled-off channel is **hidden**,
  not muted: its lines keep arriving and reappear when toggled on.
- **Mute** — hiding one player: their lines, on every channel, are received and not drawn. The
  ignore list lives in this browser only (ADR-0033).
- **Report** — sending one line, with the lines around it that the window still holds, to the
  server as a complaint. The window is the evidence; the server stores no chat.
- **System line** — a line the client or server emits that no player wrote ("that player is not
  online"). Not a channel; never filtered out.

## Party terms (FS-R82NV; across pods FS-NCC9J, ADR-0037)

- **Party panel** — the carved panel **T** toggles: the members, the leader's crown, and the
  actions the player may use (create, invite, kick, transfer, leave). Not the frames.
- **Party frames** — the column on the left edge, under the resource bars where a world has them
  (a run, a field) and under the level bar in the hub, one frame per member, the player first. A
  frame shows bars only for a teammate in the player's own world; any other
  teammate shows name and class bust alone, so missing bars *are* the "not here" signal. An away
  member is greyed. Not the panel.
- **Skeleton row** — the frame drawn for a **reserved slot** (game-service: an open invite counted
  against the party's size): the invitee's name with a grey pulse where the bust and bars go, no
  countdown, seen by every member. It becomes a real frame on accept and goes on decline or
  expiry. Client word only; the server says *reserved slot*.
- **Travel button** — the button on the leader's frame, labelled **Travel**, that sends the player
  to the town of the leader's server (game-service: *travel*, by a hub handoff). Pressable only in
  the player's own town; greyed in a field, a delve, or while the leader is away; absent when
  already on the leader's server, or when either server is unknown (a leader on no server is
  offline).
- **Invite prompt** — the small carved prompt an incoming invite raises, with Accept, Decline and
  a countdown on the client's own clock. Not the skeleton row (that is the inviting side's view).

## Mailbox terms (FS-1GZGD)

- **Mailbox** — the player's in-game letters, opened from the **envelope** in the town only
  (never in a delve or a field). The screen and the code say mailbox and letter; never "mail",
  "inbox" or "email" (the account's email is a different thing on the web pages). Maps to
  notification-service's Mailbox and `/api/mail/*`.
- **Envelope** — the mailbox's HUD icon at the bottom-right of the town: a line envelope drawn
  in Phaser with a small **wax seal**. Not an emoji and not a Heroicon (the HUD is canvas).
- **Wax seal** (on the envelope) — the indicator: lit, with a count, while any letter is unread
  or still holds unclaimed enclosures; dark only when everything is read and claimed. The
  **pulse** is the envelope's few glows when a newer letter than the player last saw arrives;
  after it the seal stays lit. A lit seal dot on a list row means that letter is unread.
- **`mail_arrived`** — the game WebSocket action (`{"action": "mail_arrived", "payload": {}}`)
  that tells a player standing in the town a letter has just been sent to them. It carries no
  letter: the client answers it by fetching the mailbox summary. It is the only thing that
  fetches outside town entry and opening the panel; there is no polling timer. A missed one is
  made up at the next town entry. (FS-1GZGD A4, ADR-0045)
- **Letter panel** — the centered carved panel the envelope opens: the letter list on the left,
  the open letter on the right. While it is open WASD does not move the character.
- **Enclosed row** — the row of bag-sized slots under a letter's body showing its enclosures:
  item icons with the item tip, "x3" for a quantity, and the gold as a `coins` slot with its
  amount under it (gold is credited to the purse on claim; it is not an item). The icon and the
  tip come from the enclosure's **item snapshot**, which is exactly the item the player will get.
- **Take** (a letter's enclosures) — what the screen calls taking every enclosure of a letter at
  once with the one **Take** button ("Take" → "Taking…" → "Taken"): its items into the stash,
  its gold into the purse. Afterwards the dimmed slots wear a **Taken** wax stamp. Code, the API
  and the server call it the **claim** (`/claim`, `claimState`, `LETTER_ALREADY_CLAIMED`); the
  screen never says "Claim" here (voice rule, see *Open*, resolved 2026-11-04).

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
  footprint and are used for neither. A living monster is also hit over its **body column**.
- **Body column**: the screen-space column a living monster's body is drawn in, from its feet up
  to its crown and 0.4 of a crown either side (half its length for a quadruped). The pointer hovers
  and strikes a monster on its footprint or its body column (FS-48CTQ §C.5). It is a box, not the
  sprite's pixels.
- **Bake**: the build-time step that renders 3D models through the isometric camera into 2D sprite
  sheets. "Bake" always means build time, never in-browser at load.
- **Sprite manifest**: `public/art/manifest.json`, the bake's index. It records, per sheet: frame
  size, anchor, directions, frame counts, fps, declared light source, asset source/licence, and
  two measured values: a ground sheet's mean colour and a standing sheet's head height (`crown`).
  A sheet may also record its **sheet scale** and be **trimmed** (both below). The client learns
  about art only through it.
- **Sheet scale**: how many of a sheet's px make one screen px (`scale` in the manifest; absent
  is 1). A sheet baked at 2x holds twice the detail each way and is drawn at half size, so it
  stands exactly as large as at 1x; its frame size and atlas positions are in its own px, while
  `crown`, markers, the footprint and every other size stay screen px (ADR-0058, FS-HF0WW).
- **Trimmed sheet**: a sheet whose frames were each cut, at bake time, to the box that holds their
  pixels; the atlas stores only the cut and the manifest says where it sits in the whole frame
  (`trim`). Drawn, anchored and sized as the whole frame (ADR-0058, FS-HF0WW).
- **Walk-attack** (`walk_attack`): a class's attack drawn while it moves: the attack from the
  waist up over the walk from the waist down, the legs facing the aim (for a melee swing, its
  target). Every playable class's sheet carries it; no creature's or resident's does (FS-HF0WW,
  FS-3V7GC).
- **Atlas group**: the atlas pages one group of sheets is packed onto, named by the manifest's
  atlas keys without the page number (`boss-0` and `boss-1` are the `boss` group). The unit the
  client loads and frees art by (FS-C4JWH).
- **Resident group**: an atlas group loaded at boot and kept for the whole game: the four class
  groups and every small one. Always "resident group" or "resident art", never a bare "resident",
  which is a townsperson (ADR-0059).
- **Scene-scoped group**: an atlas group loaded only by the scenes that draw it (folk, wildlife,
  fodder, creatures, boss) and freed when the next scene does not use it (ADR-0059, FS-C4JWH).
- **Eviction**: removing a scene-scoped group's pages from the texture manager (and so the GPU),
  with every animation registered on them, once the next scene's preload completes. Only ever of
  art; "unload" is not used for it (ADR-0059).
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
  ground plan, wall-piece sheets, roofs and the HUD's Indoor/Outdoor label on or off, ambient,
  perimeter wall and run dressing. The indoor blackout is no world theme's choice: every run takes it. A client constant, never on the wire, never a game rule. Always say *world* theme:
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
  and pebbles, flagstone house floors, timber-frame walls, roofs, the HUD's Indoor/Outdoor label.
  Kept for a future outdoor place. Not "grass": grass is the hub's ground.
- **Tower interior theme** (short: **tower theme**): the default run look: the inside of the
  Barrowspire. Stone flags and timber planks, partition walls, a perimeter wall with arrow slits,
  darkness beyond, no roofs, a darker ambient. The whole floor is indoors, so "indoor" carries no
  meaning in this theme.
- **Interior**: the inside of a town building, drawn **in the same world and the same scene**
  (FS-B0H2D): while the player stands in a house, its roof lifts (hides) so the furnished room
  shows, the run's rule from FS-2325V §C.3. Not a separate scene, world, or load step; nothing is
  sent to the server on entering. Leaving puts the roof back. "Inside" is the client's test on the
  player's world position (`insideHouse`), never server state.
- **Furnishing**: a server wall inside a house that the client draws as furniture (the Inn's
  counter and tables, the smithy's forge) instead of as wall pieces. It has collision, so it is
  **not dressing**, like a tree stand. Recognised by geometry: a wall of a house that touches none
  of the house's four edges. Stools, shelves, crates, the anvil and the Inn's hearth are **indoor
  dressing**: dressing placed inside a house, with no collision.
- **Inn's hearth**: the fireplace inside the Inn, a light source shown only while the Inn's roof
  is lifted. Always qualified: bare **hearth** in the hub means the outdoor brazier at the
  gathering ground (`HUB_HEARTH`, keep-out K5), which is a different thing.
- **Room**: in the tower theme, the space enclosed by one group of server walls sharing a
  `house_id`. The same server thing the exterior theme draws as a **house** (and game-service
  calls a building). One entity, three names by layer; the screen word follows the world theme.
  On a **dungeon floor** (one whose floor map carries regions, FS-KE075) a room is instead a
  **region** of kind `room` from the floor map: no `house_id`, no building exterior, no roof or
  stone cap, no indoor blackout. Say *dungeon room* where either could be meant.
- **Floor map**: the static layout of the current run floor, sent once by the server
  (`floor_map`, FS-KE075, ADR-0060): size, cell size, regions and walls. The scene builds the floor
  from it; per-tick snapshots no longer carry walls in a run.
- **Region**: a room or a corridor segment of a dungeon floor, by id, as cell rects on the floor
  map. Every walkable cell is in exactly one. The unit of fog and of the minimap.
- **Void**: the rock of a dungeon floor outside every region and its shell walls. Drawn as the
  canvas's darkest ink; nothing stands in it.
- **Partition wall**: a server wall as the tower theme draws it: masonry, cut into wall pieces
  with the same geometry and cut-away rule as a house wall. It is a server wall, with collision.
- **Perimeter wall**: the tower's outer wall, drawn by the client alone around the outside of the
  play area. Not a server wall: no entity, no collision, not in `walls[]`. Its south and east runs
  are always low so it never covers anything in play.
- **Floor band**: `lower` / `middle` / `upper`, a run floor's place in the climb, derived from
  `floor` and `floor_count` (FS-8RBQY §C.1). The only input that varies the tower look per floor.
  Not the same as **floor**, the wire number it is derived from.
- **Building**: in this client, the drawn thing a group of server walls sharing a `house_id` makes,
  whatever the world calls it (a town building in the hub, a **room** in the Spire, a **house** in
  the exterior theme). Used where a rule holds for all of them (ADR-0036, FS-9PN7X).
- **Building type**: a building's wall-piece material, which decides both of its looks. Today two:
  **timber** (`TIMBER_WALLS`: town buildings, and the exterior theme's houses) and **masonry**
  (`MASONRY_WALLS`: Spire rooms). Not a world theme: a world theme picks which building type its
  walls use.
- **Building exterior**: how a building is drawn while the player is outside it: a closed block,
  all four walls full height in its building type's outward surface, under a roof (timber) or a
  **stone cap** (masonry) that never fades. One per building type (ADR-0036, FS-9PN7X). Always
  say *building* exterior: bare "exterior" collides with the **exterior theme**, which is a run
  look, not a building's outside.
- **Interior look**: how a building is drawn while the player stands inside it: the cut-away
  (back walls full, south and east fronts low), furnished and lit. Not the same as **interior**,
  which names the place (a town building's inside, FS-B0H2D), not the way it is drawn.
- **Indoor blackout**: while the player stands inside a building, everything outside it (the
  street, corridors, open floor, every other building, and everyone in them, party included) is
  drawn in the canvas's darkest ink (`palette.inkDeep`), to the px: only what the building itself
  draws (its floor, its walls, what stands in it) shows. Snaps on and off at the doorway. In the
  Spire this gives a room an inside, so "indoor" means *inside a room* there once FS-9PN7X ships,
  while the tower theme's "the whole floor is indoors" still describes the floor as a whole. A
  view rule, never a visibility rule: the server sends what it always did.
- **Fog of war** (FS-SRA9J, ADR-0063, ADR-0068): on a dungeon floor, how much of each **region**
  the player is shown, by its **exploration state**: **unexplored** (never entered by a party
  member: its ground and walls under a dense **veil**, nothing else in it drawn), **explored**
  (entered before: terrain under a lighter veil, no monsters), **visible** (a living party member
  stands in it now: drawn in full). Its edges are feathered and a change of state eases in. Shared by the party, reset on reconnect and
  on a floor change. Presentation only, never a visibility rule: the server sends what interest
  allows (ADR-0060). On a dungeon floor it takes the place of the indoor blackout.
- **Minimap**: the top-right HUD map of a dungeon floor: explored regions, the party, and the
  switch, escape door and stairs once their region is explored. Toggled with M. Not on floors
  without regions.
- **Target frame** (FS-48CTQ): the HUD frame at the top centre that names one monster (name,
  level, HP bar) instead of plates over every head: the hovered monster, else an engaged boss, else
  the monster the local player last hit. A **marker mode** per world and floor says whether
  monsters carry overhead plates (`overhead`, everywhere today but floor 1) or use the frame.
  Not a **marker**: it is HUD, not drawn in the world.
- **Silhouette**: the player's outline drawn through a building exterior that stands between them
  and the camera. It replaces the occluder fade for buildings; trees and tall props still fade.
- ~~**Dark opening**: an entrance seen from outside: a town building's door gap or an open Spire
  door, drawn as its frame with flat darkness inside. A closed or locked door draws as a door.~~
  Retired 2026-11-03 (owner, FS-9PN7X §B.5 amendment): entrances show doors. A town door gap
  holds a drawn door, shut from outside and open from inside; a Spire room door shows its own
  state; a door head closes the wall over every door from outside. Don't use the term.
- **Container view**: the on-screen panel showing a container's contents. Not the
  same thing as a **container**, which is the WS entity in `containers[]`. Opening the view is
  presentation; clicking an item in it sends exactly the message the item row always sent. It has
  one face per container kind (FS-1D6BX), which differ only in art:
  - **Coffer**: a chest's view, a square open box facing the player with the items inside. No
    animation.
  - **Satchel**: a sack's view, the leather satchel with its flap opening (FS-2325V §D).
  - **Bone heap**: a drop pile's view, the heap with the items lying on top. No animation.
- **Sack**: the container kind `"sack"` (FS-1D6BX), placed on the floor where a chest would be and
  opening into the satchel. **Not the bag**: say "sack", never "bag" or "loot bag", for it.
- **Bag**: the ordered list of items the player's character carries but does not wear, drawn as
  the 30-cell grid (6 × 5) in the gear overlay's right panel, under the gear slots (FS-HRH2J). It
  holds at most **bag capacity**, 30 items (`BAG_CAPACITY` in `src/ui/bag.ts`, game-service's
  `BagCapacity`). New items go on the end, and nothing reorders it. In a run or a field world it
  is the WS `inventory` (plus items taken and still pending), and a pickup or unequip into a full
  bag is not sent ("Your bag is full."). In the hub it is the account's bag-location items, read
  over REST and not capped, so it can read over capacity (e.g. `34 / 30`); before FS-VPD8Y it
  was every owned item the loadout did not wear. Same
  meaning as game-service's **bag**
  ([`game-service/CONTEXT.md`](../game-server/game-service/CONTEXT.md) "Carried items").
  **Not the container view**: the coffer/satchel/bone-heap panel shows a container's contents, never the
  bag, even though code still says `satchel` in places (`satchelIcon`, the container view's
  leather). Say **bag** in prose, specs and new names. Not "inventory" either: that is the wire
  field, and items-service's word for everything an account owns.
- **Stash**: the account's town storage (60), opened at the hub's stash chest and shown as its
  own grid beside the bag; items move bag ↔ stash with right-click or `E` (FS-VPD8Y). Never in
  a run or field world. Not the container view: a run chest is a world container, the stash
  chest only opens the account's stash.
- **Worn tip**: the item tip of a worn item, captioned "Worn" ("Worn · Ring 1" / "Worn · Ring 2"),
  shown beside a bag item's own tip while Shift is held over it in the gear overlay, one per
  target slot that holds an item (FS-NV54P). Holding Shift to see them is to **compare**. Not a
  second kind of tip: the same item tip, built by `buildItemTip`, with a caption.
- **Unsafe find** (marking): the border and tip note on an item picked up in this run, which
  is lost if the player dies before escaping. Game-service's term (FS-18Z5F).

- **Ability card**: the HUD panel at the bottom right of a run or a field world showing the
  player's class ability: its name, the right-mouse glyph and a line on how it works (FS-8AY7S).
  Never in the hub. The ability itself is game-service's term
  ([`game-service/CONTEXT.md`](../game-server/game-service/CONTEXT.md) "Classes and abilities").
- **Resource bars**: the player's own Health bar and, below it, their class resource bar at the
  top left of a run or a field world, under the level bar in a run, each labelled with its own
  name ("Health:", "Mana:",
  "Stamina:", "Parry:"). The mercenary's bar is drawn as 3 pips. There are no overhead bars over
  other players for now: teammates' health and resource live in the party frames (FS-CH21F R14).
  The player has no bar over their own head (FS-8AY7S).

- **Aim line**: the line an archer sees while holding to aim Shadow Shot, faint until a release
  would fire. Drawn for the aiming player only; the server never knows about it (ADR-0030).
- **Stance tell**: the raised blade over a mercenary while their parry stance is open.
- **Armed tell**: the blade carried at a mercenary's hip while they hold 3 parry charges (riposte
  armed).
- **Riposte slice**: the wide sword arc drawn when an armed mercenary cuts. Not the **cut**, the
  narrow arc of their ordinary left-click.
- **Shimmer** (FS-KZC92): a one-shot glitter over one character's body, played the moment an
  effect lands on them. It ends on its own and marks the moment only. It is not a lasting buff
  display. A concrete shimmer is a base (its motion) plus a **look**.
- **Granted shimmer**: the base played when no player is the source (a potion, scroll, shrine,
  world or NPC buff): glints winking over the body. The heal shimmer is one.
- **Invoked shimmer**: the base played when a player is the source (an ally's buff, a
  self-buff, a charge-up): a spiral winding up the body.
- **Look**: a shimmer's three colours, all `BARROW` tokens: `glint` (the glint body), `centre`
  (its hot core) and `light` (the glow it casts and pools at the feet). The heal look is
  `oxbloodText` / `vellum` / `oxblood`. Not a base: the same base takes any look.

- **Logical view** (FS-ZAJMH): the coordinate space cameras and the HUD work in. Always **720
  units tall**; **1080 to 1280 units wide** depending on the shape of the space the game is given.
  At render scale 1 one logical unit is one CSS pixel of the
  old 1080×720 canvas. Scenes and HUD read it from the viewport module (`src/render/viewport/`),
  never from `cameras.main.width/height`, which are backing-store px. A pointer's `x/y` are backing
  px too: a HUD hit test maps them to logical units (`viewport.toLogical`). World aim keeps
  `pointer.worldX/worldY`.
- **Render scale**: backing-store pixels per logical unit. Displayed CSS size ×
  `devicePixelRatio` ÷ logical size, capped at 2 (`RENDER_SCALE_CAP`). Fractional is valid. Every
  scene's main camera is zoomed by it at origin 0; canvas text rasterises at it.
- **Pixel grid**: the 1/render-scale steps a camera's scroll is kept on (`keepOnPixelGrid`), so
  a still world keeps its px as the camera moves, at a fractional render scale too. With the
  camera's `roundPixels` kept on and every game object rounding whenever its camera does
  (`fullAuto`, set once in `src/render/viewport`, ADR-0057), every quad's corner lands on a whole
  backing px. Phaser 4 rounds a scaled or zoomed quad only on request, which is why it is asked
  for centrally rather than per object.
- **Stage**: the 1080-unit-wide layout a canvas menu (main menu, character creation) is built in
  (`STAGE_WIDTH`, the narrowest logical view). Its camera centres it in a wider view
  (`centreStage`), the backdrop reaching the view's edges; a menu's own hit test reads a pointer
  in stage units (`stagePoint`). Not the HUD: HUD widgets keep to the view's edges by anchors.
- **Game frame**: the DOM element that holds the canvas and Phaser's DOM container. It is what
  goes fullscreen. The fullscreen button sits over the canvas's top-right corner, never out in
  the frame's bars.
- **Windowed** / **fullscreen**: the game frame's two states on the `/game` page.

## Dev gallery terms (FS-1819Q)

- **Tracked family**: a kind of visual piece the dev gallery must show in full. Listed once in
  `src/dev/gallery/families.ts`; v1 tracks effects and item icons.
- **Gallery card**: one entry in a tracked family: a name plus a one-line demo, or a one-line
  reason why it can't be demoed.

## Mapping table

| Screen says | REST / auth | WS protocol | SPECIFICATION.md |
|---|---|---|---|
| player | `Member`, `member_id` | `player`, `player_id`, `current_player` | "player" |
| a delve | — | `game`, `session_id`, `find_game`, `end_game` | "escape run" |
| the Spire | — | the instance world | "escape run" (the instance) |
| Gentle Meadows, the Forlorn Forest | — | `world_type` `field` | "field world" |
| the town | — | `world_type` `hub` | "hub" |
| the Inn, the store, the smithy | — | walls sharing a `house_id` | "enterable town building" |
| relic, plunder | `/api/items/*` | `items[]` | "loadout", "items" |
| chest, sack, bone heap | — | `containers[].kind` `chest` / `sack` / `drop_pile` | "container" |
| the party | — | `party_update`, `party_id` | "party" |
| travel to the leader | — | `world_handoff` (to a hub) | "Travel to the party leader's village" |
| a letter, Take | `/api/mail/*`, `claim`, `claimState` | `mail_arrived` | "mailbox", "claim a letter's enclosures" |

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
- ~~The **HUB** world (refactor plan) has no lore name yet — "hub" is an engineering word.~~
  Resolved 2026-10-30 (FS-B0H2D scoping): it is **the town**, the word the owner uses and the
  Elder's tale already speaks. A proper name for the town (if it ever gets one) is still open.
- **Escaping vs dying.** The end-of-run overlay distinguishes them (`current_player === null` ⇒
  escaped) but the vocabulary does not. The guideline offers *"Few return whole"* for death; the
  successful case has no term.
- ~~**"Claim" on a letter vs the voice rule.** *Voice rules* reserve "Acquire" / "Claim" for
  in-game-gold purchases; FS-1GZGD's charter put "Claim" on the letter's button, where nothing
  is bought. Kept as the charter decided; whether the voice rule should name letters too, or the
  button should take another verb, is unsettled.~~ Resolved 2026-11-04 (FS-1GZGD amendment, A5,
  the user): the button takes another verb, **Take** → "Taking…" → "Taken", with a "Taken" stamp.
  The voice rule stands unchanged; "claim" survives only in code and API names.
- `game-server/game-service/CONTEXT.md` is still empty. When it is populated, the protocol column
  of the mapping table above becomes a link rather than a restatement.
