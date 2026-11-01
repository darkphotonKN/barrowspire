---
id: I-NCC9J-6
status: open
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 6: invite and create anywhere, the prompt in every scene, new notice copy (game-client)"
---
Implements FS-NCC9J §Requirements R23, R24, R29

**Lane: agent (AFK).** Built against FS-NCC9J's wire shapes; integrated once the server slices land.

## What to Build

- The Invite field and button and the Create party button work in every world (no more greying
  outside the town).
- The invite prompt mounts in every scene (town, field, run), hidden only under the end-of-run
  overlay; in a run its Accept is greyed with "Not while delving."
- New and changed notice copy (R29): `leader_away`, `unavailable`, `expired` (the accepter's view),
  `pod_full` and `not_in_hub` reworded for travel.

## Acceptance Criteria

- [ ] Invite and Create party send in town, field and run.
- [ ] The prompt shows in every scene; Accept is greyed in a run and sends nothing.
- [ ] Each new or changed code renders R29's copy.
- [ ] `vitest` green; lint fence passes; scene files not reformatted.

## Blocked By

None (server: I-NCC9J-3 for live delivery outside the town)

## Spec Reference

FS-NCC9J §Requirements R23, R24, R29; §User Stories 1, 2, 4, 19.

## TDD Approach

- RED: a pure test that the panel's actions for a party-less player in a field include Invite and Create enabled.
- GREEN: drop the town-only rule, then mount the prompt in the field and run scenes.
