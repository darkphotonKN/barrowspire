---
id: I-77DVN-1
status: done
implements: FS-77DVN
blocked_by: []
labels: [ready-for-agent]
title: "FS-77DVN slice 1: the XP bar along the bottom middle, panel-less with studs and level numerals, in the town, every field and every run (game-client)"
---
Implements FS-77DVN §A, §B, §C, §D, §F

## Files it expects to touch

- `game-client/src/ui/xpBarLayout.ts` (new, pure: the piece, bar, studs and numeral anchors for a
  view), `game-client/src/ui/xpBarLayout.test.ts` (new)
- `game-client/src/ui/ProgressHud.ts` (the widget redrawn: no panel, studs, numerals, the cue's new
  place, a `relayout()`; `drawXpBar` stays exported here for the gear overlay and the character
  list), `game-client/src/ui/ProgressHud.test.ts` (new, recording stage)
- `game-client/src/ui/progress.ts`, `game-client/src/ui/progress.test.ts` (the ends' words helper;
  `levelLabel` removed once unread)
- `game-client/src/scenes/HubScene.ts`, `game-client/src/scenes/FieldScene.ts`,
  `game-client/src/scenes/BarrowspireScene.ts` (mount from `current_player`, call `relayout()` from
  `relayoutHud`), and their `*.test.ts`
- `game-client/docs/design-guideline.md` ("UI Chrome": the Experience bar bullet)
- Not the top-left constants (`PROGRESS_HUD_AT`, `RESOURCE_HUD_AT`, `PARTY_FRAMES_PLACEMENT`):
  slice 2 moves those. This slice leaves the run's bars at y 56 and the hub's frames at y 56.

## What to Build

Move the player's own XP bar to the bottom middle of the canvas in every world it is shown in. A
pure layout function of the view centres the piece on `W / 2`, its lowest point 16 px up, as wide as
a centred span can be while keeping 16 px clear of the chat window's right edge and the corner
row's left edge (read from `chatWindowLayout` and `hudCornerLayout`), capped at 480: 188 px at 1080,
388 at 1280. Draw a 5 px bar through `drawXpBar` with no panel, a brass stud (`frame` r 2,
`frameBright` r 0.9 highlight) 6 px beyond each end, the level as a bare 12 px body-serif numeral
in `hudText` with a 2 px `markerStroke` stroke at the left and the next level (or "Cap") at the
right, each in a fixed slot so the bar's length never changes with the level. Drop the "N / M"
count from the HUD. The level-up cue rises from 6 px above the piece's centre with today's words,
hold, fade and rise. Mount it in the field from `current_player` through `progressOf`, as the hub
does; keep it up while dead, fallen, spectating or escaped; re-place it on every scene's resize.
Name the cap, the gaps and the end slot as constants. Add the guideline bullet.

## Acceptance Criteria

- [ ] FS-77DVN §Acceptance Criteria, the bar's items: the layout rule at every width 1080 to 1280 (centred, 188 / 388, ≤ 480, 16 px clear of both neighbours, lowest point within 2 px of 704 and not below), neighbours read from their layout modules; 5 px bar through `drawXpBar`, no panel; the two studs; the numerals' size, ink, stroke, alignment and fixed slots; "Cap" and a full bar at the cap; no count on the HUD, the character sheet's count unchanged; the ends' words helper tested, `levelLabel` gone if unread; no redraw on an unchanged state; mounted in the hub, a field and a run, shown while dead, spectating, escaped or fallen, none without a level; re-placed and re-crispened on resize; depth 1000; the cue's words, place, timing and baseline rule.
- [ ] No raw colour literal added; the token fence passes.
- [ ] The design guideline's "UI Chrome" has an "Experience bar" bullet marked "Added by FS-77DVN"; no dev-gallery card or family added.
- [ ] Headless captures at 1080 and 1280 of the town, a field and a run (alive, and dead spectating), chat folded and unfolded, render scales 1 and 2, checked by eye.
- [ ] Typecheck, lint and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

None

## Spec Reference

FS-77DVN §A.1–§A.5 (place), §B.6–§B.12 (look), §C.13–§C.15 (worlds), §D.16 (cue), §F.22–§F.23
(guideline, no gallery card); User Stories 1–18, 23–27.

## TDD Approach

- RED: `xpBarLayout.test.ts` expects the piece centred at 540 and 188 wide at 1080, 388 at 1280, and 16 px clear of `chatWindowFrame(...).panel` and `cornerIconFrame("mail", view)` at every width between.
- GREEN: the layout function from the two neighbours' edges, then the widget drawing from it.
