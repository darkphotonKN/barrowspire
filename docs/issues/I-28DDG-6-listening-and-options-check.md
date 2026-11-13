---
id: I-28DDG-6
status: open
implements: FS-28DDG
blocked_by: [I-28DDG-4, I-28DDG-5]
labels: [blocked]
title: "FS-28DDG slice 6: the owner's listening check of the town music and the Options panel (HITL; folds I-28DDG-3)"
---
Implements FS-28DDG §Change: Music volume in an Options panel

**Lane: HITL (Nick).** Restart the client only. No server change. This check folds in
I-28DDG-3's listening check. Its on/off item is replaced by the Options checks below, and a pass
here closes I-28DDG-3 too.

## Files it expects to touch

- This issue file and I-28DDG-3 (ticks, status). On a pass, `spec-update` flips the FS's statuses
  and the thin lines. No code.

## What to Check

From I-28DDG-3:

- Reload straight onto /game and enter the town. It stays silent until the first click or key,
  then the music rises (about 2 s). Coming in from login and the roster instead, it may rise at
  once.
- Let it play past one full loop (about 110 s) and listen at the wrap: **no gap and no click**. If
  either is heard, write it back as a `## Change:` on FS-28DDG (the loop marker in Edge States).
- Walk into the Inn and back out: the music carries on.
- Enter the Spire (solo or party), then go to a field: the music fades out (about 1 s) and the run
  or field is silent. Come back: it fades in again from the top of the track.
- ESC menu, *Change character*: you go to the roster with the music fading out, and the roster is
  silent.
- Alt-tab away and back: it pauses and resumes. (Before your first click or key in the game, a
  blur may not pause it. That is known and accepted.)
- Leave /game for the marketplace and come back: no error on the page, and the music plays in the
  town again.

New:

- Default loudness: level 3 is gain 0.3, a little quieter than before. Level 5 is half the file's
  loudness (the temporary cap). Say whether the cap or the steps want retuning.
- Town ESC menu: **Options** sits where the music row was ([2], or [3] while queued). It opens a
  larger **OPTIONS** panel with the windows' frame, a centred title, **Music** ◄ ■■■□□ ►, and
  *Back [Esc]*.
- ◄/► clicks, ←/→ and clicking a step change the level at once with no jump (about 200 ms).
  Level 0 fades it out, and leaving 0 fades it in. Change it during the arrival fade-in: the fade
  lands on the new level.
- *Back*, Esc and the × return to the ESC menu. The corner Menu icon closes everything.
- While the panel is open you cannot walk, open the inventory or chat, or press anything behind
  it.
- Reload: the level is kept. A browser that had silenced the music opens with an empty bar.
- A field's ESC menu and the run's ESC menu have *Options* too, open the same panel, and *Back*
  returns to that world's menu. Change the level there, then come back to town: it fades in at
  the new level.
- In the run, die or end the run with the panel open: the panel closes, and the card is not
  covered.
- The arrows and steps look right in the game palette at your display's scale (they are drawn in
  code, not as font glyphs).

## Acceptance Criteria

- [ ] Nick's listening and look check passes, or each finding is written back as an FS amendment
      or a new issue.
- [ ] I-28DDG-3 is set `done` with this one.

## Blocked By

I-28DDG-4, I-28DDG-5

## Spec Reference

FS-28DDG whole (story 25) and §Change: Music volume in an Options panel (its HITL criterion).
