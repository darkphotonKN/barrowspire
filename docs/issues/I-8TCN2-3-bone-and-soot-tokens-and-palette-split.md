---
id: I-8TCN2-3
status: done
implements: FS-8TCN2
blocked_by: [I-8TCN2-2]
labels: [ready-for-agent]
title: "FS-8TCN2 slice 3: swap in the Bone & Soot tokens and split the UI palette from the game palette"
---
Implements FS-8TCN2 §Requirements B (8-10), §Requirements C (13-15)

## What to Build

The actual recolour, plus the palette split ADR-0025 decides.

- `globals.css` `:root` takes the FS §B.8 values. Re-derive the opaque surface equivalents,
  border alphas, glow, focus-ring and carved-edge tokens against the new base.
- `src/utils/theme.ts` gains a **UI table**, separate from `BARROW` / `BARROW_HEX`, holding the
  UI palette as CSS strings, with a comment that it must agree with `:root` (ADR-0025).
- `src/app/subscription/page.tsx` Stripe theming (card element styles and the Payment Element
  `appearance`) reads the UI table, not `BARROW`. Grep for any other DOM import of `BARROW`
  (`src/app`, `src/components`, `src/marketplace`) and migrate it too.
- Measure in the browser: every text token, bone on soot, soot on bone, and each `--rarity-*` at
  badge size against `--color-bg-dark`. Lift any rarity under 4.5:1 within its own hue. Write the
  measured figures into the guideline's contrast and rarity tables, replacing slice 1's
  placeholders.
- Look at every route for amber or warm-umber leftovers: `/`, `/login`, `/register`, `/portal`,
  `/profile`, `/leaderboard`, `/subscription`, `/marketplace`, plus header, user menu and
  notification panel. If grain reads as noise on the neutral base, lower its opacity and record
  the value in the guideline.

## Acceptance Criteria

- [ ] `:root` carries the §B.8 values; the `theme.ts` UI table mirrors them
- [ ] No DOM file imports `BARROW`; Stripe theming reads the UI table
- [ ] `BARROW` / `BARROW_HEX` and every Phaser file are byte-identical to `main` (`git diff main -- game-client/src/scenes game-client/src/render` empty, and `BARROW*` blocks unchanged)
- [ ] Measured contrast figures in the guideline; every text token and rarity ≥ 4.5:1
- [ ] Every listed route looked at, with no amber or umber leftovers
- [ ] `./lint-fence.sh` green, `next build` passes

## Blocked By

I-8TCN2-2

## Spec Reference

FS-8TCN2 §Requirements B.8-10, C.13-15; user stories 2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18, 21.
