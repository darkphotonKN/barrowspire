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
  - **Town** — the owner's word for the hub, and the lore's (the Warden's tale: "the town woke
    to a tower"). Same world, not a part of it. Fine in conversation, specs and player-facing
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
  interchangeable: a world switch keeps the connection, a handoff replaces it.
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
  door, not a queue.
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
  - **Patron** — a fixed resident at one of the Inn's tables, talkable with a short lore line.
    Never wanders, never leaves. Two or three of them; not a crowd system.
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
  counter and tables, the smithy's forge. A server wall carrying its building's `house_id`, so it
  collides like any wall and stays inside its building's footprint. Told from the building's own
  walls by geometry alone: a furnishing touches none of its building's four outer edges. Smaller
  pieces (stools, shelves, crates, the anvil, the Inn's hearth) are client dressing, with no
  collision, and are not furnishings.
- **The Inn** — the largest town building: a tavern room with the innkeeper behind a counter,
  three tables with patrons, and a hearth. One room, no upstairs, no rooms to rent, nothing to
  buy. A place with people in it.
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
  prose, specs and new names. **Avoid "satchel"**: game-client uses it for the container view
  (a chest's or pile's contents), which is not the bag. Avoid "inventory" too: that is the wire
  field (`inventory`) and items-service's word for everything an account owns.
- **Bag capacity** — the most items a bag holds: 30 (`BagCapacity`). Enforced on every move that
  grows the bag inside a run or a field world: a pickup into a full bag, and an unequip into a
  full bag, are refused and nothing moves (`ErrBagFull`). An equip that swaps out what a slot
  held is net-zero and allowed at full. Not enforced in the HUB world, whose gear screen reads
  items-service over REST rather than a body's bag.
- **Worn gear** — what a body has in its equipment slots (`EquipmentComponent`). Never counts
  toward bag capacity.
- **Not the bag:** a **container**'s item list (a chest or drop pile) is the same component on a
  different entity and has no cap here; the **stash** (FS-VPD8Y) is account storage outside any
  world.

### The message hub (the other `hub`)

- **Message hub** — the central WebSocket dispatcher (`messageHub.Run`). Owns which connection's
  messages reach which world, and fans a world's broadcasts back to that world's clients only.
  Always written in full to keep it apart from the HUB world.
- **Connection** — one client's WebSocket to one pod, held across any number of world switches on
  that pod and replaced only by a handoff. Never assume connection and world are the same
  lifetime, nor that a player keeps one connection from queue to run.

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
  Every matched player ends the match connected to it, and returns to *its* HUB world.

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
- **Arrival slot** — a reserved spawn position in the party formation, kept for a handoff player
  so they stand with the party. A *position*, unrelated to whether they hold a seat; a run with
  none left spawns the arrival elsewhere.

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

### Chat (FS-WJGFJ; world chat and whisper FS-5SH4G; mute and report FS-4HEG7)

Chat is a relay, not a world concern: a message never enters an ECS world, is never stored, and
is addressed by scope, not by position. Three words here collide with the world vocabulary
above; the rule is to qualify, never to rename.

- **Chat channel** — one of the kinds of talk a message belongs to, carried as a type on the
  message: `area`, `world`, `whisper`, `party`, `trade`. Always written "chat channel" (or the
  qualified form, "area chat", "world chat") because **channel** alone means a field channel
  (ADR-0030) and **Redis channel** means the pub/sub topic. Party and trade are reserved types
  with no behaviour yet; a type exists so adding it later changes no envelope.
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
- **Whisper** — a one-to-one message to one player by id, found on any pod over Redis; the pod
  holding the target delivers it. A target held by no pod is **offline**, and the sender gets
  one system notice. Nothing is queued for later.
- **Relay** — what a pod does with a chat message: receive, resolve the audience from the scope
  key, deliver, forget. The server keeps no history (ADR-0033); "chat history" is a client word.
- **Report** — a player's complaint about one message, carrying its own evidence from the
  client (the message, its neighbours, reporter, reported player, chat channel, time). An HTTP
  call through api-gateway, not a chat message, and not something game-service looks up.
- **Mute** — client-side only. game-service has no notion of a muted player and keeps relaying
  to them; the client hides what it chooses.

