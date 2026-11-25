---
id: I-TAGWA-3
status: done
implements: FS-TAGWA
blocked_by: [I-TAGWA-1, I-TAGWA-2]
labels: [ready-for-agent]
title: FS-TAGWA slice 3: the pace at 0.525 and the hub's own move bonus
---
Implements FS-TAGWA §Change: The owner's play-test tweak and the town bonus

## What to Build
`PaceScale` 0.5 → 0.525, the golden regenerated, the knob's value pinned by no test. A town bonus,
`HubMoveSpeedBonusPercent` = 10, applied by the hub's gear pass on top of capped worn move speed, in
the hub only. The review's two real LOW findings fixed alongside: the knob-value test and the dead
`entities/Player.ts` with its 200 px/s copy.

## Acceptance Criteria
- [ ] `PaceScale` 0.525, golden regenerated, no test pins the value
- [ ] Hub walk = base × (1 + capped worn %) × 1.10; run and field without it; residents unchanged
- [ ] Suites green

## Blocked By
I-TAGWA-1, I-TAGWA-2

## Spec Reference
FS-TAGWA §Change: The owner's play-test tweak and the town bonus R16–R18.
