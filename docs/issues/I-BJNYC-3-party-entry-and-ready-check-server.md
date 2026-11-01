---
id: I-BJNYC-3
status: open
implements: FS-BJNYC
blocked_by: [I-BJNYC-1]
labels: [ready-for-agent]
title: "FS-BJNYC slice 3: party_enter, the 15 s ready check and one run for the whole party; start_solo refused for party members (game-service)"
---
Implements FS-BJNYC §Requirements R2–R15, R18

**Lane: human (HITL) — authorised by charter 2026-11-02.** `/develop` may run this slice.
Charter default 2 (refuse `start_solo` for party members) ships **in this slice**, never before:
without party entry a party could not delve at all.

## What to Build

- **Wire.** New actions in `common/constants`: inbound `party_enter` (no payload) and
  `party_ready` `{check_id, accept}`; outbound `party_ready_check`
  `{check_id, leader_id, expires_in_ms, members: [{player_id, name, state}], outcome, reason?, names?}`
  (`state`: `waiting|accepted|declined`; `outcome`: `open|started|cancelled`; `reason`:
  `declined|timeout|left|disconnected|changed|failed`). New `party_notice` codes `checking`,
  `not_at_gate`, `not_in_town` (with names). Routed by the hub to the party registry.
- **`start_solo` refusal (R2).** A party member's `start_solo` is refused "Your party enters
  together." at the same place in its guard order as `find_game`'s (I-BJNYC-1).
- **`party_enter` (R3–R6).** Party read from Redis **off the loop**, decided **on the loop**
  (`party_travel.go`'s pattern). Refusals in R5's order: `not_member`, `not_leader`, `locked`
  (seam; really answered by I-BJNYC-6), `checking`, `not_at_gate` (`AtSpireGate`), `not_in_town`
  naming every member not seated in this pod's hub world, in join order; `unavailable` for Redis.
  No-character / already-delving leader answered as `start_solo` answers them.
- **Ready check (R7–R12).** One open check per party, in pod memory: id, roster, 15 s deadline, the
  leader `accepted` at open, others `waiting`. `party_ready_check` to every member of the check at
  open, after every answer, and at start/cancel. `party_ready` from a waiting member records the
  answer; stale / foreign / repeated answers ignored. Cancelled (every member told) on: decline;
  15 s timeout (the registry's tick); a member, leader included, leaving the town or disconnecting;
  any membership or leader change while open. Leaving the gate zone within the town does not cancel.
- **Start (R11, R13, R14).** All accepted → every member's gear read off the loop (`checkGear`'s
  read) with a fresh Redis read of the party; on the loop, build only if the roster is unchanged and
  everyone is still in the town, else cancel (`changed` / `left` / `disconnected`); unreadable gear
  → `failed` naming them; Redis down or build failure → `failed`, no names.
  `CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: members})`, each member sent
  `world_entered`. The pod records the run's party and roster (pod memory only; **no change to the
  party's Redis structure**).
- **Party of one (R3).** Completes at once: no wait, the run starts.
- **After the run (R18).** The party is untouched and every member is back in this pod's town by
  the existing hub return; verify, build nothing new unless it fails.

## Acceptance Criteria

- [ ] `start_solo` from a party member is refused "Your party enters together.", same guard position as `find_game`; a player in no party descends alone as before.
- [ ] `party_enter` refusals fire in R5's order under a table-driven test (`not_member`, `not_leader`, `checking`, `not_at_gate`, `not_in_town` with every absent member named in join order, `unavailable`); a member on another pod, in a field, in a run, away or disconnected counts as not in the town.
- [ ] The party is read off the loop; decisions are on the loop; no Redis call on the loop.
- [ ] A passing `party_enter` sends every member, leader included, `party_ready_check` `outcome: open`, leader `accepted`, others `waiting`, `expires_in_ms` ≈ 15 000.
- [ ] Each answer is pushed to every member; stale, foreign and repeated answers are ignored.
- [ ] Decline, timeout, leaving the town, disconnecting and a membership/leader change each cancel with the right `reason` and names; the leader stepping off the gate zone within the town does not.
- [ ] All accepted: one run built with every member seated together, each sent `world_entered`; unreadable gear cancels `failed` naming the member; Redis down at the re-read cancels `failed`, no names; nobody leaves the town on any cancel.
- [ ] A party of just the leader enters at once on `party_enter`.
- [ ] A second `party_enter` during an open check is refused `checking`.
- [ ] When the run ends the party is unchanged in Redis and every member is in this pod's town.
- [ ] `partystore` keys and scripts unchanged.
- [ ] `go test ./... -race` on the touched packages green; lint fence passes.

## Blocked By

I-BJNYC-1 (the party-membership query and the guard position this slice reuses for `start_solo`).

## Spec Reference

FS-BJNYC §Requirements R2–R15, R18; §User Stories 1–2, 4–12, 14–17, 22–24, 26–28; §Acceptance Criteria rows 3–11, 15–16; §Edge States (party of one, double press, late answer, field mid-check, building, away, leader disconnects mid-check, accept during check, Redis, gear, build failure, pod stops during a check).

## Files expected to touch (game-server/game-service)

- `common/constants/game.go` (actions, notice codes). **Collision:** I-NCC9J-9 is editing it now.
- `internal/gameserver/hub.go` (route `party_enter` / `party_ready`; `start_solo` guard; the consumer interface)
- New `internal/gameserver/party_entry.go` (the check, its state machine, the start) and `internal/gameserver/party_entry_test.go`
- `internal/gameserver/party.go` (registry: hook membership changes and departures into cancel; tick for the timeout). **Collision:** I-NCC9J-9 is editing it now.
- `internal/gameserver/party_cache.go`, `internal/gameserver/party_updates.go` (fan-out of `party_ready_check` to members on this pod)
- `internal/gameserver/server.go` (seated-in-hub query for members; `CreateGameSession` reused unchanged), `internal/gameserver/handler.go` (a drop during an open check)
- `internal/types/messages.go` if the ready-check payload is typed (**note:** uncommitted changes from other work in the tree)

## TDD Approach

- RED: a party member's `start_solo` is refused.
- RED: table test of `party_enter` refusals in order.
- RED: a two-member party: `party_enter` → both get `open` with the leader accepted; member accepts → one run with both seated, both get `world_entered`.
- RED: each cancel cause (decline, timeout via a fake clock, leave town, drop, membership change).
- GREEN: `party_entry.go` and the hub/registry wiring.
