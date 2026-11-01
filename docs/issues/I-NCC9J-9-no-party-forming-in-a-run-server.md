---
id: I-NCC9J-9
status: done
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 9: no invite or create from a run, invites to a player in a run refused delving (game-service)"
---
Implements FS-NCC9J §Requirements R9, R10, R14, R15

**Lane: human (HITL) — authorised by charter 2026-11-02.**

## What to Build

Nobody forms a party inside the tower, and an invite that could never be accepted is never sent.

- **Inviter in a run (R9, R10):** `party_invite` from a player the directory reports `InRun` is
  refused `party_notice` `locked` (no name), at the head of R10's list, ahead of `not_leader`.
  For a target on another pod, the inviter's standing is checked again when the lookup returns
  (`inviteThere`), so an inviter who entered a run meanwhile is refused `locked` too.
- **Target in a run (R10):** a new `party_notice` code `delving`, carrying the target's name,
  refused after `not_found` and before `already_in_party`. Same pod: the directory's
  `InRun(target)` (in `targetRefusal`'s path); another pod: the presence entry the lookup already
  read has `World == "run"`. No extra Redis read; decided in Go before the invite script runs, so
  the target gets no `party_invite`, no slot is reserved, a party-less inviter stays in no party,
  and the Lua script is unchanged.
- **Create in a run (R15):** `party_create` from a player in a run is refused `locked`, first,
  ahead of `already_in_party` and `queued`.
- **Accept (R14):** unchanged; `locked` at accept stays as the safety net for a target invited
  outside a run who entered one within the 60 s.
- Fields unchanged; leave, kick, transfer unchanged.

Expected files: `game-server/game-service/internal/gameserver/party.go` (`invite`, `inviteThere`,
`targetRefusal` or a sibling, `create`); `game-server/game-service/common/constants/game.go` (the
`PartyNoticeDelving` code, the one addition outside party.go, needed for the new wire code);
tests in `internal/gameserver/party_test.go` and `party_crosspod_test.go`. No change to
`internal/partystore` scripts, the party's Redis structure, `internal/serializer/**`, or any new
action. `party_updates.go` / `party_courier.go` only if needed.

## Acceptance Criteria

- [ ] `party_invite` from a player in a run is refused `locked`, before `not_leader`; the same
      for a cross-pod invite whose inviter entered a run while the lookup was out.
- [ ] `party_create` from a player in a run is refused `locked`, before `already_in_party` and
      `queued`.
- [ ] An invite to a player in a run is refused `delving` with their name, for a target on this
      pod (directory `InRun`) and on another pod (presence `world: run`); no `party_invite` is
      delivered, no slot is reserved, the invite script is not run, and a party-less inviter has
      no party afterwards.
- [ ] `delving` fires after `not_found` and before `already_in_party` / `pending` in R10's
      table-driven order test (same-pod and cross-pod rows).
- [ ] Inviting and accepting in a field, and accepting in a run (`locked`), behave as before.
- [ ] `go test ./internal/gameserver/... -race` green; lint fence passes.

## Blocked By

None (client counterpart I-NCC9J-10 is independent: it greys early, this refuses at the source)

## Spec Reference

FS-NCC9J §Requirements R9, R10, R14, R15 (2026-11-02 charter amendments); §Acceptance Criteria
"party_invite and party_create from a player in a run…", "An invite to a player in a run is
refused delving…", "Inviting and accepting in a field…", "Refusals of an invite fire in R10's
order…"; §Edge States "Target enters a run as the invite is sent", "Inviter enters a run while a
cross-pod lookup is out"; §User Stories 25.

## TDD Approach

- RED: a table row in the invite-order test where the target the pod holds is in a run, expecting
  `party_notice {code: delving, name}` and no `party_invite` sent.
- GREEN: check `InRun(target)` after the target is found and before `groupedRefusal`; then the
  cross-pod row on `found.World`, then `locked` for the inviter and for create.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Open for Nick: the wire code `delving` against game-service CONTEXT.md's run/delve rule (add a CONTEXT exception, or rename to `in_run` in the FS). LOWs: `leadRefusal` now also checks the run; a target just out of a run may read `delving` for one presence tick.
