# FS-0XMCP: Hub destination gates and the Spire entrance

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" (walk to a destination gate in the hub · the Spire's entrance at the back of the hub · the Warden as storyteller, not the queue); `game-server/game-service/SPECIFICATION.md` "### Hub world" (destination gates in the hub · Spire entry from its gate) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection per pod, per-pod player ceiling), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (built in code, never sourced), [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (what the field gates switch to) · Related: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (hub, Warden, delve entry today; §Requirements 9, 24 superseded in part here; §Requirements 5's player–player push in the hub superseded by the 2026-10-30 amendment), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (queue → match → handoff; out of bounds), [FS-NSV3D](NSV3D-solo-delve-entry.md) (Go alone), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (leave queue from the hub), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) (hub dressing and its keep-out rules), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (Gentle Meadows, behind the east gate; owns entering a field), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (Forlorn Forest, behind the west gate)

## Summary

The hub becomes the map. Instead of asking the Spirewarden to join a delve, a player walks to
a place: the Spire's door at the back (north) of the hub, a trail mouth off the west edge
toward the Forlorn Forest, or a road off the east edge toward Gentle Meadows. Walking into the
Spire's door opens the same *Descend alone / Wait for company* panel the Warden opens today,
and the server checks the player really stands at that door. The field gates exist, are
signposted, can be walked to and are detected, but stepping through them into a field is
FS-X2F2H's work. The Warden stays as the village elder who tells how the Spire came, and
offers no queue at all.

## Requirements

### Gates as hub map data (game-service)

1. **Three gates, fixed in the hub's map data** beside the function NPCs and buildings
   (`internal/game/hub_map.go`): the **Spire gate**, the **Forest gate** and the **Meadows
   gate**. Each has a destination (`spire`, `forest`, `meadows`), a position, a range, and
   an **arrival point** inside the hub. Positions are map data, identical on every pod and
   after every restart; nothing about a gate is decided at runtime.
2. **Starting layout** (world px; the hub stays 2000 × 1000, see R11):

   | Gate | Destination | Position | Range | Arrival point |
   |---|---|---|---|---|
   | Spire gate | `spire` | (1000, 50), the north edge, centred | 80 | none (a run returns to the spawn, as today) |
   | Forest gate | `forest` | (40, 400), the west edge | 80 | (180, 400) |
   | Meadows gate | `meadows` | (1960, 360), the east edge | 80 | (1820, 360) |

   The implementing issue may nudge a number only to keep R3 true, and records any nudge in
   the issue.
3. **Layout invariants**, tested: every gate's range circle is clear of every hub building
   footprint; every gate is reachable by walking from the spawn without crossing a wall; every
   arrival point lies outside its own gate's range (so arriving never re-triggers the gate) and
   clear of buildings.
