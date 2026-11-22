---
id: I-8RZ51-8
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-7]
labels: [blocked]
title: "FS-8RZ51 slice 8: a click on an available node spends a point in town, sent from the tree's own commands; tier 6 asks once, refusals show in the panel (game-client)"
---
Implements FS-8RZ51 §G R38, §D R16, R21–R22, §API surface row 3

**Author: agent.** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)* The spend is the tree piece's own command (ADR-0085 Decision 2): composing it
reads only the node and rank the piece holds and the game store's `worldType`, so it goes from the
piece through its own command module, as `partyCommands(socketManager)` does, never through a bridge
request and never from a world scene.

## Files it expects to touch

- `game-client/src/assets/types/client.ts` (`ActionType.SpendPassivePoint: "spend_passive_point"`,
  `ActionMap` payload `{ node_id: string; rank: number }`)
- `game-client/src/ui/passiveTreeCommands.ts` (new: `spend(node, rank)` over a narrow socket
  interface; `onError("spend_passive_point", …)` registered as the slot mounts) and its test with a
  fake socket, as `partyCommands.test.ts`
- `game-client/src/ui/uiSceneTree.ts`, `game-client/src/ui/PassiveTreeOverlay.ts`,
  `game-client/src/ui/passiveTreeModel.ts` (in-flight state, the tier-6 confirm, the refusal line) and
  their tests
- `game-client/src/scenes/UIScene.ts` (hand the slot `passiveTreeCommands(socketManager)`)

## What to Build

- In town (`useGameStore.getState().worldType === "hub"`), a click on an available node sends
  `spend_passive_point` with the node's next rank. Tier 6 first asks in the panel ("Choose <name>?
  <other> is gone for good.", Yes / No); No sends nothing.
- While a spend is in flight the node takes no second click, until the state shows the rank, a
  refusal for the action arrives, or 5 s pass. A retry after a timeout sends the same target rank.
- A refusal's reason shows in the panel until the next click or close. The `onError` listener is
  registered as the tree mounts, open or not: an unclaimed error reply is fatal to the session.
- Outside town nodes take no click (slice 7's footer).

## Acceptance Criteria

- [ ] The "Client" criteria of FS-8RZ51 §Acceptance Criteria for the click, the second click, the
      tier-6 ask, the refusal, outside town and "the spend goes from the tree's command module",
      each a test against a fake socket.
- [ ] A refusal of `spend_passive_point` never reaches the session's global error handler.
- [ ] No client-side spend rule beyond "available" from the model: the server decides.
- [ ] No world scene file and no `UiRequest` kind changes in the diff.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-7 (the overlay, its slot and its model).

## Spec Reference

FS-8RZ51 §G R38, §D R16, R21–R22, §API surface row 3, §Edge States (refusal words, duplicate,
disconnect); ADR-0085. User stories 9–12, 24.

## TDD Approach

- RED: clicking an available `mage.t1a` at rank 0 in the hub sends `{node_id: "mage.t1a", rank: 1}`
  once through the fake socket.
- GREEN: `passiveTreeCommands`, the click handler and the in-flight set.
