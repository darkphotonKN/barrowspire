---
id: I-0036
status: done
implements: FS-0005
blocked_by: []
labels: []
title: "FS-0005 slice 1: amend Part I — gameplay accent channels, typography, lighting rule"
---
Implements FS-0005 §Requirements 1-5

**Author: human** — do NOT hand this to `/develop`. Design authorship. It writes the rule that
decides what 65 amber call sites are allowed to mean, and every later slice reads it.

> **No code changes in this slice.** One document. Every other FS-0005 slice is blocked on it.

## What to Build

Part I of `game-client/docs/design-guideline.md` describes a pixel-art game that does not exist
yet, and gives gameplay **no accent rule at all**. FS-0004 amended Part II and left this half
untouched, so the canvas has no written answer to "why is this amber".

### 1. A gameplay accent rule (§R1)

The important one. Part II's "one torch per view" is a rule about **emphasis on a web page** —
amber means *look here*, and scarcity is what makes it work. Applied to a dungeon crawl it would
actively hide interactables: a player who cannot find the door at a glance has a broken game, not
a busy screen.

So Part I gets its own rule, and it must say **explicitly that one-torch does not govern the
canvas**, with the reasoning — otherwise the two read as a contradiction and the next person
picks one at random.

In gameplay, colour is a **readability channel, not emphasis**. Assign semantic channels:

| Channel | Colour | Means |
|---|---|---|
| Interactable / actionable | amber | the player can do something with this |
| Safe / friendly / restorative | arcane green | pickups, allies, healing |
| Damage / danger / hostile | oxblood | enemies, damage, hazards |
| Neutral HUD | vellum | labels, counters, non-urgent information |
| Frame / chrome | brass | panel borders, dividers, HUD structure |

This makes §R16 testable rather than aesthetic: **an amber thing the player cannot act on becomes
a defect**, which is a far more useful rule than "use less amber".

### 2. Typography (§R2-R3)

Amend to blackletter display + old-style serif body, matching Part II. **Record it as a
deliberate deviation** from Part I's current "medieval pixel/bitmap font (Alagard)", with the
reasoning: a bitmap font is a *pairing with pixel art*, there is no pixel art yet, and pairing one
with vector primitives reads as an accident. Name the revisit condition — the pixel font becomes
correct again when the asset FS lands.

State that the **≥28px bound applies here too**, and name the permitted canvas surfaces. HUD text
is small by nature, so in practice this is the main-menu title and the end-of-run overlay heading
and nothing else. That is intended, not an oversight.

### 3. A lighting rule (§R4)

Static vignette at the canvas edges, plus a warm pool centred on the delver that moves with them.
The pool is what makes the scene read as *carrying a torch* rather than merely dark.

**State the readability floor.** The vignette may never make an entity at the canvas edge
unreadable. Enemies whose intended accent is "glowing eyes against dark" are the case that tests
it, and the case most likely to fail.

### 4. Name what is still pending on assets (§R5)

Nearest-neighbour rendering, dithered shading, selective dark outlining, 9-slice pixel borders,
`image-rendering: pixelated`. FS-0005 does **not** discharge these. The guideline must not read as
though the canvas is done when the asset FS has not happened.

## Acceptance Criteria

- [ ] Part I carries a gameplay accent rule with the five semantic channels
- [ ] It states explicitly that one-torch does not govern the canvas, and why
- [ ] Typography is amended to blackletter display + serif body
- [ ] The deviation from the Alagard/pixel-font rule is recorded, with its revisit condition
- [ ] The ≥28px bound and the permitted canvas surfaces are named
- [ ] A lighting rule is stated: static vignette + delver-tracking torch pool
- [ ] The readability floor is stated, naming the glowing-eyes case
- [ ] The Part I rules still pending on assets are listed as pending
- [ ] No code files changed in this slice

## Blocked By

None. Head of the FS-0005 chain.

## Spec Reference

FS-0005 §Requirements 1-5 (§A. Amend Part I of the visual SSOT); §User Stories 4, 5, 6, 8, 21;
§Risks and fallbacks (the accent rule is written from the screen, not from a play session).
