---
id: I-0037
status: done
implements: FS-0005
blocked_by: [I-0036]
labels: [blocked]
title: "FS-0005 slice 2: the semantic canvas palette, the font constant, and the Cinzel regression"
---
Implements FS-0005 §Requirements 6-13

The foundation the recolour consumes. Mechanical once I-0036 has authored the channels — this
slice reads them, it does not invent them.

## What to Build

### The semantic palette module (§R6-R9)

A new module exposing the canvas palette **by intent, never by colour**: `palette.wall`,
`palette.floor`, `palette.door`, `palette.container`, `palette.interactable`, `palette.enemy`,
`palette.player`, `palette.damage`, `palette.hud`, `palette.frame`, plus whatever the scenes
actually draw.

- Every value resolves from `BARROW_HEX`. **The module introduces no new hex literal.** If the
  palette lacks a value, add it to `theme.ts` *and* `globals.css` first, in that order, as a
  visible palette change (ADR-0013).
- **Scenes import this module, not `BARROW_HEX` directly** (§R9). `BARROW_HEX.slate` at a call
  site says nothing about whether slate is right for a door; `palette.door` does. This is the
  whole reason the module exists — it makes a 245-site diff reviewable and the next retheme one
  file instead of another sweep.
- Channel names should map onto I-0036's accent rule where they overlap, so `palette.interactable`
  and "amber means actionable" are visibly the same decision.

### Reconcile the base (§R8)

The canvas world background is `0x0d0b0a` — the value FS-0004 lifted to `0x1c1613`. Canvas and
DOM currently disagree about what "dark" means. `PhaserGame.tsx`'s `backgroundColor` was already
moved onto `BARROW.umber` in FS-0004; the in-scene fills were not.

### Typography (§R10-R13)

- **Fix the regression FS-0004 introduced.** Three text objects declare
  `fontFamily: "Cinzel, Georgia, serif"`. Cinzel is no longer loaded — those objects are silently
  rendering Georgia right now. This is cleanup of a change made in the sibling FS, not new work.
- **All 59 `add.text` objects declare a font family.** Only 3 do; the other 56 fall through to
  Phaser's default sans, which is the loudest non-medieval signal on the screen and costs nothing
  to fix.
- Phaser cannot read CSS custom properties, so the canvas needs its own font constant — defined
  **once**, beside or inside the palette module, never repeated per call site.
- Blackletter only on the surfaces I-0036 permits, never below 28px.

## Acceptance Criteria

- [ ] A semantic palette module exists; every name describes intent, not colour
- [ ] Every value resolves from `BARROW_HEX`; the module adds no new hex literal
- [ ] The canvas base matches the DOM base
- [ ] A single canvas font constant exists, defined once
- [ ] No text object references Cinzel anywhere
- [ ] All 59 `add.text` objects declare a font family
- [ ] Blackletter appears only on permitted surfaces, never below 28px
- [ ] No scene imports `BARROW_HEX` directly
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Blocked By

I-0036 — the channel names and the typography bound come from that amendment.

## Spec Reference

FS-0005 §Requirements 6-13 (§B. The canvas palette module, §C. Typography); §User Stories 7, 9,
15, 16, 17; §Edge States (a colour the semantic palette lacks).

## TDD Approach

Presentation code with no behavioural surface, so the loop is thin: the palette module is worth a
test asserting every exported channel resolves to a value present in `BARROW_HEX`, which is what
keeps §R7 true as the module grows.

- RED: a test asserting every `palette.*` value appears in `BARROW_HEX`
- GREEN: the module, sourcing from `BARROW_HEX`
