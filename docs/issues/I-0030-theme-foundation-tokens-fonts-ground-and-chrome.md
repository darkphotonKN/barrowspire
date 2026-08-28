---
id: I-0030
status: done
implements: FS-0004
blocked_by: [I-0029]
labels: [blocked]
title: "FS-0004 slice 2: theme foundation — tokens, fonts, page ground, material primitives, site chrome"
---
Implements FS-0004 §Requirements 7-15, 18-19, 21, 24, 25-29, 38

The foundation every view slice consumes, plus the chrome that proves it renders. Mechanical once
I-0029 has authored the values — this slice reads them, it does not invent them.

## What to Build

### Tokens (§R7-R9)

- Define the tokens the guideline already marks *(new)* in `globals.css`: `--color-bg-card-2`,
  `--color-border-strong`, `--color-text`, `--color-primary-bright`, and the five `--rarity-*`
  variables. The guideline flags these as required before further UI work.
- Reconcile `src/utils/theme.ts` (`BARROW` / `BARROW_HEX`) with the CSS custom properties. They
  are the same palette in two forms — CSS strings for the DOM, `0x` ints for Phaser. **A value in
  one and not the other is a defect**, and FS-0005 inherits whatever this slice leaves.
- Add Tailwind v4 `@theme` declarations for every token that must resolve as a utility.

These two files become the **only** places a raw hex may appear (§R10). Everything after this
slice refers; it does not restate.

### Fonts (§R11-R14)

- Load the blackletter display face and the body serif via `next/font/google` in `layout.tsx`,
  following the existing `Cinzel` / `EB_Garamond` pattern, each exposed as a CSS variable.
- **Every stack declares a real fallback chain ending in a generic family.** Blackletter is a
  single-purpose display face and the most likely font in the app to fail to load; it must degrade
  to a legible serif, never to the browser default sans.
- `--font-heading` / `--font-body` remain the styling contract. Component code must not name a
  face directly — that indirection is what makes the §Risks fallback a two-file change instead of
  a sweep.

### Page ground (§R18-R19, R25, R28)

- Base and card surfaces take the lifted values from I-0029.
- `body { color: #fff }` becomes vellum via `--color-text`. Pure white is off-palette and cold.
- Page-level grain via an inline SVG `data:` URI. **No image files** — `public/` stays empty.
- Page vignette darkening the edges, per the guideline's lighting rule.

This is the first visible change in the feature: the page stops being black and starts being
material.

### Material primitives (§R21, R26-R27, R29)

The reusable vocabulary the view slices consume. Build it once here rather than six times later:

- Layered surface gradients that read as carved stone or parchment rather than flat fills, for
  cards, panels, modals, dropdowns.
- Inset shadows for beveled/engraved edges, within the guideline's existing radius scale.
- CSS-drawn ornament — corner marks, brass rules, dividers.
- Re-tune the 34 glow/shadow declarations in `globals.css` to the guideline's warm brass/amber
  range at low opacity. **No glow may read as emission** — this is a primary source of the neon
  impression.

### Site chrome (§R13, R15, R24)

Applies the vocabulary to the surfaces that appear on every page, which is what makes this slice
verifiable rather than theoretical: `Header.tsx`, `UserMenu.tsx`, `NotificationBell.tsx`, and the
`header-*` (9), `nav-*` (6), `menu-*` (12), `logo-*` (3) and `btn-*` (6) class families.

- Active nav is one of amber's permitted surfaces; the rest of the chrome moves to brass/vellum.
- `NotificationBell.tsx` carries a `styled-jsx` block **outside `globals.css`** — including a
  gradient to `#00d4e6` at line 248. It is exactly the kind of place a stylesheet sweep misses.
- Blackletter on the logo only, above I-0029's size bound.

### Package name (§R38)

`package.json` `name` is still `void-raiders`. Change it. No other field.

## Acceptance Criteria

- [ ] All *(new)* tokens and the five `--rarity-*` variables exist in `globals.css`
- [ ] `theme.ts` and `globals.css` define the same palette, value-for-value
- [ ] `@theme` declarations exist for every token used as a utility
- [ ] Both faces load via `next/font/google`, each with a fallback chain ending in a generic family
- [ ] The page renders legibly with the blackletter face blocked (test with it blocked, not cached)
- [ ] `--font-heading` / `--font-body` are the only face references in component code
- [ ] Base and card surfaces use I-0029's lifted values
- [ ] No `#fff` text remains; `body` is vellum
- [ ] Grain and vignette render, sourced from an inline SVG `data:` URI — no files in `public/`
- [ ] Surface gradients, beveled edges and CSS ornament exist as reusable classes
- [ ] No glow reads as emission
- [ ] Header, user menu and notification bell are fully reskinned
- [ ] `NotificationBell.tsx`'s `styled-jsx` block contains no raw hex, including `#00d4e6`
- [ ] Blackletter appears on the logo and nowhere below the size bound
- [ ] `package.json` no longer names `void-raiders`
- [ ] `npm run build` and `npm run lint` pass

## Blocked By

I-0029 — this slice reads the values that slice authors. Starting before it means inventing
values the SSOT will contradict.

## Spec Reference

FS-0004 §Requirements 7-15, 18-19, 21, 24 (NotificationBell), 25-29, 38; §User Stories 4, 6, 8, 9,
20, 22; §Edge States (font fails to load).
