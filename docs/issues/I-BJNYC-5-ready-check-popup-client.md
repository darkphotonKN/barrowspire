---
id: I-BJNYC-5
status: in-progress
implements: FS-BJNYC
blocked_by: [I-BJNYC-3]
labels: [ready-for-agent]
title: "FS-BJNYC slice 5: the ready-check popup: every member's state, a 30 s countdown, the leader's row already ticked (game-client)"
---
Implements FS-BJNYC §Requirements R23–R26, §Copy

**Lane: agent (AFK).** Nick, 2026-11-02: "組隊進塔 隊長按了之後所有人都要在15秒內 按同意 跳窗會有所有人確認的狀況
還有秒數倒數"; "隊長是按的人所以預設就打勾".

## What to Build

- **Store:** a guard `isPartyReadyCheck` and the open check in the party store, keyed by
  `check_id`; replaced by each newer message for the same check; cleared on `started` / `cancelled`.
  Wire type for `party_ready_check` (server → client) and `party_ready` `{check_id, accept}`
  (client → server).
- **Popup** (new, modelled on `PartyInvitePrompt.ts`, pure layout split out as the invite prompt
  does): the question "<leader> would enter the Spire. Are you ready?", one row per member with
  their state (waiting / accepted / declined), and a whole-second countdown from `expires_in_ms`.
  **The leader's row is shown ticked (accepted) from the moment the popup opens.** Shown to every
  member, the leader included; it does not pull a member out of a shop or a dialogue.
- **Answers:** a member who is `waiting` sees **Accept** and **Decline** (send `party_ready`); once
  answered the buttons give way to the answer. The **leader's popup is status only**: no Accept, no
  Decline, no Cancel.
- **Live / close:** each later message redraws the rows and resets the countdown to the newest
  `expires_in_ms`. `started`: close; the scene follows `world_entered`. `cancelled`: close and show
  the reason in passing per §Copy (`declined`, `timeout`, `left`, `disconnected`, `changed`,
  `failed` with and without a name).

## Acceptance Criteria

- [ ] Every member, the leader included, sees one popup with each member's state and a whole-second countdown from `expires_in_ms`.
- [ ] The leader's row is ticked (accepted) from the moment the popup opens.
- [ ] A waiting member sees Accept and Decline, each sends one `party_ready` with the check id; after answering the buttons are gone.
- [ ] The leader sees no Accept, Decline or Cancel.
- [ ] A newer `party_ready_check` for the same check redraws rows and countdown; a message for another check id replaces the old popup.
- [ ] `started` closes the popup; `cancelled` closes it and shows the reason per §Copy, names filled in.
- [ ] `npm test` and lint green.

## Blocked By

I-BJNYC-3 (the server's ready check and its wire).

## Spec Reference

FS-BJNYC §Requirements R23–R26; §Copy (popup, cancelled rows); §User Stories 2–9, 27; §Acceptance Criteria rows 18–20; §Edge States (late answer).

## Files expected to touch (game-client)

- New `src/ui/PartyReadyCheck.ts`, `src/ui/partyReadyCheckLayout.ts` and their tests
- `src/stores/partyStore.ts`, `src/stores/partyStore.test.ts` (**note:** uncommitted changes from other work in the tree)
- `src/assets/types/server.ts`, `src/assets/types/client.ts` (`party_ready_check`, `party_ready`)
- `src/scenes/HubScene.ts` (mount the popup; the check only happens in the town)
- `src/ui/partyNotice.ts` if the cancel copy sits with the other party words (same note)

## TDD Approach

- RED: store keeps the newest message per check id and clears on `started`/`cancelled`.
- RED: layout for a leader viewer: leader row accepted, no buttons; for a waiting member: Accept and Decline.
- RED: countdown seconds from `expires_in_ms`; cancel copy per reason.
- GREEN: store, layout, popup, scene mount.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: the popup for every member, leader ticked, 30 s countdown. Open for Nick: the popup hides under the gear overlay and Esc menu while the countdown runs.
