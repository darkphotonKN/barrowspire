---
id: I-X2CMM-27
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-14", "I-X2CMM-15", "I-X2CMM-19", "I-X2CMM-20", "I-X2CMM-21"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 27: client wave-2 review fix round 1 (the pigment rule, the hound's bay in the glossary, aim candidates, lines)"
---
Implements FS-X2CMM §H R41, §I, §J R49, R55–R57

**Author: agent**

## What to Build

Fixes from `/code-review` of the wave-2 client diff (`4e358210...` I-X2CMM-20), both axes. Client only.

1. **The book pigments' readers (MED).** `game-client/docs/design-guideline.md` says the book pigments are
   for a page roundel only and nothing else reads them, while its own wave-2 line names
   `palette.bookEffect.revealedTrap` and `.houndBay`, and the book's world effects (witchlight, rune,
   tracker's eye, the hound ring) have read them since wave 1. ADR-0098 (recorded by the session with this
   issue) amends ADR-0094: the pigments are read by the page renderer and by the book's own world effects
   through `palette.bookEffect`, nothing else. Edit the guideline's pigment paragraph in place to say so,
   and make `canvasPalette.ts`'s comments on `bookPigment` / `bookEffect` agree.
2. **"Bay" means two things (MED, language).** The glossary (`game-client/CONTEXT.md`) defines a bay as a
   chapel window's stretch of wall. The session adds a "Hound's bay" entry with this issue (via
   `/domain-model`); in code, name the hound's call so it cannot be read as the wall's (the wire field
   `bay` stays: it is the server's). Keep renames small and local.
3. **`heardBay(…, fresh = false)` (LOW).** `src/render/creatures/hounds.ts`: drop the flag argument and the
   needless `{ ...state, bay: state.bay }`; set the held bay directly where the hound is made.
4. **The aim's candidates rebuilt every frame (LOW).** `BarrowspireScene.ts` `aimScene` calls
   `aimInteractables` every frame while any page is armed. Build it only for an armed `interactable`
   page, and only when the state changed (memoise on `lastGameState`).
5. **Container kinds read raw (LOW).** `src/scenes/aimInteractables.ts` tests `c.kind === "chest" || "sack"`;
   the client reads container kinds through `placedKind`. Use it, so a chest-looking container of a new
   kind is aimable.
6. **The `cast_skill` listener's comment (LOW).** `BarrowspireScene.ts`: it names Take a Contract only;
   Pick the Lock's and Strike a Deal's refusals arrive there too.
7. **The reticle card (LOW).** `src/dev/gallery/effects.ts`: the `pageReticle` card gains the
   interactable ring (amber, R41), now live with Far Hand.
8. **A refusal that reads as a fact (LOW).** `src/ui/encounterLines.ts`: "No contract is taken on the top
   floor." → "No contract can be taken on the top floor."

Styling and copy items (1, 7, 8) are presentation; the rest is behaviour under the existing tests.

## Acceptance Criteria

- [ ] Each item above; tests updated where a line or behaviour changes.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-X2CMM-14, -15, -19, -20, -21

## Spec Reference

FS-X2CMM §H R41, §I, §J R49, R55–R57; ADR-0094, ADR-0098
