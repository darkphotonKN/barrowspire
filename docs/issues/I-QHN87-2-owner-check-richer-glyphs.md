---
id: I-QHN87-2
status: open
implements: FS-QHN87
blocked_by: [I-QHN87-1]
labels: [blocked]
title: "FS-QHN87 slice 2: the owner judges the richer corner glyphs from screenshots, up to two rounds of tweaks (Nick)"
---
Implements FS-QHN87 §Requirements R15, §Acceptance Criteria "By eye"

**Lane: human (HITL).** The owner looks at I-QHN87-1's screenshots (listed in that issue under
"Screenshots"). An agent makes each tweak he asks for, on I-QHN87-1's files only (`HudCorner.ts`,
`HudCorner.test.ts`, `MailboxEnvelope.ts` (lines and width only), `MailboxEnvelope.test.ts`, and
the guideline's Corner row paragraph if a description changes). The agent then re-shoots the same
twelve PNGs and keeps the suite green. There are at most two rounds (G7). A third request is a new
change, not this slice.

## What to Build

Nothing at first. Look at the screenshots:

- the town row, idle and hovered, at render scale 1 and 2, over a light and a dark ground;
- the field row with the greyed Mailbox, at render scale 1 and 2;
- the two enlargements.

## Acceptance Criteria

- [ ] The row no longer feels empty. The gear, haversack, hooded figure, two hooded figures and
      tied envelope each read as what they are at render scale 2, and their main shapes at 1.
- [ ] No corner shows a notch at render scale 2, and no icon reads as a blob at 1. Note anything
      I-QHN87-1 reported as mushed or dropped (the rivets, a haversack part).
- [ ] Nothing reads as a circle in the envelope's middle. The badge hides none of its cord, knot
      or fold.
- [ ] Translucent corners (idle 0.85, greyed 0.6) don't look beaded (FS § Edge States).
- [ ] Tweak rounds: round 1 ☐ / round 2 ☐ (at most two). Each round re-shoots the set and keeps
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      green.
- [ ] The owner approves the row.

## Blocked By

I-QHN87-1.

## Spec Reference

FS-QHN87 §Requirements R14, R15, §Acceptance Criteria "By eye", §Edge States "Render scale 1" and
"Translucent strokes"; charter G7; user stories 1–14, 17 and 18.
