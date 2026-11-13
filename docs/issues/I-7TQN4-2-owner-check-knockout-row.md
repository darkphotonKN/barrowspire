---
id: I-7TQN4-2
status: done
implements: FS-7TQN4
blocked_by: [I-7TQN4-1]
labels: [blocked]
title: "FS-7TQN4 slice 2: the owner judges the knockout corner row in game at render scale 1, 1.5 and 2, up to one round of tweaks (Nick)"
---
Implements FS-7TQN4 §Requirements R21, §Acceptance Criteria "By eye"

**Lane: human (HITL).** The owner looks at the corner row in game, at render scale 1, 1.5 and 2,
with I-7TQN4-1's screenshots (listed in that issue under "Screenshots") beside him. An agent makes
the one round of tweaks he may ask for, on I-7TQN4-1's files only, re-shoots the same twenty-six
PNGs, and keeps the suite green. A second request is a new change, not this slice (N10).

## What to Build

Nothing at first. Run the client with I-7TQN4-1 in it. Look at the corner row:

- in the town (with a letter waiting, so the badge shows, and once as a new one arrives, to see
  the glow) and in a field or a run (the greyed Mailbox);
- at render scale 1, 1.5 and 2 (the browser's zoom, or a screen of that density);
- idle, and with the pointer on each icon;
- once with the window moved between densities, to see every icon rebuild, the envelope included.

## Acceptance Criteria

- [ ] The row reads as one set of five bronze knockouts with the rucksack.
- [ ] The gear's centre hole, ring and four rivet holes read at 2 and 1.5; its hole and ring at 1.
- [ ] The Character's shoulders read as smooth armour plates, with no lump or hook, at all three
      scales; its neck gap, seams, baldric and buckle read at 2 and 1.5.
- [ ] Party reads as three people, the gap separating the front bust from the two behind.
- [ ] The envelope reads as a letter, its flap and folds clear, the badge on it; it still glows on a
      new letter.
- [ ] The greyed Mailbox reads as off, over a field and in a run.
- [ ] Cut lines are smooth, with no jagged steps and no corner wedge, the rucksack's included.
- [ ] Every icon is redrawn sharp after a change of render scale.
- [ ] Tweak round: round 1 ☐ (at most one). It re-shoots the set and keeps
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      green.
- [ ] The owner approves the row.

## Blocked By

I-7TQN4-1.

## Spec Reference

FS-7TQN4 §Requirements R21, §Acceptance Criteria "By eye", §Edge States (render scale 1 and 1.5, a
sharp corner of a cut, the badge, the glow during a pulse, a light and a dark ground); charter N10;
user stories 1–22.

## Owner sign-off

2026-11-13: the owner looked at the whole corner row in game (bronze knockouts with a drop shadow and a top-lit gradient) and approved it: 「icon看起來可以 之後有新的徽章都照著個設計方式 並回main」.
