---
id: I-29KSH-9
status: done
implements: FS-29KSH
blocked_by: [I-29KSH-2]
labels: [blocked]
title: "FS-29KSH slice 9: hub occupancy cap"
---
Implements FS-29KSH §Requirements 31-33

**Author: agent**

## What to Build

A ceiling on how many players the hub holds at once, refused at the door.

- The hub enforces an **occupancy cap** on concurrent occupants.
- When full, entry is refused **before the player reaches it**: pressing start returns a refusal
  with a message and the player stays in the main menu. **No admission queue and no waiting
  screen** — deliberately, since the one queue that already exists still has no working exit
  (`leave_queue`, out of scope).
- The cap is a **hub-door check, not a WebSocket connection limit**. Connections are not refused
  at the handshake.
- **Players inside a run do not count** toward it, and a returning player is never refused entry
  to the hub — the return path must not be gated by the cap.
- The check is server-side. A client cannot talk its way past it.

Related but distinct, and worth keeping straight (`game-service/CONTEXT.md`): the **occupancy
cap** is this door check; the **concurrency ceiling** is the whole-deployment limit of 50 that
ADR-0015's single-process decision rests on. Raising the ceiling reopens an ADR; raising the cap
does not.

## Acceptance Criteria

- [x] With the hub at its cap, a further player pressing start receives a refusal and stays in
      the main menu.
- [x] The refusal carries a message the client can display.
- [x] A player inside a run does not count toward the cap.
- [x] A player returning from a run is admitted even when the hub is at its cap.
- [x] The cap is enforced server-side; a crafted client request cannot exceed it.
- [x] Connections are not refused at the WebSocket handshake.
- [x] Two players contesting the last slot: one is admitted, one is refused.
- [x] **Revised, as in the earlier slices:** no new test failures, no new lint findings versus
      the branch point. Lint held at 34.

## Blocked By

I-29KSH-2 — the hub must exist to be capped.

## Spec Reference

FS-29KSH §Requirements 31-33; §Edge States (Full — both rows). Constraint: ADR-0015 — the
50-player concurrency ceiling is what the single-process decision depends on. §Rejected
alternatives: an admission queue for a full hub.

## TDD Approach

- RED: fill the hub to its cap, then assert the next entry attempt is refused rather than
  admitted.
- GREEN: door check.
- RED: with the hub at cap, resolve a run and assert its players are readmitted.
