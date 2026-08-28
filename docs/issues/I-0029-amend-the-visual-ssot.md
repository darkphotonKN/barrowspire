---
id: I-0029
status: done
implements: FS-0004
blocked_by: []
labels: []
title: "FS-0004 slice 1: amend the visual SSOT — typography, material, accent rule, lifted bases"
---
Implements FS-0004 §Requirements 1-6

**Author: human** — do NOT hand this to `/develop`. This slice is design authorship, not
implementation. It picks values that every subsequent slice reads, and picking them wrong is the
failure mode that produced the current look.

> **No code changes in this slice.** Two documents only. Every other FS-0004 slice is blocked on
> it because they consume the values it authors.

## What to Build

`game-client/docs/design-guideline.md` is the SSOT for every visual decision — `CLAUDE.md` says so
in its first paragraph, and the guideline wins over any other document. So FS-0004 deliberately
does **not** pin visual values; it states the properties the amendment must satisfy. This slice
authors the actual values.

### 1. Replace the Part II typography rule (§R1, §R2)

Part II currently reserves blackletter for the game canvas and **keeps Cinzel for the web**. Amend
it: a blackletter display face (UnifrakturMaguntia or Pirata One) for web display type, paired
with a readable old-style serif for body and labels.

**State a hard minimum size.** The guideline already warns blackletter is "hard to read small —
large text only". Convert that warning into a checkable bound plus a named list of permitted
surfaces (logo, hero, page `h1`). Everything else uses the body serif. Without a number, §R13 and
its acceptance criterion are unreviewable.

### 2. Add a "Material & depth" section (§R3)

The half the guideline never specified, and the reason a palette that already said "no neon"
produced neon anyway. Define the CSS-only material vocabulary — grain, surface gradients,
carved/beveled edges, vignette, ornament — with the standing rule that all of it is expressible
without image assets.

### 3. Add an accent-vs-structure rule (§R4)

The guideline says "one torch per view" but never says what carries everything else, so amber
became the whole accent system by default (49 occurrences against 4 brass, 1 oxblood). Name brass,
stone-slate, barrow-brown, oxblood and vellum as load-bearing **surface and border** colours, and
enumerate the surfaces amber is still permitted on.

### 4. Lift the base surface values (§R5)

`#0d0b0a` is black in everything but name, which is what makes amber read as emission. Author new
values for the background tokens in a warm umber/stone range.

**State the contrast floor the values were chosen against.** Lifting the base narrows contrast
with vellum text, and I-0034 measures against this floor. A lift with no stated floor cannot be
verified, only argued about.

### 5. Resolve the Legendary / one-torch conflict

`Legendary` is amber-bright. A grid of legendary relics reintroduces amber across a view, which
the one-torch rule otherwise forbids. **The rarity ramp is an exception and the guideline must say
so explicitly** — otherwise two rules sit in silent contradiction and whoever implements I-0032
picks one at random.

### 6. Mirror into `game-client/CLAUDE.md` (§R6)

Its "### Color Palette", "### Typography" and "### Visual Rules" sections restate the old values
and would contradict the SSOT the moment it changes.

## Acceptance Criteria

- [ ] Part II names a blackletter display face and a body serif
- [ ] A numeric minimum size and a named list of permitted blackletter surfaces are stated
- [ ] A "Material & depth" section defines grain, gradients, beveled edges, vignette and ornament
- [ ] An accent-vs-structure rule names the load-bearing colours and enumerates amber's surfaces
- [ ] New base surface values are authored into the token table
- [ ] The contrast floor those values were chosen against is stated
- [ ] The rarity ramp is documented as an explicit exception to the one-torch rule
- [ ] `game-client/CLAUDE.md`'s palette, typography and visual-rules sections match the amendment
- [ ] No code files changed in this slice

## Blocked By

None. This is the head of the FS-0004 chain.

## Spec Reference

FS-0004 §Requirements 1-6 (§A. Amend the visual SSOT); §User Stories 23, 26; §Risks and fallbacks
(the blackletter fallback path — Grenze / MedievalSharp / IM Fell — if the size bound does not
hold in practice).
