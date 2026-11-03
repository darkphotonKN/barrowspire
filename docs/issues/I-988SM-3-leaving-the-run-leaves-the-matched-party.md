---
id: I-988SM-3
status: done
implements: FS-988SM
blocked_by: [I-988SM-1]
labels: [ready-for-agent]
title: "FS-988SM slice 3: leaving the run leaves a matched party; the last one out ends it (game-service)"
---
Implements FS-988SM §Requirements R11–R18, R21, R21b

**Lane: human (HITL) by default (game-server). `/develop` may run this slice under the approved
charter "單人排隊自動組隊" (Nick, 2026-11-03).**

## What to Build

- **Every way out of the run removes a matched member (R11).** `LeaveRun` (a dead delver leaving
  early), `ReturnPlayersToHub` and `forgetIfAwaitingSettlement` at the run's end, and
  `cleanUpPlayerCompletely` when the reconnect grace runs out (both branches), for host players and
  arrived remotes alike. (R11's released-seat case is I-988SM-2.) Each posts a removal
  to the party registry's loop (R17); none waits on Redis.
- **Removal reuses the remove script with reason `left` (R12–R14).** Not a voluntary
  `party_leave`, so the instance lock does not refuse it. The script's existing rules give
  succession when the leader goes and `dissolved` when the last member goes. Only parties of
  matched origin are touched: a pre-formed party's members stay members (ADR-0035).
- **Watching is not leaving (R15, R18).** A dead or escaped member still in the run, and a member
  who reconnects within the grace, stay members.
- **Back in town and free (R21).** After leaving, `find_game` queues them.
- Failure: a removal that fails on Redis is logged at Warn; the record's TTL ends it (R17).

## Acceptance Criteria

- [ ] A dead member who leaves through `LeaveRun` is removed: the others receive `left`, the leaver an update that no longer lists them, and they are in town party-less.
- [ ] When the leader leaves the run, the earliest-joined remaining member leads at once and everyone remaining is told.
- [ ] At the run's end every member still in the run leaves as they are returned to the hub; the last one's update reads `dissolved`.
- [ ] A member whose reconnect grace runs out (record deleted, or kept for settlement) leaves the party.
- [ ] A member who reconnects within the grace is still a member, host player or not.
- [ ] A member whose grace expired and who connects again later lands in the village with no party: no party frame, no Redis party pointer naming the matched party, and `find_game` queues them (R21b; Nick: "死亡的人在連回來後就只會在村莊 跟塔沒任何關聯了").
- [ ] A dead member who stays to watch is still a member and still receives party chat.
- [ ] A dead or escaped member who stays to watch receives no XP when a living member kills a monster, and no item reaches their bag.
- [ ] An escaped member stays a member until the run ends.
- [ ] A player back in town after a matched run can `find_game` and is queued.
- [ ] A pre-formed party that entered from the gate: members who die or escape stay members, and the party persists after the run.
- [ ] Two members leaving in the same tick: one `left`, the last `dissolved`; a removal that finds the member already gone counts as success.
- [ ] Tests pass.

## Blocked By

I-988SM-1

## Spec Reference

FS-988SM §Requirements R11–R18, R21, R21b; User Stories 3–8, 10, 13, 14, 19; Acceptance Criteria rows 7–15, 16; Edge States "the leader leaves the run while the others are still in transit", "two members leave in the same tick", "remove in flight and the run ends".

## TDD Approach

- RED: gameserver test — a matched party of two, one member dies and sends `leave_run`; the other receives `party_update` `left` and the leaver ends party-less.
- GREEN: the leave hooks posting a matched-only removal on the registry loop; then the run-end and grace-expiry paths, then the XP/no-item pins.
