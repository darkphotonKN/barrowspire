---
id: I-8TCN2-4
status: done
implements: FS-8TCN2
blocked_by: [I-8TCN2-3]
labels: [ready-for-agent]
title: "FS-8TCN2 slice 4: the Atmosphere layer"
---
Implements FS-8TCN2 §Requirements D (16-22)

## What to Build

The token-derived Atmosphere that was on in the approved preview, built into `globals.css` as
real CSS. No raw colour anywhere; everything comes from `var(--color-*)` via gradients and
`color-mix()`.

Reference values from the approved preview, each expressed through tokens:
- **Hero title** (landing hero `h1`, and any page `h1` in blackletter): `linear-gradient(180deg,
  primary-bright 0%, primary 48%, primary darkened to ~62% 100%)`, clipped to text, with
  `drop-shadow(0 0 28px <primary @ 35%>)` and `drop-shadow(0 2px 0 <black @ 60%>)`.
- **Hero glow** (landing hero section only): `radial-gradient(ellipse 55% 42% at 50% 40%,
  <primary @ 16%>, transparent 70%)` plus `radial-gradient(ellipse 90% 60% at 50% 110%,
  <brass @ 10%>, transparent 70%)`.
- **Section `h2`**: `--color-brass-bright`.
- **Primary CTA** (the one per view): `box-shadow: inset 0 0 0 1px primary-bright, 0 0 26px
  <primary @ 35%>`. Secondary buttons get nothing.
- **Vignette**: deepen the existing `body::after` vignette to about `radial-gradient(ellipse 85%
  75% at 50% 40%, transparent 50%, <black @ 60%> 100%)`, fixed, pointer-events none, below the
  header and popups.

Prefer a semantic hook (a class on the hero section, title and primary CTA) over structural
selectors like `main > section:first-of-type`. Add the class in the page if needed; that's
presentation, not layout.

Fallbacks: `@supports not (background-clip: text)` and `prefers-reduced-transparency` give a
solid `--color-primary` title; `forced-colors: active` drops the whole layer.

## Acceptance Criteria

- [ ] The landing page matches the approved preview: gradient bone title, torch glow in the hero, iron-bright `h2`s, glowing primary CTA, deepened vignette
- [ ] No raw colour introduced; the CSS fence stays green
- [ ] With the layer removed, every page is still legible and laid out the same
- [ ] Reduced transparency gives a solid title; forced colors drops the layer
- [ ] `./lint-fence.sh` green, `next build` passes

## Blocked By

I-8TCN2-3

## Spec Reference

FS-8TCN2 §Requirements D.16-22; user stories 1, 4, 7, 8, 20.
