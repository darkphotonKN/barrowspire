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
- **Arrival** — coming into a place the player was not just in: the town, a field, the Spire's
  first floor, or the next floor up on a climb. Not an arrival: a reconnect or a page refresh back
  into the same place, and walking into a town building (FS-PQ2TW, ADR-0075).
- **Arrival card** — what the screen shows on an arrival: the view dark, the place's name over a
  rule and one line, then the view back and the card burned away to ash (its dust and smoke are
  alternates a play may name). The climb's **floor card** is
  the arrival card of a floor; "floor card" stays the word for that one.
- **Lost connection** — the game socket closing when the client did not let it go: a server
  restart or rollout, a network loss, the browser closing it after sleep (FS-R6EYZ). Not a lost
  connection: leaving /game, a handoff or a redirect (the old socket let go on purpose), or a
  `4001` refusal the client is renewing its way past (FS-ZPX58). In code, `onConnectionLost`.
- **Disconnect notice** — the carved panel a lost connection raises while the player is in a
  world (town, field or run): "Disconnected", one line and **Return to menu**, the world dimmed
  and still behind it (FS-R6EYZ). One at a time; it stays through scene changes until pressed.
  The main menu it returns to reconnects.
- **World scene** — one of the three Phaser scenes that draw a world the player stands in:
  `HubScene` (the town), `FieldScene` (a field), `BarrowspireScene` (a run). A world switch
  replaces one with another (`WORLD_SCENES`). Not the main menu or character creation.
- **UI scene** — the one Phaser scene (`UIScene`) drawn over every world scene and under the
  disconnect notice, holding the interface the worlds share: in phase 1 the corner row, the ESC
  menu with OPTIONS, and the interface sounds (FS-TQZ5J, ADR-0081). It outlives world switches and
  sleeps outside the worlds. It and the world scenes talk only through the **UI bridge**, a typed
  channel: the world reports its state, the UI scene sends requests.
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
- **Envelope** — the mailbox's HUD icon at the bottom-right of the town: a **knockout** envelope
  drawn in Phaser (its flap and foot folds cut; FS-7TQN4), or its **line glyph** where the scene
  cannot make the texture, bare (no plate, no seal; FS-J1672), the **corner row**'s Mail icon,
  carrying the **count badge** over it. Not an emoji and not a Heroicon (the HUD is canvas). Its hover label reads
  "Mailbox" (FS-1GZGD § Change, 2026-11-12); outside the town the row shows it greyed,
  "Mailbox · town only".
- **Count badge** (on the envelope; FS-J1672) — the indicator: a small ember badge with the
  count at the envelope's top-right corner while any letter is unread or still holds unclaimed
  enclosures; gone only when everything is read and claimed. The **pulse** is the envelope's few
  glows when a newer letter than the player last saw arrives; after it the badge stays. Before
  FS-J1672 this was the envelope's **wax seal** (lit with the count, dark at none).
- **Wax seal** — the lit seal dot on a letter-list row, meaning that letter is unread. The
  envelope no longer wears one (FS-J1672); the code's `sealState` still names the envelope's
  count and lit state.
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
  footprint and are used for neither. A living monster is also hit over its **body column**. Not
  a **wall foot**, which is only what a wall's ground shadow is cast from.
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
  is 1; one of 1, 1.5, 2, 3, 4). A sheet baked at 2x holds twice the detail each way and is drawn
  at half size, one at 1.5x one and a half times and is drawn at two thirds, so either stands
  exactly as large as at 1x; its frame size and atlas positions are in its own px, while
  `crown`, markers, the footprint and every other size stay screen px (ADR-0058, ADR-0076,
  FS-HF0WW). At 1.5 a screen px is a whole sheet px only every two screen px, so the frame box,
  the anchor and the trim lie on that two-px step.
- **Trimmed sheet**: a sheet whose frames were each cut, at bake time, to the box that holds their
  pixels; the atlas stores only the cut and the manifest says where it sits in the whole frame
  (`trim`). Drawn, anchored and sized as the whole frame (ADR-0058, FS-HF0WW).
- **Walk-attack** (`walk_attack`): a class's attack drawn while it moves: the attack from the
  waist up over the walk from the waist down, the legs facing the aim (for a melee swing, its
  target). Every playable class's sheet carries it; no creature's or resident's does (FS-HF0WW,
  FS-3V7GC). On a sheet that runs, its legs never step faster than the slowed body moves
  (FS-JS7C8 R21). Moving more than 90° away from the aim, a class that carries it plays the
  backpedal-attack instead.
