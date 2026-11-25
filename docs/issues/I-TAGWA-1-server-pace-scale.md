---
id: I-TAGWA-1
status: done
implements: FS-TAGWA
blocked_by: []
labels: [ready-for-agent]
title: FS-TAGWA slice 1: one pace scale on every server travel speed, pinned, and the pace golden
---
Implements FS-TAGWA §Requirements R1–R9, R15

## What to Build
`PaceScale` (0.5) in `game-service/common/constants/game.go`, commented as the knob. Every travel speed
of R2 written as its full-pace figure × `PaceScale` where it is defined: `DefaultSpeed`, `NPCWanderSpeed`,
the monster sheets, `VariantStepSpeedGain`, `AllySheets`, the three monster shots and the four delver
projectile rows. The hound, the block push, split arrows and the volley follow on their own (R3). Timings,
reach, the charge and the leap stay (R5). A pin test per class (R7) and a Go test that writes and checks
`game-client/src/data/pace.golden.json` (R9). Existing tests that hard-code a full-pace number read the
paced one.

## Acceptance Criteria
- [ ] `PaceScale` defined once, 0.5, commented as the knob
- [ ] `DefaultSpeed` 100 and `NPCWanderSpeed` 30, each figure × `PaceScale`
- [ ] Monster sheets, variant gain, ally sheets, monster shots, delver projectile rows paced
- [ ] Pin test fails for an archetype, ally kind or projectile row with no row in it
- [ ] Worn move speed applies to the paced base, capped as before; the hound and block push follow
- [ ] No timing, range, radius, max flight, charge or leap value changes
- [ ] The travel budgets (brazier windows, the mark's longest flight) stretch over `PaceScale`, pinned (R15, added in the build)
- [ ] `pace.golden.json` written by a Go test that fails while stale
- [ ] `make test`, vet, gofmt, lint pass

## Blocked By
None

## Spec Reference
FS-TAGWA §Requirements 1–9: the knob, the classes, what follows, what stays, the pin test, the golden.

## TDD Approach
- RED: the pin test with today's figures × `PaceScale` (fails: speeds are full pace)
- GREEN: scale each definition
