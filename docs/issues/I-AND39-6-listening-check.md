---
id: I-AND39-6
status: open
implements: FS-AND39
blocked_by: [I-AND39-2, I-AND39-3, I-AND39-4, I-AND39-5]
labels: [blocked]
title: "FS-AND39 slice 6: the owner's listening check of the gameplay sound effects (HITL)"
---
Implements FS-AND39 §Acceptance Criteria

**Lane: HITL (owner).** Restart the client only. No server change.

## What to Check

- **The board.** Open `/dev/sounds` and press each of the 11. Judge each sound:
  - Does it read as wood, leather, iron, cloth or flesh, and never a synth beep?
  - Is it short and free of clicks?
  - Are `hit_monster` and `hit_player` told apart, and `chest_open`, `loot_open` and `stash_open`
    told apart?
  - Is the set balanced?

  Name any sound to remake, and say louder or softer per effect. Each is a `Tunes FS-AND39`: the
  ceiling 0.7, the trims 1.0 and the recipe numbers.
- **The run.** Strike a monster and hear `hit_monster`; a teammate's strike sounds too. Take a
  hit and hear `hit_player`; a teammate's wound is silent. Cast your class's ability:
  - warrior Dash;
  - mage Triple Fireball, while the plain fireball stays silent;
  - archer Shadow Shot, on the release, not the draw;
  - mercenary parry.

  Open a chest (lid), a sack and a drop pile (rustle). A timed open sounds at the open. Take an
  item (pouch). Equip, unequip and swap (buckle).
- **The field.** The same hits, casts, pile and clearing chest, pickups and gear.
- **The town.** E at the stash plays the lid with the inventory's open sound. Equip, unequip and
  stash↔bag moves play `item_swap`.
- **The level.** In OPTIONS, the Sound effects slider sets these too, and 0 silences them. The
  interface sounds and the music behave as before.
- **Chrome and Safari.** Both play every effect.

## Acceptance Criteria

- [ ] Every check above passes, or a finding is written back to FS-AND39 (a `Tunes` note or a
      `## Change:`).

## Blocked By

I-AND39-2, I-AND39-3, I-AND39-4, I-AND39-5

## Spec Reference

FS-AND39 §Acceptance Criteria: the owner's listening check; user stories 25–28.

## Files it expects to touch

- This issue file (ticks, findings, status). On a pass, `spec-update` flips FS-AND39 to shipped
  and checks its line. Tuning findings touch `game-client/src/audio/gameplaySfx.ts`'s table only.
