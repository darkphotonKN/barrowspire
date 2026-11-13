---
id: I-XWHZP-1
status: open
implements: FS-XWHZP
blocked_by: []
labels: [ready-for-agent]
title: "FS-XWHZP slice 1: the lore line, its three tones, its queue and dust, and their gallery cards"
---
Implements FS-XWHZP §A, §B, §C, §G

**Type:** AFK. Client only. The look is delegated (the owner's art rule): judged after on the
gallery cards and a screenshot.

## Files expected

- new `game-client/src/ui/loreLine.ts` (`LORE_LINE` numbers, `LoreTone`, `LoreLine`; a pure queue step; the `LoreLines` piece that draws, times, queues and takes lines down; the dread tremor)
- new `game-client/src/render/effects/loreDust.ts` (the fine motes off a line; the dread ember burst)
- `game-client/src/utils/canvasPalette.ts` (`loreText`, `loreDread`, `loreHope` over existing `BARROW` tokens)
- `game-client/src/dev/gallery/effects.ts` (three cards under `loreDust`: lore, dread, hope) and its test
- Tests beside each new file

## What to Build

A lore line: italic body serif, 22 px, centred 20% of the view's height above its middle, at
depth 1990, camera-fixed, in its tone's colour with a soft ink shadow and no backing; a 900 ms
fade in, 2600 ms hold, 1100 ms fade out, 250 ms gap to the next (R2-R5). Fine motes rise off it
while it holds, a trail (≤ 1 per 80 ms, ≤ 40 alive) in the tone's colour (R6). Three tones over
existing tokens (R8): `lore` vellum, `dread` oxbloodText with a ≤ 12-mote ember burst (R9) and a
220 ms, 0.002 camera tremor (R10, the named exception to FS-KYPQ9 §B.5), `hope` brassBright.
Queue (R11-R14): one at a time, dread ahead of non-dread, at most 3 waiting (oldest non-dread
dropped), equal lines dropped. A clear empties it (R15). Reduced motion: text only; no `fx_dust`:
text only, one warning (R7). A resize keeps its place. Three gallery cards (R26).

## Acceptance Criteria

- [ ] A line draws in the body serif, italic, 22 px, at its place and depth, camera-fixed, in its tone's `palette` colour, with no backing.
- [ ] Its fade in, hold, fade out and gap are 900, 2600, 1100 and 250 ms.
- [ ] The queue: one showing; dread waits ahead of non-dread and behind earlier dread; a fourth waiting drops the oldest non-dread; an equal line is dropped.
- [ ] A dread start emits ≤ 12 ember motes once and trembles the camera once; lore and hope do neither.
- [ ] Reduced motion: no dust, burst or tremor, the fades kept; no `fx_dust`: no dust, one warning.
- [ ] A resize keeps the line at its place; `clear()` takes every line down and empties the queue.
- [ ] The gallery has a card per tone under `loreDust`; its registry test passes.
- [ ] The source scan still finds no shake in `render/effects` or either scene.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

None

## Spec Reference

FS-XWHZP §A R1-R7, §B R8-R10, §C R11-R15, §G R26; user stories 12-16, 20, 22-25.

## TDD Approach

- RED: the pure queue step: a dread line pushed behind two hope lines waits first.
- GREEN: the queue, then `LoreLines` against a recording scene, then the dust, then the cards.
