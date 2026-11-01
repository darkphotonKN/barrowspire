---
id: I-BJNYC-2
status: in-progress
implements: FS-BJNYC
blocked_by: []
labels: [ready-for-agent]
title: "FS-BJNYC slice 2: the Spire's door greys \"Wait for company\" for a party member (game-client)"
---
Implements FS-BJNYC §Requirements R20, §Copy

**Lane: agent (AFK).** Independent of I-BJNYC-1 (the server refuses regardless); together they are
charter default 1. "Descend alone" is **not** greyed here: that waits for party entry (I-BJNYC-4).

## What to Build

- `delveChoices` (`HubScene.ts`) learns whether the player is in a party (from the party store) and,
  for a party member, greys "Wait for company" and has the door say "Your party enters together."
  "Descend alone" and "Not yet" stay as today.
- A player in no party sees the door unchanged.
- Pure: the choice of greying is decided from state, testable without a canvas.

## Acceptance Criteria

- [ ] In a party: "Wait for company" is disabled and the door shows "Your party enters together."; "Descend alone" and "Not yet" unchanged.
- [ ] In no party: the door's choices and line are exactly today's.
- [ ] A party of just the leader counts as in a party.
- [ ] Joining or leaving a party while the door panel is closed changes the next panel.
- [ ] `npm test` and lint green.

## Blocked By

None

## Spec Reference

FS-BJNYC §Requirements R20; §Copy (door row); §User Stories 13, 24; §Acceptance Criteria row 2.

## Files expected to touch (game-client)

- `src/scenes/HubScene.ts` (`delveChoices`, `HubState`), `src/scenes/HubScene.test.ts`
- `src/stores/partyStore.ts` only if an in-party selector is needed (**note:** it has uncommitted changes from other work in the tree; keep the edit small)

## TDD Approach

- RED: `delveChoices` with a party in state returns "Wait for company" disabled and the party line.
- GREEN: thread in-party into `HubState` and grey the choice.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: at the Spire door a party member's Wait for company is greyed.
