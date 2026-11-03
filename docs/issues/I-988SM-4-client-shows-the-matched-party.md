---
id: I-988SM-4
status: open
implements: FS-988SM
blocked_by: [I-988SM-2, I-988SM-3]
labels: [ready-for-agent]
title: "FS-988SM slice 4: the client shows the matched party, lets it go, and clears the queue on a cancelled match (game-client)"
---
Implements FS-988SM §Requirements R20, R23, R24

## What to Build

- **Verify, don't build (R23).** With slices 1–3 in, two browsers queue with *Wait for company*:
  the party frames show both on entering the Spire; party chat works; each player's frames clear
  as they leave the run; the last one out sees the party go. `partyStore.apply` already lets the
  party go on an update that no longer lists this player or reads `dissolved`.
- **Only if a gap shows**, add text (a system line), no new state or message handling.
- Party chat's join and leave lines appear from the updates as today (R20, FS-XGW7H).
- **A cancelled match clears the queue panel (R24; added 2026-11-03, charter default C).** On the
  `find_game` refusal "The match failed. Queue again." that arrives after `queue_status`, the corner
  queue panel and the door's queued line return to not queued, and *Wait for company* can be pressed
  again. Check today's client first (SocketManager / the hub's queue state on a `find_game` error).
  If it already clears, nothing to build. If not, make the smallest change that clears the queued
  state on that refusal; it is the one client change this slice may make beyond text.

## Acceptance Criteria

- [ ] Two matched players see each other in the party frames during the run and can use party chat.
- [ ] With the two browsers on different pods (if available), the player who arrives by handoff sees the party on entering, without any extra `joined`. *(Added 2026-11-03.)*
- [ ] A player who dies and leaves sees their frames clear in town; the other still sees the party, now one member.
- [ ] The last player out sees the party end; both can queue again at once.
- [ ] After a cancelled match (one player already in a party), both browsers show the refusal, the queue panel shows not queued, and *Wait for company* can be pressed again. *(Added 2026-11-03, R24.)*
- [ ] No client code changes beyond text and, only if needed, the queue-panel reset on that refusal; client tests pass.

## Blocked By

I-988SM-2, I-988SM-3

## Spec Reference

FS-988SM §Requirements R20, R23, R24; User Stories 1–4, 21; Acceptance Criteria (frames, leaving, the cancel's queue-panel reset).

## TDD Approach

- Manual two-browser check (HITL). If text is added: a partyStore unit test for the line.
- If the queue-panel reset needs code: RED — a client unit test where a `find_game` refusal after `queue_status` leaves the panel queued; GREEN — clear it.
