---
id: I-NCC9J-10
status: in-progress
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 10: Invite and Create greyed in a run, in_run notice copy (game-client)"
---
Implements FS-NCC9J §Requirements R23, R24, R29

**Lane: agent (AFK).** Built against the amended wire (`in_run` with a name; `locked` at invite
and create); integrated once I-NCC9J-9 lands, but nothing here waits on it.

## What to Build

- **R23:** the party panel's Invite field, its button and the Create party button are greyed in a
  run (`world === "run"`, the existing `partyLocked`), for a player in no party and for a leader
  alike; still usable in the town and in a field. The change is in `partyActions`; the panel
  already greys from its flags.
- **R24:** unchanged; the prompt still mounts in a run with Accept greyed "Not while delving."
  (the safety net for an invite received before the run). Only the comments/doc lines that say
  "Invite and Create work in every world" are corrected.
- **R29:** `PARTY_NOTICE_COPY` gains `in_run: "{name} is in a delve."`; `locked` keeps "Not
  while delving." (now also the answer to invite and create from a run).

Expected files: `game-client/src/stores/partyStore.ts` (`partyActions`, its flag comments) and
`partyStore.test.ts`; `game-client/src/ui/partyNotice.ts` and `partyNotice.test.ts`;
`game-client/src/ui/PartyPanel.ts` only if its header comment or greying needs it. Not
`ui/party.ts` nor `scenes/BarrowspireScene.ts` (another charter, FS-QPDKN, is changing them).

## Acceptance Criteria

- [ ] `partyActions` in a run returns `create: false` and `invite: false` for a party-less player
      and for a leader with room; in the town and a field they are as before.
- [ ] The panel's Invite field is disabled and Create party greyed in a run (panel test).
- [ ] The prompt still shows in a run with Accept greyed; unchanged tests stay green.
- [ ] `party_notice {code: "in_run", name: "Mira"}` renders "Mira is in a delve."; without a name,
      "Someone is in a delve."
- [ ] `vitest` green; lint fence passes; scene files not reformatted.

## Blocked By

None (server: I-NCC9J-9 for the refusals themselves)

## Spec Reference

FS-NCC9J §Requirements R23, R24, R29 (2026-11-02 charter amendments); §Acceptance Criteria
"Client: Invite and Create party work in every world…" (amended); §Edge States "Invited in the
village, then into a run within 60 s"; §User Stories 19, 26.

## TDD Approach

- RED: `partyActions(null, self, "run")` expects `create: false, invite: false`.
- GREEN: gate both flags on `!locked`; then the `in_run` copy row.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: in the tower, Invite and Create party greyed; inviting someone in a delve says "<name> is in a delve."
