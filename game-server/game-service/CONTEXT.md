# CONTEXT — game-service

Ubiquitous language for the **game-service** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## The `hub` collision — read this first

**`hub` names two unrelated things in this service, and both keep their name.** This is a known
ambiguity, deliberately tolerated, so it is written down rather than left to bite:

- **HUB** — *a place.* The shared, long-lived world players gather in between runs, as
  [`/docs/refactor_plan.md`](../../docs/refactor_plan.md) names it.
- **message hub** — *a component.* The central WebSocket dispatcher (`messageHub.Run`,
  `internal/gameserver/hub.go`) that routes each connection's messages to the right world.

They have nothing to do with each other. A player is *in* the HUB; a message goes *through* the
message hub.

This collision is not theoretical — it derailed a round of FS-29KSH's scoping, where "do the HUB
and the tower share the same hub?" was asked about the world and answered about the dispatcher.
**When either could be meant, write the full term**: "the HUB world" or "the message hub", never
a bare "the hub". Renaming the dispatcher was considered and not taken.

## Terms

### Worlds

- **World** — one isolated ECS simulation: its own `EntityManager`, its own goroutines, its own
  fixed-timestep tick, no mutable state shared with any other world.
- **World type** — which kind of world: `hub` or `run`. Two types, one client. Gains `field`
  with FS-X2F2H (the client calls this **world kind**, mirroring `world_type` on the wire).