4. **The gate range is one constant**, `GateRange = 80`, the same distance the Warden is
   spoken to from today (`NPCInteractRange`, mirrored by the client's `NPC_TALK_RANGE`).
5. **A gate is an ECS entity built from the map data**: a `Gate` component (pure data: its
   destination and arrival point), a transform, and an interactable range. It is not an NPC
   and carries no NPC component.
6. **Gates reach the client in the hub's state** as a `gates` list, each entry
   `{entity_id, destination, position, range}`. The key is the hub's only: a run omits it
   (`omitempty`, the pattern `monsters` and `stairs` follow). Arrival points are server-only.
7. **"At a gate" is one server rule:** a player is at a gate when their body is in the hub
   world and the distance from its centre to the gate's position is at most the gate's range.
   It is answered from the hub session's own entity state, read under the session's lock
   (never from anything the client sends), and is exposed as one query on the hub session
   that FS-X2F2H reuses for the field gates. A player in no world, in a run, or (once
   FS-X2F2H lands) in a field is at no gate.

### The Spire gate (both surfaces)

8. **Walking into the Spire gate opens the delve panel** (client). The panel's choices and
   behaviour are exactly today's (FS-NSV3D §Requirements 1–5, FS-G4VMQ): *Descend alone*
   sends `start_solo`; *Wait for company* sends `find_game`; *Not yet* closes it; while
   queued it shows the queued line and the corner queue panel with its *Leave* button works
   from anywhere in the hub. Only the trigger moves, from the Warden to the gate.
9. **The panel's line is re-voiced for a door, not a keeper**, keeping the warning: e.g.
   *"The Spire's door stands open. Few return whole, and fewer return twice."* The queued
   line ("The delve is gathering. Wait, or leave the queue.") is unchanged.
10. **The trigger is edge-triggered and never queues anyone by itself.** Stepping into the
    gate's range opens the panel once; it does not reopen until the player has stepped out
    and back in, or presses **E** while inside. Walking out of range closes an open panel
    (a `start_solo` already sent still completes; its reply is handled as today). Dismissing
    (Esc, *Not yet*) closes it without queuing. The trigger is suppressed while the hub's Esc
    menu or another dialogue is open. The client measures from the player's last
    server-reported position, not a predicted one, so the client never opens the panel where
    the server would refuse.
11. **No map widening.** The hub stays 2000 × 1000 (`HubMapWidth/Height` and the client's
    `HUB_SIZE` unchanged). The gates sit on the world's edge, where the movement clamp
    already stops a player; the Spire's facade and the field approaches are drawn beyond the
    edge, outside the walkable diamond, so no new collision is needed for them.
12. **The server refuses `find_game` and `start_solo` from anyone not at the Spire gate**
    (R7), with the message *"Walk to the Spire's door first."* as an error on that same
    action (the existing `refuse` shape). Order inside each handler: the existing
    no-character refusal, then the existing resume-an-existing-run path (a player already in
    a run is resumed as today, wherever they are), then the gate check, then the existing
    queue / solo logic unchanged. Message names and payloads are unchanged.
13. **`leave_queue` is not location-bound.** A queued player leaves from anywhere in the hub,
    as FS-G4VMQ ships it. A queued player may walk away from the gate and stays queued; a
    match found while they are anywhere in the hub hands them off exactly as today.
14. **The matchmaker is untouched.** No change to `internal/matchmaker`,
    `internal/match_queue`, `SessionManager.AddPlayer`, `RemovePlayerFromQueue`, `IsQueued`,
    or how they are wired. The gate check is an early refusal in the message hub's
    `find_game` / `start_solo` cases, before the existing calls, which stay as they are.

### The Spire's facade (game-client)

15. **The Spire's entrance is one baked prop** at the hub's north edge, authored in code and
    baked like every other world sheet (ADR-0020, ADR-0021; design guideline Part I). It
    shows the **front face and lower storeys only**: a stone base and steps, a great arched
    door at the Spire gate, buttresses either side, two lower storeys with arrow slits. Its
    stone uses the tower interior's family (FS-8RBQY; `tools/bake/page/models/tower.js`), so
    outside and inside read as one building.
16. **Its top is never seen.** The facade stands beyond the north edge (world y < 0) and is
    tall enough that the hub camera's reach (`projectedBounds` + margin) cuts it off above
    the lower storeys at every camera position; no cut edge or floating top is ever on
    screen. If the current camera margin shows its top, the margin or the prop height is
    adjusted, not the bake of a whole tower.
17. **The door reads as interactable.** Amber means *interactable* on the canvas, so the
    door's threshold carries the amber cue (sconces or a threshold glow); nothing else on the
    facade is amber.

### Field gates (game-client; entering is FS-X2F2H)

18. **The Forest gate is a trail mouth off the west edge**: trodden ground running from the
    hearth's paths west to the edge, flanked by trees (the baked `pine` / `oak` from
    `nature.js`) thickening beyond the edge into the dark. **The Meadows gate is a road off
    the east edge**: a wider, rutted road from the hearth's paths east to the edge, a fence
    end beside it, opening onto lighter ground beyond. Each has a **signpost** (the existing
    baked `signpost` sheet) beside the gate.
