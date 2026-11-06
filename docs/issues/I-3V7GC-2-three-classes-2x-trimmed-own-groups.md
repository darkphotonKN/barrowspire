---
id: I-3V7GC-2
status: open
implements: FS-3V7GC
blocked_by: [I-3V7GC-1]
labels: [ready-for-agent]
title: "FS-3V7GC slice 2: knight, wizard and mercenary baked at 2x, trimmed, each in its own atlas group (game-client)"
---
Implements FS-3V7GC §A (Requirements 1–3), §D (Requirement 12), §E (Requirements 13–14)

**Lane: agent (AFK).**

## What to Build

The three class entries in `tools/bake/page/characters/cast.js` take `scale: 2`, `trim: true`
and their own groups (`knight`, `wizard`, `mercenary`), as the archer's does; the `characters`
group goes. Re-bake. No client code: FS-HF0WW R4–R8 and R25 already draw any scaled, trimmed sheet.

## Acceptance Criteria

- [ ] The manifest gives the three `scale: 2`, frames twice their 1x size, the 1x anchors and crowns, `trimmed: true`, each on its own group's pages; no `characters-*` page remains; no other sheet has a `scale` (`animationSelect.test.ts` against the real manifest).
- [ ] Nothing in `src/` names an atlas group.
- [ ] Each new page's decoded memory and the totals before and after recorded in FS-3V7GC § Verification.
- [ ] `npm run bake -- --check` prints `bake: no changes`; typecheck and the full vitest suite pass.

## Blocked By

I-3V7GC-1 (the wizard fails the 2x guard without it).

## Spec Reference

FS-3V7GC §A R1–R3, §D R12, §E R13–R14; user stories 1–3, 11.
