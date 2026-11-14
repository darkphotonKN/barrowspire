---
id: I-TQZ5J-32
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-30, I-TQZ5J-31]
labels: []
title: "FS-TQZ5J batch 5, slice 3: the owner's look check of the moved HUD pieces (HITL)"
---
Implements FS-TQZ5J §Change: Batch 5: the ability card, the potion cell and the HUD bars (the owner's check)

**Lane: HITL (Nick).** Restart the client only. No screenshots (the owner's rule, 2026-11-14).

## What to Check

- [ ] The town: the level bar top left; a level-up cue.
- [ ] A field: the Health and resource bars, the ability card above the corner row; greyed while the
      lockout runs.
- [ ] The run: the level bar, the bars, the potion cell (dimmed at 0), the ability card with its
      right-mouse glyph, greyed and down as before; the controls badge 8 px above the card, with it.
- [ ] A press on any of them still attacks; the gear overlay and the party panel still draw over them.
- [ ] Chat is held (the note in the FS): it is still the world's, unchanged.
