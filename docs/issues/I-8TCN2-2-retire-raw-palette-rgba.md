---
id: I-8TCN2-2
status: done
implements: FS-8TCN2
blocked_by: [I-8TCN2-1]
labels: [ready-for-agent]
title: "FS-8TCN2 slice 2: retire raw palette rgba literals and extend the CSS fence"
---
Implements FS-8TCN2 §Requirements B (11-12)

## What to Build

About 150 raw `rgba()` triples of the old palette survive outside `:root` because the ADR-0013
CSS fence only matches hex. Replace each with a token, or a value derived from one, so a palette
change reaches everywhere. Then close the gap in the fence.

**This slice is behavior-preserving.** It runs against the *current* torch palette, so the page
should look the same before and after. That is the point: slice 3's recolour then lands
everywhere at once.

Sites (`grep -rhoE "rgba?\([0-9 ,]+" src/app src/components` lists them):
- brass `156,123,63` (~121), arcane `111,143,74`, oxblood `110,31,31`, amber `232,161,77`,
  surfaces `42,33,26` / `54,43,34`, warm highlights `255,245,225` / `255,240,214`
- warm darks `7,6,5`, `13,11,10`, `20,16,12`; leftover cold `10,10,20`, `6,6,14`, `85,102,119`
- in `src/app/globals.css`, `src/app/page.tsx`, `src/app/leaderboard/page.tsx`,
  `src/components/NotificationBell.tsx`

Mechanism: prefer `color-mix(in srgb, var(--color-x) N%, transparent)` for alpha variants of an
existing token. Where a value has no token (warm highlight, the dark overlays), add a token to
`:root` first (and to the guideline's token table) per ADR-0013's "a new colour is a token
first". Neutral `0,0,0` and `255,255,255` may stay literal. Inline `style={{}}` in TSX uses
`var()` / `color-mix()` strings the same way.

Fence: extend `game-client/scripts-check-css-tokens.sh` (and the TS-side fence if inline styles
are only reached by `lint-fence.sh`) to reject non-neutral `rgb()`/`rgba()` literals outside
`:root`. Prove it, as ADR-0013 requires: a fixture with a non-neutral rgba is rejected, and the
real tree passes.

## Acceptance Criteria

- [ ] No non-neutral raw `rgb()`/`rgba()` outside `:root` in the four files
- [ ] Any new tokens are in `:root` and in the guideline's token table
- [ ] The extended fence rejects a violating fixture and passes the real tree; `./lint-fence.sh` green
- [ ] The landing page, header, leaderboard and notification panel look unchanged in the browser on the current palette (spot-check computed colours of a few converted sites)
- [ ] `next build` passes

## Blocked By

I-8TCN2-1

## Spec Reference

FS-8TCN2 §Requirements B.11-12; user stories 16, 17, 20.
