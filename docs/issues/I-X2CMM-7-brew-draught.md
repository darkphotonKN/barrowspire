---
id: I-X2CMM-7
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-2"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 7: Brew sets down a draught any delver drinks for a heal over time"
---
Implements FS-X2CMM §E

**Author: agent**

## What to Build

- **Brew (R27).** Archer, level 9, `none`, 3 s, 30 stamina, 120 s. On completion a draught at the
  archer's feet: an interactable any delver of the run drinks once by `interact` within 60 px
  (`DefaultInteractableRange`). Drinking heals 30 % of the drinker's max health over 6 s in even
  parts each tick, never above max; a second draught during a heal restarts it at the full amount.
  The draught goes when drunk or on a floor change. Keep the interaction hook small (the Spire
  branch adds interactables too).
- **Wire:** the draught in the run world-effect list (kind `draught`, an id the client sends to
  `interact`), and a `draught` named state on the drinker while healing.

## Acceptance Criteria

- [ ] A level-9 archer brews: after 3 s stamina −30 and a draught at their feet in every recipient's state.
- [ ] A wounded teammate interacting with it heals 30 % of max over 6 s and the draught is gone; a second interact does nothing.
- [ ] A draught goes on a floor change.
- [ ] `make test` green.

## Blocked By

I-X2CMM-2

## Spec Reference

FS-X2CMM §E R27, §F R34

## TDD Approach

- RED: drinking heals over 6 s.
- GREEN: draught entity, interact, heal tick.
