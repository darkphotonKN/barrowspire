# SPECIFICATION — game-service

> ♻️ **RECONCILED DRAFT (spec-bootstrap, deliberate re-baseline).** The previous spec captured
> the **intent** well (what we want to build) but had drifted from the **code** in structure and
> status. This version keeps the intent (⏳ PLANNED items carried over) and re-maps the ✅ DONE
> claims to what the code actually does on 2026-07-25. `> REVIEW:` marks divergences, partials,
> and suspected bugs a human must confirm. This reconciliation replaced a 61-line untracked
> spec (backup retained outside the repo). Future `/spec-audit` runs delta against this.

Living spec for the **instanced escape-run simulation**. Architecture & conventions live in
[`CLAUDE.md`](CLAUDE.md); the whole-project refactor plan is
[`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

Legend: ✅ DONE (built & code-verified) · ⚠️ PARTIAL · ⏳ PLANNED / NOT STARTED

---

## Purpose

game-service is the authoritative, short-lived **escape-run engine**: an **ECS world + a
WebSocket message-hub**, real-time **coordination, not a domain model**. A party is matched,
an isolated world is built, the run ticks to resolution, results are published, the world is
torn down. DDD belongs to the *surrounding* contexts (profile, inventory, economy,
matchmaking); this service is the engine they feed. ✅

## Architecture (as built)

- **Single process, multiple concurrent sessions.** One `Server` holds `sessions map[uuid →
  *Session]`; each session owns its **own `ecs.EntityManager` and goroutines**, fully isolated
  (no shared mutable state). ✅
- **Fully in-memory per run.** No game-state persistence; the world is discarded on teardown. ✅
- **Fixed-timestep tick:** `manageGameLoop`, ticker at `GameFrameRate = 30` Hz. Each tick runs
  the systems over all entities, then broadcasts state. ✅
- **Coordination, not DDD** for the loop (per CLAUDE.md). The `internal/game` package name is
  ECS-session, not a DDD service.
  > REVIEW: the tick loop instantiates **fresh zero-value system structs each tick** and ignores
  > the `movementSystem/combatSystem/skillSystem` fields injected in `NewSession` — those
  > injected fields are dead. Harmless (systems are stateless) but inconsistent.

## ✅ Done — session & matchmaking lifecycle

- **Matchmaking queue** ✅ — `queueService` ticks 1/s; emits on `MatchedChan` when
  `len(players) ≥ matchSize`. Entry via hub action `find_game` → `AddPlayer`.
  > REVIEW: `matchSize` is hardcoded `2` (`NewQueueService(2)`); `leave_queue` is broken (see
  > divergences) so players can't actually dequeue.
- **Start game** ✅ — on `MatchedChan`, `CreateGameSession` builds the world and broadcasts
  `game_found` with `session_id`.
- **World build** ✅ — `CreateGameSession` → new EntityManager → `NewSession` (spawns the loop)
  → `InitialMapObjects` (containers, 3 buildings with walls/doors, 1 escape door, 1 switch,
  item pool seeded via gRPC `ListItemTemplates` to items-service) → players added via `AddPlayer`.
- **Teardown** ✅ — `endSession` (or last-player-leave) closes the session channels, waits on
  the WaitGroup, and calls `PublishMatchComplete`.

## ✅ Done — ECS world

- **Components** (pure data) ✅ — Player, Transform, Velocity, Health (`IsEliminated`), Skill,
  Stats (Str/Agi/Int/Kills/Deaths…), Equipment (10 slots), Item, ItemIDList, Door, Wall,
  Container, Openable, Interactable (`Range`), Lockable, Switch, EscapeDoor, MatchProgress.
  > REVIEW: `Destructible` component declared but unused; the ECS type registry lists many
  > unused tags (NPC, Enemy, Buff, Level, Inventory, …); `ComponentTypeMatchProgress` has the
  > literal string value `"Entity"`.
- **Systems** (behavior) ✅/⚠️ —
  - **MovementSystem** ✅ — the workhorse: spatial-hash bucketing, split-axis **swept-AABB**
    collision vs walls & closed doors, depenetration, player-player push, boundary clamp.
  - **InteractionSystem** ✅ — auto-opens/closes proximate openables; escape door & switch
    require explicit `interact`.
    > REVIEW: auto-toggles every tick while in range — likely door flicker; contradicts the
    > explicit-interact model.
  - **EliminationSystem** ✅ — health ≤ 0 → eliminate, push onto elimination channel.
  - **RulesSystem** ✅ — tracks alive/dead/escaped; `activePlayers ≤ 1` ends the session.
  - **CombatSystem / SkillSystem** ⏳ — **empty stubs**; `DamageCalculator` (stats-based math)
    is **dead code**, never invoked.

## ✅ Done — gameplay actions (with partials)

- **Players — server-authoritative** ✅ — `CreatePlayerEntity`; server owns transform/velocity/
  health; loadout fetched at join via gRPC from items-service.
- **Movement** ✅ but ⚠️ **NOT grid** — client sends continuous `vx,vy` (`move`); server
  integrates with collision and broadcasts each tick.
  > REVIEW: the prior spec said "grid/WASD" — the build is **continuous float velocity**, not
  > grid. Correct the intent or the label.
- **Attack / combat** ⚠️ PARTIAL — `handleAttack` sets flags; **actual damage is applied inside
  MovementSystem** (hardcoded 10 dmg, range 60, 0.5s cooldown).
  > REVIEW: combat logic is misplaced in MovementSystem; `CombatSystem`/`SkillSystem` stubs and
  > `DamageCalculator` are unused. Stats never affect damage.
- **Items** ⚠️ PARTIAL — item *entities* exist; **pickup** (`interact`) and **equip/unequip**
  work. **Drop and use/consume do NOT** — `pickup`/`use_item`/`drop_item` action constants exist
  but are **unhandled**.

## ✅ Done — WebSocket message-hub

- **Connection lifecycle** ✅ — authenticate via gRPC auth → upgrade WS → per-conn **reader**
  goroutine (`ServeConnectedPlayer`) + per-conn **writer** goroutine (buffered channel, honoring
  Gorilla's single-writer rule) + one central `messageHub.Run`. Includes reconnection handling
  (keeps player state, 30s window, re-sends `game_found`).
- **Inbound actions** ✅ — menu: `find_game`, `leave_queue`; in-game: `move`, `attack`,
  `interact`, `equip`, `unequip`.
  > REVIEW: declared-but-unhandled inbound actions: `queue`, `leave_game`, `pickup`, `use_item`,
  > `drop_item`, `chat`.
- **Outbound** ✅ — `game_found`, `queue_status`, `reconnected`, `end_game`, `Error`, plus the
  per-tick personalized state broadcast (serialized once via a pooled buffer, then per-player
  formatted; non-blocking send that drops on a full queue).

## ✅ Done — results reporting (was filed as PLANNED)

- **Match-end fan-out** ✅ — `PublishMatchComplete` ranks players and publishes two protobuf
  events, **`GameMatchEnded`** and **`ItemsExtracted`** (idempotent `EventId`), to the
  `GameEventsExchange` via a **transactional outbox** (the only use of the Postgres DB here).
  > REVIEW: this reconciles two items the old spec listed under ⏳ Planned — "Results reporting"
  > and "Extraction REWARDS fan-out" are **already implemented**. `StartedAt`/`EndedAt` are both
  > `time.Now()` at end (no real start time; TODO in code).

## ⏳ Planned / Not Started (intent carried over — MMO-RPG refactor)

See [`/docs/refactor_plan.md`](../../docs/refactor_plan.md) for sequencing.

### World & sim
- **Persistent HUB world** — shared social/staging space; light sim (position sync, chat,
  presence, grouping). Distinct world type from escape runs. *(None exists — only the run world.)*
- **Multi-instance allocation contract** — ⚠️ partially present: multiple isolated sessions
  already coexist in-process, but there is **no generic allocation abstraction / instance-id
  contract / warm pool** — world creation is hardwired in `CreateGameSession`.

### Matchmaking / session lifecycle
- **Allocation contract** — generic matchmaking ↔ instance allocation interface (warm pool or spawn).
- **Roster + modifiers seeding** — roster seeding exists; **run modifiers do not**.
- **Client handoff lifecycle** — background the hub WS, connect clients to the instance WS,
  return to hub on resolve. *(No hub world, so no handoff yet.)*
- **Results reporting** — ✅ done (see above); keep here only for the hub-return leg.

### Persistent player state (NEW vs. the stateless escape game)
- **Durable accounts / profile** (DB-backed) — not in this service.
- **Persistent inventory** carried across runs — loadout is read via gRPC per run, not persisted here.
- **Progression** (levels/skills/unlocks) persisted — not present.

### Cross-context business flows (DDD services + sagas)
- **Player-to-player TRADE** (atomic two-party swap saga). ⏳
- **GEAR ESCROW across the run lifecycle** (checkout on delve → instance authoritative →
  return/forfeit on extract/death/crash; flagship saga with crash-recovery compensation). ⏳
- **START-A-DELVE** distributed coordination (matchmaking → allocation → handoff). ⏳
- **Economy / wallet, market** bounded contexts. ⏳
  *(Extraction REWARDS fan-out — moved to ✅ Done above.)*

## Known divergences & suspected bugs (REVIEW before trusting)

Code-certain unless noted:
- **Loot types inverted** — armor configs appended to `itemPool.Weapons` and vice-versa; the
  lookup then returns the wrong category. Players get armor where weapons are expected.
- **Item-count loop bounds wrong** — `generateItems` compares a running offset against a count
  (`for i := numberOfWeapons; i < numberOfArmor`), so armor/consumable spawn counts are wrong
  (often none).
- **`leave_queue` broken** — nil-deref path when the player isn't found, and the actual dequeue
  (`RemovePlayerFromQueue`) is commented out — leaving the queue does nothing.
- **`cleanUpClient` inverted** — the player-exists branch returns early without closing the
  msg channel / deleting mappings / closing the conn (leak); the fall-through derefs a nil player.
- **Combat in the wrong system** — damage inlined in MovementSystem; `CombatSystem`/`SkillSystem`
  empty; `DamageCalculator` dead.
- **Dead infra** — Redis `cacheService` wired but unused; the gRPC game server is created and
  served but **registers no service** (`// TODO`); `internal/ecs/outbox/` empty; `MessageSender`
  interface unused.
- **Convention violations** — `slog.Info` used with printf verbs (`server.go`), `log.Printf`
  with `%w` (`main.go`); pprof mutex/block profiling left on (TODO to remove).

## Open questions

- Is movement meant to be grid or continuous? (Spec says grid; code is continuous.)
- Should combat move into `CombatSystem` and use stats/`DamageCalculator`, or is inlined-in-movement intentional?
- Are `pickup`/`drop_item`/`use_item` intended for this milestone, or deferred?
- Is `matchSize = 2` a real target or a dev default?
