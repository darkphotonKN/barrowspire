# ADR-0063 — Fog of war is client presentation: region-based, shared by the party, never a visibility or anti-cheat rule

Status: accepted
Date: 2026-11-06
Scope: `game-client` on dungeon floors (floor 1 today). The server is not involved.
Specified by [FS-SRA9J](../specs/SRA9J-fog-of-war-and-minimap.md).
Amends: none. The indoor blackout's rule ("a view rule, never a visibility rule", `CONTEXT.md`
"Indoor blackout", FS-9PN7X) and the light source's ("no effect on what anyone can see or hit")
stand; this ADR applies the same stance to fog.
Related: [ADR-0060](0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md)
Decision 7 (interest is not visibility), [ADR-0061](0061-floor-layout-conventions-later-floors-follow.md)
Decisions 5 and 12 (regions; fog as a per-floor opt-in).

## Context

Decided in the charter Nick approved on 2026-11-06 ("核准"), decisions B1–B5, with his later
constraint "floor 1 only". Recorded without adversarial review: no `challenge-me` pass.

Forces:

- **The server already sends more than the fog shows.** Interest (ADR-0060) cuts by distance only
  (1600 px), so explored and unexplored rooms within range arrive in every snapshot.
- **A server-side cut by what a player may see** would need line of sight or region visibility on
  the server, per recipient, per tick, and the client would have to cope with monsters appearing
  from nowhere. The charter put anti-cheat and server-side fog out of scope.
- **The floor map gives the client regions** (rooms and corridor segments), so the client can tell
  which region any position is in without new wire fields.
- **Party positions are always sent**, so every client can compute the same exploration.
- **The repo has kept light and blackout presentation-only** on purpose.

## Decision

1. **Fog is drawn by the client from the floor map's regions** and the party's positions; the
   server knows nothing of it and sends nothing for it.
2. **Region-based, three states**: unexplored (black), explored (dim, no monsters), visible (a
   living member is in it). Monsters also show within 400 px of a living member.
3. **Shared by the party**: every client derives exploration from every member's position, so all
   members see the same map without any message between them.
4. **Not stored** (v1): a reconnect or a fresh scene starts exploration over.
5. **Not a visibility rule and not anti-cheat.** A modified client can see everything the server
   sends. Hiding information from such a client is a server-side decision, tied to interest
   management, and needs its own ADR.
6. **Lighting stays presentation-only**; fog decides which light sources are drawn, never what can
   be hit.
7. **Per-floor**: fog applies on floors whose map carries regions; other floors and worlds have
   none (ADR-0061 Decision 12).

## Consequences

- No server or wire change for fog; it can be tuned (radius, dim share) in the client alone.
- A cheating client sees monsters in unexplored rooms within 1600 px; accepted until server-side
  fog is decided.
- Exploration is lost on reconnect; storing it (server or browser) is a later choice.
- Server-side fog, if it comes, would extend ADR-0060's interest cut with a region test and would
  supersede Decision 5 here, not Decisions 1–4.
- Anything that wants to act on exploration (a quest "find the stairs", an achievement) cannot
  rely on it, since it is the client's alone.