- **Hub** — the shared, long-lived world players occupy between runs. One per deployment,
  server-authoritative, capped. Same thing the refactor plan calls the **HUB**; never call it a
  lobby, a town, or a village in code.
  - **Town** — the owner's word for the hub, and the lore's (the Elder's tale: "the town needs
    heroes now"). Same world, not a part of it. Fine in conversation, specs and player-facing
    copy ("town buildings", "out of town to the Forest"); code keeps **hub** (`hubBuildings`,
    `HubScene`). A spec that says "town" means the hub world, never a separate place.
- **Run** — a short-lived world built for one match, resolved and torn down. The original
  escape-run game loop. Also called an **instance** where allocation is the subject (ADR-0004,
  the refactor plan); prefer **run** for the world and **instance** only for the allocation unit.
  - Discussion in Chinese calls this 塔 ("the tower"). That is conversational shorthand only:
    it names no layer of the system, so it appears in neither code nor UI copy. **run** is the
    server's word and **delve** is the player's; 塔 is neither, and translating it into either
    one of them is a mistake.
- **Session** — the code-level struct owning a world and its loop (`internal/game`). One session
  per world, so a session is now either a hub session or a run session.
  - **`GameSession` in code means exactly this** — `GetGameSession`, `resolveGameSession`,
    `Player.CurrentGameSessionId`. The "Game" is inert: this service holds no other kind of
    session, and these names predate the hub. They cover **both** world types, so
    `GetGameSession` returning the hub is correct, not a bug, and there is no separate hub
    lookup to go looking for. Renaming was considered during FS-29KSH and declined: it touches
    30 sites across four packages to delete a neutral word, and the churn would land on top of
    the hub work in `git blame`.
- **Delve** — the *player-facing* word for entering a run, owned by
  [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md). Server
  code says **run**; UI copy says **delve**. Do not mix them in one layer. "Delve" stays the
  Spire's own word: a field visit is not a delve.
- **Field world** (world type `field`, FS-X2F2H) — a long-lived world shared like the hub, with
  monsters and loot and **no queue**: anyone walks in through its gate. Not a run: it is not built
  for a match, never resolves, and is never torn down while its pod lives. Death in it costs
  nothing. Its gains settle when the player leaves, through the match-end outbox path as a
  `returned` result, but a field visit is still not a match; do not call it one.
  - **Gentle Meadows** — the easy field, east of the hub: open, hand-laid map, low-level animals.
  - **Forlorn Forest** — the harder field, west of the hub: a generated branching trail, zombies
    and the rare ghost (FS-3QHQZ).
  - **Dev test room** — a dev-only field for trying builds (FS-BDRTJ). Built only when
    `ENVIRONMENT` is development. Unlike every other field, its visits never settle.
- **Channel** — one pod's copy of a field world (ADR-0030). Every pod runs one channel of each
  field, created at boot; two players on different pods are in different channels of the same
  field. **Collides with the Redis pub/sub channel** (`matchstart:pod:<podID>`, the hub's state
  channel), and since FS-WJGFJ with the **chat channel**: when any could be meant, write "field
  channel", "Redis channel" or "chat channel", never a bare "channel".

### Moving between worlds

- **World switch** — moving a player from one world to another by removing their entity from the
  source world and creating it in the target. Internal to the process; the client neither
  reconnects nor re-authenticates ([ADR-0015](../../docs/adr/0015-hub-and-runs-share-one-process-and-one-connection.md)).
- **World identity** — the `(type, id)` pair a state broadcast carries so the client is *told*
  which world it is in rather than inferring it from the payload's shape.
- **Handoff** — moving a matched player from their pod to the **host pod** by reconnecting: the
  client opens a new socket to the host's pod address, then closes the old one (FS-K2HKP). Only
  across pods; a player already on the host pod gets a world switch instead. The two are never
  interchangeable: a world switch keeps the connection, a handoff replaces it. The destination
  may also be a hub world (*hub handoff*, under *Party* below).
  - **Handoff player** — a matched player on another pod, who will arrive by handoff
    (`ResolvedMatchedPlayers.HandoffPlayers`). Opposite of a **local player**.
  - **Local player** — a matched player already connected to the host pod, seated in the run at
    creation with a world switch (`ResolvedMatchedPlayers.LocalPlayers`).
  - **Arrival** — a handoff player's connection reaching the host, carrying `?session_id=`.
    Seated (`SeatArrival`) or refused with close code `4002`; never served half-seated.
- **Gate** (FS-0XMCP) — a fixed hub location a player walks into to go to a place, entry
  validated by proximity on the server. The **Spire gate** opens the queue panel (queue or solo
  start; the queue and handoff are unchanged); a **field gate** world-switches the player into
  that pod's channel of the field, never a handoff (ADR-0030). Each field has an entrance gate
  back to the matching hub gate. A gate is map data, not an NPC: it replaces the **Delve NPC** as
  the queue's entry point once FS-0XMCP ships.

### Hub population

- **Occupancy cap** — the maximum number of players the hub admits at once. Refusal at the
  door, not a queue. A member whose party's **leader** stands on that pod is admitted up to the
  **travel margin** past it (one full party, `HubTravelMargin`, shared by the whole hub, first
  come); coming home from a field passes it entirely.
- **Concurrency ceiling** — the whole-deployment player limit (50) that ADR-0015's single-process
  decision depends on. Distinct from the occupancy cap even when the numbers coincide: raising
  the ceiling reopens an ADR, raising the cap does not.

### NPCs

- **NPC** — a server-authoritative, non-player entity in the hub. Two kinds, below. Both are
  server-authoritative; only one of them moves.
- **Function NPC** — an NPC that *is* the entry point to a hub function, rather than
  decoration. **Stands at a fixed position** — its placement is map data, not something
  broadcast. Talking to one opens that function. The established pattern for reaching anything
  in the hub; expect more of them.
  - **Delve NPC** — opens the matchmaking queue.
  - **Storekeeper NPC** — the Quartermaster. Has a line and opens nothing since FS-HRH2J: gear
    and the bag open from the gear overlay anywhere, not from an NPC. The function id
    (`NPCFunctionStorekeeper`, `storekeeper`) keeps its name; whether he becomes the stash keeper
    is FS-VPD8Y's call. Stands inside **the Quartermaster's store** once FS-B0H2D ships; his
    function does not change with his place.
- **Ambient NPC** — a resident with no function attached, there to make the place feel
  inhabited. Server-authoritative and broadcast per tick, so every player sees one in the same
  position. Not decoration in the technical sense: it costs broadcast and server-side collision.
  Two kinds, told apart by whether the NPC carries a wander region (`NPCComponent.Wander`):
  - **Wandering resident** — keeps to a **quarter** (`WanderRegion`), walking between random
    points in it. The Cottar, the Herbwife, the Woodcutter, the Bellringer. What "resident" meant
    before FS-B0H2D, and what a bare "resident" still means.
  - **Fixed resident** (FS-B0H2D) — an ambient NPC placed at one point and never moving: no
    quarter, no velocity, function `""`. Map data like a function NPC's place, but opens nothing
    and gets no FS-MRZH7 marker. The innkeeper, the patrons and the smith. Not a new NPC kind on
    the wire: it is the ambient NPC with its wander region left off. Do not call one a "pinned
    NPC" or a "static NPC" in code; **fixed resident** is the term.
  - **Innkeeper** — the fixed resident behind the Inn's counter. Talkable, the longest talk in
    town (client-side lines); sells, rents and pours nothing.
  - **Patron** — a fixed resident standing at the great hall's long table, talkable with a short
    lore line. Never wanders, never leaves, never sits (no sitting pose). Three of them; not a
    crowd system.
  - **Smith** — the fixed resident at the smithy's forge. A lore line; no repairs, no trading.

### Town buildings (FS-B0H2D)

- **Town building** — one of the hub's buildings (`hubBuildings`). Since FS-B0H2D every one is an
  **enterable town building**: walls with a **door gap** in the south wall, and a room inside a
  player can walk into. Before it they were closed scenery (four walls, FS-29KSH); a closed
  building is no longer a thing the hub has. Server code says **building**; game-client says
  **house** for the same footprint (its `House`, `housesFrom`).
- **Door gap** — the opening cut in a town building's south wall. Just a gap: **no door entity**,
  nothing to open, lock or sync. Unlike a run's house (`AddBuilding`), which hangs a door in its
  gap. South, so the iso view shows it from the town side.
- **Interior** — the inside of an enterable town building, **in the same world**: same session,
  same tick, same broadcast, entered by walking through the door gap. Not a separate world, scene,
  instance or load step, and no world switch. The server keeps no "inside" state; whether a player
  is inside is a client presentation test (the roof lifts). Never call it an "interior world".
- **Furnishing** — a keep-out inside a town building that the furniture stands on: the Inn's
  long table, hall hearth, counter and tables, the smithy's forge. A server wall carrying its
  building's `house_id`, so it collides like any wall and stays inside its building's footprint.
  Told from the building's own walls by geometry alone: a furnishing touches none of its
  building's four outer edges. It keeps 50 px clear of every wall and furnishing, except the hall
  hearth, built flush into the north wall. Smaller pieces (chairs, stools, shelves, crates, kegs,
  the anvil) are client dressing, with no collision, and are not furnishings.
- **Partition** — a wall of a town building's own running right across it, north edge to south
  edge, cut around a centred door gap (`hubPartition`): it makes one building two halls (the
  Inn's **great hall** and **taproom**) under one `house_id` and one roof. Not "rooms": a Room is
  a run floor's chamber. Told by geometry: it reaches the footprint's edges end on, so it is
  neither on the outline (a building wall) nor clear of every edge (a furnishing). Only the Inn has
  one. Not a second building, and not a door: nothing hangs in its gap.
- **The Inn** — the largest town building, two halls split by its partition: the **taproom**
  (the street door opens into it; the innkeeper behind the counter, two small tables) and the
  **great hall** (the long table with the patrons standing at it, the hall hearth at its head).
  No upstairs, no rooms to rent, nothing to buy. A place with people in it.
- **The Quartermaster's store** — the town building the Quartermaster stands in. "Store" is its
  name, not a function: nothing is bought or sold there.
- **Smithy** — the town building with the forge, where the smith stands. Nothing is repaired,
  made or sold.
- **Lane** (FS-B0H2D) — a straight walkable corridor, at least 240 px wide, from the hub spawn to
  a gate (the Spire's door, the Forest gate, the Meadows gate) that no wall crosses. Map data's
  promise that nothing blocks the way out of town; tested, not eyeballed. A lane is not the
  client's trodden path (`HUB_PATHS`), which is ground paint.

### Field places and visits (FS-X2F2H, FS-3QHQZ)

- **Field place** — a field as data (`FieldPlace`): everything one channel of it is built from,
  its size, layout provider, entrance and arrival, hub gate, creature table, level band, stat and
  drop factors, respawn delay, elite rule and chest restock delay. One per field, the same for
  every pod; the channel is what a pod builds from it.
- **Layout provider** — what hands a field place its layout for one channel (`LayoutProvider`).
  The Meadows' provider returns a fixed, hand-laid layout; the Forest's returns the one its pod
  generated at boot, and may fail. The seam that lets a hand-laid field and a generated one be
  built the same way.
- **Visit** — one player's stay in a field, from entering through its gate to whichever way out
  removes their body first (`FieldVisit`). What settles when they leave. Not a match and not a
  run, though it settles through the match-end outbox path.
  - **Visit id** — minted fresh on every field entry, and sent as the settlement event's
    `session_id`. Never the channel's own id: character-service keys XP grants on it, so two
    visits to one channel must never share one. The one place a `session_id` does not name a run.

### Generated layouts (FS-3QHQZ, `internal/levelgen`)

- **Layout** — two layers, one word; qualify when either could be meant:
  - **generator layout** (`levelgen.Layout`) — the branching-trail generator's pure output for a
    seed: bounds, wall rects, entrance, trails, dead ends, open cells, seed and attempt. Knows
    nothing of monsters, chests or loot.
  - **field layout** (`FieldLayout`) — what stands on a field's ground: keep-out obstacles,
    standard and elite spawn points, chests. The Forest's field layout is derived from its
    generator layout; the Meadows' is hand-laid.
- **Trail** — one walked path of carved cells in a generator layout, in walk order. The **main
  trail** starts at the entrance mouth; a **branch** sprouts from another trail and records which.
  The trails form a tree: they never join except where one sprouted.
- **Dead end** — where a trail stops. Every trail has exactly one, and every dead end opens into a
  clearing. The main trail's is the deepest.
- **Clearing** — the open round space carved at a dead end. In the Forest each holds either an
  elite spawn point or a chest, and the main trail's always holds an elite. Spawn points for
  ordinary monsters are never placed in one.
- **Spawn point** — a fixed point in a field where one monster stands, and where it respawns after
  dying. Two kinds:
  - **standard spawn point** — on open ground (in the Forest, on the trails); its elite rule is
    the field place's.
  - **elite spawn point** — at a clearing's centre; always elite.
  - **Elite rule** (`FieldElite`) — how a spawn point's monsters come elite, rolled at each spawn
    and respawn: **Rolled** (the Spire's floor-1 chance; the Meadows), **Never** (the Forest's
    trail points), **Always** (every elite spawn point).
  A spawn point is a point, not a placed object: it is not recorded as an occupied area.
- **Restock** — a field chest emptying and closing a set delay after it was **first opened**
  (`ChestRestockDelay`; 5 minutes in the Forest), so its next opening rolls afresh. What a player
  already took is theirs. Timed from the first open, not from the last item taken.

### Dungeon floors and the floor map (FS-KE075, ADR-0060, ADR-0061, ADR-0062)

- **Cell** — one square of a generated floor's grid, 80 px a side (`levelgen`). A cell is
  **walkable** or not. Not the movement system's spatial-hash cell (40 px), which is unrelated.
- **Dungeon floor** — a run floor built as rooms and corridors on a cell grid (floor 1 today).
  The other run floors are built by the building generator and have no regions.
- **Region** — one named part of a dungeon floor's walkable cells: a **room** or a **corridor
  segment**. Every walkable cell belongs to exactly one region. Regions have ids, carried on the
  floor map; the client's fog and minimap are built on them.
- **Room** — a rectangular region carved as a chamber, from a 4×4-cell crypt to a 10×8-cell hall.
  In game-service the word means only this; the walls of floors 2–3 make **buildings**.
- **Corridor segment** — a region of corridor cells: corridors are cut into segments so that a
  long corridor is not one region.
- **Doorway** — a walkable cell of a room that touches a corridor cell. Always open: a dungeon
  floor has no door entities (v1).
- **Shell wall** — a dungeon floor's wall: the non-walkable cells next to a walkable one (diagonals
  included), merged into axis-aligned rects. Rock deeper than the shell is **void**: no entity, no
  collision, never reached.
- **Room role** — what a room is for on its floor: **start** (the party's spawn), **switch**,
  **escape door**, **stairs**, **treasure** (a chest and an elite guard), or none. Server-only:
  never on the wire.
- **Floor map** — the static description of the current floor sent to a client once (`floor_map`):
  size, cell size, regions (dungeon floors only) and wall rects. Sent on run entry, floor change,
  reconnect and on request. Never per tick.
- **Interest** — the per-recipient cut of a snapshot: on a dungeon floor, monsters, drop piles and
  containers farther than the **interest radius** (1600 px) from the recipient are left out. Party
  members and the floor's fixed interactables are always sent. Not anti-cheat (ADR-0060).
- **Path** — the cell-by-cell route a monster follows on a dungeon floor (A*, ADR-0062). A
  monster's **repath** is its search for a new path.
- **Guarded chest** — a dungeon floor's chest in a treasure room or a hall, which will not open
  while any of its **guards** stands. Its guards are the monsters its room was populated with as
  guards (a treasure room's elites, a hall's pack), fixed at the floor build, never the demon, a
  corridor's monsters or a top-up. A guard **stands** while it is in the world with health above 0,
  wherever it has chased to. Server-only: nothing marks it on the wire (FS-KE075 §J).

### Bosses (FS-77AB6, FS-VHGE7)

- **Boss** — a monster spawned with `Boss: true`: never an elite, at most one of each kind a
  floor, rolls the boss drop row and the boss experience multiplier. The Spire has two.
- **Demon** — the green boss (archetype `demon`): guaranteed on the top floor, rare below.
- **Blood Demon** — the red boss (archetype `blood_demon`): never guaranteed, rolled on every run
  floor at odds that climb with the floor; tougher than the demon. "Red demon" in conversation.
- **Slam** — a demon's wind-up move: the roar, then a heavy hit at twice its level damage, rationed
  by a cooldown. On the wire it is the `attack` action.
- **Fire claw** — a demon's regular move: one swipe, no wind-up, its level damage. On the wire it
  is the `claw` action. The fire is presentation only.

### Field combat (FS-X2F2H)

- **Kill credit** — in a field world, the XP and the loot roll of a kill belong to the player who
  lands the killing blow, and to no one else. Not shared, not split by damage dealt.
- **Killer-first window** — the 30s after a field kill during which only the killer may take the
  dropped pile; after it, anyone may. Kill credit decides who rolls the loot; the window decides
  who may pick it up.

### Carried items (FS-HRH2J)

- **Bag** — the ordered list of items a player's body carries but does not wear: the body's
  `ItemIDListComponent.ItemIDs`. Holds at most **bag capacity** items. New items always go on
  the end; nothing reorders it. In code it is still `satchel` / `itemIDList`; say **bag** in
  prose, specs and new names. **Avoid "satchel"**: game-client uses it for a sack's container
  view, which is not the bag. Avoid "inventory" too: that is the wire
  field (`inventory`) and items-service's word for everything an account owns.
- **Bag capacity** — the most items a bag holds: 30 (`BagCapacity`). Enforced on every move that
  grows the bag inside a run or a field world: a pickup into a full bag, and an unequip into a
  full bag, are refused and nothing moves (`ErrBagFull`). An equip that swaps out what a slot
  held is net-zero and allowed at full. Not enforced in the HUB world, whose gear screen reads
  items-service over REST rather than a body's bag.
- **Worn gear** — what a body has in its equipment slots (`EquipmentComponent`). Never counts
  toward bag capacity.
- **Not the bag:** a **container**'s item list (a chest, sack or drop pile) is the same component on a
  different entity and has no cap here; the **stash** (FS-VPD8Y) is account storage outside any
  world, never seated.
- **Seating checkout** — seating a body checks out its worn and bag items in items-service
  (IN_RUN, ADR-0032) before building it. The bag a body is seated with is the account's
  bag-location items, not every owned item (FS-18Z5F).
- **Safe item** — an item the delver brought into this run or field world (seated with). A dead
  delver's safe items come home.
- **Unsafe find** — an item picked up inside this run, held on the body (bag or worn) until the
  delver escapes. Unsafe follows the item, not the slot: equipping it keeps it unsafe. A dead
  delver's unsafe finds are lost, whether they leave early or wait for the run's end. Field
  death costs nothing, so field finds are never lost (FS-18Z5F).
- ~~**Released escapee**~~ — retired 2026-11-04 (FS-GV8WN R17). An escaped delver now settles at
  their escape and may leave like a dead one; nobody is released.
- ~~**Settling**~~ — retired 2026-11-04 (FS-GV8WN R17). The Redis mark and its entry refusals are
  gone. In game-client, "Settling…" is only the settlement record's status line.

### Settlement (FS-GV8WN, ADR-0040)

- **Resolve** — a member leaving active play: escaping, dying (by choice too, or left behind on a
  floor below, which only a dead body can be), or being removed while in play once their grace
  runs out. A **resolved** member is out of play, whether or not they are settled yet. Always
  "resolved member" or "resolved delver": a **resolved cast** (Classes and abilities) is another
  thing.
- **Settlement** — the one write that brings a member's run home: their worn and carried items
  (a death keeps only safe items), the stored items they used up, their experience. Each member
  is settled exactly once: by **their own settlement** the moment they resolve (a pair carrying
  only them, items.extracted partial), or by the run's end for whoever was never settled. Code:
  `settleEscape`, `settleDeath`, `RawSettlement`, `PublishSettlement`. Not the marketplace's
  settlement (a listing's saga).
- **Settled member** — one whose settlement is written or under way (`Session.settled`). Resolved
  but not settled happens only when their body could not be snapshotted; the run's end then
  settles them. The run's end names the settled (`settled_member_ids`) so its release skips them.
- **Pending settlement** — a formatted settlement the **settlement writer** holds until it is
  recorded in the outbox and applied in items-service, each step retried with jittered backoff
  (FS-GV8WN R8, R13). A refused apply is not retried: the recorded copy lands it.
- **Confirmed settlement** — one items-service has applied: the player is sent their settlement
  record again with status confirmed (FS-GV8WN R20). "Pending" and "confirmed" are also the
  record's two statuses on the wire.
- **Settlement writer** — the pod's holder of pending settlements (`settlementWriter`), not a
  session: a session is torn down as usual while its settlements are still pending. Once the pod
  drains, it refuses new ones.
- **Sweep** — the run's end when every member was already settled: an items.extracted with no
  players, naming the settled, and no match.ended (a sweep is no match result). It releases
  orphans, such as gear checked out for a member never seated.
- **Rollback** — what a pod dying before a member's settlement commits means for them: brought-in
  gear back as it was (reclaimed at their next checkout), finds lost, what they used up undone, no
  experience. Nothing runs to make it happen; it is what is left. Say "rollback", never
  "compensation" (that is the marketplace saga's).
- **Kept member** — a resolved member whose drop could not be their leave (no hub to go to) and
  whose grace ran out: kept, body and record, until their run ends (`keptUntilRunEnd`), and back
  into the run if they reconnect before. Already settled; kept only for where they land.

### Containers (FS-4R9M9, FS-1D6BX)

- **Container**: a world entity holding items to be taken (`ContainerComponent`, WS
  `containers[]`). Its **kind** says which: chest, sack or drop pile. All three are taken from
  the same way.
- **Chest**: a container placed at floor or field build time (`ContainerKindChest`). It rolls its
  contents on its first open, and the roll may come up empty. The most generous kind.
- **Sack**: a container placed where a chest would spawn, at the sack share
  (`ContainerKindSack`, wire `"sack"`). It rolls like a chest at lower odds. **Not the bag**, which
  is carried, never placed. Say "sack", never "bag" or "loot bag", for this one.
- **Drop pile**: the container a slain monster leaves holding its kill drop
  (`ContainerKindDropPile`). It is never placed at build time. Its odds are the lowest of the
  three.

### The message hub (the other `hub`)

- **Message hub** — the central WebSocket dispatcher (`messageHub.Run`). Owns which connection's
  messages reach which world, and fans a world's broadcasts back to that world's clients only.
  Always written in full to keep it apart from the HUB world.
- **Connection** — one client's WebSocket to one pod, held across any number of world switches on
  that pod and replaced only by a handoff. Never assume connection and world are the same
  lifetime, nor that a player keeps one connection from queue to run.
- **Held token** — the member's own access token the pod keeps on their record, to read their gear
  from items-service as them when a world seats them. Set at the handshake, replaced by a reconnect
  or by a **renewal** (`renew_token`) carrying a validated access token for the connection's own
  member (FS-ZPX58 §G, ADR-0067). Never logged. A stand-in until a service credential exists
  (I-GV8WN-11).

### Pods (FS-K2HKP)

- **Pod** — one running game-service replica. **pod** is the code's word (`podID`, `PodID`);
  **replica** is fine in prose about scaling. Both mean the same process, never a Kubernetes
  concept beyond that.
- **Pod id** — the pod's identity (`POD_ID`), the key for its liveness and its match-start
  channel. Opaque; never parsed.
- **Pod address** — the WebSocket URL that reaches **this exact pod** (`POD_ADDR`, `podAddr`). Sent
  as `addr` in `world_handoff`. A load-balanced address is wrong here, since it may land on another
  pod.
- **Pod liveness** — the `pod:alive:<podID>` key a pod refreshes about once a second with a 3s
  TTL, and deletes on graceful shutdown. A pod without one is treated as dead: its queued players
  are dropped at pop. Liveness, not a cleanup sweep, because a crashed pod never cleans up.
- **Host pod** — the pod a match's run lives on. Currently the pod of the first popped player.
  Every matched player ends the match connected to it, and returns to *its* HUB world. For a
  party entry the host pod is simply the **leader's pod**, since the whole party has travelled
  there. (A party has no pod of its own: ADR-0037.)
- **Holding pod** (FS-MCYWK) — the pod a player is **present** on (seated, or within its
  reconnect grace), as the **presence index** names it. At most one at a time. Not the host pod:
  a player is held by the host pod only once they arrive there.
- **Landing pod** (FS-MCYWK) — whichever pod the load balancer put a new connection on, before
  any pod has decided anything about it. It may or may not be the holding pod. Only a fresh,
  plain connection has one in this sense: a handoff's arrival goes to the pod address it was
  sent to, never through the balancer.
- **Redirect** (FS-MCYWK) — the landing pod's answer to a connection whose player is present on
  another live pod: it sends one `world_handoff {addr, reconnect: true}` (no `session_id`, no
  `hub`) and closes the socket, having created nothing for them. The client then reconnects to
  `addr`, break-before-make, and the holding pod's own in-place reconnect puts them back where
  they stood. **Not a handoff**: a handoff is make-before-break and the old socket carries a
  player; the landing pod's carries nobody. Decided at the WebSocket handshake, before any
  record exists.
  - **Redirected connection** — one the client opened because a server directed it there,
    marked `redirected=1`: the connection a redirect sends it to, its one fallback to the shared
    address, and a travel's hub handoff connection. Never redirected again; seated where it
    lands.

### Matchmaking (FS-K2HKP)

- **Queue** — the global Redis list (`queue`) of player ids waiting for a match, shared by every
  pod. Not per pod.
- **Queue entry** — what the queue knows about one queued player, held in the `queue:entries`
  hash: their pod id and their character in play. The queue list carries only ids; the entry
  carries everything else.
- **Match start** — the message (`MatchStart`) a pod receives on its own `matchstart:pod:<podID>`
  channel. It comes in two **steps**, in order:
  - **`create`** — matcher to host pod only: build the run from these players.
  - **`handoff`** — host pod to each other involved pod, after the run exists: send these
    players to the host. Never sent by the matcher, so no player can be told to move before
    the run expecting them exists.
- **Session id** — the run's one id, minted when the host creates the session and named
  `session_id` on the wire. There is no separate run id or match id; do not introduce one. The
  one exception: a field visit's settlement carries its **visit id** as `session_id`.

### Seats (FS-K2HKP)

- **Seat** — a matched player's place in a run. A local player's seat is claimed at creation; a
  handoff player's seat is held for them until they arrive or it is released. Membership, not a
  position (see *arrival slot*).
- **Expected player** — a handoff player whose seat is held but not yet claimed. In code, an entry
  in the session's `playersPendingConnection`; the entry, not the arriving connection, carries
  the character they are seated as. Once seated, no longer expected.
- **Seat release** — dropping every unclaimed seat once `SeatReleaseAfter` (15s) has passed since
  the run was created; a later arrival for one is refused. If nobody is in the run at that point,
  the run is shut down. Checked in the tick; nothing waits on it.
- **Arrival slot** — a reserved spawn position in the spawn formation, kept for a handoff player
  so they stand with the others. A *position*, unrelated to whether they hold a seat; a run with
  none left spawns the arrival elsewhere. ("Formation" here is spatial; it has nothing to do with
  *party formation* below, which is players grouping up.)

### Party (FS-R82NV, FS-NCC9J, FS-BJNYC, FS-XGW7H, FS-V780R, FS-988SM; ADR-0037, ADR-0039)

Before these specs, "party" was loose prose for "the players in a run". It is now a thing with
an id. Use **roster** or **the run's players** for the people a run seats; use **party** only
for the group below. The two coincide inside an instance by rule, not by definition.

ADR-0037 (superseding ADR-0034) moved the party off any one pod. Since I-NCC9J-1 a party's
state is in Redis (`internal/partystore`) and each pod keeps a **party cache**; the remaining
FS-NCC9J slices add fan-out across pods, away and removal, and travel.

- **Party** — a named group of players, one **leader** and up to the configured size (2 now, at
  most 4), that enters instances together and talks on its own chat channel. Its state lives in
  **Redis**, not on any pod; its members may stand on **different pods**, and it outlives any one
  pod. It persists until it empties and is never stored in a database. A player is in at most
  one party. A pod *holds players*, never a party.
- **Leader** — the member who may invite, kick, transfer leadership, set the *loot rule*, and
  start a *party entry*. May be on any pod. The creator at first; a random matched player for an
  auto-formed party. When the leader leaves or is removed, the **earliest-joined** remaining
  member succeeds, at once, even inside an instance. Succession is the one party change an
  instance never locks.
- **Leader's pod** — the pod the leader is connected to *at the moment it is asked*: where a
  member's **travel** goes. It moves when the leader does. Not a home: the party's state is in
  Redis whoever leads and wherever.
- **Party pod** — *retired by ADR-0037.* It meant the one pod a party lived on and every member
  had to be connected to. There is no such pod now; say **leader's pod** for where travel goes,
  and **party cache** for a pod's copy of a party. (Still the right word when reading FS-R82NV's
  same-pod build.)
- **Party cache** — a pod's in-memory copy of the parties of the players it holds. Reads
  (frames, panel, party chat audience, field loot allocation) come from it, so the hub loop and a
  world's tick never wait on Redis; writes always go to Redis. Kept current by party letters and
  re-read from Redis on each refresh. Never the source of truth: a stale cache can change what is
  shown, never an outcome.
- **Travel** — a member moving themselves to the village (hub world) of the **leader's pod**, by
  a hub handoff they trigger from the button beside the leader in the party frames, only while
  standing in their own village. The only way party members gather on one pod. Not a world
  switch: a field is still entered by walking in from the same pod's village (ADR-0030).
- **Let go** — what the pod a member travels from does as it sends the handoff: it takes them out
  of the **presence index** and will not hold their old socket for the reconnect grace, so nothing
  routes them back. They stay **present** on that pod, and told their party, until the socket
  closes. **Taken back**: still there on that socket once the handoff's 15 s pass, and found on no
  other pod, so the travel did not take them; they are in the index again.
- **Hub handoff** — a handoff (same mechanic: new socket to the pod address, old one dropped)
  whose destination is a pod's hub world instead of a run: the client enters that hub with
  `enter_hub` once the new socket opens. Used only for a member's **travel**. No longer used on
  invite acceptance. Never used for fields (ADR-0030). Not the **redirect** (under *Pods*), which
  shares the `world_handoff` message but is no handoff.
- **Presence index** — the Redis lookup from a character name, or a player id, to
  `{player id, pod id, pod address, world}`, for **every connected player with a character**, in any world.
  Written by the pod that holds the player, kept alive by TTL, deleted when they leave. Answers
  "is this player online, and where": invites, party fan-out, reconnects and whisper (FS-KCQ06)
  use it. A name with no entry is **offline**. Not a friends list and not a history. A lookup
  query shaped like a uuid is always read as a player id, never a name, so a whisper or invite can
  name a player by id, and a 32-hex-character name can't be found by name (FS-KCQ06, accepted).
- **Pod inbox** — the Redis channel `pod:<podID>:inbox` each pod subscribes to for **letters**
  addressed to one of *its* players from another pod: an invite, a **party update** (which also
  carries the party, versioned, for that pod's party cache), a party notice, or a **party chat
  letter** (`party_chat`: one stamped party chat line and the players there it is for, FS-XGW7H),
  or a **whisper letter** (`whisper`: one stamped whisper and the one player it is for, FS-KCQ06).
  Every letter is at most once. Rides the same
  Redis client and subscriber → hub-loop shape as world chat. Distinct from the **match-start
  channel**, which carries run coordination, and from the chat bus, which carries chat lines. (In
  code, the *courier* is the part of the party registry that sends and reads these letters.)
- **Seated / present** — a player is **seated** on a pod while connected to it and standing in one
  of its worlds: whom it answers by name directly, and whose parties its party cache keeps. A
  player is **present** on a pod while seated there *or* within its reconnect grace: who the pod
  writes into the presence index, and who hears a party update there. "Held" on its own is not
  a term: say seated, or present for the wider sense. The one compound kept is **holding pod**
  (under *Pods*), the pod a player is present on. A player seated on a new connection is read afresh: the pod does not know
  their screen. (Not a **seat**, which is a place in a run.)
- **Shown party** — what a pod last queued for a seated player's connection as a party update: a
  party at a version, or no party. The pod's own record, not something the client reports. After each
  re-read the pod **reconciles**: every player whose shown party differs from what its party cache
  now holds is sent the cache's (reason `sync`). How a removed player whose letter was lost learns
  it (FS-NCC9J R21a).
- **Party invite** — a request from a party to a named player to join, sent by its leader, found
  through the presence index and delivered through the target's pod inbox, wherever they stand.
  It is the party's, not its sender's: it stands through a change of leader, and its answer goes
  to whoever leads now. While open it is a **reserved slot**. Pending until accepted, declined,
  expired (60 s), or **gone** (its party ended first; an accept then hears `party_gone`).
  **Accepting makes the player a member where they stand**, on any pod; nobody moves.
- **Reserved slot** — an open invite counted against the party's size with its members, so the
  party refuses invites beyond its free places and an accept always fits. Freed when the invite
  is declined, expires or is gone. (The client draws it as a skeleton row in the party frames.)
- **Away** — a member whose party record has gone 40 seconds without a refresh, about 30 seconds
  after they dropped (any drop, by design not at once; a drop under 30 seconds never shows it).
  Still a member; removed, with succession if they led, once the record expires after **5
  minutes**. Distinct from **offline** (no presence entry at all).
- **Party entry** — the leader, standing at an instance's gate, taking the whole party into that
  instance. Requires every member in the leader's world on the **leader's pod** (gathered there by
  travel, not at the gate); then a *ready check*; then the run is built from the party exactly as
  `start_solo` builds one for one player, and members are world-switched in. No handoff at entry,
  because everyone has already travelled.
- **Ready check** — the pending request a party entry sends every other member: accept within
  30 s or the entry is cancelled and the party told who declined or timed out. Same shape as an
  invite (sent, awaited, expired), different question.
- **Matched party** (also *auto-formed party*) — the party the host pod creates from **every**
  matched player, local and on other pods, on a random match (`find_game` → `MatchStart`),
  **before it creates the run** and before anyone enters the tower: so matched strangers are a
  party too, leader at random among the **local** players, no invites. If any matched player
  already has a party, the match is **cancelled**: no run, and everyone is told to queue again. A late arrival is entering, not
  joining; one who never connects or closes the tab is a disconnected member, host or not. It
  carries the **matched origin**, which is what sets its lifetime apart: a member leaves it on
  **leaving the run** (dying and leaving, escaping and leaving, leaving early, their reconnect
  grace running out, or their seat being released before they arrived, at which point they count
  as dead), and it ends when its last member leaves. It never outlives its
  run (ADR-0039, FS-988SM). A member who stays to watch after dying or escaping is still a member.
  The opposite is a **pre-formed party** (made by create and invite), which persists after a run.
  A solo run is *not* a party: "every run is a party" is parked (FS-BJNYC Out of Scope).
- **Instance lock** — while a party is inside an instance, leave, kick, transfer and loot-rule
  changes are refused. Disconnecting keeps the run's existing reconnect grace; only when it runs
  out does the player count as dead for that run. A pre-formed party's member remains a member
  regardless; a matched party's member leaves it on leaving the run (FS-988SM).
- **Loot rule** — the party setting that says whose bag a pickup lands in: **random allocation**
  (default; a random living, un-escaped member, redrawn if their bag is full) or **picker keeps**.
  A closed set that later rules extend. Chosen by the leader, locked inside an instance. It
  changes who *receives* a pickup, never what drops or who may click it; drops and coffers stay
  single-copy. Distinct from the field's *killer-first window*, which reserves at drop time.

### Classes and abilities (FS-8AY7S, FS-MAMHR, FS-JTNPR, ADR-0030)

- **Class** — a character's archetype, by its server id: `warrior`, `mage`, `archer`, `mercenary`
  (FS-MAMHR). The id is the term in code and on the wire. Display names belong to game-client:
  the screen and the art say other things (the warrior is drawn from the *knight* sheet, the mage
  from the *wizard* sheet).
- **Ability** — a class's one right-click skill: `dash` (warrior), `triple_fireball` (mage),
  Shadow Shot (archer), the parry stance (mercenary). Not every `cast_skill` is an ability:
  left-click attacks (`slash`, `arrow`, `fireball`, `cut`) go out as `cast_skill` too. On the wire,
  *skill* is the message and *ability* is the role.
- **Class resource** — what a class's ability costs: **mana** (mage), **stamina** (warrior,
  archer), **parry charges** (mercenary). One per class. Only abilities spend it; left-click
  attacks are free. Replaces the shared mana pool every class had before FS-8AY7S. On the wire
  the kinds are `mana`, `stamina` and `parry_charges` (never bare `parry`).
- **Mana** — the mage's class resource: a big pool that regenerates slowly. "MP" is old HUD
  shorthand, not a separate term.
- **Stamina** — the warrior's and archer's class resource: a small pool that regenerates
  quickly.
- **Parry charge** — the mercenary's class resource: a count from 0 to 3, gained one per parried
  strike and never regenerated. Kept until spent, carried across floors, lost on death. **Always
  say "parry charge", never just "charge"**: in this service *charge* already means the warrior's
  dash in flight (`DashComponent`, "a charge in flight").
- **Parry stance** — the mercenary's ability: a short window, opened on the tick its cast
  arrives, in which a monster strike that lands is negated and grants a parry charge.
  Server-authoritative (ADR-0030's exception).
- **Whiff lockout** — the 1.0 s, timed from the close of a parry stance that caught nothing,
  during which it cannot be raised again. A stance that parried starts none.
- **Riposte** — the cleave the mercenary's next left-click becomes once they hold 3 parry
  charges: a wide front arc that hits every enemy in it and spends all three. **Riposte armed**
  is the state of holding 3 parry charges with the riposte not yet thrown. The riposte has no
  skill id: the client sends `cut`, and the server arms it from the parry-charge count.
- **Cut** — the mercenary's left-click: a narrow sword cone scaling on the mean of Strength and
  Agility (FS-MAMHR). Not the warrior's `slash`.
- **Shadow Shot** — the archer's ability: one slow, heavy projectile. The client draws the hold
  to aim; the server only sees the release (ADR-0030).
- **Resolved cast** — a cast the server acts on: skill id plus target point, judged on the tick
  against cooldown and cost. Aiming, holding and wind-up before it are client presentation and
  never reach game-service state (ADR-0030).

### Mailbox arrivals (FS-1GZGD amendment 2026-11-04, ADR-0045)

game-service has no mailbox; it only passes on a hint that one changed.

- **Mail arrival** — a message on the Redis channel `mail:arrived`, published by
  notification-service when a mailbox letter is sent: `{"member_id"}` for one player,
  `{"broadcast": true}` for everyone. Every pod subscribes at boot, in world chat's subscriber →
  message hub shape. At most once; anything else on the channel is skipped.
- **`mail_arrived`** — the WebSocket action a pod sends for a mail arrival: to the named player if
  they stand in the HUB world on this pod, or to every player in the HUB world on this pod for a
  broadcast. Never to a player in a run or a field world. No payload; the client asks the
  gateway for the mailbox.
- **Mailbox letter** vs **letter** — here a bare *letter* is a pod-inbox letter (party courier,
  whisper). The in-game mail's letters are always written **mailbox letter**, and game-service
  never holds one.

### Chat (FS-WJGFJ; world chat FS-5SH4G; party chat FS-XGW7H; whisper FS-KCQ06; mute and report FS-4HEG7)

Chat is a relay, not a world concern: a message never enters an ECS world, is never stored, and
is addressed by scope, not by position. Three words here collide with the world vocabulary
above; the rule is to qualify, never to rename.

- **Chat channel** — one of the kinds of talk a message belongs to, carried as a type on the
  message: `area`, `world`, `whisper`, `party`, `trade`. Always written "chat channel" (or the
  qualified form, "area chat", "world chat") because **channel** alone means a field channel
  (ADR-0030) and **Redis channel** means the pub/sub topic. Trade is a reserved type with no
  behaviour yet; a type exists so adding it later changes no envelope.
- **Scope key** — the value that, with the chat channel, names a message's audience: the pod id
  for area, a fixed constant for world, the target's player id for a whisper, the party id for
  party. The pair `(chat channel, scope key)` is the whole address; routing reads nothing else.
- **Area chat** — the chat channel whose audience is **every connection on this pod**, whatever
  world each stands in (ADR-0032). Delivered in-process. "Area" is the player-facing word; it
  does **not** mean a world, a session, or a field channel, and a tower run on the same pod is
  inside the area. Qualify as "area chat" when "area" could read as a place.
- **World chat** — the chat channel whose audience is every player on every pod. Published on a
  Redis channel, delivered by each pod to its own connections. **Not the ECS "world"**: a world
  is a simulation, world chat crosses all of them. Always "world chat", never a bare "world".
- **Party chat** — the chat channel whose audience is the members of one party (scope key = the
  party id), on any pod and in any world, the sender included. Members may be on different pods
  (ADR-0037): the sender's pod reads the audience from its **party cache**, tells the members it
  seats directly, finds the rest with one presence read, and sends each other pod holding any of
  them one **party chat letter** through its pod inbox; that pod hands the line to the players the
  letter names without consulting its own cache. It never touches the chat bus (FS-XGW7H). Always
  open: a sender the cache holds in no party is refused (`no_party`), the channel is never closed
  for them. Replaces ADR-0034's in-process delivery.
- **System line** — a chat line with no sender, carried on a chat channel so it filters with it.
  Rendered as system, never as a member speaking. Distinct from a **chat notice**, which answers
  one sender alone. None is sent yet: party events and loot allocation notices in the party chat
  channel were left out of FS-XGW7H for a later FS.
- **Whisper** — a one-to-one message to one player, addressed by character name and found
  through the **presence index**, on any pod and in any world. The sender's pod delivers it
  itself when the target is seated there; otherwise it sends one **whisper letter** to the
  target's pod inbox, and only that pod delivers it (FS-KCQ06). A name with no presence entry is
  **offline**, and the sender gets one chat notice. Nothing is queued for later.
- **Whisper echo** — the sender's own copy of a whisper they sent, shown as "To Name: …". It
  means the line went out, never that it was read: on the same pod, the target's writer queue took
  it; across pods, the whisper letter was published and at least one pod received it (a receiver
  count above 0, FS-KCQ06 R8a). A line that didn't go out gets `not_online` instead of an echo.
  There is no ack.
- **Chat bus** — the Redis side of chat (`internal/chatbus`): the pub/sub the cross-pod
  channels ride, bytes in and bytes out, knowing nothing about lines. A pod subscribes to the
  world channel at boot and publishes its own world lines to it (FS-5SH4G). Not a store: nothing
  on it is kept (ADR-0033).
- **Relay** — what a pod does with a chat message: receive, resolve the audience from the scope
  key, deliver, forget. The server keeps no history (ADR-0033); "chat history" is a client word.
- **Report** — a player's complaint about one message, carrying its own evidence from the
  client (the message, its neighbours, reporter, reported player, chat channel, time). An HTTP
  call through api-gateway, not a chat message, and not something game-service looks up.
- **Mute** — client-side only. game-service has no notion of a muted player and keeps relaying
  to them; the client hides what it chooses.