- **Run** (`run`): a playable class's looping clip while it moves and is not attacking, a fast
  run (short of a sprint, leaning forward, the arms pumping) keyed to the server's move speed so it plays at about its own pace, turned to its movement.
  Replaces the walk for the four classes; folk and creatures still walk. Not the walk, which the
  class sheets keep for later use (FS-JS7C8).
- **Pace** (`WALK_PACE`, `RUN_PACE`; the backpedal legs' pace in the bake): the world px per
  second a looping clip carries the body at 1x: the speed its planted foot slides back under the
  body, measured on the rig by the bake's `pace.js`, never guessed. The client plays a looping clip
  at the drawn speed over its pace, so planted feet stay planted; the attack-on-the-move clips
  play at their authored rate, their leg cycles chosen from the measured pace (FS-JS7C8 R3, R10,
  R21).
- **Backpedal-attack** (`backpedal_attack`): a playable class's attack drawn while it moves more
  than 90° away from the attack's facing: the attack from the waist up over the backpedal legs
  from the waist down, composed as the walk-attack is and lasting as long as the attack. The
  backpedal legs are the walk's legs run backward in time: the walk-attack's upright stance and
  stride, the feet stepping back. The only backward step: a class that is not attacking never
  steps back. The backpedal legs are a bake-only cycle; no sheet carries a standalone `backpedal`
  (FS-JS7C8, owner changes 2026-11-12).
- **Facing** (a character's): which of the 8 world directions its figure is turned to: its drawn
  movement, kept while it stands; a swing turns it to its aim. Never the pointer, and never sent to
  or received from the server: every client derives every figure's facing from the motion it
  draws (FS-JS7C8 R22, owner change 2026-11-12). *Avoid*: "pointer facing" (retired).
- **Atlas group**: the atlas pages one group of sheets is packed onto, named by the manifest's
  atlas keys without the page number (`boss-0` and `boss-1` are the `boss` group). The unit the
  client loads and frees art by (FS-C4JWH).
- **Resident group**: an atlas group loaded at boot and kept for the whole game: the four class
  groups and every small one. Always "resident group" or "resident art", never a bare "resident",
  which is a townsperson (ADR-0059).
- **Scene-scoped group**: an atlas group loaded only by the scenes that draw it (folk, wildlife,
  fodder, creatures, boss) and freed when the next scene does not use it (ADR-0059, FS-C4JWH).
- **On-demand group**: a scene-scoped group no scene preloads, fetched while a scene runs, the first
  time a snapshot lists the archetype it draws (today only `blood_demon`). Freed by eviction like any
  scene-scoped group (ADR-0071, FS-VHGE7).
- **Stand-in**: what a monster on an on-demand group draws until the group is in: a sheet its scene
  already holds, under a palette tint. A look, never the placeholder (ADR-0071).
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
- **Wall piece**: one tile of a wall as drawn (`WallPiece`), each sorted by its own footprint,
  with a **post** wherever walls end or meet. "Back" pieces stand full height; "front" pieces are
  the low cut-away. What a wall is cut from, and what decides its height, depend on where it
  stands:
  - **A building's wall** (a house, a partition, a floor of buildings): a server wall rect, cut
    along the rect's centreline, a post at each end. Its height is its house side's: back on the
    north and west sides, front on the south and east (or a piece rule's, where one is given).
  - **A dungeon floor's wall**: an *edge run* (**Wall edge**), cut on the edge, two pieces per
    cell, its centre half the wall's thickness into the wall cell, a post at each end of the run
    (FS-XK2B6). Its height is its edge's (`edgeHeight`), never its place's: front on a region's
    south or east edge, and on any edge whose wall cell also has a walkable cell directly north or
    west of it; back otherwise. So some north and west pieces are low.
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
  `docs/design-guideline.md`), which every world theme draws its colours from.
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
  long table, hall hearth, counter and tables, the smithy's forge) instead of as wall pieces. It
  has collision, so it is **not dressing**, like a tree stand. Recognised by geometry: a wall of a
  house that touches none of the house's four edges. Chairs, stools, shelves, crates, kegs,
  chests, candelabra, lanterns, paintings, plants, rugs and the anvil are **indoor dressing**:
  dressing placed inside a house, with no collision.
- **Partition**: a server wall of a house that reaches its edges end on, across the house (the
  Inn's, between its **great hall** and **taproom**; `isPartition`). It divides one house, one
  **Room** in this glossary's sense (one `house_id` wall group), into two halls; never call the
  halves rooms. Drawn as low interior masonry inside the house while the player is in it, with an
  open doorway; never a cut-away outer wall with an exterior look, never furniture.
- **Inn's hearth**: the great hall's hearth (`hall_hearth`), a furnishing built into the Inn's
  north wall and a light source shown only while the Inn's roof is lifted. Always qualified: bare
  **hearth** in the hub means the outdoor brazier at the gathering ground (`HUB_HEARTH`, keep-out
  K5), which is a different thing.
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
- **Wall edge**: on a dungeon floor, the side a wall cell shares with a walkable cell directly
  north, south, west or east of it (FS-XK2B6). A dungeon floor's walls are drawn on wall edges,
  never through a wall cell's middle; a wall cell may carry up to four. The whole cell still
  collides, and what lies of it beyond its walls is drawn as void is. Say *edge run* for a
  straight line of wall edges facing the same way and drawn at one height, from one corner of the
  walkable outline to the next, or to where the wall changes height. A building's wall is still
  cut along its rect's centreline (**Wall piece**).
- **Wall foot** (short **foot**; `WallFoot`, `BAKE.WALL_FOOT`, `BAKE.POST_FOOT`): the strip of
  ground a wall stands on as drawn, which its ground shadow is cast from (FS-V8FT3 §C R13): one
  thickness deep, the material's (`WallSheets.thickness`), not the server rect's; as long as a
  stretch of the wall's pieces standing end to end at one height, so one foot for a whole run,
  never one per piece; with how tall that stretch stands. A building's wall's foot is centred on
  its rect's centreline; a dungeon floor's edge run's is the strip from its **wall edge** to one
  thickness on its wall cells' side. A post's foot is its own square. Not a **footprint**: a
  footprint is one object's patch of ground, read for draw order and clicks; a foot joins a run's
  pieces and is read for nothing but casting its shadow. Never a figure's feet (the point a
  sprite stands on).
- **Partition wall**: a server wall as the tower theme draws it: masonry, cut into wall pieces
  with the same geometry and cut-away rule as a house wall. It is a server wall, with collision.
- **Perimeter wall**: the tower's outer wall, drawn by the client alone around the outside of the
  play area. Not a server wall: no entity, no collision, not in `walls[]`. Its south and east runs
  are always low so it never covers anything in play.
- **Floor band**: `lower` / `middle` / `upper`, a run floor's place in the climb, derived from
  `floor` and `floor_count` (FS-8RBQY §C.1). FS-M8CSE (locked, not built) derives it from `floor`
  alone, because the run's height leaves the wire; the band then says how high a floor is, never
  how far through the run. The only input that varies the tower look per floor. Not the same as
  **floor**, the wire number it is derived from.
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
- **Minimap**: the top-right HUD map of the world the player stands in. On a dungeon floor:
  explored regions, the party, and the switch, escape door and stairs once their region is
  explored; not on floors without regions. In the **town** (FS-P0HSP): the whole town from the
  first moment, its buildings solid with their doors open, its edge open at each road, its **map
  marks**. In a **field world**: its **charted ground** only. Everywhere the party's dots, never a
  monster, another player or a label. M, or a press on its **map mode icon**, steps it through its
  modes, normal, enlarged and the map overlay, and the browser remembers the mode, one for every world (FS-1SEF0, FS-P0HSP); nothing
  hides it.
- **Map overlay** (FS-1SEF0): the minimap's third mode, the floor's map drawn see-through over the
  whole view, about the figure the camera follows, under the HUD; the top-right corner holds no
  map while it is up.
- **Map mode icon** (FS-56CKV §Change: Map mode icon): the small amber glyph in the minimap's
  bottom-left corner (in the very top-right corner while the map overlay is up) that does what M
  does: a press steps the minimap to its next mode. Hovered, it says "Map mode (M)".
- **Map name** (FS-56CKV §Change: Map name): the name of the place the minimap shows, the same
  words its arrival card titles it with (the town, a field, a floor of the Spire), in small text
  inside the minimap's top-right, normal or enlarged (FS-56CKV §Change: The enlarged map keeps its
  labels inside), or left of the map mode icon while the overlay is up. Never a second list of
  names.
- **Map mark** (FS-56CKV, FS-P0HSP): a small amber glyph on the minimap for something the player
  can walk to and act on: in a run the switch, escape door and stairs; in the town the tower (the
  Spire gate), a teleport mark (a gate to another area), the stash chest and a bag (the
  Quartermaster), never the Elder, who only tells a story; in a field the teleport mark of its
  road home. Never a label, a monster or another player. Once FS-P0HSP ships the town and every field have a minimap.
- **Charted ground** (FS-P0HSP): the part of a field the character has walked near, which that
  field's minimap shows; the rest is **uncharted** and shown as nothing. Charting is the field's
  minimap fog: on the minimap only, never on the screen, the character's own (not the party's),
  kept in this browser per character and field (ADR-0078). Not **fog of war**, which veils a dungeon floor
  in the world and is the party's (explored / unexplored are that one's words).
