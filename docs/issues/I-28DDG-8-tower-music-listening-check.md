---
id: I-28DDG-8
status: done
implements: FS-28DDG
blocked_by: [I-28DDG-7]
labels: [blocked]
title: "FS-28DDG slice 8: the owner's listening check of the tower's music in a run (HITL)"
---
Implements FS-28DDG §Change: The tower's music on every floor of a run

**Lane: HITL (Nick).** Restart the client only. No server change.

## What to Check

- In the town, the village track plays as before.
- Enter the Spire (solo or a party). The village falls away (about 1 s). Once the run is built,
  the tower track rises (about 2 s). Before your first click or key after a reload straight into
  a run, it stays silent and rises on that click.
- **Loudness.** The tower file is about 14 dB quieter than the village's (measured; FS Facts). If
  it sounds too soft at the same Music level, say how much louder. That sets the tower's trim
  (`Tunes FS-28DDG`, W5). It is 1.0 now.
- Climb to the next floor, and the one after. The track carries on with no restart, dip or gap.
- Let it play past one full loop (120 s) and listen at the wrap: **no gap and no click**. If
  either is heard, write it back as a `## Change:` (the loop marker, Edge States).
- ESC → Options → Music in the run: ←/→ change the loudness at once; 0 fades it out, and up
  from 0 fades it in.
- Die and spectate: the music carries on. Escape or die and let the settlement record open: it
  carries on under the record.
- Close the record (or press Leave): the tower falls away and the village rises in the town.
- Go to a field from the town: silence there, as before.
- Leave /game for the marketplace and come back into a run: no error on the page, and the music
  plays.

## Acceptance Criteria

- [ ] Every check above passes, or a finding is written back to FS-28DDG.

## Blocked By

I-28DDG-7

## Spec Reference

FS-28DDG §Change: The tower's music on every floor of a run: the listening-check criterion; T9.

## Files it expects to touch

- This issue file (ticks, status). On a pass, `spec-update` flips the section to shipped. No code.

## Findings

- **2026-11-14, loudness (Nick, listening):** he could not hear the tower's music. Both tracks
  played under the shared `MUSIC_MAX_GAIN` 0.3 at trim 1, so 0.18 at the default level, and the
  tower file is about 14 dB quieter than the village's (−27.3 vs −12.9 dBFS RMS). Offered the
  options, he chose: 「塔預設上限是1 也就是100%」 — the tower's ceiling is 1, that is 100% of the
  file. Tuned (`Tunes FS-28DDG`): each world track now carries its own ceiling (`maxGain`) in
  place of the trim, gain = `maxGain` × level / 5 under the one shared Music level. The tower's
  is 1.0 (steps 0, 0.2, 0.4, 0.6, 0.8, 1.0; default level 3 plays at 0.6); the village's stays
  `MUSIC_MAX_GAIN` 0.3, still temporary (steps and default 0.18 unchanged). The trim is gone.
  Fades, ramps, the stored setting and the panel are unchanged. Recorded as a dated Tunes note
  under FS-28DDG § Change: The tower's music on every floor of a run. The rest of this check
  still awaits the owner's next listen.

## Owner sign-off

2026-11-14: the owner listened to his newest tower mix in game (ceiling 1.0) and approved it: 「沒問題可以合併回main跟push」.
