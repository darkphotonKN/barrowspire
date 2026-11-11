---
id: I-B4SG9-8
status: done
implements: FS-B4SG9
blocked_by: [I-B4SG9-7]
labels: [ready-for-agent]
title: "FS-B4SG9 slice 8: play check of the Bone Archer on floor 1"
---
Implements FS-B4SG9 §Acceptance Criteria ("In play")

**Type:** HITL. The owner plays floor 1 in a browser. No code is expected; a failed check goes
back to the slice that owns it, and a number that feels wrong is a `Tunes FS-B4SG9` change to the
sheet (R2) or the population constants (R19).

## Files owned

None. (Ticks the FS's "In play" boxes; `spec-update` flips the thin lines when the feature ships.)

## What to Check

Restart game-service and the client. Enter a run; raise the archer share in a local build if a
hall is slow to find (R19).

## Acceptance Criteria

- [ ] A Bone Archer is picked out of a pack by its bow before it draws.
- [ ] The draw reads. Stepping sideways during or after it avoids the arrow; running straight away
      does not.
- [ ] Standing behind a wall, arrows stop on it and the archer comes round.
- [ ] A hall's chest says "It will not open." until the hall's archer is dead as well.
- [ ] The arrow reads as hostile next to a party archer's.
- [ ] The owner has answered, or knowingly left open, §Open questions 1–2 (parry, reflect) after
      seeing what happens today with a mercenary and with Gravewarden's Oath.

## Blocked By

I-B4SG9-7

## Spec Reference

FS-B4SG9 §Acceptance Criteria "In play (HITL, on floor 1)"; §Open questions 1–2; user stories 2–8,
10, 13.

**Owner check, 2026-11-11.** Nick played floor 1 on the local branch `play/floor1-fixes` (this branch merged with the wall-corner and coffer fixes) and reported "看過了沒問題". He gave one verdict for the whole check, not one per line, so the boxes above are left as written. Parry and Gravewarden's Oath against an arrow stay as the code has them (not parried; reflected), as he was told on the same day and did not change.
