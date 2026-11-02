---
id: I-BJNYC-4
status: in-progress
implements: FS-BJNYC
blocked_by: [I-BJNYC-2, I-BJNYC-3]
labels: [ready-for-agent]
title: "FS-BJNYC slice 4: \"Enter as a party\" at the Spire's door for the leader; solo greyed for party members; party_enter refusals in words (game-client)"
---
Implements FS-BJNYC §Requirements R21, R22, §Copy

**Lane: agent (AFK).** Greys "Descend alone" for party members, so it must not ship before party
entry exists on the server (I-BJNYC-3): charter default 2.

## What to Build

- **Door choices** (`delveChoices`): for the party's **leader**, an **Enter as a party** choice
  that sends `party_enter`, with "Descend alone" and "Wait for company" greyed; for a member who is
  not the leader, both greyed and no entry choice; "Not yet" for everyone. A party of just the
  leader sees Enter as a party. No party: unchanged.
- A sent `party_enter` is pending until the ready check opens, the run starts, or a refusal comes
  (no double send).
- **Wire types:** `party_enter` (no payload) in `src/assets/types/client.ts`.
- **Refusal copy** for `party_enter`'s `party_notice` codes, per FS-BJNYC §Copy: `checking`
  "Your party is already being asked.", `not_at_gate` "Walk to the Spire's door first.",
  `not_in_town` "<names> is/are not in the town."; `not_member`, `not_leader`, `locked`,
  `unavailable` keep their existing words. Shown in passing; the player stays where they stand.

## Acceptance Criteria

- [ ] Leader: "Enter as a party" present and live; "Descend alone" and "Wait for company" greyed.
- [ ] Non-leader member: both greyed, no entry choice.
- [ ] No party: door exactly as before. Party of just the leader: "Enter as a party" shown.
- [ ] Pressing it sends one `party_enter`; a second press while pending sends nothing.
- [ ] Each `party_enter` refusal code reads per §Copy; `not_in_town` with one name ("is") and several ("are").
- [ ] `npm test` and lint green.

## Blocked By

I-BJNYC-2 (same door function), I-BJNYC-3 (the server's `party_enter`; R2's greying never before party entry).

## Spec Reference

FS-BJNYC §Requirements R21, R22; §Copy (door, `party_enter` refused); §User Stories 1, 10, 14–16, 24; §Acceptance Criteria rows 17, 20.

## Files expected to touch (game-client)

- `src/scenes/HubScene.ts`, `src/scenes/HubScene.test.ts` (`delveChoices`, `HubState`, sending `party_enter`)
- `src/assets/types/client.ts` (`party_enter`)
- `src/ui/partyNotice.ts`, `src/ui/partyNotice.test.ts` (new codes; **note:** uncommitted changes from other work in the tree)
- `src/stores/partyStore.ts` (leader / in-party selectors if not already enough; same note)

## TDD Approach

- RED: `delveChoices` for a leader includes Enter as a party and greys the other two; for a member greys both with no entry.
- RED: notice copy table for the new codes.
- GREEN: choices, the send, the copy.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: the leader sees Enter as a party, members see solo and queue greyed, refusals in words.
