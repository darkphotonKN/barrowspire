---
id: I-X2CMM-30
status: done
implements: FS-X2CMM
blocked_by: []
labels: [ready-for-agent]
title: FS-X2CMM slice 30: the wolf's look, the page "Call the Wolf" and every player text
---
Implements FS-X2CMM §Change: The archer's wolf (W1–W2)

## What to Build
In game-client: rebuild `tools/bake/page/characters/hound.js` as a timber wolf (W1; same sheet
key, clips and group; ADR-0021 fidelity), bake it (`npm run bake`) and refresh its contact sheet;
the page's name "Call the Wolf" and a wolf line in `src/data/classBooks.ts`; every player-facing
string that says hound (plates, tooltips, reticle card, dev gallery labels that a player would
read stay as they are only if they are dev-only); the roundel picture in `src/ui/pageIcons.ts`
becomes a wolf's head in profile (verdigris). Internal names (`call_the_hound`, `hound` in code,
file names, wire values) stay. Art never blocks: if the bake cannot run here, ship the texts and
icon and say so.

## Acceptance Criteria
- [ ] The FS section's game-client criteria.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green; `npm run bake --
      --check` clean after the bake.

## Blocked By
None

## Spec Reference
FS-X2CMM §Change: The archer's wolf W1–W2, its game-client Acceptance Criteria.
