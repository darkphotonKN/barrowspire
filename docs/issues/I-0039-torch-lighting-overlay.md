---
id: I-0039
status: open
implements: FS-0005
blocked_by: [I-0038]
labels: [blocked]
title: "FS-0005 slice 4: lighting — static vignette and a torch pool that follows the delver"
---
Implements FS-0005 §Requirements 19-22

**Author: human** — do NOT hand this to `/develop`. Two things need judgment that only a running
game answers: how strong the vignette can be before it costs a fight, and whether the overlay
costs frames. Both are tradeoffs, not tasks.

## What to Build

### The vignette (§R19)

A static darkening at the canvas edges. This does the atmospheric work — the world pressing in
around the light.

### The torch pool (§R20)

A warm pool centred on the delver, moving with them. **This is the part that makes the scene read
as carrying a torch rather than as a dark screen**, and it is why static-only was rejected during
scoping.

### Build once, reposition — never rebuild (§R21)

`BarrowspireScene` redraws from a full-state broadcast every tick. Allocating overlay graphics
inside that loop is a per-frame cost at 60Hz for a layer whose *shape* never changes — only its
position does. Construct once, depth-sort above the world, move it per tick.

### Verify readability, do not assume it (§R22)

I-0036 states a readability floor. This slice proves it in a running game:

- entities at the **canvas edge**, where the vignette is strongest
- **enemies read by their eyes** against dark ground — the intended accent, and the case most
  likely to fail
- HUD text where it sits over the world rather than over a panel

**If atmosphere and readability conflict, the vignette yields.** Reduce its strength or its reach
and say so in the PR. An unreadable hostile is a bug; a slightly less moody screen is not.

## Acceptance Criteria

- [ ] A static vignette renders at the canvas edges
- [ ] A warm pool is centred on the delver and moves with them
- [ ] Overlay graphics are allocated once and repositioned, never rebuilt per tick
- [ ] The overlay is depth-sorted above the world and below the HUD
- [ ] Entities at the canvas edge remain legible, verified in a running game
- [ ] Enemies remain readable against dark ground with the overlay active
- [ ] Frame rate holds during play; any vignette reduction is documented
- [ ] Re-entering the scene on reconnect does not allocate a second overlay
- [ ] `current_player === null` (escaped or died) resolves deliberately — fade or fall back to the
      static vignette, never track a stale position or throw
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Blocked By

I-0038 — readability can only be judged against the recoloured world, and both slices edit
`BarrowspireScene.ts`.

## Spec Reference

FS-0005 §Requirements 19-22 (§E. Lighting); §User Stories 2, 12, 13; §Edge States (the overlay
hides an enemy at the canvas edge; the torch pool at a wall or corner; frame cost at 60Hz;
reconnect and scene restart; `current_player === null`).
