---
id: I-WDM0X-4
status: open
implements: FS-WDM0X
blocked_by: [I-WDM0X-2, I-WDM0X-3]
labels: [blocked]
title: "FS-WDM0X slice 4: the owner's listening check of the interface sound effects, in Chrome and Safari (HITL)"
---
Implements FS-WDM0X §Acceptance Criteria (Housekeeping: the owner's listening check)

**Lane: HITL (Nick).** Restart the client only. No server change.

## Files it expects to touch

- This issue file (ticks, status). On a pass, `spec-update` flips FS-WDM0X to shipped and checks
  its two thin lines. No code.

## What to Check

In Chrome, then again in Safari:

- [ ] In the town, every row of S1 sounds as it should, by icon, key, × and Esc:
      - the Inventory (I, B), the Character panel (C) and the Party panel (T);
      - the envelope (letter panel);
      - the ESC menu;
      - M and the map mode icon.
- [ ] The Menu icon over an open inventory and party panel plays one sound (the menu's). The
      envelope over the open gear plays one (the letters').
- [ ] Esc with both gear panels open plays one close.
- [ ] *Options*, and *Back* from OPTIONS, are silent. The Menu icon over OPTIONS plays the menu's
      close.
- [ ] Pressing I fast, several times, restarts the sound rather than piling it up.
- [ ] OPTIONS shows Sound effects under Music. Level 0 silences every effect, and level 5 is the
      files' own loudness. The level holds after a reload. The music's slider still moves only the
      music.
- [ ] In a field and in the run: the inventory, character, party, menu and minimap sounds. In the
      run, the Fall confirm and its *Not yet*. Dying with the menu open, and the run ending,
      close things silently.
- [ ] Going between the town, a field and the run with windows open is silent.
- [ ] Reload straight onto /game: the first press may be silent, and nothing bursts out later.
- [ ] Is each effect's loudness right against the music at the defaults (music 3, effects 3)? If
      not, the levels are tunables (`SFX_MAX_GAIN`, `SFX_DEFAULT_LEVEL`): `Tunes FS-WDM0X`.
- [ ] **Safari:** every effect is heard. If any is silent, write it back as a `## Change:` on
      FS-WDM0X (Edge States, "Safari and Ogg"); the order or the format is the owner's call.

## Blocked By

I-WDM0X-2, I-WDM0X-3

## Spec Reference

FS-WDM0X §Acceptance Criteria, Housekeeping (the owner's listening check); Edge States.
