---
id: I-8RZ51-18
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-14]
labels: [blocked]
title: "FS-8RZ51 slice 18: every tooltip says what its node does, specs in plain words with the look as a note, and the Passives group sums traversal stats (game-client)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-E (V26, V30)

**Author: agent.** It touches `PassiveTreeOverlay.ts` for one thing only, the faint note tone, so it
may run beside slice 17. Rebase onto 17 if both are in flight.

## Files it expects to touch

- `game-client/src/data/passiveTree.ts`:
  - each ability's and spec's effect line, in V26's words, keyed by id;
  - `STAT_WORDS` reads the unit (`max_hp` flat: "+5 max HP") and `primary_attribute` via
    `primaryAttributes`.
- `game-client/src/data/passiveTree.test.ts`
- `game-client/src/ui/passiveTreeModel.ts` and its test:
  - tip lines per kind;
  - no tier line;
  - the spec effect first and "Your look changes." last in a new `note` tone.
- `game-client/src/ui/PassiveTreeOverlay.ts`: the `note` tone's colour, the faint token
- `game-client/src/ui/characterSheet.ts` and `characterSheet.test.ts`: sum per stat and unit;
  `primary_attribute` into the class's attributes

## What to Build

V26's tooltip copy:

- traversal: "<Name>: <effect>", from the golden;
- ability: its name, its line, "Cast with 3.";
- specialization: its title, then what it does with its numbers, then a faint closing "Your look
  changes.".

V30: the Passives group shows a flat and a percent max HP as two lines, and Might under the
class's attribute(s).

## Acceptance Criteria

- [ ] FS-8RZ51 §Change "Client" rows 7 and 11.
- [ ] Each of the eight spec lines and four ability lines appears exactly as V26 writes it.
- [ ] A Vitality retuned in a test golden shows its new number with no copy edit.
- [ ] `npm test`, lint, `lint:fence` and `tsc` green.

## Blocked By

I-8RZ51-14 (the copy re-keyed and the model's tip lines).

## Spec Reference

FS-8RZ51 §Change: Tree v2 V26, V30. User stories 8, 9, 10, 17.
