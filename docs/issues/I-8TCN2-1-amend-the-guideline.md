---
id: I-8TCN2-1
status: done
implements: FS-8TCN2
blocked_by: []
labels: [ready-for-agent]
title: "FS-8TCN2 slice 1: amend the design guideline for a separate Bone & Soot UI palette"
---
Implements FS-8TCN2 §Requirements A (1-7)

## What to Build

The visual SSOT changes before the code. Rewrite `game-client/docs/design-guideline.md` Part II
so it governs a web UI palette that is separate from the Part I game palette (ADR-0025), with
Bone & Soot as that palette and the Atmosphere layer as a bounded part of "Material & depth".
Bring `game-client/CLAUDE.md` and `docs/theming_plan.md` into line.

- Part II scope/direction and "Runtime source of truth": UI definition sites are `globals.css`
  `:root` and the UI table in `theme.ts`; `BARROW` / `BARROW_HEX` are the game palette only.
- Principle 1 amended to a neutral soot base, with the reason recorded (FS §A.3).
- Principle 2 and "Accent vs structure": bone is the torch; the four permitted uses unchanged;
  text on a bone fill is `--color-bg-dark`.
- Colour token table, contrast floor table and "Accent vs structure" table carry the FS §B
  values. Contrast figures are placeholders marked "measured in slice 3" where the browser
  measurement doesn't exist yet. Don't copy ratios from the FS as if measured.
- `--color-brass` documented as the iron-grey **structure role**; the name is a role, not a hue.
- New Atmosphere subsection under "Material & depth" (FS §D): what each piece is, where it may
  appear, the reduced-transparency and forced-colors fallbacks, and why it does not breach "no
  glow may read as emission".
- Part I (game) is not edited, except where it claims the DOM and canvas share one palette.

## Acceptance Criteria

- [ ] Part II cites ADR-0025 and names the UI definition sites
- [ ] Token, contrast and accent-vs-structure tables carry Bone & Soot values
- [ ] Principles 1 and 2 amended as FS §A.3-4 says, with the why
- [ ] Atmosphere subsection present with bounds and fallbacks
- [ ] `game-client/CLAUDE.md` colour table, CSS-var snippet and visual rules agree with the guideline, and point at it rather than restating where they can
- [ ] `docs/theming_plan.md` records the Bone & Soot UI direction and ADR-0025 in Direction and Status

## Blocked By

None

## Spec Reference

FS-8TCN2 §Requirements A.1-7; user stories 19, 22.