- **Target frame** (FS-48CTQ): the HUD frame at the top centre that names one monster (name,
  level, HP bar) instead of plates over every head: the hovered monster, else an engaged boss, else
  the monster the local player last hit. A **marker mode** per world and floor says whether
  monsters carry overhead plates (`overhead`, everywhere today but floor 1) or use the frame; on a
  `frame` floor a damaged monster still carries its HP bar over its head, alone, with no plate
  (§F). Not a **marker**: it is HUD, not drawn in the world.
- **Damage chip** (FS-48CTQ §F.22): the run of an HP bar, overhead or in the target frame, that
  still shows the health a hit just took, lighter than the fill; it holds a moment, then drains to
  the fill. A view-only echo of the drop: it is not health and not a damage number.
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
- **Timed open** (FS-MQYEX): the wait between reaching for a shut chest or sack in a run and its
  view opening, counted by the server and sent as `current_player.timed_open`. The client only
  draws it, as the **open bar** over the container. It **completes** (the container opens) or is
  **cancelled** (nothing opens, nothing is said). Not a **countdown** (FS-B3NDZ): it fills, it
  carries no number, and it sits on no panel. Not a "channel": on screen that word is chat's.
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

- **Corner row** (FS-3EBCA): the row of drawn panel icons in the bottom-right corner of every
  world, from the right **Menu** (a gear: one Esc press), **Inventory** (a bag: the inventory),
  **Character** (a bust: the character panel), **Party** (the party panel) and the **Mailbox**
  icon (the envelope; greyed outside the town). Each is a **knockout** and names itself and its
  key under the pointer. Not the party frames, not the minimap's column.
