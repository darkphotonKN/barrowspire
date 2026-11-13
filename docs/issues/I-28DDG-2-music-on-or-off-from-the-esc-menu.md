---
id: I-28DDG-2
status: done
implements: FS-28DDG
blocked_by: [I-28DDG-1]
labels: [blocked]
title: "FS-28DDG slice 2: Silence the music / Let the music play in the town's ESC menu, remembered in this browser (game-client)"
---
Implements FS-28DDG §Requirements F (R15–R19), G (R20)

**Lane: agent.**

## What to Build

The music setting in `localStorage["barrowspire_music"]` (`"on"` | `"off"`), with every read and
write guarded in the same way as `ui/minimapMode.ts`. Anything unreadable reads as on. The music
module reads it on each hub entry and does not start the music while it is off. `hubMenuChoices`
takes the music state and adds the actionable row (**Silence the music** / **Let the music play**)
after *Leave the queue* and before *Back*. Called without it, as the field calls it, the choices
are unchanged. HubScene's `openMenu` wires the row. A press switches the music (fade out or fade
in, reversing a fade in flight), writes the setting, and rebuilds the menu in place with the other
label.

## Files it expects to touch

- `game-client/src/audio/musicSetting.ts` (new) and `game-client/src/audio/musicSetting.test.ts`
  (new), or the setting inside `hubMusic.ts` if it stays small
- `game-client/src/audio/hubMusic.ts` and its test (on/off, read on entry)
- `game-client/src/scenes/hubMenu.ts` (the `"music"` choice id and the state parameter)
- `game-client/src/scenes/HubScene.ts` (`openMenu`'s actions and choices)
- `game-client/src/scenes/HubScene.test.ts` (the `hubMenuChoices` cases)
- `game-client/src/scenes/FieldScene.ts` only if the shared `Record<HubMenuChoice["id"], …>`
  actions type forces a `music` entry there. If so, make it type-only and leave the field's menu as
  it is (R19).

## Acceptance Criteria

- [ ] FS-28DDG §Acceptance Criteria E holds.
- [ ] The field's and the run's ESC menus are unchanged.
- [ ] Whole client `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and
      `npm run lint` pass.

## Blocked By

I-28DDG-1 (the music module the row switches)

## Spec Reference

FS-28DDG R15–R19; stories 12–15, 20; Edge States "Toggled during a fade", "Toggled off, then
leave", "Setting changed in another tab", "Storage refused".

## TDD Approach

- RED: `hubMenuChoices({ queued: false, music: "on" })` ids are `["change", "music", "back"]` with
  the label "Silence the music". A store that throws reads as on.
- GREEN: the choice, the guarded setting, then the scene's wiring.
