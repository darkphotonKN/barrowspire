# ADR-0030 — Field worlds are per-replica channels, entered by a local world switch, never handed off

Status: accepted
Date: 2026-10-29
Scope: `game-server/game-service`, `game-client`
Realized by: [FS-X2F2H](../specs/X2F2H-field-worlds-and-gentle-meadows.md) (field worlds and
Gentle Meadows), [FS-3QHQZ](../specs/3QHQZ-forlorn-forest-and-branching-trails.md) (Forlorn
Forest); entered from [FS-0XMCP](../specs/0XMCP-hub-destination-gates.md)'s hub gates
Builds on: [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one process and
one client connection per pod, a per-pod player ceiling)

## Context

Decided by the user on 2026-10-29 while scoping hub destination gates and the first field
worlds. The choice between the two shapes below was the user's own; the details in the
Decision (one of each field per pod, created at boot) were charter defaults the user approved
wholesale. Recorded without adversarial review of those defaults.

The hub is becoming the map: players walk to a gate and go somewhere. The Spire stays the
queued, instanced, party-sized escape run (FS-K2HKP, FS-NSV3D). The new places, Gentle Meadows
and the Forlorn Forest, are **field worlds**: shared like the hub ("a real game world"), with
monsters and loot, and with **no queue**. Anyone walks in.

game-service already runs as several replicas. The hub spans them by syncing **players only**
through Redis pub/sub (FS-JEAVX): each replica simulates its own connections and merges a thin
slice of everyone else's state. NPCs are local to each replica. Nothing in that model shares
monsters, combat or loot rolls across pods, and it cannot without a cross-pod authority for
every hit and every pile: a field's simulation has to live whole on one pod.

That leaves two shapes:

1. **Zone server.** One owner pod per field. Entering hands the client off to that pod through
   K2HKP's handoff, the way a matched party reaches its run. Everyone in a field sees the same
   field.
2. **Channels.** Every pod runs its own copy of each field. Entering is a switch between worlds
   in the process the client is already connected to.

The user rejected the zone server: "game worlds being horizontally hosted and scaled based on
pods is fine, just like MMOs having servers." The zone server would also lean on K2HKP's
matchmaker and handoff, which is the user's hand-coded work and out of bounds for this feature.

## Decision

**A field world is a per-replica channel.** Each game-service pod creates one Gentle Meadows and
one Forlorn Forest at boot and keeps them for the pod's life, always on, like the hub.

**A player enters and leaves a field by a local world switch on the pod they are connected to,
never by a handoff.** Walking into a field gate in the hub moves the player from that pod's hub
world to that pod's field world; walking back out of the field's entrance gate moves them back.
The client keeps its one connection (ADR-0015).

## Consequences

- **Friends on different pods see different fields.** Two players who meet in the shared hub
  can walk through the same gate and land in different Meadows or Forests. Accepted for now. The
  fix is "join a friend's channel", parked with party formation, which does not exist yet.
- **Fields never publish to Redis.** Like run worlds (FS-JEAVX R10), a field's state stays on its
  pod. Only the hub publishes.
- **No dependency on K2HKP.** Entering a field touches neither the matchmaker, the match queue
  nor the handoff. To keep it that way, entering a field while queued for the Spire is refused,
  as solo start is (FS-NSV3D), rather than teaching the matchmaker about fields.
- **Fits ADR-0015's ceiling.** A field is one more world in the pod's one process. The per-pod
  player ceiling bounds the fields too; there is no separate field occupancy cap.
- **Each channel is its own world.** A generated field (the forest) has its own seed and layout
  per pod. Nothing promises two channels look alike.
- **A pod crash loses only what the field had not settled.** Gains settle when the player leaves
  (FS-X2F2H), so a crash costs the unsettled visit and nothing at risk, since field death costs
  nothing.
- **Idle cost.** Every pod pays to run both fields even when empty. Whether an empty field
  should sleep is left open in FS-X2F2H.
- **Reversible later.** A zone-server or join-a-friend's-channel model can supersede this once
  party formation exists; the gate and the field world kind do not depend on which pod owns the
  field.
