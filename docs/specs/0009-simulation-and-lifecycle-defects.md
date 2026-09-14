# FS-0009: Simulation and lifecycle defects

> Status: draft · SPECIFICATION.md: no capability line — see D0 · Related ADRs: [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md)

## Scoping notes (raw)

### How this arrived

Five defects, four of them parked during FS-0008's implementation and one reported while
playing the merged hub build. None is a new capability: every one is an existing behaviour
that is wrong. They are collected here because the decisions behind the fixes were reached
in one session and would otherwise evaporate.

**The dominant lesson, recorded because it shapes what to test:** all five surfaced from
*running the stack*, with the unit suite fully green throughout. The run world hid three of
them because its teardown discards the whole world; the hub, which is never torn down,
exposed them. `Session.manageGameLoop` returns early when `TestMessageSpy != nil`, before
`RulesSystem` ever executes — so D5's path below has never been covered by a test at all.

### D0 — These are defects, not capabilities: no `SPECIFICATION.md` line

Fixing a broken existing behaviour produces no new capability line, and does not un-check
the line the behaviour already has. `game-client/SPECIFICATION.md` keeps
`- [x] Equip and unequip from the loadout` even though D3 says it is currently broken: the
capability shipped, and a defect in shipped behaviour is not a status change.

**`write-a-spec` must not invent a capability line for this FS.** The repo's backend lane
(root `CLAUDE.md`) says hand-coded server work skips the spec chain by design; this FS
exists to hold the *reasoning*, not to route the work through the capability index.

---

### D1 — One player, one record

**Defect.** `s.players[memberId] = player` stores a pointer; `s.MapConnToPlayer(conn, *player)`
dereferences it, so `connToPlayer` holds a *different object*. Routing reads
`connToPlayer` (`GetPlayerFromConn`), so the two must agree.

`everyRecordOf` (`internal/gameserver/server.go:222`) exists solely to undo this: four call
sites (`JoinHub`, `setCurrentWorld`, `forgetCurrentWorld`, `CreateGameSession`) loop over
every copy to write one field, and `markPlayerAsReconnecting` writes both by hand.

**Decision.** `MapConnToPlayer` takes `*types.Player`. The copy disappears, `everyRecordOf`
becomes a one-element slice and is deleted, the four loops become direct field writes, and
the double-write in `markPlayerAsReconnecting` collapses. Net effect is subtraction: one
function, four loops, three comments explaining the copy.

Verified before deciding: nothing reads or writes either map wanting them to differ. Every
site is spending effort keeping them in sync. The reconnection path also gets *more*
correct — it currently takes `reconnectingPlayer` and immediately copies it again.

**`s.players` lifetime is unchanged (option A).** It is never deleted, deliberately
(`handler.go:409`) so a reconnecting player keeps their state. That means it grows for the
life of the process. Considered and rejected: a disconnect timeout that evicts from
`s.players`. Rejected because it changes reconnection semantics — a separate decision — and
under ADR-0015's 50-player ceiling the retained memory is negligible. After this fix
`s.players` becomes the sole owner, so the growth is more visible but no worse.

---

### D2 — The state broadcast has two races, and the pool is the worse one

`internal/game/session.go:895`, `broadcastFullState`.

**Race A — no lock.** The function ranges `s.playerEntityIDToPlayerID` while `Admit` and
`RemovePlayer` write it under `s.mu` from the message hub's goroutine.

**Race B — the pool is recycled while readers still hold it.** `FormatStateToClientState`
does not copy: `ClientGameState.Items/Doors/Walls/Containers/EscapeDoor/Switch/NPCs/Projectiles`
alias `BackendGameState`'s slices. `broadcastFullState` then calls `PutBackendState` on the
next line. On the following tick `SerializeBackendState` may `Get()` that same object and
`RestBackendStatePool` truncates each slice to `[:0]` and refills it — overwriting the exact
backing arrays the previous tick's `ClientGameState`s still point at.

**Removing the goroutine does not fix Race B.** The aliasing outlives the tick through the
per-connection `msgChan` buffer: the writer goroutine JSON-encodes later, whoever enqueued it.

