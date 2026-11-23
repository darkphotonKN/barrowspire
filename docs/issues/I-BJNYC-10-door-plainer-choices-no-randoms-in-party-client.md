---
id: I-BJNYC-10
status: done
implements: FS-BJNYC
blocked_by: []
labels: []
title: "FS-BJNYC change slice: the Spire door reads Challenge the Spire Alone / with Party / with Randoms [Two Player], and a party is not offered Randoms (game-client)"
---
Implements FS-BJNYC §Change: Plainer door choices, no random queue in a party

**Lane: agent (AFK).** Charter "Party of three", extended by Kranti 2026-11-24.

## What to Build

`delveChoices` in `HubScene.ts` relabels the three ways in (Alone `start_solo`, Party
`party_enter`, Randoms `find_game`), orders them Alone, Party, Randoms, Not yet, and leaves Randoms
out when `state.party` is `member` or `leader`. The door's existing redraw on a party-standing
change adds or removes it live. Ids, actions, `stays`, `enabled` and sounds do not change. Any
other player-visible text that names an old label follows; comments may follow.

## Files it expects to touch

- `game-client/src/scenes/HubScene.ts` (`delveChoices` and its doc comment)
- `game-client/src/scenes/HubScene.test.ts`, `game-client/src/ui/uiSceneDialogue.test.ts`,
  `game-client/src/scenes/UIScene.test.ts`, `game-client/src/ui/npcDialogue.test.ts`
  (labels and order pinned there)
- Comments only, if followed: `game-client/src/ui/npcDialogue.ts`, `game-client/src/ui/partyNotice.ts`,
  `game-client/src/ui/PartyReadyCheck.ts`, `game-client/src/utils/class/SocketManager.ts`,
  `game-client/src/ui/partyCommands.test.ts`, `game-client/src/ui/partyNotice.test.ts`

Not touched: any server file; any wire type.

Note: I-BJNYC-9 (the door's every-choice slice) is marked `in-progress` in this tracker; its R20
order and "none hidden" rule are what this slice replaces. If it is not actually landed on the
branch, stop and report.

## Acceptance Criteria

- [x] FS-BJNYC §Change: Plainer door choices, all nine acceptance rows.
- [x] The tests that pinned "Descend alone", "Wait for company", "Enter as a party" and the Enter-third order are rewritten to P1–P3, each citing this change.
- [x] A test per party standing (none, member, leader, party of just the leader) pins which choices show; one pins the redraw adding and removing Randoms.
- [x] Whole client vitest, `npx tsc --noEmit`, `npm run lint`, `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-BJNYC §Change: Plainer door choices, no random queue in a party: P1–P3, P5, P6 (P4 is a no-change on the server).

## TDD Approach

- RED: `delveChoices({ queued: false, party: "none" })` labels in the new order; `party: "member"` and `"leader"` without `queue`.
- GREEN: relabel, reorder, filter `queue` by `state.party`.
