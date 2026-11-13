---
id: I-J1672-1
status: done
implements: FS-J1672
blocked_by: []
labels: [ready-for-agent]
title: "FS-J1672 slice 1: bare corner icons, no seal, and the envelope's count badge (game-client)"
---
Implements FS-J1672 §Requirements R1–R12, §Acceptance Criteria (all but "By eye")

The owner, 2026-11-13: 「把ui右下角的功能icon移除外匡 信箱icon中間的圈圈有點怪拿掉」, then
「只有中間那個圈圈拿掉 不然就改一下造型」.

## What to Build

The whole corner row in one slice, since half a row on plates looks unfinished (D1):

- `HudCorner.draw` stops drawing `carvedPanel`: Menu, Inventory, Character and Party draw only
  their glyphs; the greyed Mailbox draws only its faint envelope lines, no `drawWaxSeal`.
- `drawParty` stops filling the front bust in `palette.hudPanel`; the back bust's lines are left
  undrawn where the front bust stands, so the pair reads as before with nothing filled (R3).
  The other glyphs keep their exact strokes.
- `MailboxEnvelope.drawBody` stops drawing `carvedPanel`; `drawSeal` stops drawing the wax seal
  and draws the count badge instead (R8, R9): ember, 14 px tall, rounded ends, the lit seal's
  rim, the count `min(waitingCount, 99)` in 11 px bold `hudText`, centred at the top-right
  corner of the envelope's lines and moved left only if it would leave the 58 × 46 rect; no
  badge, and no count text, when nothing waits.
- Zones, cursors, `covers`, hover labels, the glow and the pulse stay exactly as they are.
- `drawWaxSeal` stays exported: the letter list's unread dot (`LetterPanel`) still uses it.

Files expected: `game-client/src/ui/HudCorner.ts`, `game-client/src/ui/HudCorner.test.ts`,
`game-client/src/ui/MailboxEnvelope.ts`, and the envelope's tests (the `MailboxEnvelope`
`describe` blocks in `game-client/src/ui/LetterPanel.test.ts`, or a new
`game-client/src/ui/MailboxEnvelope.test.ts` if they move). Not `carvedPanel.ts`,
`hudCornerLayout.ts`, `letterPanelLayout.ts`, `LetterPanel.ts`, `@/mailbox/mailbox` or any scene
(FS-J1672 §Bounds).

## Acceptance Criteria

- [ ] No corner icon's graphics draw `carvedPanel` (no rounded-rect ground, brass rule or stud) in
      the town, a field or a run; the greyed Mailbox draws no seal.
- [ ] No glyph fills a shape; the Party glyph's back bust is not drawn where the front bust stands.
- [ ] Glyph colours and alphas as before, idle and hovered; the greyed Mailbox unchanged under the
      pointer.
- [ ] Zones (rects, depth 1000, hand cursor except greyed), `covers` and hover labels unchanged.
- [ ] The envelope draws no seal in any state; with `waitingCount` 3 a badge reads "3" centred at
      (789, 669) at 1080 × 720 and (989, 669) at 1280; 120 reads "99", rim included inside
      (742, 658, 58, 46); 0 draws no badge and no count text; a lowered count follows at once.
- [ ] A pulse still plays three glows (yoyo, repeat 2) round the rect and leaves the badge.
- [ ] The letter list's unread seal dot still draws; `carvedPanel.ts` is untouched.
- [ ] No raw colour literal; `npx vitest run --maxWorkers=4 --minWorkers=1`,
      `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.

## Blocked By

None.

## Spec Reference

FS-J1672 §Requirements R1–R12 and §What this changes in its owners; user stories 1–11. Supersedes,
without editing them, FS-3EBCA R2, R3 and its "carved plate" criterion, and FS-1GZGD D12, R33,
R35 and § Change C2's "plate, lines, seal, count and pulse are drawn exactly as before".

## TDD Approach

- RED: `HudCorner.test.ts` — the fake graphics see no `carvedPanel` grounds (no `fillRoundedRect`)
  for any icon, no `fillCircle` (seal) on the greyed Mailbox, and no `fillPath`/`fillCircle` from
  the Party glyph; envelope tests — no seal circle at `envelopeSealAt`, a badge with its count text
  at (789, 669) when `waitingCount` is 3, none at 0, "99" inside the rect at 120.
- GREEN: drop the `carvedPanel` calls, drop the seal, draw the badge, draw the back bust without
  the covered stretch.
