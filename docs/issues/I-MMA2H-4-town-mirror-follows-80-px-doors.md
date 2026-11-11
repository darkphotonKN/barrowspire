---
id: I-MMA2H-4
status: open
implements: FS-MMA2H
blocked_by: [I-MMA2H-2, I-MMA2H-3]
labels: [blocked]
title: "FS-MMA2H slice 4: the client's town follows the 80 px door gaps (game-client)"
---
Implements FS-MMA2H §D

**Lane: agent (AFK).** No server change. Blocked through I-MMA2H-3 on owner decision D1. Merges as
a pair with I-MMA2H-3.

## Files owned

- `game-client/src/render/world/hubKeepOut.ts` (`HUB_DOOR_SPURS`, its comment)
- `game-client/src/render/world/hubInteriors.ts` (indoor dressing spots on a widened threshold;
  comments that give the gap's or the taproom's numbers)
- `game-client/src/render/world/{hubKeepOut,hubInteriors,hubStash}.test.ts` (`DOOR`)
- `game-client/src/scenes/HubScene.test.ts` only where it pins a 50 px gap

The golden is read, never edited here.

## What to Build

Every fixture that walls a town building cuts the gap the golden has (R13). Each door spur is as
wide as its gap, from its sill (R14). Indoor dressing stays off each threshold strip at the new
width, moved the least it can; outdoor dressing, fences and paths still clear K1-K8 (R15). A town
door and the partition's doorway draw as a run house's does (R16); the drawing is gap-driven, so
expect no production change beyond data.

## Acceptance Criteria

- [ ] `doorGaps` over the golden's walls finds one 80 px gap per town building and one in the
      Inn's partition.
- [ ] Each `HUB_DOOR_SPURS` rect is 80 px wide and starts at its gap's west jamb and sill.
- [ ] No indoor dressing spot lies on a door's threshold strip (gap-wide, 80 px deep inward);
      `hubKeepOut.test.ts` passes.
- [ ] No client source or test holds 50 as a door width.
- [ ] `npm test` and `npm run lint` in game-client pass.

## Blocked By

- I-MMA2H-2 (the 80 px door art).
- I-MMA2H-3 (the rewritten golden).

Blocks I-MMA2H-5.

## Spec Reference

FS-MMA2H §D R13-R16; user stories 3, 7, 8, 11, 13.

## TDD Approach

- RED: `DOOR = 80` in the three town suites, against the rewritten golden.
- GREEN: the spurs, then any dressing spot the threshold test names.
