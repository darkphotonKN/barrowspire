---
id: I-B0H2D-6
status: open
implements: FS-B0H2D
blocked_by: [I-B0H2D-5]
labels: [ready-for-agent]
title: "FS-B0H2D slice 6: game-client gives the innkeeper, patrons and smith their talk"
---
Implements FS-B0H2D §F Requirements 27–29

**Author: agent** (charter: names and lines authored to fit the lore, listed for the owner to tweak)

## What to Build

Talking to the Alewife, the Drover, the Gravedigger, the Pilgrim or the Smith opens their own
lines, told the Warden's way (*Go on* / *Farewell*), and in a crowded room the nearest NPC
answers.

- New lines table keyed by NPC name (e.g. `src/scenes/townLines.ts` + test) with the exact R27
  text and roles (*Keeper of the Inn*, *Keeper of the forge*; patrons no role). One file so the
  owner can edit the words in one place.
- `HubScene.openDialogue`: a name with lines gets the passage dialogue (generalise `wardenTale`
  rather than copy it); others fall back to `RESIDENT_LINES` as today. Function NPCs unchanged.
- The talk loop picks the **nearest** NPC within `NPC_TALK_RANGE`, not the first found (R28).
- Nothing new goes to the server (R29).

Expected files (hotspot `src/scenes/HubScene.ts`: after I-B0H2D-5, never in parallel):
- `game-client/src/scenes/HubScene.ts`
- `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/scenes/townLines.ts` (new) + `townLines.test.ts` (new)

Not touched: the server, `hubKeepOut.ts`, `hubInteriors.ts`.

## Acceptance Criteria

- [ ] Each of the five names shows exactly its R27 passages in order; the last offers only
      Farewell; every telling starts at passage 1.
- [ ] Alewife's card shows role "Keeper of the Inn", Smith's "Keeper of the forge"; patrons none.
- [ ] Unknown resident name falls back to `RESIDENT_LINES`; Warden and Quartermaster unchanged.
- [ ] Two NPCs in range: the nearer one answers (scene test).
- [ ] No socket message sent on talk (scene test).
- [ ] vitest, lint, token fence green.

## Blocked By

- I-B0H2D-5 (same hotspot file)

Names must match I-B0H2D-2's server data exactly.

## Spec Reference

FS-B0H2D §F R27–R29; user stories 11–13, 18, 19, 23.

## TDD Approach

- RED: `townLines` passages for Alewife (4) and fallback for an unknown name; nearest-NPC scene
  test with two NPCs in range, the farther found first.
- GREEN: the table, the generalised passage dialogue, the nearest pick.