19. **Approaches are trodden ground** joining the existing hub paths to each gate, so the
    hub reads as a crossroads. Starting paths `[x, y, w, h]`: north lane `[950, 100, 100,
    400]`; west trail `[60, 390, 600, 50]` + `[620, 390, 60, 300]`; east road `[1380, 340,
    570, 50]` + `[1340, 390, 60, 300]`. Nudges allowed to keep R20.
20. **A new keep-out rule, K8**: no prop or dressing stands inside a gate's range or on a
    gate approach. The hub keep-out data (`hubKeepOut.ts`) carries the gates (read-only facts
    copied from the server's map data, like K3–K6) and its vitest checks every placement.
21. **Walking into a field gate is detected, and does not switch worlds.** On entering a
    field gate's range the client shows the destination's name as an amber marker over the
    signpost (*"The Forlorn Forest"*, *"Gentle Meadows"*) and raises one gate-entered seam
    (a callback the scene exposes, keyed by destination) that FS-X2F2H wires to its enter
    message. Until then nothing else happens: no message is sent, the player stays in the hub.
22. **Gate positions on the client come from the `gates` list** in the hub state (R6), not
    from client constants, for every gameplay decision (the triggers in R10, R21). Client
    copies exist only as keep-out data for prop placement (R20).

### The Warden (both surfaces)

23. **The Warden is a storyteller.** The server's function NPC `Spirewarden` changes function
    from `delve` to `storyteller`; `NPCFunctionDelve` is removed and nothing opens the queue
    from an NPC. He keeps his name, place (spawn + (140, −120)) and look (`folk_spirewarden`).
24. **His dialogue tells how the Spire came**, in up to three short passages: one morning the
    town woke to a tower standing on the old barrow field; what it took; and that its door
    stands at the north of the hub. *Go on* advances, *Farewell* closes; the last passage
    offers only *Farewell*. No branching and no memory: every conversation starts at the first
    passage (FS-29KSH §Out of Scope, dialogue trees). He offers no queue, solo or leave option
    in any state, queued or not.
25. **Transition safety:** while the client ships ahead of the server rename, the client maps
    both `delve` and `storyteller` to the Warden's look and his lore dialogue, so no build
    order leaves him drawn as a stranger or the delve unreachable. The `delve` alias is
    removed once the server sends `storyteller`.

### Amendment 2026-10-30: players pass through each other in the hub and the fields

Implementing I-0XMCP-4 showed that the Concurrent edge state ("players do not collide in the
hub today") was false. The hub reuses the runs' `MovementSystem` (FS-29KSH §Requirements 5,
D7), which pushes any two moving bodies apart, players included. Ten players walking to the
Spire's door lined up about 40 px apart, only about three stood inside the 80 px gate range,
and the rest were refused *"Walk to the Spire's door first."* One player standing in the
doorway could push everyone else out of range, which is a griefing hole. The user chose to
take player-vs-player collision out of the shared worlds and keep the gate rule as written.
This supersedes FS-29KSH §Requirements 5's "player–player push" for the hub, and that FS's
D7 ("hub collision is the runs' collision") in this one respect.

26. **Players pass through each other in the hub and in field worlds.** In a world whose type
    is `hub` or `field`, the `MovementSystem` resolves no body-vs-body collision between two
    player bodies (both carry the Player component): neither pushes the other, in either
    order of movement, whether one stands still or both walk.
27. **Spire runs keep player collision unchanged.** In a world whose type is `run`, players
    still push each other apart exactly as today. Body-blocking is part of run combat.
28. **Everything else collides as it does today, in every world.** Players still stop at walls,
    hub buildings and closed doors, are depenetrated from them, and are held in by the world's
    edge clamp. Players and monsters still push each other in fields and runs. Hub residents
    (ambient NPCs) still collide with players and with each other (FS-29KSH §Requirements 11).
    A charge in flight still runs through every body, as today.
29. **Pass-through belongs to the world, fixed when it is built**, like its bounds: the session
    tells its movement system which rule applies, from the world type it already holds. The
    movement system does not look anything up and nothing is decided per tick from client
    input. One rule keyed on world type; no per-player or per-area exceptions.
30. **The gate rule is unchanged.** `GateRange` stays 80 and "at a gate" stays the server's
    `AtGate` (R4, R7, R12). With pass-through, any number of players can stand at the Spire
    gate at once, and each is at the gate.
31. **No client change and no message change.** The hub and field scenes draw server
    positions and run no player-vs-player collision of their own; overlapping players are
    drawn overlapping, depth-sorted as any two bodies are.

## User Stories

1. As a player, I want to walk to a place to go there, so that the hub feels like a world and not a menu.
2. As a player, I want to see the Spire towering at the back of the hub, so that I know at once where the danger is.
3. As a player, I want the Spire's door to be obviously a door I can use, so that I never hunt for the way in.
4. As a player, I want stepping up to the Spire's door to offer me *Descend alone* or *Wait for company*, so that starting a delve is the same choice I already know.
5. As a player, I want walking past the door not to queue me, so that I never descend by accident.
6. As a player who dismissed the door's panel, I want it to stay closed while I linger, so that it does not nag me.
7. As a player who dismissed it, I want to press E at the door or step back in to reopen it, so that changing my mind is easy.
8. As a queued player, I want to wander away from the door and stay queued, so that I can talk to people while I wait.
9. As a queued player, I want to leave the queue from anywhere in the hub, so that I need not walk back to the door.
10. As a queued player, I want the door to tell me the delve is gathering instead of offering the queue again, so that I am not confused about my state.
11. As a player, I want to see a trail into the forest off the west edge and a road to the meadows off the east edge, so that I know the hub has places other than the Spire.
12. As a player, I want a signpost at each road, so that I know where it leads before I walk it.
13. As a player, I want the destination's name to show when I step up to a field gate, so that I know I am at it.
14. As a player, I want trodden paths from the hearth to each gate, so that I can find them without a map.
15. As a player, I want the Spirewarden to tell me how the Spire came, so that the world has a history.
16. As a player, I want the Spirewarden to point me at the door, so that a newcomer who talks to him first still finds the way in.
17. As a returning player, I want the Warden not to offer me the queue any more, so that there is one way in and I learn it once.
18. As a player arriving back from a field, I want to land just inside the hub by that field's gate, so that the return matches the way I left (FS-X2F2H uses the arrival point).
19. As a player arriving back from a field, I want not to be bounced straight back out, so that arriving never re-triggers the gate.
20. As the owner of game-service, I want the server to refuse a queue or solo start from anyone not at the Spire's door, so that a modified client cannot skip the walk.
21. As the owner of game-service, I want gate positions in the hub's map data, so that every pod and every restart agrees where the gates are.
22. As the owner of game-service, I want one "at a gate" rule, so that the Spire gate and the field gates (FS-X2F2H) cannot disagree on what "at" means.
23. As the owner of the matchmaker, I want the queue, solo start and leave-queue messages unchanged and the matchmaker untouched, so that my hand-coded work is not disturbed.
24. As a client developer, I want gate positions in the hub state, so that the client never carries a drifting copy of gameplay positions.
25. As a client developer, I want a keep-out rule for gates, so that no future prop is dropped onto a gate or its approach.
26. As an FS-X2F2H implementer, I want a gate-entered seam on the client and an at-gate query and arrival points on the server, so that entering a field is wiring, not a redesign of the hub.
27. As an artist-agent, I want the Spire's facade to be front face and lower storeys only, so that the bake stays small and its top never needs drawing.
28. As a player in a crowd at the Spire's door, I want to walk through the others to the door, so that nobody standing in the doorway can keep me out of the Spire.
29. As a player in the hub or a field, I want other players never to shove me around, so that a busy shared world does not push me off where I am standing.
30. As a player in a Spire run, I want my party and I still to block each other's bodies, so that run combat keeps its body-blocking.
31. As a player in a field, I want monsters still to block and push me, so that fighting in a field feels like fighting in the Spire.
32. As the owner of game-service, I want pass-through decided by world type when the world is built, so that the hub, fields and runs cannot drift into different rules by accident.

## Acceptance Criteria

- [ ] The hub holds exactly three gates (`spire`, `forest`, `meadows`) at the R2 positions (or recorded nudges), identical across two server instances.
- [ ] Every gate's range is clear of every hub building; every gate is reachable on foot from the spawn; every arrival point lies outside its gate's range and outside every building.
- [ ] The hub state carries `gates` with `entity_id`, `destination`, `position`, `range`; a run's state has no `gates` key.
- [ ] The at-gate query answers true at the gate's position and at exactly its range, false just beyond, false for a player in a run, and false for an unknown player; `go test -race` stays green with the query called while the hub ticks.
- [ ] Walking into the Spire gate opens the delve panel once; lingering does not reopen it; stepping out and back, or E inside, reopens it; walking out closes it.
- [ ] From the door's panel, *Descend alone* sends `start_solo` and *Wait for company* sends `find_game` with the same payloads as before; the queued state, corner panel and *Leave* behave as before.
- [ ] `find_game` from a player in the hub but away from the Spire gate is refused with "Walk to the Spire's door first." and the player is not queued; the same for `start_solo`, and no run is created.
- [ ] `find_game` and `start_solo` from a player already in a run still resume them, wherever their hub position was.
- [ ] `leave_queue` from anywhere in the hub still leaves the queue.
- [ ] No file under `internal/matchmaker` or `internal/match_queue` changes, and `SessionManager.AddPlayer` / `RemovePlayerFromQueue` / `IsQueued` are called exactly as before.
- [ ] The Spire's facade is a baked sheet authored in code, drawn beyond the north edge, door centred on the Spire gate; its top is not on screen at any camera position (checked at the north-west, north and north-east corners of the walkable area).
- [ ] The door's threshold carries the amber interactable cue and nothing else on the facade is amber.
- [ ] A trail mouth with trees and a signpost stands at the west gate; a road with a fence end and a signpost at the east gate; trodden paths join both and the Spire's door to the existing paths.
- [ ] Keep-out rule K8 exists and every hub prop placement passes it.
- [ ] Stepping into a field gate shows its destination's name and fires the gate-entered seam once per entry; no message is sent and the player stays in the hub.
- [ ] The Warden's function is `storyteller`; `NPCFunctionDelve` no longer exists; talking to him gives the lore passages with *Go on* / *Farewell* and never a queue, solo or leave option, queued or not.
- [ ] The Warden still looks like the Warden (`folk_spirewarden`) before and after the server rename.
- [ ] A contact sheet of the new and changed baked art is produced and reviewed before the art issue closes.

Added by the 2026-10-30 amendment (R26–R31):

- [ ] In the hub, a player walking into a standing player passes through them: neither body is pushed, and the walker ends where an unobstructed walk would put them. The same holds in a field world.
- [ ] In a run, the same walk is stopped at `2 × PlayerRadius` as today, and the existing crowd tests (`movement_crowd_test.go`) stay green.
- [ ] In the hub and in a field, a player still stops at walls and buildings and is held by the edge clamp; in a field, a player and a monster still push each other; in the hub, a resident and a player still push each other.
- [ ] Ten players walking to the Spire's door together all end within `GateRange` of the Spire gate, and every one's `find_game` is accepted (no "Walk to the Spire's door first.").
- [ ] Pass-through is chosen from the world's type when the world is built, not per tick from anything a client sends.
- [ ] No file under `internal/matchmaker` or `internal/match_queue` changes, and no client file or message changes.

## Edge States

- **Empty hub / nobody else queued:** the Spire gate behaves as the Warden did (FS-29KSH,
  FS-NSV3D): *Wait for company* waits; *Descend alone* goes at once.
- **Concurrent:** two players step into the Spire gate in the same tick: each opens their own
  panel; two `find_game`s in one tick both queue (unchanged FS-29KSH behaviour).
  ~~Many players crowding the door do not block each other (players do not collide in the hub
  today).~~ Corrected by the 2026-10-30 amendment: players did collide in the hub, and a crowd
  lined up out of range. Players now pass through each other in the hub and the fields
  (R26), so a crowd at the door all stands at the gate and nobody can block the doorway.
- **Players stacked on one spot (hub or field):** two players seated at the same spawn or
  arrival point, or walking onto each other, stay overlapping until one walks away; nothing
  pushes them apart and nothing breaks. A resident or monster that touches the stack pushes
  each body as it would one alone.
- **Remote players (other pods' ghosts in the hub):** already collide with nothing
  (FS-JEAVX §Requirements 13); unchanged.
- **Moving from the hub or a field into a run:** the run's rule applies from the first tick in
  the run; party members seated close together are pushed apart there as today.
- **Lag at the boundary:** the client opens the panel from the server-reported position (R10),
  so it opens only where the server agrees. If the player walks out between opening and
  choosing, the panel closes; a choice sent in the same instant may be refused with the walk
  message, which the global error handler shows; nothing is queued.
- **Refused start:** a `start_solo` refused for any reason re-enables the choice (FS-NSV3D R5);
  the walk refusal is one more reason, handled the same way. A refused `find_game` shows the
  refusal and leaves the player unqueued.
- **Queued and walking away:** stays queued; the corner panel follows; *Leave* works anywhere.
  Returning to the door shows the queued line.
- **Match found away from the door:** handed off as today; nothing about the gate is checked
  at match time.
- **Already in a run (reconnect confusion):** `find_game` / `start_solo` resume them before
  any gate check.
- **Disconnect at the door:** the panel is client state and is gone; on reconnect the player
  is wherever the hub puts them (FS-29KSH) and must walk back.
- **Esc menu open while walking in:** the trigger is suppressed; closing the menu inside the
  range does not open the panel (press E or step out and in).
- **Another dialogue open (Warden, Quartermaster) while walking in:** the gate does not stack
  a second dialogue; the open one stays.
- **Field gate before FS-X2F2H:** stepping in shows the name and fires the seam; nothing else.
  The movement clamp holds the player at the edge.
- **Arrival from a field (FS-X2F2H):** the arrival point is outside the range, so the player
  must step back toward the edge to go again.
- **Player in a field (after FS-X2F2H) sends `find_game`:** not in the hub, so at no gate,
  refused with the walk message; this gives FS-X2F2H "no queue from a field" without a
  matchmaker change.
- **Unauthorized / modified client** sending `find_game` from across the map: refused (R12).
- **Server rename lands before or after the client:** the client's `delve` alias (R25) keeps
  the Warden drawn and talking either way.

## Out of Scope

- Entering or leaving a field: the `field` world kind, enter/leave messages, the world switch,
  arrival handling, refusals while queued (FS-X2F2H, ADR-0030).
- The fields themselves: Gentle Meadows (FS-X2F2H), Forlorn Forest and trail generation
  (FS-3QHQZ).
- Any change to matchmaking, the queue, handoff or match size (FS-K2HKP; user-owned).
- The rest of the Spire: upper storeys, its top, any interior seen from the hub.
- Spire party bonus; party formation; joining a friend's channel; chained zones (parked by
  the user).
- Moving the Warden or the Quartermaster; the Quartermaster's dialogue.
- Widening or reshaping the hub beyond the gate approaches.
- Renaming backend "delver" identifiers.
- Writing the Gate term to CONTEXT.md and the thin lines (already done at scoping).
- Any change to collision in Spire runs, or to how walls, buildings, doors, monsters and
  residents collide, in any world (2026-10-30 amendment, R27–R28).
- Widening `GateRange` or moving the gates to fit a crowd; pass-through is the fix (R30).

## Decision log

Scoped 2026-10-29 with the user and locked under a charter. **[user]** = the user's own call;
**[charter default]** = proposed by the agent and approved by the user wholesale, not
individually discussed; **[spec]** = settled while writing this FS to close a scoping gap,
under the same charter.

| # | Decision | Provenance |
|---|---|---|
| D1 | Walk-to gates: each destination is a place in the hub you walk into (R1, R8, R21) | [user] |
| D2 | The Spire at the back (north) of the hub, an obvious dungeon entrance, mostly off-screen: front face and lower levels only (R15, R16) | [user] |
| D3 | The facade is one baked prop at the hub's north edge, authored in code (R15) | [charter default] |
| D4 | Forest gate off the west edge, Meadows gate off the east edge (R2, R18) | [user] |
| D5 | Trail mouth (west), road (east), a signpost at each (R18) | [charter default] |
| D6 | The Spire gate opens the existing Gather / Go alone panel unchanged; only the trigger moves (R8, R13, R14) | [charter default] |
| D7 | Gate entry is server-validated by proximity to the gate (R7, R12) | [charter default] |
| D8 | Field gates switch worlds locally, no queue, no handoff; detail in FS-X2F2H / ADR-0030 (here: detection only, R21) | [charter default] |
| D9 | The Warden keeps lore dialogue and loses every queue option (R23) | [user] |
| D10 | The Warden's exact behaviour: storyteller function, up to three passages, *Go on* / *Farewell*, no memory (R24) | [charter default] |
| D11 | Gate coordinates, range 80, arrival points, approach paths (R2, R4, R19); no map widening (R11) | [spec] (closes scoping "Open": exact map edits, widening) |
| D12 | Facade and field approaches drawn beyond the world edge so no collision is added (R11, R16) | [spec] |
| D13 | Edge-triggered panel, E to reopen, closes on walking out, measured from server position (R10) | [spec] |
| D14 | Gates are ECS entities broadcast as `gates` in the hub state; arrival points server-only (R5, R6) | [spec] |
| D15 | Gate check order: after no-character and resume, before queue / solo (R12); `leave_queue` not gated (R13) | [spec] |
| D16 | Client aliases `delve` → storyteller during the rename (R25) | [spec] |
| D17 | Players pass through each other in the hub and in field worlds; Spire runs keep player collision; walls, buildings and monsters collide everywhere as today; the gate rule stays as written (R26–R28, R30). Decided 2026-10-30: the user answered "Brighter, fix edges" to the choice "no player collision in hub and fields" | [user] |
| D18 | Residents keep colliding with players (FS-29KSH §Requirements 11 unchanged); only player-vs-player is removed (R28) | [spec] (amendment, reading D17 narrowly) |
| D19 | Pass-through is a property of the world chosen from its type when built, not looked up by the movement system or decided per tick (R29) | [spec] (amendment) |

**Rejected:** a single destination device (waystone / map table) listing destinations. The
user chose walk-to gates: the hub itself is the map.

**Finding while specifying D7:** today there is **no server-side proximity check** for the
Warden. `find_game` and `start_solo` are accepted from anywhere in the hub
(`internal/gameserver/hub.go`); the only distance check is the client's `NPC_TALK_RANGE = 80`
in `HubScene.ts`, mirroring `NPCInteractRange`. "Moving the Warden's check to the gate"
therefore means adding the server check for the first time (R7, R12), at the gate, with the
Warden's range as the gate's range (R4).

**Finding while implementing I-0XMCP-4 (2026-10-30), led to D17:** players **do** collide in
the hub. The hub reuses the runs' `MovementSystem`, whose body-vs-body push applies to every
moving body, players included. The FS's Concurrent edge state said otherwise. In the
gameserver test, ten players walking to the Spire's door lined up about 40 px apart and only
about three were inside the 80 px range; the rest were refused. `TestQueueFindGameFlow` was
changed to walk players to the door one at a time as a stopgap. Players on other pods (ghosts,
FS-JEAVX) never collided, so the effect only showed among players on one pod.
