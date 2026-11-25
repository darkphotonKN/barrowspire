---
id: I-TAGWA-2
status: done
implements: FS-TAGWA
blocked_by: [I-TAGWA-1]
labels: [ready-for-agent]
title: FS-TAGWA slice 2: the client reads the pace golden for the block slide, class cards and playback
---
Implements FS-TAGWA §Requirements R10–R14

## What to Build
A client pace module reading `src/data/pace.golden.json`. `BLOCK_SLIDE_SPEED` = `defaultSpeed ×
blockPushSpeedShare`. The class cards' Speed (and the SPD bar's full mark) paced from the golden.
Playback tests and comments read the paced base, the clip strides untouched. `GAME_CONFIG.PLAYER_SPEED`
and `BULLET_SPEED` deleted. No client literal of a server speed stays.

## Acceptance Criteria
- [ ] The block slide reads the golden (50 px/s at 0.5)
- [ ] The class cards' Speed is the paced base (100; the archer 110), the bar's mark scaled
- [ ] Walk, run and hound playback tests read the base from the golden
- [ ] `PLAYER_SPEED` and `BULLET_SPEED` are gone
- [ ] `npm test`, lint, lint:fence and `tsc` pass

## Blocked By
I-TAGWA-1 (writes the golden)

## Spec Reference
FS-TAGWA §Requirements 10–14: the block slide, playback, the class card, dead copies, the snapshot.

## TDD Approach
- RED: seal.test's slide speed equals the golden's `defaultSpeed × blockPushSpeedShare`
- GREEN: derive `BLOCK_SLIDE_SPEED` from the pace module
