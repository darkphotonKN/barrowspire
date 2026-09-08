---
id: I-0052
status: open
implements: FS-0008
blocked_by: [I-0046]
labels: [blocked]
title: "FS-0008 slice 8: ambient NPCs"
---
Implements FS-0008 §Requirements 10-14

**Author: agent**

## What to Build

Residents, so the hub feels inhabited rather than staged.

- **Server-authoritative and broadcast per tick**, so every player sees the same NPC in the same
  place. Client-side ambient NPCs were considered and rejected (FS-0008 §Rejected alternatives):
  free on the server, but each client would see its own residents in its own places, and it
  would close the door on ambient NPCs gaining function later.
- **Random walk within an assigned region.** Each is given an area in the map data, picks a
  destination inside it, walks there, pauses, picks another. Chosen over fixed patrol paths
  (mechanical, one hand-drawn route per NPC) and over mostly-idle twitching (cheapest, but the
  place stops feeling lived in).
- **Same collision path as players** — walls, buildings, each other, and players.
- **Wedge escape, required not optional.** An NPC unable to make progress toward its destination
  for a bounded number of ticks abandons it and picks another. Random walk against hard
  collision otherwise corners them permanently; this is the classic failure of this approach and
  the reason the requirement exists.
- **Interactable, with one throwaway line.** No function, no UI, no per-player state. Both NPC
  kinds respond to interaction, so a player never has to guess whether an NPC is broken.

Use the ECS `NPC` type tag (already declared, currently unused), same as function NPCs.

Cost accepted: the hub broadcast carries `N players + M ambient NPCs` per tick rather than
`N players`.

**Decide and proceed** (marked AFK deliberately): NPC count, their wander regions, and the
throwaway lines. Keep counts modest — the hub broadcast is the only one in the system doing N
per-player formats per tick.

## Acceptance Criteria

- [ ] Ambient NPCs move; two different clients observe the same NPC at the same position at the
      same time.
- [ ] An ambient NPC is stopped by walls, buildings, players and other NPCs.
- [ ] An ambient NPC placed against a corner does not remain stuck there indefinitely.
- [ ] An ambient NPC stays inside its assigned region.
- [ ] Interacting with an ambient NPC returns a line and opens nothing.
- [ ] Function NPCs remain at fixed positions and are not affected.
- [ ] `go test ./...` passes and `golangci-lint run` is clean.

## Blocked By

I-0046 — the hub world and its broadcast must exist.

## Spec Reference

FS-0008 §Requirements 10-14; §Design decisions D6; §Rejected alternatives (client-side ambient
NPCs, fixed patrol paths, mostly-idle ambient NPCs). Vocabulary: `game-service/CONTEXT.md` —
**Ambient NPC** vs **Function NPC**.

## TDD Approach

- RED: place an ambient NPC in a corner with its destination beyond the wall; tick N times and
  assert its destination changed. Today it would still be pushing at the wall.
- GREEN: wedge detection and re-target.
- RED: tick the world and assert the NPC's position never leaves its assigned region.
