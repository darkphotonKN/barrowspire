---
id: I-R82NV-1
status: done
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

- [x] Two players on one pod: invite → prompt message delivered → accept → both receive `party_update` with two members, leader marked.
- [x] Decline notices `declined`; an unanswered invite notices `expired` at 60 s (clock injected).
- [x] Each refusal code fires in R12's order (table-driven).
- [x] An invite from a non-leader member is refused `not_leader`; from a queued player or to a queued accepter, `queued`.
- [x] Both Redis pointers appear on join with a TTL and vanish when the party ends (miniredis).
- [x] `PARTY_SIZE` feeds both caps; an invalid value fails startup with a clear error.
- [ ] `go test ./... -race` on touched packages green. — party packages green under `-race`; the whole `internal/gameserver` package fails under `-race` on clean HEAD too (pre-existing, see notes)

## Blocked By

None

## Spec Reference

FS-R82NV §Requirements R1–R6, R8, R11–R17 (same pod), R21, R25; §User Stories 1, 3, 5, 7, 8, 18, 20, 21; §Edge States (concurrent accepts, unauthorized, name case).

## TDD Approach

- RED: a hub test where player A sends `party_invite` naming B on the same pod and B receives a `party_invite` message with an invite id.
- GREEN: the party state, the action case in the hub, and same-pod lookup.

## Implementation notes (agreed with Nick, 2026-11-01)

- **`already_in_party` reads the roster's memory**, not the Redis pointer: on one pod the two
  agree, and the pointer write is queued, so it can lag a join. Slice 3 adds the Redis read for
  cross-pod targets (and should check `pod:alive` beside it).
- **`pod_full` never fires for a same-pod target**: they already hold a hub seat on the party
  pod. The code exists; its table row lands in slice 3.
- **Refusal order** for an invite: the sender's own standing first (`not_in_hub` → `not_leader`
  → `queued`), then R12's list. Accept follows R16: `not_in_hub` → `already_in_party` → `queued`.
- **A party ends in this slice only by graceful shutdown** (R5): every member gets a final
  `party_update` `dissolved`, and the pointers are deleted on the hub loop as it exits, before
  `Server.PartiesDissolved()` closes; `SetupRouter`'s shutdown waits on it. No test-only
  `removeMember`; the last-member-leaves path arrives with `party_leave` in slice 2.
- **On `ctx.Done()` the hub loop dissolves the parties once and keeps routing** through the
  shutdown drain (readers still send to it, runs are still in play); party actions are ignored
  from then on. The shutdown delete waits for the pointer writer to stop first.
- **Voided invites notice their inviter** `already_in_party` (with the target's name) when the
  target joins another party: not in the FS, chosen for user story 7.
- **`PARTY_SIZE` accepts 2–4**; unset is 2; anything else stops startup.
- **An invite is delivered first and kept after.** If the send fails (target gone, writer
  queue full), the inviter gets `delivery_failed` (R10's code, used on this pod too), and no
  party forms and no place is held.
- **The party of one is announced**: the first delivered invite sends the new leader a
  `party_update` (`joined`, subject = leader), per R21 "every change".
- **`size` on `party_update` is the party's cap (`PARTY_SIZE`), not its count**, and
  `party_invite` carries it too, so the client can render R32's "(<n>/<size>)". The count is
  `len(members)` / `member_count`. This adds a field to R13's payload and fixes R21's ambiguity.
- **Refusals about the target carry `name`** for R36's copy: `not_found` the name as typed
  (trimmed), `already_in_party` / `pending` the target's character name.
- A second accept of an invite voided by joining another party is ignored (the invite is gone,
  R14/R17), not answered `already_in_party` as the Edge State reads; the client closes the
  prompt on the `party_update` anyway.
- Left as is: `defaultPartySize` lives in both `config` (env default) and `gameserver` (the
  default for a pod built without the option); `HubSeatedPlayer` matches a name or an id, as R12
  asks; no settings field on `party` until FS-V780R adds the loot rule.
- Pre-existing: the `internal/gameserver` package fails under `-race` on clean HEAD too
  (`serializer.SerializeBackendState` race; load-sensitive timeouts). Party tests pass under
  `-race` in isolation.