**Blast radius.** Full state every tick, so a torn frame is overwritten 33ms later — no
crash (every pointer stays valid), no persistent corruption. The symptom is a frame mixing
old and new entity positions. It matters more than that sounds because this is the *only*
authoritative channel and the client does not validate it: `isGameState`
(`game-client/src/types/gameState.ts:148`) checks that the payload is shaped like a state
and nothing else — no tick number, no version, no comparison with the previous frame.

**Decision — delete the pool.** Measured with the repo's own benchmark (Apple M5 Pro):

```
BenchmarkSerializeBackendState_NoPool     10226 ns/op   14480 B/op   192 allocs/op
BenchmarkSerializeBackendState_WithPool    9898 ns/op   13344 B/op   166 allocs/op
```

328 ns and 8% of memory, i.e. ~10 µs per second of wall clock at 30Hz. That is what the pool
buys in exchange for making the authoritative state channel formally racy — `go test -race`
cannot pass, which costs every future concurrency test its safety net.

Delete `backendStatePool`, `PutBackendState`, `RestBackendStatePool`, and the
`PutBackendState` method on `game.StateSerializer` (`session.go:107`) and its test mock.

Rejected: deep-copying in `FormatStateToClientState` (N copies of the world per tick — more
expensive than the pool saves); refcounting the state so it returns only once all sends
complete (a counting protocol to save one allocation).

**Decision — send inline, delete the per-player goroutine.** `PushMessageToChannelQueue`
(`server.go:496`) is already a `select` with `default`: it never blocks, and a slow client's
frame is dropped rather than stalling the tick. The expensive part — `conn.WriteJSON` — already
runs in a permanent per-connection goroutine (`setupClientWriter`, `handler.go:313`), and
that fan-out is untouched. So `go func` parallelises two map lookups and a non-blocking
channel send, while adding 30×N goroutines per second and contention on `s.mu` from N
goroutines hitting the same RWMutex.

**Decision — snapshot the recipients under `RLock`, then serialize outside it.** Rejected:
holding the lock across serialization (puts the whole per-tick serialize in the critical
section).

Two consequences fall out: the intermediate `clientStates` map disappears (it existed only
because `PutBackendState` had to sit between the two loops), and the currently-swallowed
error from `SendStateToPlayer` becomes an `atomic.Uint64` counter on `Session`. Not `slog` —
one slow client would emit 30 lines a second.

**Known remaining, deliberately unfixed: component-level concurrency.** Snapshotting the
recipient list does not protect the *components* read during serialization; handlers mutate
`component.VX` directly, outside `s.mu`. That is a deeper problem touching every system and
every handler, and is out of scope here.

**Rejected: a `playerToConn` reverse map.** `GetConnFromPlayer` (`server.go:462`) linearly
scans `connToPlayer`, making the broadcast O(N²) per tick. At the 50-player ceiling that is
~2,500 comparisons per tick, ~1 ms per second — 0.1% of one core. A fourth map would have to
stay in sync with `connToPlayer` on connect, disconnect and reconnect, which re-introduces
exactly the hazard D1 removes, to buy 0.1% of a core. Also rejected: putting
`Conn *websocket.Conn` on `types.Player` (O(1) with no new map, but leaks a transport type
into the shared types package). **Revisit when ADR-0015's concurrency ceiling is raised** —
this is what `CONTEXT.md`'s *Concurrency ceiling* entry is for.

---

### D3 — Service-to-service calls must carry the caller's token

**Defect.** ADR-0004's zero-trust position requires each service to authenticate its callers.
In practice `marketplace → items` forwards the caller's token
(`metadata.AppendToOutgoingContext`) and `game-service → items` sends nothing, so the items
service's auth middleware rejects it. Equipping from the loadout is broken in the hub as a
result, while `game-client/SPECIFICATION.md` still records the capability as shipped.

**Decision, two parts.**

1. `ListItemTemplates` goes on the items service's `publicMethods` whitelist. It takes
   `google.protobuf.Empty` and returns the shared template catalogue — no player data, so
   there is nothing for a token to authorise.
2. `GetLoadoutWithItems` forwards the caller's token, following marketplace's existing
   pattern. The forwarding is **abstracted into a gRPC client interceptor**, not repeated per
   method, so a new method is authenticated by default rather than by remembering.

The gateway → items path forwards the caller's header through the same interceptor.

