---
id: I-3EBCA-15
status: open
implements: FS-3EBCA
blocked_by: [I-3EBCA-14]
labels: [blocked]
title: "FS-3EBCA slice 15: the owner judges the bronze knockout rucksack in game at render scale 1, 1.5 and 2, up to one round of tweaks (Nick)"
---
Implements FS-3EBCA §Change: The inventory icon is a bronze knockout rucksack (R15, Acceptance Criteria "By eye")

**Lane: human (HITL).** The owner looks at the Inventory icon in game, at render scale 1, 1.5 and
2, with I-3EBCA-14's screenshots (listed in that issue under "Screenshots") beside him. An agent
makes the one round of tweaks he may ask for, on I-3EBCA-14's files only. The agent then
re-shoots the same sixteen PNGs, and the suite stays green. A second request is a new change, not
this slice (K7).

## What to Build

Nothing at first. Run the client with I-3EBCA-14 in it. Look at the corner row in the town and in
a field:

- at render scale 1, 1.5 and 2 (the browser's zoom, or a screen of that density);
- idle, and with the pointer on the Inventory icon;
- once with the window moved between densities, to see it rebuild.

## Acceptance Criteria

- [ ] It reads as a round backpack with a side pocket on each side, not as a head with ears or a
      bag with handles.
- [ ] Its bedroll, flap, hasp and pockets read at 2 and 1.5. Its silhouette, flap and pockets read
      at 1.
- [ ] Its cut lines are smooth, with no jagged steps, at all three scales, and no corner wedge at
      the hasp catches the eye (§ Edge States).
- [ ] The bronze sits with the four amber line glyphs, reads as pressable, and lifts clearly under
      the pointer, over a field and in the town.
- [ ] It is redrawn sharp after a change of render scale.
- [ ] Tweak round: round 1 ☐ (at most one). It re-shoots the set and keeps
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      green.
- [ ] The owner approves the icon.

## Blocked By

I-3EBCA-14.

## Spec Reference

FS-3EBCA §Change: The inventory icon is a bronze knockout rucksack: R15, Acceptance Criteria
"By eye", Edge States (render scale 1 and 1.5, a sharp corner of a cut, a light and a dark
ground); charter K7; user stories 1–7, 11–13, 15 and 19.
