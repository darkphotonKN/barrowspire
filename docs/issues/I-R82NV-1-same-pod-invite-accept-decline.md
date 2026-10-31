---
id: I-R82NV-1
status: open
implements: FS-R82NV
blocked_by: []
labels: [ready-for-agent]
title: "FS-R82NV slice 1: form a party on one pod — invite, accept, decline, party_update (game-service)"
---
Implements FS-R82NV §Requirements R1–R6, R8, R11–R17 (same-pod branch), R21, R25

**Lane: human (HITL).** game-service is hand-coded by Nick unless he authorises the agent for
this slice, as he did for chat. Discuss each choice before writing code.

## What to Build

The party exists, end to end, between two players on the **same pod**:

- Party state owned by the message hub's goroutine (like the chat relay): id, leader, ordered
  members, created at, settings slot. Behind a narrow interface the hub consumes.
- `PARTY_SIZE` env (default 2, max 4, invalid fails startup) feeds the party cap **and**
  `NewMatchmaker` in `config/routes.go` instead of the literal 2.
- Actions `party_invite {name}`, `party_accept {invite_id}`, `party_decline {invite_id}`.
  A target is looked up among **this pod's hub-seated players** by case-insensitive name or
  player UUID (the presence index arrives in slice 3).
- First invite by a party-less player creates a party of one with them as leader (R4).
- Refusals as `party_notice {code, …}` in R12's order: `party_full`, `self`, `not_found`,
  `already_in_party`, `pod_full`, `pending`; plus `not_leader`, `not_in_hub`, `queued`.
- Pending invites on the party pod, 60 s expiry → `expired` to the inviter.
- Accept on the same pod adds the member at once; decline → `declined`.
- Redis pointers `party:<id>` → pod id and `player:<id>:party` → party id, TTL 30 s, refreshed
  every 10 s, deleted when the party ends (last member gone).
- `party_update` to every member on every change (R21 shape; `where` is `hub` for now).
- New constants in `common/constants/game.go` (actions, notice codes). No invite text in logs.

## Acceptance Criteria

- [ ] Two players on one pod: invite → prompt message delivered → accept → both receive `party_update` with two members, leader marked.
- [ ] Decline notices `declined`; an unanswered invite notices `expired` at 60 s (clock injected).
- [ ] Each refusal code fires in R12's order (table-driven).
- [ ] An invite from a non-leader member is refused `not_leader`; from a queued player or to a queued accepter, `queued`.
- [ ] Both Redis pointers appear on join with a TTL and vanish when the party ends (miniredis).
- [ ] `PARTY_SIZE` feeds both caps; an invalid value fails startup with a clear error.
- [ ] `go test ./... -race` on touched packages green.

## Blocked By

None

## Spec Reference

FS-R82NV §Requirements R1–R6, R8, R11–R17 (same pod), R21, R25; §User Stories 1, 3, 5, 7, 8, 18, 20, 21; §Edge States (concurrent accepts, unauthorized, name case).

## TDD Approach

- RED: a hub test where player A sends `party_invite` naming B on the same pod and B receives a `party_invite` message with an invite id.
- GREEN: the party state, the action case in the hub, and same-pod lookup.
