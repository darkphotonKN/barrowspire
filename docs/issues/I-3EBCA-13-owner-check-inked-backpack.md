---
id: I-3EBCA-13
status: done
implements: FS-3EBCA
blocked_by: [I-3EBCA-12]
labels: [blocked]
title: "FS-3EBCA slice 13: the owner judges the inked backpack from screenshots, up to two rounds of tweaks (Nick)"
---
Implements FS-3EBCA §Change: The inventory icon is an inked backpack (R14, Acceptance Criteria "By eye")

**Lane: human (HITL).** The owner looks at I-3EBCA-12's screenshots (listed in that issue under
"Screenshots"). An agent makes each tweak he asks for on I-3EBCA-12's files only (`HudCorner.ts`,
`HudCorner.test.ts`, and the guideline's Corner row paragraph if the description changes). The agent
then re-shoots the same ten PNGs, and the suite stays green. There are at most two rounds (D7). A
third request is a new change, not this slice.

## What to Build

Nothing at first. Look at the screenshots: idle and hovered, at render scale 1 and 2, over a light
ground and a dark ground, plus the two enlargements.

## Acceptance Criteria

- [ ] It reads as a dark-fantasy inked backpack, not a realistic one.
- [ ] Its flap, buckles, straps, side pouch, bedroll and shoulder strap read at render scale 2. Its
      silhouette, flap and buckles read at 1.
- [ ] It sits with the four line glyphs in weight.
- [ ] Its amber edge reads as "pressable" and brightens under the pointer, over both grounds.
- [ ] Tweak rounds: round 1 ☐ / round 2 ☐ (at most two). Each round re-shoots the set and keeps
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      green.
- [ ] The owner approves the icon.

## Blocked By

I-3EBCA-12.

## Spec Reference

FS-3EBCA §Change: The inventory icon is an inked backpack: R13, R14, Acceptance Criteria "By eye",
Edge States "Render scale 1" and "A light ground / A dark ground"; D7; user stories 2, 3, 11, 12, 15
and 16.

## Superseded

2026-11-13: built and looked at, then superseded by FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack (I-3EBCA-14/15).
