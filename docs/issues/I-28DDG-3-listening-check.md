---
id: I-28DDG-3
status: open
implements: FS-28DDG
blocked_by: [I-28DDG-1, I-28DDG-2]
labels: [blocked]
title: "FS-28DDG slice 3: the owner's listening check of the town music (HITL)"
---
Implements FS-28DDG §Acceptance Criteria (whole FS)

**Folded into I-28DDG-6 (2026-11-13).** Run that check instead. Its *Silence the music* item is
superseded by FS-28DDG §Change: Music volume in an Options panel, and I-28DDG-6's pass closes
this issue.

**Lane: HITL (Nick).** Restart the client only. No server change.

## Files it expects to touch

- This issue file (ticks) and, on a pass, the FS's and thin lines' status flips by `spec-update`.
  No code.

## What to Check

- Reload straight onto /game and enter the town: silent until the first click or key, then the
  music rises (about 2 s). Come in from login and the roster instead: it may rise at once.
- Let it play past one full loop (about 110 s) and listen at the wrap: **no gap and no click**. If
  either is heard, write it back as a `## Change:` on FS-28DDG (the loop marker in Edge States).
- Volume: quiet under the town, not intrusive (0.4). Say if it wants retuning.
- Walk into the Inn and back out: the music carries on.
- Enter the Spire (solo or party), and go to a field: the music fades out (about 1 s) and the
  run or field is silent. Come back: it fades in again from the top of the track.
- ESC menu: *Change character* goes to the roster with the music fading out; the roster is
  silent.
- ESC menu in the town: **Silence the music** fades it out and the row now reads **Let the music
  play**. Press it again and it fades back in. Reload: the choice is kept. The field's ESC menu has
  no music row.
- Alt-tab away and back: it pauses and resumes. (Before your first click or key in the game, a
  blur may not pause it. That's known and accepted, see the FS Edge States.)
- Leave /game for the marketplace and come back: no error on the page, and the music plays in
  the town again.

## Acceptance Criteria

- [ ] Nick's listening check passes, or each finding is written back as an FS amendment or a new
      issue.

## Blocked By

I-28DDG-1, I-28DDG-2

## Spec Reference

FS-28DDG whole; story 25.
