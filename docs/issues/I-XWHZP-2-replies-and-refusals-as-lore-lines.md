---
id: I-XWHZP-2
status: done
implements: FS-XWHZP
blocked_by: [I-XWHZP-1]
labels: []
title: "FS-XWHZP slice 2: the copy table, and interact replies and a refused Fall as lore lines"
---
Implements FS-XWHZP §D, §F

**Type:** AFK. Client only. **Hotspot:** `BarrowspireScene.ts`.

## Files expected

- new `game-client/src/ui/loreCopy.ts` (the R16 table: every key's line and tone; `loreForReply`, `loreForFall`, `loreForEvent`; FS-3103M's `tome_taken`, `altar_without_tome`, `altar_burned`, `burn_heard` included)
- `game-client/src/ui/floor.ts` (`interactNotice` and the gather words move to the copy table; `refusesContainer` stays)
- `game-client/src/scenes/BarrowspireScene.ts` (the scene's `LoreLines`; the `interact` reply and the refused `forfeit_run` play lore lines; cleared on reset, scene end and a floor change; equip stays the HUD notice)
- Tests beside each; `BarrowspireScene.test.ts`

## What to Build

One pure copy table (R16) keyed on the event or reason, with the gather words, "It will not
open.", the field's `loot_reserved` words, FS-3103M's three lines and nothing for
`altar_burned`. An unkeyed interact reply with a message is a `lore` line in the server's words
(R17); an empty one says nothing (R18). A refused Fall is a `lore` line in the server's words, or
"The barrow will not take you yet." (R16). The run scene plays these through its lore lines,
never the HUD notice; equip refusals and the network notice stay HUD notices (R20). The lines
clear on a floor change, a reset and the scene's end (R15).

## Acceptance Criteria

- [ ] The copy table gives R16's line and tone for each reply key, nothing for `altar_burned` or an empty reply, the server's words as `lore` for an unkeyed reply.
- [ ] `tome_taken` and `altar_without_tome` give FS-3103M's lines (as amended), `burn_heard` the dread hell line.
- [ ] In the run scene, an interact reply and a refused Fall raise a lore line and no HUD notice; a guarded chest still gives up the reach; an equip refusal still raises the HUD notice.
- [ ] A floor change and a reset clear the lore lines.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-XWHZP-1

## Spec Reference

FS-XWHZP §D R15-R18, R20-R21, §F R25; user stories 6-11, 21, 26-28.

## TDD Approach

- RED: `loreForReply({ success: false, message: "its guards still stand", reason: "container_guarded" })` is `{ text: "It will not open.", tone: "lore" }`.
- GREEN: the table, then the scene's reply and Fall paths.
