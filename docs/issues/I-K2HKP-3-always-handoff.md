---
id: I-K2HKP-3
status: open
implements: FS-K2HKP
blocked_by: [I-K2HKP-2]
labels: []
title: "FS-K2HKP slice 3: Hand off into the run"
---
Implements FS-K2HKP §Requirements (Allocation and handoff, Seat timeout, Return to the HUB world, Client)

## What to Build

**Human lane: Kranti builds this, pairing with an agent for decisions and correctness.**

One feature block: **a published match turns into a running delve.** The host pod reserves a
seat per player in a pending run, then tells the other pods to send their players over. Players
on other pods reconnect to the host with the JWT they already have, plus the run id and their
character id; players already on the host are seated without a reconnect. The run is built and
starts when every seat is filled, or the pending run aborts after 15s and re-queues whoever was
seated. Returning to the HUB world after the run stays a plain world switch on the host pod.
No handoff tickets: JWT identity plus the reserved seat is the check.

The flow, end to end:
match received on the host's channel → host creates the pending run (seats keyed by player id,
15s timer), seating its own players from their player records → host publishes a handoff
`{runID, hostAddr, playerIDs}` on each other pod's channel → that pod sends its listed players
`world_handoff {addr, runID}` → client opens a new socket `?token=…&run=…&character=…` → host
checks the member holds an unfilled seat, loads the character from character-service for that
member, fills the seat (or refuses with `4002`) → client closes the old socket (normal closure)
→ all seats filled → build the run from the seated characters, `world_entered` to everyone,
run ticks → (or) seat timeout → discard the pending run, world switch arrived players to the
host's HUB world, re-queue every seated player at the head, tell them.

Includes the small client piece: handle `world_handoff` in the single world-transition point
(connect with token, run id, character id; close the old socket once accepted), stay on or fall
back to the original address on refusal or failure, and stop the main menu's cancel from sending
`find_game {cancel: true}`.

Details in the FS §Requirements 16–31 and §Edge States.

## Done when

- On one replica with default env, a match runs end to end with no handoff (both players on the
  host).
- On two replicas, players from both end up in one run on the host pod, each playing the
  character they entered the HUB world with.
- The handoff is only published after the host reserved the seats; only players on other pods
  get `world_handoff`.
- A handoff connection with no unfilled seat for that member, or a character that can't be
  loaded for them, is refused with `4002` and the client stays in the HUB world.
- A missing player aborts the run after 15s; the others are back in the HUB world, told why, and
  at the head of the queue.
- Run resolution returns players to the host's HUB world with no reconnect.
- Tests cover seat filling, refusal, and the seat timeout (miniredis clock where Redis is
  involved).

## Blocked By

I-K2HKP-2 (global queue and matcher)

## Spec Reference

FS-K2HKP §Requirements 16–31, §Edge States (host crash, host never receives the match, source
crash, disconnect before handoff, lost handoff message, someone else takes a seat, double
connect), User Stories 2, 4, 8, 10, 11, 15–17, 19, 20. Supersedes FS-29KSH R20–R21 for hub → run.