**Accepted consequence, chosen not missed.** The access token lives 15 minutes. A player who
stands in the hub longer than that and then opens the loadout will send an expired token and
be refused. Client-side refresh is the fix and is **separate work, deliberately deferred**
(*"refresh另外排"*); it does not block this decision.

Rejected: giving the items middleware an internal-calls bypass (a back door that would be
load-bearing forever); storing a service token in game-service (widens what a compromised
game-service can reach).

**No ADR this session.** The "every service-to-service call forwards the caller's token"
rule is a constraint that holds rather than a capability, so it belongs in an ADR. Writing
it was explicitly deferred; if it is never written, this section is the only record.

---

### D4 — The spatial hash does two jobs and is wrong at both

`internal/systems/movement.go:30`.

```go
entitiesMap := make(map[int]*ecs.Entity, 0)   // one entity per cell, last writer wins
...
for _, entity := range entitiesMap            // ← used as the simulation list
...
if other, ok := entitiesMap[cellKey]; ok      // ← used as the neighbour index
```

**Defect A — entities silently stop being simulated.** The main loop iterates the *index*.
An entity evicted from its cell does not move, does not collide, does not clamp to bounds,
its attack cooldown does not tick, and its attack is not resolved. It freezes for that frame.

Cell size is `2 * PlayerRadius` = 40, which is exactly `resolveCollision`'s `minDist`. Two
entities close enough to collide are therefore the two most likely to share a cell: the
defect fires precisely when correctness matters.

**Defect B — the freeze alternates, so both entities jitter.** `EntityManager.GetAllEntities`
(`internal/ecs/manager.go:64`) ranges a map, so the slice order is randomised every tick and
the cell's winner flips frame to frame. `resolveCollision` snaps the *moving* entity to
exactly `minDist` from the other, assuming both sides get resolved; with only one side
resolved per frame, and the reference position moving each time, the pair never settles.
**This is a direct candidate for the movement jitter reported during hub testing** — it moves
positions themselves, where D2's torn frames only affect rendering.

**Defect C — the neighbour lookup finds at most one entity per cell.** Three entities in an
adjacent cell means colliding with one of them.

**Latent — key overflow.** `cellX<<8 | cellY` bleeds into `cellX`'s bits once `cellY > 255`,
i.e. a world taller than 10,200px. Currently safe (hub 1000, run 960) and silent when it
breaks.

**The 9-cell neighbourhood itself is sound.** 200 px/s ÷ 30Hz = 6.7px per tick against a
40px cell, so nothing tunnels.

**The hash saves nothing today.** Walls and doors — the dominant cost in this loop — do not
use it at all: every entity scans every wall three times and every door three times. At hub
capacity that is 54 × 20 × 3 ≈ 3,240 swept-collision calls per tick, each far more expensive
than a distance check, against 54² = 2,916 distance checks for the brute-force alternative.
The comment on line 29 describes something the code does not do.

**Decision — fix it properly (option ②), do not delete it.** Deleting the hash was
recommended first, on the estimate that map lookups (~25 ns) cost an order of magnitude more
than contiguous distance checks (~2 ns), putting the crossover near N ≈ 100 — above the
current 54. **That recommendation was withdrawn**: monsters are planned, which takes a run
past the crossover, and the concept is the right one. The three defects are in the
implementation, not the idea.

- Split the two jobs: `movables []*ecs.Entity` is the simulation list, `cells
  map[cell][]*ecs.Entity` is the neighbour index.
- Iterate `movables`, so no entity is skipped.
- Iterate the slice in each of the 9 cells, so no candidate is missed.
- `type cell struct{ x, y int }` as the key — no bit packing, nothing to overflow.

**Out of scope, recorded:** walls and doors should use the index too (they are static, so
their cells can be computed once at world build rather than every tick) — this will become
the bottleneck before entity collision does, once monsters arrive. And the attack resolution
living inside `MovementSystem` (lines 203–237) is why a frozen entity also stopped attacking;
that is an SRP problem larger than this fix.

---

### D5 — A run's end signal fires every tick, and the second one panics

**Reported symptom.** The first queue → run works. After it resolves and everyone returns to
the hub, queueing for a second run misbehaves.

