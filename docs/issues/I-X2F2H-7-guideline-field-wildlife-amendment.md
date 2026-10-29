---
id: I-X2F2H-7
status: open
implements: FS-X2F2H
blocked_by: []
labels: [ready-for-agent]
title: "FS-X2F2H slice 7: the design guideline's field-wildlife and daylit-field amendment (game-client docs)"
---
Implements FS-X2F2H §H (Requirement 62)

**Author: agent.** A rule change, flagged to the user in FS-X2F2H's hand-back (Decision log
D28). The boar breaks two Part I rules as written: fodder is "undead and barrow-born only", and
creatures are built on "one shared humanoid rig". The Meadows also breaks "the world reads as a
torch-lit crypt". FS-Q14EV's boss-tier amendment (I-Q14EV-1) is the precedent for the shape.

## What to Build

In `game-client/docs/design-guideline.md` Part I only:

1. **Field-wildlife clause** under *Enemy design language*: in **field worlds only**, fodder and
   brutes may be living animals (the boar first). Materials are natural hide, bristle, tusk and
   horn from the warm, desaturated end of the ramp, never bright. The Spire's undead-only rule is
   unchanged for runs.
2. **Quadruped rig variant**: creature variants of the shared rig may be quadrupeds (horizontal
   spine, four legs, head and tail chains), still authored in code (ADR-0021), still 8
   directions and idle / walk / attack / death on the same contact-sheet approval.
3. **Size tier for quadrupeds**: measured against the player by body length at the shoulder line
   rather than standing height; fodder reads smaller than a player's height.
4. **Eyes stay the hostile accent**: ember red from the oxblood family, the one emissive, drawn
   above the light-map, so a boar in daylight still reads hostile.
5. **Daylit fields**: a field world may be daylit instead of torch-lit; the readability floor and
   the gameplay accent channels still hold.
6. Make the *Enemies* summary bullet and the *In-Game Canvas / World Art* mood line consistent
   with the above. Attribute the amendment to the owner's approval of FS-X2F2H (2026-10-29).

## Acceptance Criteria

- [ ] Part I carries the field-wildlife clause, the quadruped variant, the quadruped size rule, the eye rule and the daylit-field rule, attributed as above.
- [ ] Nothing in Part II (web UI) changes; runs' rules read unchanged.
- [ ] The token fence and doc lint scripts, if they cover this file, stay green.

## Files expected to touch

- `game-client/docs/design-guideline.md` (Part I: *Characters / Enemies*, *Enemy design language*, *In-Game Canvas / World Art*, *Lighting* only)

## Blocked By

None

## Spec Reference

FS-X2F2H §H R62 (and R54, R61 which depend on it); Decision log D28; User Stories 17, 18, 28.

## TDD Approach

Not applicable (documentation).