- **Knockout** (FS-7TQN4; `Knockout` in `src/ui/knockout.ts`) — how a corner-row icon is drawn: one
  solid silhouette filled in its own texture, its inner lines (**cuts**, 1.6 px) and **holes**
  erased so the world shows through, tinted bronze (the greyed Mailbox `hudFaint`). The picture is
  the silhouette plus its cuts; the colour is only the tint. Not an outline, not a mask, and
  nothing to do with a player being downed.
- **Line glyph** (FS-QHN87) — a corner-row icon drawn in strokes only, 2.25 px, nothing filled:
  what each icon falls back to where the scene cannot make its knockout's texture. Never the
  normal look.
- **Inventory** (panel; FS-HRH2J § Change: Character and inventory apart): the gear overlay's right
  panel, titled INVENTORY: the ten gear slots, the **bag** under them and the purse line, opened
  on its own by `I` or `B` or the corner row's Inventory icon. The screen's name for that panel
  only: the items under the slots are still the **bag**, and the wire's `inventory` is still the
  bag's items.
- **Character panel** (FS-HRH2J § Change: Character and inventory apart): the gear overlay's left
  panel, the stats (class, name, level and experience, health and resource, the class card, what
  worn gear adds), opened on its own by `C` or the corner row's Character icon. Never shown in
  stash mode, where the left panel is the **stash**.
- **Ability card**: the HUD panel at the bottom right of a run or a field world showing the
  player's class ability: its name, the right-mouse glyph and a line on how it works (FS-8AY7S),
  standing directly above the **corner row** (FS-3EBCA).
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
- **Still glow** (FS-QE2QW): the soft, unmoving light behind a Runed or Fabled item's icon, in its
  rarity colour. It marks the tier for as long as the icon is shown.
- **Item glitter** (FS-QE2QW): the quiet loop of small glints on a Fabled item's icon while that
  icon is shown. Not a **shimmer**: a shimmer is one-shot, on a body, and marks a moment; item
  glitter loops, on an icon, and marks what the item is. It shares only the shimmer's glint.

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
  goes fullscreen, from the OPTIONS panel's **Fullscreen** row; nothing stands over the canvas
  (FS-T3DWX). The top-right HUD stands in the corner the button used to keep.
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
