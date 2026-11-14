---
id: I-TQZ5J-17
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-13, I-TQZ5J-14, I-TQZ5J-15, I-TQZ5J-16]
labels: [ready-for-agent]
title: "FS-TQZ5J phase 3, slice 5: the owner's look-and-feel and listening check of the moved pieces (HITL)"
---
Implements FS-TQZ5J §Change: Phase 3: the gear, the container view, the settlement record and the controls panel (the owner's check, R58, R61, R64–R66)

**Lane: HITL (Nick).** Restart the client only. No server change.

## What to Check

In the town, a field and the run, windowed and fullscreen, at render scale 1 and 1.5/2:

- [ ] The inventory, the character panel, the stash (the chest's E), their tips, Shift's compare row,
      the flash and the purse line and tip look and answer as before; I, B, C, Q, E and the corner
      icons; Esc's order (letter, menu, party, gear, then the menu).
- [ ] The town's reopen keeps the bag and the stash on show under the loading line, which holds every
      press.
- [ ] The coffer, the satchel and the bone heap open, fill, take (click, F), refuse a full bag and close
      (Q, walking away, a hit) as before; the open bar of a timed open stays over the container.
- [ ] The settlement record, short and scrolled, its Close and SETTLEMENT, as before.
- [ ] H toggles the controls panel; it now draws over the party panel, and a press on it no longer
      attacks (R61). Accept or ask.
- [ ] The run's end closes the gear overlay, the container view and the controls panel with the party
      panel, silently (R58). Accept or ask.
- [ ] A world button under a reopened window takes no press there (R64): the corner LEAVE under the
      inventory while watching. Accept or ask.
- [ ] R66's depth cases (the shots listed in the run's report): the gear over the frames, its tips over
      the dialogue card, the run's notifications and the party panel; the inventory over the notice
      line and the invite prompts; the controls panel over the party panel; the moved windows over the
      resolved card where reopened. Accept or ask.
- [ ] Phase 2's transitional state is gone: over a frame under the character or stash panel, nothing
      hidden lights, scrolls or moves.
- [ ] The sounds below, unchanged.

## Where each moved sound plays after phase 3

| Sound | Where | When (unchanged; now played by the UI scene's own action) |
|---|---|---|
| `inventory_open` / `inventory_close` | gear overlay | I or B, the Inventory icon, its ×, Esc, Q, the stash chest's E; once per action, none for a game-made close |
| `character_open` / `character_close` | gear overlay | C, the Character icon, its ×, Esc, Q |
| `menu_hover` / `menu_click` | settlement record | the pointer onto Close / Close pressed, before the held town comes in |

## Blocked By

Every phase 3 slice.

## Spec Reference

FS-TQZ5J §Change: Phase 3; FS-WDM0X S1–S9, § Pass 2b.
