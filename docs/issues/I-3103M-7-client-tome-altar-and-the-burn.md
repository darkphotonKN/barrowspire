---
id: I-3103M-7
status: open
implements: FS-3103M
blocked_by: [I-3103M-3, I-3103M-6]
labels: [ready-for-agent]
title: "FS-3103M slice 7: the client draws the tome and altar, speaks the lore, and asks before the burn"
---
Implements FS-3103M §I

Client only. Copy follows `game-client/CLAUDE.md` "Wording"; colours by `palette` names only.

## Files expected

- `game-client/src/types/gameState.ts` (`TomeState`, `AltarState`; `tome?`, `altar?`, `tome_carried?` on the state)
- `game-client/src/ui/floor.ts` (`interactNotice`: `tome_taken`, `altar_without_tome`, `altar_burned`; a pure `burnHeard(previous, incoming)`)
- new `game-client/src/ui/tome.ts` only if the burn confirm's copy and choices do not sit well in `party.ts` beside `FALL_CONFIRM`
- new `game-client/src/render/world/altar.ts` (the tome and altar views, as `stairs.ts` / `chest.ts` are)
- `game-client/src/scenes/BarrowspireScene.ts` (draw both; E targeting; the confirm through `showMenuPanel`; the burn line on the flip)
- Tests beside each

## What to Build

Lore lines through the existing HUD notice in the `waiting` tone (R24): `tome_taken` writes "Wonder
if I can burn it."; `altar_without_tome` writes "A tome was burned here once, they say, to insult a
demon."; `altar_burned` writes nothing. E at an unburned altar while `tome_carried` opens the run
menu's confirm panel as Fall does, line "Burn tome?", choices Burn and Not yet [Esc]; Burn sends
the interact, Not yet nothing; without `tome_carried` E sends the interact at once (R25). When
`altar.burned` turns true against the previous state's false, every client shows "You hear a sound
from hell" in the `refused` tone; a first state is the baseline (R26). The tome and altar draw from
their sheets, the altar's frame following `burned`; a listed tome is an E target, a burned altar is
not (R27). The altar's refusal may clear a pending coffer reach as any refusal does (R28). Vorsk
needs nothing: its nameplate is the server's name.

## Acceptance Criteria

- [ ] `interactNotice` gives R24's lines and tones; nothing for `altar_burned`.
- [ ] `burnHeard` is true only on an unburned-to-burned flip; false on a first state.
- [ ] E at an unburned altar with `tome_carried` opens the confirm and sends nothing; Burn sends one interact for the altar; Not yet and Esc send nothing; without `tome_carried` E sends at once.
- [ ] A burned altar is no E target; a listed tome is.
- [ ] The tome and altar draw at their positions from their sheets; the altar's frame follows `burned`.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.
- [ ] Live check of the flip line needs I-3103M-4 on the server; demo per the integration flow, never an agent-started backend.

## Blocked By

I-3103M-3, I-3103M-6.

## Spec Reference

FS-3103M §I R24-R28; user stories 4, 6, 7, 8, 14, 20, 21.

## TDD Approach

- RED: `interactNotice({ success: true, message: "", reason: "tome_taken" })` returns the tome line, `waiting`.
- GREEN: the reason branches, then `burnHeard`, then the scene wiring.
