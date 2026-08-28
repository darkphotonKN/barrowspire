---
id: I-0031
status: done
implements: FS-0004
blocked_by: [I-0029, I-0030]
labels: [blocked]
title: "FS-0004 slice 3: landing page — rarity ramp, the starfield decision, lore copy"
---
Implements FS-0004 §Requirements 15-17, 20, 23, 35-36

**Author: human** — do NOT hand this to `/develop`. Carries one irreversible-feeling judgment
call (§R23) and one rule the guideline had to be amended to resolve (the Legendary exception).

The first page anyone sees, and currently the least medieval thing in the repo.

## What to Build

### The rarity ramp (§R16-R17)

`src/app/page.tsx:354-359` declares a component-local `rarityColors` object that **contradicts the
guideline's rarity table on every single entry**:

| Rarity | Code today | Guideline |
|---|---|---|
| Common | `#4a4a44` grey | `#8a7d5c` vellum-dark |
| Uncommon | **missing entirely** | `#6f8f4a` arcane green |
| Rare | `#e8a14d` **amber** | `#4a6b6f` necrotic teal |
| Epic | `#bf5fff` **neon purple** | `#9c7b3f` brass |
| Legendary | `#6f8f4a` green | `#f2b866` amber-bright |

Purple, green and amber badges side by side is about as neon as a palette gets, and `Rare` is
currently burning the one-torch colour on a badge.

- Reconcile to the guideline's table; add the missing `Uncommon`.
- Colours come from the `--rarity-*` tokens (I-0030), **not** from a component-local object.
- Every badge keeps its text label — rarity is never signalled by hue alone (§R17). Already true
  in `RarityBadge`; keep it true.
- **`Legendary` is amber-bright**, which reintroduces amber wherever legendary relics grid. I-0029
  documents this as an explicit exception to the one-torch rule. Implement against that exception;
  if I-0029 did not settle it, stop and settle it there rather than deciding here.

### The starfield (§R23)

`src/components/ParticleText.tsx` renders a mouse-reactive canvas particle system with `Star`,
`twinkleSpeed` and `twinkleOffset`. It is a **starfield on the landing page of a barrow-crawl** —
the wrong world entirely, and because it is canvas rather than CSS, no palette work reaches it.

**This is an explicit decision, made and stated, not made silently:**
- *Remove it*, or
- *Rework it* so the particles read as embers, drifting dust or falling ash in palette colours,
  with the stars and twinkle gone.

Either is acceptable. Choosing by default — leaving it because it was there — is not.

### Amber demotion and copy (§R15, §R20, §R35-R36)

- Apply one-torch-per-view to the landing page: the primary CTA and the page `h1`. The `splash-*`
  (8) and `treasure-*` (9) class families are the bulk of the work.
- `#bf5fff` at `page.tsx:358` goes with the rarity fix.
- `operator` at `page.tsx:151` — on `CLAUDE.md`'s explicit **never use** list, and still shipped.
  Delvers, per `CONTEXT.md`.
- Version footer at `page.tsx:228` becomes `v0.1 // The Barrow-Deep`. The `v0.1` itself stays.

## Acceptance Criteria

- [ ] The rarity map matches the guideline's table on all five entries, `Uncommon` included
- [ ] Rarity colours resolve from `--rarity-*` tokens; no component-local colour object remains
- [ ] Every rarity badge renders its text label
- [ ] `#bf5fff` is gone
- [ ] `ParticleText` is removed, or reworked to embers/dust/ash in palette colours with no stars
- [ ] The decision made for `ParticleText` is stated in the PR description, not just in the diff
- [ ] Amber appears only on the primary CTA and the page `h1`
- [ ] No `operator` in user-facing strings on this page
- [ ] Version footer reads `v0.1 // The Barrow-Deep`
- [ ] The page renders correctly at 640px and below
- [ ] `npm run build` and `npm run lint` pass

## Blocked By

I-0029 (the Legendary exception, and the amber-permitted surface list), I-0030 (the `--rarity-*`
tokens and the material primitives this page consumes).

## Spec Reference

FS-0004 §Requirements 15-17, 20, 23, 35-36; §User Stories 1, 2, 3, 5, 10, 11, 12, 16;
§Edge States (Rarity `Legendary` against the one-torch rule).
