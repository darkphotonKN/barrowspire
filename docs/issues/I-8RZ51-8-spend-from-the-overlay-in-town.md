---
id: I-8RZ51-8
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-7]
labels: [blocked]
title: "FS-8RZ51 slice 8: a click on an available node spends a point in town, tier 6 asks once, refusals show in the panel (game-client)"
---
Implements FS-8RZ51 §G R38, §D R16, R21–R22, §API surface row 3

**Author: agent.**

## Files it expects to touch

- `game-client/src/assets/types/client.ts` (`ActionType.SpendPassivePoint: "spend_passive_point"`,
  `ActionMap` payload `{ node_id: string; rank: number }`)
- `game-client/src/ui/PassiveTreeOverlay.ts`, `game-client/src/ui/passiveTreeModel.ts` (in-flight
  state, the tier-6 confirm) and their tests
- `game-client/src/utils/class/SocketManager.ts` only to subscribe to the action's refusal
  (`errorListeners`), if the overlay cannot reach it through the scene

## What to Build

- In town (world type `hub` from `world_entered`), a click on an available node sends
  `spend_passive_point` with the node's next rank. Tier 6 first asks in the panel ("Choose
  <name>? <other> is gone for good.", Yes / No); No sends nothing.
- While a spend is in flight the node takes no second click, until the state shows the rank, a
  refusal for the action arrives, or 5 s pass. A retry after a timeout sends the same target rank.
- A refusal's reason shows in the panel until the next click or close.
- Outside town nodes take no click (slice 7's footer).

## Acceptance Criteria

- [ ] The "Client" criteria of FS-8RZ51 §Acceptance Criteria for the click, the second click, the
      tier-6 ask, the refusal and outside town, each a test against a recording socket.
- [ ] No client-side spend rule beyond "available" from the model: the server decides.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-7 (the overlay and its model).

## Spec Reference

FS-8RZ51 §G R38, §D R16, R21–R22, §API surface row 3, §Edge States (refusal words, duplicate,
disconnect). User stories 9–12, 24.

## TDD Approach

- RED: clicking an available `mage.t1a` at rank 0 in the hub sends `{node_id: "mage.t1a", rank: 1}`
  once.
- GREEN: the click handler and the in-flight set.
