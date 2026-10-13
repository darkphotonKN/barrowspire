---
id: I-K2HKP-4
status: open
implements: FS-K2HKP
blocked_by: []
labels: [ready-for-agent]
title: "FS-K2HKP slice 4: Client follows a handoff to the host server"
---
Implements FS-K2HKP §Requirements (Client R29–R31), §Acceptance Criteria (Client)

## What to Build

**Agent lane (game-client).** The client half of the handoff. The contract below is fixed by
the FS, so this can be built and unit-tested against it alone. End-to-end verification across
two replicas waits on I-K2HKP-3. The server is not touched.

The contract (FS-K2HKP R21–R24, R29–R31):
- Server → client: `{action: "world_handoff", payload: {addr, run_id}}`.
- New socket: `{addr}?token=<jwt>&run=<run_id>`. The host checks the JWT's member against the
  run's expected players. There is no character param, because the host already has the character
  from the queue entry.
- Refusal: the host closes the new socket with **4002**.
- Success: the new socket is accepted. Later the host sends `world_entered` (run), which the
  existing single transition point already handles.

Behavior:
- On `world_handoff`, from the single world-transition point (ADR-0015 clause 4), **make
  before break**:
  1. Open the new socket alongside the current one. `SocketManager.connect` refuses a second
     socket today, so this needs a separate path.
  2. Only once the new socket is accepted: detach the old socket's close handling, so its close
     isn't treated as a disconnect or auth failure. Then close the old socket with a normal
     closure (1000) and make the new socket the active one.
  3. Hold the existing transition while the run is entered.
- A `world_handoff` for a run the client is already moving to is ignored.
- On 4002, or any failure before the new socket opens: drop the new socket, keep the old one,
  stay in the HUB world, and tell the player the delve couldn't be joined. If the old socket is
  already gone, reconnect to the original address and enter the HUB world.
- **Remember the current server address.** After a handoff, a reconnect must go to the host it
  moved to. Today these are hardcoded to `ws://localhost:5668/game/ws`:
  - `BootScene.ts:62`
  - `BarrowspireScene.ts:2848`
  - `GameScene.ts:50`
- The main menu's cancel sends only `leave_queue`, and no longer `find_game {cancel: true}`
  (`MainMenuScene.ts:900-901`).

## Acceptance Criteria

- [ ] `world_handoff` opens a socket to `addr` with the token and run id, and closes the old socket
      (1000) only after the new one is accepted, from the single transition point.
- [ ] A duplicate `world_handoff` for the same run is ignored.
- [ ] A 4002 refusal, or a failure before the new socket opens, leaves the player in the HUB
      world on the old socket. If the old socket is gone, they reconnect to their original
      address.
- [ ] The old socket's close during a handoff triggers neither the disconnected status nor the
      auth-error redirect.
- [ ] After a handoff, reconnects go to the host's address, not a hardcoded one.
- [ ] Main-menu cancel sends only `leave_queue`.
- [ ] Tests pass.

## Blocked By

None. Built against the FS contract. End-to-end verification needs I-K2HKP-3.

## Spec Reference

FS-K2HKP §Requirements 29–31 (contract from R21–R24), §Acceptance Criteria (Client),
§Edge States (host crash before arrival, arrival after release), User Stories 2, 10, 23.

## TDD Approach

- RED: a `world_handoff` while connected opens a second socket and keeps the first open until
  the second reports open.
- GREEN: a handoff path in `SocketManager` that holds a pending socket and swaps on open.