**Cause.** `RulesSystem.Update` (`internal/systems/rules.go:76`) has no memory. It recomputes
`activePlayers <= 1` every tick, and that condition is monotonic — nobody revives, nobody
un-escapes. So it does not *detect* the end; it *re-announces* it every 33ms.

`endSessionCh` is unbuffered. `manageEndSession` receives once and calls `endSession()`,
which runs `notifyPlayersOfGameEnd` → `ReturnPlayersToHub` → `CloseSession` → `Shutdown()`,
and `Shutdown` closes `endSessionCh`. The next tick sends again. Both interleavings panic:

- close lands first → *send on closed channel*;
- the send blocks first → closing a channel with a blocked sender panics that sender.

Even when the closes beat the next tick, `close(stopChan)` leaves the loop's `select` with
both `ticker.C` and `stopChan` ready, and Go picks at random — so it is roughly a coin flip
per run.

**Second, independent defect.** `Shutdown`'s guard reads `if !s.isRunning`, but `isRunning`
is set `true` in `Start()` and **never set back to `false`** (`session.go:184`, `858`). The
guard has never stopped anything; a second `Shutdown()` closes already-closed channels.

**Why the symptom looks like "the flow got confused" rather than "the server died."**
`manageGameLoop` has no `recover`, and an unrecovered panic in any goroutine terminates the
whole process. Under `air`, the process is restarted immediately: new hub, empty
`s.players`, empty queue, no sessions — while the client still believes it is somewhere.

**Decision.**

1. Latch the end state on `MatchProgressComponent.Ended`. The component stays pure data and
   the system stays stateless, per the ECS conventions in `game-server/game-service/CLAUDE.md`.
   `RulesSystem` returns early once it is set, so the channel is never touched again.
2. Set `s.isRunning = false` in `Shutdown`, making it idempotent. Still required after (1),
   because `endSession` is reachable from other paths (e.g. the last player disconnecting
   via `cleanUpPlayerFromSession`).

**Deferred, deliberately: `recover()` in the four session goroutines.** ADR-0015 put the hub
and every run in one process, which means any world's panic now kills every world — the bill
for a decision that traded process isolation for a single connection. Containing it would
mean a recover in each of `manageClientMessages`, `manageGameLoop`, `manageEliminations` and
`manageEndSession` (recover only catches its own goroutine), with a run's panic tearing down
that run and returning its players to the hub, and the hub's panic deliberately *not*
recovered — a server with no hub is worse than a restarted one.

Not done now because the developer is the only player and runs under `air`: the crash, with
its full stack, is the best available debug signal, and a recover would demote it to one log
line. **Revisit before anyone else plays.**

**And recover is not the real fix anyway.** The underlying cause is 106 unchecked type
assertions across `internal/` (21 of them discarding `GetComponent`'s `ok` outright), e.g.
`movement.go:88` asserts a transform on wall entities filtered only by `hasWallComp`. Safe
today only because `CreateWallEntity` happens to add both components. The real fix is a
component accessor that makes forgetting the check impossible; that is a 106-site
refactor and is out of scope.

---

### Parked — nothing here is being done, all of it is recorded on purpose

| Item | Trigger to revisit |
|---|---|
| `recover()` in session goroutines; the 106 unchecked assertions behind it | before real players (D5) |
| Spatial index for walls and doors | when monsters land (D4) |
| Attack resolution living in `MovementSystem` | SRP debt, no trigger (D4) |
| `GetConnFromPlayer` O(N) → O(N²) broadcast | when ADR-0015's 50-player ceiling is raised (D2) |
| Component-level concurrency during serialization | no trigger; touches every system and handler (D2) |
| Client access-token refresh | blocks nothing; the hub-idle expiry in D3 is accepted until then |
| An ADR for D3's token-forwarding rule | explicitly deferred this session; D3 is the only record until written |

### Open questions

- Is the reported movement jitter D4's alternating freeze, D2's torn frames, or both? D4 is
  the stronger candidate (it moves positions, not just renders them). A test placing two
  entities in one 40px cell and asserting *both* positions advance should be red today, and
  fixing D4 should be observable in play.
- D5's cause is read from the code, not observed. Confirmation is one line in the server
  terminal: `panic: send on closed channel` or `panic: close of closed channel`, plus an
  `air` rebuild. If neither appears, there is further state surviving run teardown that this
  FS has not found.
