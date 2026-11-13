---
id: I-S8Z2Y-2
status: done
implements: FS-S8Z2Y
blocked_by: [I-S8Z2Y-1]
labels: [blocked]
title: "FS-S8Z2Y slice 2: the owner judges the embossed corner row at render scale 1, 1.5 and 2, up to one round of tweaks (Nick)"
---
Implements FS-S8Z2Y §Requirements R12, §Acceptance Criteria "By eye"

**Lane: human (HITL).** The owner compares I-S8Z2Y-1's plain and emboss screenshots (listed in that
issue under "Screenshots"), then looks at the corner row in game at render scale 1, 1.5 and 2. An
agent makes the one round of tweaks he may ask for (the shadow's alpha or offset, the lift, the
shade), on I-S8Z2Y-1's files only, re-shoots the same set and keeps the suite green. A second
request is a new change.

## What to Build

Nothing at first. Run the client with I-S8Z2Y-1 in it and look at the corner row:

- in the town (a letter waiting, so the badge shows, and once as one arrives, for the glow) and in
  a field or a run (the greyed Mailbox), over a dark and a light ground;
- at render scale 1, 1.5 and 2;
- idle, and with the pointer on each icon.

## Acceptance Criteria

- [ ] Each icon reads raised: the shadow is seen, and is not a blur or a double image.
- [ ] The bronze reads lit from above, and the row still reads as one set with the badge on top.
- [ ] Cuts, the gear's rivets, the Party gap and the buckle read no worse than in the plain shots.
- [ ] The greyed Mailbox still reads as off.
- [ ] Tweak round: round 1 ☐ (at most one). It re-shoots the set and keeps
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .`, `npm run lint` and
      `npm run lint:fence` green.
- [ ] The owner approves the row.

## Blocked By

I-S8Z2Y-1.

## Spec Reference

FS-S8Z2Y §Requirements R12, §Acceptance Criteria "By eye", §Edge States; charter G7; user stories
1–16.

## Owner sign-off

2026-11-13: the owner looked at the whole corner row in game (bronze knockouts with a drop shadow and a top-lit gradient) and approved it: 「icon看起來可以 之後有新的徽章都照著個設計方式 並回main」.
