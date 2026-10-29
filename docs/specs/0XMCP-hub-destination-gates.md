# FS-0XMCP: Hub destination gates and the Spire entrance

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" (walk to a destination gate in the hub · the Spire's entrance at the back of the hub · the Warden as storyteller, not the queue); `game-server/game-service/SPECIFICATION.md` "### Hub world" (destination gates in the hub · Spire entry from its gate) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection per pod, per-pod player ceiling), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (built in code, never sourced), [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (what the field gates switch to) · Related: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (hub, Warden, delve entry today), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (queue → match → handoff; out of bounds), [FS-NSV3D](NSV3D-solo-delve-entry.md) (Go alone), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (leave queue from the hub), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (Gentle Meadows, behind the east gate), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (Forlorn Forest, behind the west gate)

## Scoping notes (raw)

### How this arrived

Scoped 2026-10-29 with the user, locked under a charter. Items marked **[user]** were the
user's own call; **[charter default]** were proposed by the agent and approved by the user
wholesale (not individually discussed); **(not challenged)** converged without pushback.

### Vision (user)

- Replace the Spire Warden as the matchmaking entry with something visual. The hub becomes
  the map: players WALK to a destination.
- The Warden stays, as a village-elder storyteller. Lore: one morning the town woke to a
  tower, the Spire, standing on the old barrow field.
- The Spire is the magical escalating dungeon (not infinite now, could be later): hardest,
  most rewarding, you must escape. The other places (fields) are safer farming areas with
  the same goals (XP, items) but lower rewards.

### Decisions

1. **Walk-to gates.** Each destination is a place in the hub you walk into. **[user]**
2. **The Spire sits at the back (north) of the hub**: obviously a dungeon entrance with a
   spire-like tower. To save tokens and design space it is mostly off-screen: we see the
   front face and lower floors/levels only. **[user]** Built as one baked prop at the hub's
   north edge, authored in code (ADR-0020/0021). **[charter default]**
3. **Forest gate:** a trail mouth off the hub's **west** edge. **Meadows gate:** a road off
   the **east** edge. Each with a signpost. Directions **[user]**; trail mouth / road /
   signpost **[charter default]**.
4. **Spire gate opens the existing Gather / Go alone panel unchanged.** Queue, solo start,
   leave-queue and the queued state behave exactly as today; only the trigger moves from the
   Warden to the gate. **[charter default]**
5. **Gate entry is server-validated by proximity to the gate**, the same check the
   Warden / delve NPC has today, moved to the gate. **[charter default]** (server decision;
   game-service is human lane.)
6. **Field gates switch worlds** (Meadows, Forest): a local world switch on the same pod, no
   queue, no handoff. Detail and rules live in FS-X2F2H and ADR-0030.
7. **The Warden keeps lore dialogue and loses every queue option**: storyteller only.
   **[user]**; exact behaviour **[charter default]**.

### Rejected

- **A single device (waystone / map table) listing destinations.** The user chose walk-to
  gates: the hub itself is the map.

### Constraints referenced

- FS-K2HKP is the user's hand-coded matchmaker: **out of bounds**. Never edit
  `internal/matchmaker`, `internal/match_queue` or their wiring. Moving the trigger must not
  need a matchmaker change; the gate drives the same messages the Warden panel sends today.
- FS-NSV3D solo start and FS-G4VMQ leave-queue are reused as they are.
- Art: design guideline Part I; baked and authored in code (ADR-0020, ADR-0021).

### Open (not settled)

- Exact hub map edits for the three gate approaches.
- Whether the hub map needs widening to fit the gates and the Spire's front face.

### Parked (out of scope)

- Spire party bonus (more XP / drops when queued with friends): party formation does not
  exist yet (checked 2026-10-29: no party / invite work by anyone).
- Party formation; join a friend's channel; chained zones ("we'll add chained zones into
  different places later", user).
- Renaming backend "delver" identifiers.

### Vocabulary

- "Delver" was retired 2026-10-29 for "player" (client copy). "Delve" stays the Spire's own
  word; a field visit is not a delve. New terms (Gate) go to the CONTEXT.md files.
