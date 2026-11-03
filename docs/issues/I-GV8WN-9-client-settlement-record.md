---
id: I-GV8WN-9
status: in-progress
implements: FS-GV8WN
blocked_by: []
labels: [ready-for-agent]
title: "FS-GV8WN slice 9: the client shows a toggleable settlement record that holds the return to the village"
---
Implements FS-GV8WN §G Requirements 21–24

**Author: agent.** Client only. Build against the `settlement` wire shape in FS-GV8WN R19 (the
server half is I-GV8WN-8); end to end needs it.

## What to Build

- Handle `settlement` (R19): open the **settlement record** at once. Replace its content on every
  `settlement` (a `confirmed` one flips the status).
- The record shows outcome, carried (finds marked), lost (unsafe / consumed, distinguishable),
  experience gained and level change, kills and time in the run, and a status line: settling while
  `pending`, settled once `confirmed`. Never copy that suggests items may be lost.
- The record can be closed. A **Settlement** button joins the bottom-centre buttons of a resolved
  player (beside Watch, and Leave) and reopens it.
- Cleared on `world_entered` for any other world.
- **Holds the return to the village:** `ResultHold` is raised while the record is open. If the
  run's end arrives (`end_game` + `world_entered(hub)`) with the record open, the hub is held
  until the record is closed or Leave is pressed. With it closed, the hub applies at once.
- Remove the FS-QPDKN result card: `end_game` no longer opens it (R24).
- Follow `game-client/CLAUDE.md` and `docs/design-guideline.md` (game palette, lore voice, no new
  colours outside tokens).

## Acceptance Criteria

- [ ] `settlement` opens the record with all R19 fields shown; `lost` separates unsafe from consumed.
- [ ] A second `settlement` with `status: confirmed` changes the status line only.
- [ ] Closing and reopening from the Settlement button works.
- [ ] Entering any other world clears the record.
- [ ] Run end with the record open holds the hub until close or Leave; with it closed, the hub applies at once.
- [ ] `end_game` shows no result card.
- [ ] vitest, tsc and lint pass.

## Blocked By

None (built against the wire shape; end to end after I-GV8WN-8)

## Spec Reference

FS-GV8WN §G R21–R24; user stories 5–9.

## TDD Approach

- RED: a test feeding `settlement` (pending) → record open with its content; then `end_game` + `world_entered(hub)` → hub held until close.
- GREEN: record component + store, `ResultHold` raised by the record, result card removed.
