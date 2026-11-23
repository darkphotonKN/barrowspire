---
id: I-JS7C8-36
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 36: through spec-update, strike the thin line 'Walk-and-attack animation' (repointed at FS-JS7C8 as removed) and reword 'Run and backpedal animations', then delete the struck line when the retirement ships (game-client SPECIFICATION.md)"
---
Implements FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired (R156)

**Lane: agent, through the `spec-update` skill only.** No other skill writes
`game-client/SPECIFICATION.md`. No code. The FS bodies are not edited: FS-HF0WW's and FS-3V7GC's
headers still name the line, and their pointer stubs (`## Change: The knight's sprint, and the
attack-on-the-move clips retired → FS-JS7C8`) lead to this change.

## What to Build

1. **At lock (now; this step is not blocked).** In `game-client/SPECIFICATION.md` "### Presentation":
   - `- [ ] Walk-and-attack animation → FS-HF0WW` (:105) becomes
     `- [ ] ~Walk-and-attack animation~ → removed FS-JS7C8` (docs/specs/README.md *Removal: strike,
     then delete*).
   - `- [ ] Run and backpedal animations → FS-JS7C8` (:106) is reworded with the pointer unchanged.
     The backpedal it names is gone and the run stays. Suggested: `- [ ] Class run animation →
     FS-JS7C8`. The wording is spec-update's call within the survival test.
2. **On ship.** When I-JS7C8-35 has merged, the struck line is **deleted** (never checked), via
   `spec-update`. The run line's checkbox is not flipped here: it flips when FS-JS7C8 ships as a
   whole.

## Acceptance Criteria

- [ ] The struck line reads `~Walk-and-attack animation~ → removed FS-JS7C8`, unchecked.
- [ ] The run line is reworded, still unchecked, still `→ FS-JS7C8`.
- [ ] After I-JS7C8-35 merges, the struck line is gone from `game-client/SPECIFICATION.md`.
- [ ] Only `game-client/SPECIFICATION.md` changes, and only through `spec-update`.

## Blocked By

None for step 1. Step 2 waits on I-JS7C8-35.

## Spec Reference

FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired: R156; K4.

## Files it expects to touch

`game-client/SPECIFICATION.md`.
