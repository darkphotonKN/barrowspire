---
id: I-NCC9J-3
status: open
implements: FS-NCC9J
blocked_by: [I-NCC9J-1]
labels: [ready-for-agent]
title: "FS-NCC9J slice 3: invites and accepts anywhere, fan-out to every member's pod (game-service)"
---
Implements FS-NCC9J §Requirements R5, R7, R9–R11, R13, R14, R21

**Lane: human (HITL).**

## What to Build

- Presence widens to every connected player with a character: hashes gain `name` and `world`
  (`hub` | `field` | `run`); sampled on the tick as FS-R82NV slice 3 does, kept while a player is
  held in the reconnect grace.
- Invites from and to any world; delivery through the target pod's inbox in whatever world they
  stand.
- Accept in place on any pod, no handoff; inside a run refused `locked` (until FS-BJNYC).
- Fan-out: after each mutation, a `party_update` letter to every member's pod (looked up in
  presence); the receiving pod updates its cache and delivers it.
- `party_update` gains `reserved: [{name, expires_at}]` and each member's `online`.
- Close the FS-R82NV slice 3 code review items carried in I-R82NV-3 (writer ordering behind the
  backlog, the god-object split into a cross-pod courier with the work queue on the hub, writer
  drain at shutdown, `queued` re-check, failure notices not dropped, test gaps).

## Acceptance Criteria

- [ ] A player on pod A invites a player in a field on pod B; B shows the prompt; accepting there makes them a member with no `world_handoff`; both get `party_update` with two members.
- [ ] An accept inside a run is refused `locked`; an invite to someone in a party → `already_in_party`, from any pod.
- [ ] R10's refusal order holds under a table-driven test with cross-pod rows.
- [ ] Every member, on every pod, receives `reserved` entries; decline and expiry remove them.
- [ ] Presence holds players in fields and runs with `world`; keys vanish on leaving and lapse within 30 s of a pod stopping.
- [ ] The I-R82NV-3 review items listed above are closed or explicitly re-deferred.
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-1

## Spec Reference

FS-NCC9J §Requirements R5, R7, R9–R11, R13, R14, R21; §User Stories 1–6, 18; §Edge States (invitee joins another party first, a letter dropped, unauthorized).

## TDD Approach

- RED: the two-pod harness (`party_crosspod_test.go`): a player in pod B's Meadows receives an invite from pod A.
- GREEN: presence for every world, then delivery outside the hub, then accept in place.
