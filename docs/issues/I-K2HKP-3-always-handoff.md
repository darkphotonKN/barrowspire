---
id: I-K2HKP-3
status: open
implements: FS-K2HKP
blocked_by: [I-K2HKP-2]
labels: []
title: "FS-K2HKP slice 3: Always hand off into the run"
---
Implements FS-K2HKP §Requirements (Allocation and handoff, Seat timeout, Return to the HUB world, Client)

## What to Build

**Human lane: Kranti builds this, pairing with an agent for decisions and correctness.**

One feature block: **a published match turns into a running delve.** The host pod builds the
run with reserved seats; every matched player's pod sends them `world_handoff`; each client
reconnects to the host with its ticket and drops the old socket; the run starts when every seat
is filled, or aborts after 15s and re-queues whoever arrived. Returning to the HUB world after
the run stays a plain world switch on the host pod.

The flow, end to end:
match message received → host builds run with seats → `world_handoff {addr, ticket}` to every
matched player (same-pod ones too) → client opens new socket `?token=…&ticket=…` → `GETDEL`
ticket, check player + run → seat filled → all seats → run ticks → (or) seat timeout → tear down,
world switch arrived players to the host's HUB world, re-queue at head.

Includes the small client piece: handle `world_handoff` in the single world-transition point,
fall back to the original address on failure, and stop the main menu's cancel from sending
`find_game {cancel: true}`.

Details in the FS §Requirements 16–31 and §Edge States.

## Done when

- On one replica with default env, a match runs end to end through the handoff.
- On two replicas, players from both end up in one run on the host pod.
- A ticket works once; bad tickets are refused at the handshake.
- A missing player aborts the run after 15s; the other is back in the HUB world, told why, and
  at the head of the queue.
- Run resolution returns players to the host's HUB world with no reconnect.
- Tests cover ticket use/reuse/expiry and the seat timeout with miniredis's clock.

## Blocked By

I-K2HKP-2 (global queue and matcher)

## Spec Reference

FS-K2HKP §Requirements 16–31, §Edge States (host crash, source crash, disconnect before
handoff, lost pub/sub message, ticket replay), User Stories 2, 4, 8, 10, 11, 15–17. Supersedes
FS-29KSH R20–R21 for hub → run.
