---
id: I-BDRTJ-5
status: open
implements: FS-BDRTJ
blocked_by: [I-BDRTJ-3]
labels: [ready-for-agent, blocked]
title: "FS-BDRTJ slice 5: client endgame test run gate (label, walk-in start, production ignores it)"
---
Implements FS-BDRTJ §Change: Endgame test run

Agent lane. Blocked by I-BDRTJ-3 only for the end-to-end check; the wire names are in the spec.

## What to Build

The hub side of the dev gate `dev_endgame_run`: the plain "Endgame Test Run" label at the gate
(R20), and on stepping in one `start_dev_endgame_run` with an empty payload, held until
`world_entered` or a refusal (R21). `world_entered` takes the player into the run as
`start_solo`'s does; a refusal is said with `notice`, as a refused field entry is, and the gate
can be tried again. A `production` build drops the gate (`gatesInThisBuild`), so no label and no
message (R23). The gate is never a field gate: `fieldOf` returns nothing for it, no field sign,
no `enter_field`.

## Acceptance Criteria

- [ ] `GateState.destination` and the client action types carry `dev_endgame_run` and
  `start_dev_endgame_run`.
- [ ] Non-production: the label shows at the gate while the hub state has it, and goes with it.
- [ ] Stepping in sends exactly one `start_dev_endgame_run`; lingering or a second step-in before
  the answer sends nothing more.
- [ ] A refusal shows the server's words via `notice` and clears the pending send.
- [ ] `production`: the gate is filtered out; no label, nothing sent.
- [ ] `fieldOf` of the dev gate is undefined; no field sign, no `enter_field`.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` pass.

## Blocked By

I-BDRTJ-3

## Spec Reference

FS-BDRTJ §Change: Endgame test run, Requirements 18 (client guard), 20, 21, 23 (client half);
Acceptance Criteria (client lines); Edge State "Server on, client production"; User Stories 6, 15.

## Files Expected

- `game-client/src/types/gameState.ts`, `game-client/src/assets/types/client.ts`
- `game-client/src/scenes/hubGates.ts` (+ `hubGates.test.ts`)
- `game-client/src/scenes/HubScene.ts` (+ `HubScene.test.ts`)

## TDD Approach

- RED: `gatesInThisBuild` drops `dev_endgame_run` under `production`, and `fieldOf` returns
  undefined for it.
- GREEN: the types and filters, then the label and the walk-in send in `HubScene`.
