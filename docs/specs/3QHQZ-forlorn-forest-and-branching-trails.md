# FS-3QHQZ: Forlorn Forest and branching-trail generation

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Field worlds" (Forlorn Forest look and creatures); `game-server/game-service/SPECIFICATION.md` "### Field worlds" (branching-trail level generation · Forlorn Forest) → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (fields are per-replica channels), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) · Builds on: [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (field world kind, death, kill credit, loot, balance; all field rules live there) · Related: [FS-0XMCP](0XMCP-hub-destination-gates.md) (the west gate), [FS-F6F88](F6F88-multi-floor-delves.md) (the tower's fixed-square floors this contrasts with), [FS-Q14EV](Q14EV-expanded-baked-enemy-roster.md) (Spire roster), [FS-77AB6](77AB6-monsters-and-combat.md) (elites), [FS-8RBQY](8RBQY-tower-interior-run-look.md) (exterior theme)

## Scoping notes (raw)

### How this arrived

Scoped 2026-10-29 with the user, locked under a charter, together with FS-0XMCP and
FS-X2F2H. Items marked **[user]** were the user's own call; **[charter default]** were
proposed by the agent and approved by the user wholesale (not individually discussed).
Server items are human lane. Field-wide rules (shared per pod, costless death, kill credit,
killer-first loot, stat × 0.75, drop factor 0.5, level band 4–9, 45 s respawn) are in
FS-X2F2H and not repeated here.

### The place

1. **West of the hub. A little gloomy but not so dark; forest vibes. A trail to follow that
   branches randomly**, unlike the tower's fixed-square floors (FS-F6F88). **[user]**
2. **One big zone, same theme throughout, not massive**: larger than both the village (hub)
   and a single tower floor. **[user]** About **2× a tower floor's area**. **[charter
   default]**

### The generator

3. **This branching generator is the BASELINE for randomly generating level shapes in
   future.** **[user]** So it is built as a **reusable module**, not forest-specific code.
   **[charter default]**
4. **Seeded branching random walk**: a main trail plus side branches; a **clearing at each
   dead end** holding an elite or a container. **[charter default]** (server)
5. **Generated once at pod boot with a random seed, kept for the pod's life, never
   regenerated under players.** **[charter default]** (server) Each pod's channel therefore
   has its own layout (ADR-0030).

### Enemies

6. **Darker types: zombies by default, unless the tower already has zombies, then
   skeletons.** **[user]** Checked 2026-10-29: the Spire roster is ghoul, troll, demon (plus
   FS-Q14EV's spec'd wraith, revenant, gravehound); **no zombies**, so **zombie** is the
   default enemy.
7. **Ghost too, but rarer. "Nothing more."** **[user]** Ghost ≈ **1 in 12 spawns, faster and
   frailer**. **[charter default]**
8. **Elites harder than normals** (FS-X2F2H rule 16: Spire elite multipliers on top of the
   field's × 0.75). **[user]**

### Look

9. **Dim ambient, mist, dead and live trees**, on the exterior theme's ground family
   (FS-8RBQY). Art built in code and baked (ADR-0020/0021, design guideline Part I).
   **[charter default]**

### Rejected

- **Chained zones** (outer / deep / heart): deferred; user: "we'll add chained zones into
  different places later".
- **One big zone fixed per deploy or a daily seed**: not needed now; per-pod boot seed is
  enough.

### Open (not settled)

- None specific to the forest beyond FS-X2F2H's (empty-field sleep).

### Parked (out of scope)

- Chained zones; more enemy types; regenerating the forest on a schedule.
- Join a friend's channel (friends on different pods walk different forests until then).
