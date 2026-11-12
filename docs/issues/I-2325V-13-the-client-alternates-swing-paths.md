---
id: I-2325V-13
status: open
implements: FS-2325V
blocked_by: []
labels: [blocked]
title: "FS-2325V change slice 13: the local player's consecutive swings alternate forehand and backhand, back to the forehand after a pause (game-client)"
---
Implements FS-2325V §Change: The class attacks move with weight and cut deep (R9)

**Parked by the owner, 2026-11-12: "先改回只有一刀好了 我再看看狀況 不過一刀還是要有各職業風格". Not built; FS-2325V R9 is parked with R8.**

**Lane: agent.** Client presentation only; nothing on the wire, the server untouched.

## What to Build

On a sheet that carries `backhand`, `CharacterAnimator` plays path 1, path 2, path 1 … on
consecutive swings (`attack`→`backhand`, `walk_attack`→`walk_backhand`,
`backpedal_attack`→`backpedal_backhand`); `SWING_CHAIN_GAP_MS` (800) after a swing's clip ends
with no new swing, the next is path 1 again; a charge plays path 1 and restarts the chain. A sheet
without `backhand` plays path 1 every time. Kept small and local to the clip choice.

## Acceptance Criteria

- [ ] Seen red first: swings alternate 1, 2, 1; a swing after the gap is path 1; a sheet without
      `backhand` stays on path 1; a mid-swing start or stop of moving swaps within the path.
- [ ] Typecheck, lint and the client suite green.

## Blocked By

None
