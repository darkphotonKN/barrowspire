---
id: I-988SM-2
status: done
implements: FS-988SM
blocked_by: [I-988SM-1]
labels: [ready-for-agent]
title: "FS-988SM slice 2: a matched member whose seat is released counts as dead and leaves the party (game-service)"
---
Implements FS-988SM §Requirements R7, R9, R11 (released seat), R13, R14, R19, R21b

**Lane: human (HITL) by default (game-server). `/develop` may run this slice under the approved
charter "單人排隊自動組隊" (Nick, 2026-11-03).**

> **Rewritten 2026-11-03 (charter override of #4).** Was "a remote matched player joins the
> matched party when seated", with a join-without-invite script. Remote players are now members
> from initialisation (I-988SM-1), so seating adds nothing. This slice handles the one who never
> arrives.

## What to Build

- **The session reports the members whose seats it released (R7).**
  `Session.releaseUnclaimedSeats` (internal/game/session.go) today clears
  `playersPendingConnection` and tells no one. It must hand the released member ids to the host
  pod, through an injected callback or interface (constructor-injected, consumer-owned, like
  `SessionCloser`), without blocking the tick and without the session knowing about parties.
- **A released member leaves the matched party (R7, R11).** The host posts a removal to the party
  registry's loop for each released member of the run's matched party (`partyRuns[run.ID]`). It
  reuses the existing remove script with reason `left` (not a voluntary `party_leave`, so the
  instance lock does not refuse it), drops them from `partyRuns`' roster, and touches only parties
  of matched origin.
- **Succession and the end (R13, R14).** The remove script's existing rules apply. In practice the
  leader is local, so not a released member, but the rule holds if one ever is. If the released
  member was the last, the party ends with `dissolved`. That can't happen while a local player is
  still in the run.
- **The run that nobody reached (FS-K2HKP R26).** When the seat release shuts an unreached run
  down, its matched party has no members left in the run; removing the released members ends it.
  If removal is skipped because the run is gone, the record's TTL ends it (R17).
- **Notices (R19).** The remaining members receive `left`. The released member is not connected
  to the host, so their update goes through the usual delivery and may be lost; the TTL and the
  reconcile cover it.
- **Failure (R9).** A Redis error is logged at Warn; the run plays on.

## Acceptance Criteria

- [ ] A remote member whose seat is released at 15 s leaves the matched party: the others receive `left`, and the released member is no longer in `partyRuns`' roster.
- [ ] A remote member seated before the release stays a member.
- [ ] A released member who connects again later lands in their pod's village with no party: no party frame, no Redis party pointer naming the matched party, and `find_game` queues them (R21b; Nick: "死亡的人在連回來後就只會在村莊 跟塔沒任何關聯了").
- [ ] A seat released in a run with a pre-formed party changes nothing about that party.
- [ ] The session's tick never waits on the party write; the session package does not import party code.
- [ ] A Redis failure on the removal is logged at Warn and the run plays normally.
- [ ] Tests pass.

## Blocked By

I-988SM-1

## Spec Reference

FS-988SM §Requirements R7, R9, R11, R13, R14, R19; User Stories 12, 12a; Acceptance Criteria rows 5, 6; Edge States "everyone remote is a no-show".

## TDD Approach

- RED: game package test — `releaseUnclaimedSeats` past the deadline reports exactly the unclaimed member ids through its injected reporter (and nothing for a seated one).
- GREEN: the reporter; then a gameserver test that a released member of a matched party is removed with `left` and the remaining member is told.

## Files Expected

- `game-server/game-service/internal/game/session.go` (seat release reports released ids; new injected dependency)
- `game-server/game-service/internal/gameserver/` (wiring the reporter; posting the removal on the party registry's loop: `party.go` / `party_matched.go`; `server.go` or wherever sessions are constructed)
- `game-server/game-service/internal/partystore/` (reuse of the existing remove; no new script expected)
- tests next to each
