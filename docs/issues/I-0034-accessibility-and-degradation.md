---
id: I-0034
status: done
implements: FS-0004
blocked_by: [I-0031, I-0032, I-0033]
labels: [blocked]
title: "FS-0004 slice 6: accessibility and degradation — measure contrast, honour user preferences"
---
Implements FS-0004 §Requirements 30-34

**Author: human** — do NOT hand this to `/develop`. The contrast work may conclude that a token
value has to move, which is a change to I-0029's authored palette, not a local fix. That is a
decision, not a task.

Runs after every view is reskinned, because it verifies the finished surface.

## What to Build

### Measure contrast against the lifted bases (§R31)

**The guideline's claim that vellum and amber "pass" was made against `#0d0b0a`.** Lifting the
bases invalidates it. Measure, do not assume:

- body text (`--color-text`, vellum) on the lifted page and card bases
- muted text (`--color-text-dim`) on both
- dim text (`--color-text-muted`, `#6f6647`) on both — **this is the one most likely to fail.** It
  is already the dimmest token in the palette and the lift moves the ground toward it.
- text on amber fills — must stay dark (`--color-bg-dark`), never white

Report the measured ratios against the contrast floor I-0029 stated. **If a token falls below it,
the fix is to move the token**, which propagates everywhere, not to override at the call site.
Raise it rather than patching around it.

### Honour user preferences (§R32-R33)

- `prefers-reduced-motion: reduce` — every transition and entrance animation suppressed. The
  guideline already required this; verify it survived the reskin.
- `prefers-reduced-transparency` — `backdrop-filter: blur(20px)` sits on the header, dropdowns,
  modals and cards. With transparency reduced they must resolve to **opaque surfaces that still
  read as distinct layers**, not a flat undifferentiated field.
- `forced-colors` — the OS replaces colours wholesale. Grain, vignette and blur must not leave
  text on an unreadable ground.

### Verify the material layer degrades (§R30)

With grain, gradients and vignette suppressed, **every view stays legible and correctly laid
out**. The material layer is finish, never structure; if suppressing it breaks a layout, that
layout was depending on decoration.

### Focus rings (§R34)

Focus-visible brass ring on every interactive element, across all views. A restyle is the classic
way to lose these — verify by tabbing the full path through each page, including the modal focus
trap and `Esc` to close.

### Grain cost

A full-page SVG-noise overlay composited with multiple blurred surfaces is an **unmeasured cost**.
Check scroll performance on a high-DPI and a large viewport. If it degrades, scope the grain to
surfaces rather than the page — and say so in the PR, rather than quietly shipping a slower page.

## Acceptance Criteria

- [ ] Measured contrast ratios reported for body, muted, dim, and on-amber text against both bases
- [ ] Every measured ratio meets I-0029's stated floor, or the token was moved and re-measured
- [ ] Text on amber fills is dark, never white
- [ ] `prefers-reduced-motion: reduce` suppresses every transition and entrance animation
- [ ] `prefers-reduced-transparency` resolves blurred surfaces to opaque, still-distinct layers
- [ ] `forced-colors` leaves all text legible
- [ ] Every view is legible and correctly laid out with grain, gradients and vignette suppressed
- [ ] Focus-visible ring present on every interactive element in every view
- [ ] Full keyboard path verified per page, including modal focus trap and `Esc`
- [ ] Scroll performance checked at high-DPI and large viewport; any grain scoping is documented
- [ ] Every page renders correctly at 640px and below
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Blocked By

I-0031, I-0032, I-0033 — verifies the finished surface, so every view must be reskinned first.

## Spec Reference

FS-0004 §Requirements 30-34; §User Stories 12, 17, 18, 19, 21; §Edge States (material layer under
`forced-colors`; material layer with transparency reduced; grain on high-DPI; contrast after the
lift at the muted end).
