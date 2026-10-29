# FS-X2F2H: Field worlds and Gentle Meadows

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Field worlds" (field world scene · Gentle Meadows look and creature); `game-server/game-service/SPECIFICATION.md` "### Field worlds" (shared field worlds per replica · costless death with respawn at the field entrance · killer-first loot · field drop rates derived from the Spire's · Gentle Meadows) → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (fields are per-replica channels, local world switch, never handed off), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection, per-pod player ceiling), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) · Related: [FS-0XMCP](0XMCP-hub-destination-gates.md) (the hub gates that lead here), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (the second field), [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) (hub syncs only players across pods), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (out of bounds), [FS-NSV3D](NSV3D-solo-delve-entry.md) (queued-refusal precedent), [FS-77AB6](77AB6-monsters-and-combat.md) (monster stats, party-scaled levels, elites), [FS-BDA7X](BDA7X-character-leveling.md) (XP, level cap 20), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (drops), [FS-9TNJA](9TNJA-game-service-owns-its-outbox.md) / [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (match-end outbox path), [FS-8RBQY](8RBQY-tower-interior-run-look.md) (exterior theme kept for a future outdoor place)

## Scoping notes (raw)

### How this arrived

Scoped 2026-10-29 with the user, locked under a charter. Items marked **[user]** were the
user's own call; **[charter default]** were proposed by the agent and approved by the user
wholesale (not individually discussed); **(not challenged)** converged without pushback.
Server items are human lane (game-service is the user's learning surface).

Vision (user): the hub becomes the map; the Spire is the hardest, most rewarding place and you
must escape it; the other places are safer farming areas with the same goals (XP, items) and
lower rewards. Per-player / per-party instanced content will come from these places later.

### The field world

1. **New world kind `field`**: an instanced world separate from the hub but shared like the
   hub ("a real game world"), with **no queue**. **[user]**
2. **Channel model:** each pod creates one Meadows and one Forest at boot, always on, like the
   hub. **[charter default]** Recorded as [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md).
   "Game worlds being horizontally hosted and scaled based on pods is fine, just like MMOs
   having servers." **[user]**
3. **Enter / leave is a local world switch on the same pod, never a handoff.** **[charter
   default]** Leaving = walking back through the field's entrance gate → hub, at the matching
   hub gate (FS-0XMCP).
4. **Entering a field while queued for the Spire is refused**, same rule as solo start
   (FS-NSV3D). **[charter default]** Avoids any matchmaker change.
5. **Enter with current equipped gear**, no loadout screen. Nothing is at risk, so no escrow.
   **[charter default]**
6. **Gains settle on leaving** (gate, disconnect, logout): XP and picked-up items go through
   the existing match-end outbox path as a costless `returned` result. Reuses the idempotent
   pipeline; a pod crash loses only the unsettled visit. **[charter default] (not
   challenged)**
7. **Disconnect in a field → reconnect lands in the hub.** Fields are not resumed. **[charter
   default]**
8. **No separate field occupancy cap**; the per-pod ceiling (ADR-0015) covers it. **[charter
   default]**
9. **No PvP in fields**, same co-op rule as runs. **[charter default]**

### Death, kills and loot

10. **Death costs nothing**: no item loss, no escape needed. **[user] (not challenged)**
11. **Respawn at the field entrance at full health** **[user: entrance]** after **3 s**
    **[charter default]**.
12. **Kill credit (XP + loot) goes to the player who lands the killing blow.** User: "experience
    received for anyone that kills them first, we don't mind since they won't be reliable
    farming areas". **[user] (not challenged)**
13. **Killer-first loot window: 30 s**, then anyone may take the pile. Killer-first **[user]**;
    30 s **[charter default]** **(not challenged)**.
14. **Monster respawn 45 s after death at its spawn point.** **[charter default]**

### Balance

15. **Monster level = a fixed band per field**: Meadows 1–4, Forest 4–9. Not party-scaled
    (FS-77AB6 scales to a party; a shared world cannot scale to one party). **[charter
    default]** Level cap 20 (FS-BDA7X) unchanged.
16. **"Easier" = tamer stat balance** **[user]**: field stats = the Spire's stat formula ×
    0.75; elites keep the Spire's elite multipliers on top, so elites are harder than normals
    as in the tower. **[charter default]**
17. **Drop rates lower than the Spire and dynamic, so Spire tuning carries over** **[user]**:
    field drop chance = live Spire drop chance × field factor (Meadows 0.35, Forest 0.5), read
    at roll time. **[charter default] (not challenged)** Economy note: costless death plus
    shared farming feeds items into the marketplace; inflation risk acknowledged, mitigated by
    the low factors.

### Gentle Meadows

18. **East of the hub. Easier, lower level. Cozy greens, sparse trees, a nice horizon
    background, simple to draw. Low-level animal enemies; start with ONE enemy.** **[user]**
19. **A fixed, hand-laid open map**, not generated, so it does not wait on the forest
    generator (FS-3QHQZ). **[charter default]**
20. **Creature: boar**, one baked creature plus its elite variant. **[charter default]** Art
    built in code and baked (ADR-0020/0021, design guideline Part I); the exterior theme kept
    by FS-8RBQY "for a future outdoor place" is the natural ground family.

### Rejected

- **One owner pod per field with K2HKP handoff (zone server).** Rejected by the user in favour
  of per-pod channels (the MMO "servers" model). See ADR-0030.
- **A single destination device** (waystone / map table): rejected in FS-0XMCP for walk-to
  gates.

### Known cost

- Two friends on different pods meet in the shared hub (FS-JEAVX syncs players across pods)
  but enter different Meadows / Forests. Fix later with "join a friend's channel" alongside
  party formation (parked).

### Constraints referenced

- FS-K2HKP matchmaker is the user's hand-coded work: **out of bounds**. Never edit
  `internal/matchmaker`, `internal/match_queue` or their wiring. Fields need nothing from it.
- FS-JEAVX syncs only players across pods; monsters and combat cannot be split across pods,
  which is why a field lives whole on one pod (ADR-0030). Fields never publish to Redis.
- ADR-0015: one process and one connection per pod; the field is another world in that
  process.

### Open (not settled)

- Whether an empty field should sleep to save CPU. Default: always on.

### Parked (out of scope)

- Spire party bonus (needs party formation; none exists as of 2026-10-29).
- Party formation; join a friend's channel; chained zones (user: later, into different places).
- Per-player / per-party instanced content from the fields (user: future).
- Renaming backend "delver" identifiers.

### Vocabulary

- "Delver" retired 2026-10-29 for "player" (client). "Delve" stays the Spire's own word;
  **a field visit is not a delve**. New terms (Field world, Channel, Kill credit, Killer-first
  window, Gentle Meadows; World kind gains `field`) go to the CONTEXT.md files.
