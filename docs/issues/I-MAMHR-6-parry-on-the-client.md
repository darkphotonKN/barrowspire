---
id: I-MAMHR-6
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-3, I-MAMHR-4]
labels: [blocked]
title: "FS-MAMHR slice 6: right-click parries, with the stance tell, the parry flash and the Parry card"
---
Implements FS-MAMHR §G (Requirements 35–38)

**Lane: agent** (game-client). Read `game-client/docs/design-guideline.md` and the "Wording & Tone"
rules in `game-client/CLAUDE.md` first; tokens only.

## What to Build

- **Right-click (R35).** A merc's right-click sends `cast_skill { skill_id: "parry" }`, unless the
  latest state shows `parry_open` or `parry_lockout` > 0, in which case it sends nothing. The
  **stance tell** (blade raised crosswise, a steel glint) shows from the click for as long as the
  server reports `parry_open`. No movement change: the merc is not rooted.
- **Parry flash (R36).** Whenever `current_player.parries` rises, the merc's figure plays a short,
  bright steel-on-steel flash. The first state after connecting or reconnecting sets the baseline
  and flashes nothing.
- **HUD (R37).** On FS-8AY7S's HUD: the merc's parry charges as 3 pips labelled "Parry:"; the ability
  card names **Parry**, the right-mouse glyph, and a grim-voice line meaning "raise the blade as a
  blow lands to turn it aside and earn a parry charge; three make the next cut a riposte". The card
  greys out while `parry_lockout` > 0. If FS-8AY7S already placed this copy, this half is a check.
- **Teammates (R38).** Nothing of this is drawn for another delver.

## Acceptance Criteria

- [ ] Right-click sends `parry`; with `parry_open` or a lockout in the latest state it sends nothing.
- [ ] The stance tell shows while `parry_open` and clears when it closes.
- [ ] A rise in `parries` plays the flash, including at 3 parry charges; the first state after
      (re)connecting does not.
- [ ] The HUD shows 3 pips labelled "Parry:"; the card reads **Parry** with its line, greyed while
      `parry_lockout` > 0.
- [ ] Token fence and client tests pass.

## Blocked By

- I-MAMHR-3 (the client knows the merc), I-MAMHR-4 (the server parries and sends the fields).
- **FS-8AY7S: the bottom-left resource bars with the merc's 3 pips, and the bottom-right ability
  card** (including its greyed state).

## Spec Reference

FS-MAMHR §G Requirements 35–38; §F 28; §Acceptance Criteria "Client presentation" rows 3–5;
User Stories 19–21.

## Files expected

- `game-client/src/scenes/BarrowspireScene.ts` (right-click branch, state reading)
- `game-client/src/render/effects/parry.ts` (new: stance tell and flash) + `parry.test.ts`
- the client state type for `current_player` (`game-client/src/assets/types/` or wherever FS-8AY7S puts the resource fields)
- FS-8AY7S's ability card copy table (the merc's entry only)
