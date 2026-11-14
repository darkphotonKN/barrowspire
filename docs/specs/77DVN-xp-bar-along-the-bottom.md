# FS-77DVN: The XP bar along the bottom

> Status: work-order · SPECIFICATION.md: none (a change FS has no thin line; owners [FS-BDA7X](BDA7X-character-leveling.md) "Character level and experience display" (req 42, 43), [FS-56CKV](56CKV-minimap-look-and-run-hud-layout.md) (§D.20, §D.22, the top-left stack), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) "Health and class resource bars on the HUD" (R20), [FS-R82NV](R82NV-party-formation.md) "Party frames" (R34) each carry a stub) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only) · Supersedes in part: FS-BDA7X req 42's place and content on the HUD (the top-left 180 × 34 panel with "Level N" and the "50 / 130" count; now a bare bar along the bottom, in the fields too) and req 43's place of the cue; FS-56CKV §D.20 (the run's XP bar at (10, 16), the bars at (10, 56), the frames' run top 132) and §D.22's hub placements (XP bar (16, 16), frames y 56); FS-8AY7S R20's "in a run at x 10, y 84, under the XP bar" (already moved to y 56 by FS-56CKV; now y 16, as a field's); FS-R82NV R34's "run y 160" (FS-56CKV: 132; now 92) and "the hub … under the XP bar at y 56" (now y 16) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new term)

> **Amended 2026-11-14** by Kranti, after the slices went in: one owner confirmation,
> documentation only. Asked whether to keep the bar centred on the canvas or to centre it in the
> room between the chat window and the corner row, Kranti answered "centered": **the bar stays centred
> on the canvas, as built.** The Edge State "the room is off-centre" is no longer an open question;
> it is corrected in place and says *(Amended 2026-11-14, centred on the canvas)*.

> **Amended 2026-11-14 (second)** by Kranti, a name correction, documentation only. The
> implementation's code review removed the `RESOURCE_HUD_W` alias: the 180 px left column's one
> constant is `HUD_COLUMN_W` in `ui/ResourceHud.ts`, and the frames' `FRAME_W` reads it. Req 19 and
> the acceptance criterion on the left stack's placements are corrected in place, and the fact on
> the top-left stack (true of the code it was verified on) is annotated; each says *(Amended
> 2026-11-14, `HUD_COLUMN_W`)*.

## Summary

The player's own level and experience bar leaves the top-left corner and runs along the bottom
middle of the canvas, small and neat: a 5 px bar with no panel under it, a brass stud at each
end, the current level as a bare numeral at its left and the next level at its right ("Cap" at the
cap). It stands between the chat window and the corner icon row in the town, every field and
every run, alive or dead. The "50 / 130" count leaves the HUD (the gear overlay's character sheet
keeps it). In a run the Health and resource bars rise into the old place at y 16 and the party
frames follow, so a run's top left matches a field's; in the town the party frames rise to the
corner.

Charter run, 2026-11-14. The owner asked for the bar in the "middle and bottom, spread across the
bottom, small and neat", shown "everywhere, even in town or non-spire areas", with the current
level at the left end and the next level at the right. Each requirement below is a **charter
default** (the locked decisions, approved by the owner) or says **derived here** and why. Recorded
without adversarial review: no `challenge-me` pass.

**Why a change FS.** The request moves four capabilities' designs at once: the XP bar's place,
size and content (FS-BDA7X req 42, 43), the run's and the hub's top-left stack (FS-56CKV §D), the
run's resource bars' top (FS-8AY7S R20) and the party frames' tops (FS-R82NV R34). The bar leaving
the corner and the corner closing up are one layout, so they are one work order. No thin line
changes: `game-client/SPECIFICATION.md` "### Character" → "Character level and experience display
→ FS-BDA7X" stays true.

## Facts this spec rests on

Verified 2026-11-14 on `feat/client-xp-bar-bottom` at ffba8ee4; client paths under
`game-client/src/`.

- **The bar today** (`ui/ProgressHud.ts`): a 180 × 34 panel (`PROGRESS_HUD_W`, `PROGRESS_HUD_H`),
  `hudPanel` at 0.85 with a 1 px `frame` rim at 0.35; "Level N" (or "Level 20 · Cap", `levelLabel`)
  at 14 px `hudText`, the count "50 / 130" (`xpCount`) at 12 px `hudLabel` right-aligned; a 5 px
  bar drawn by `drawXpBar` (`xpTrack` at 0.9, `xpFill`, a 1 px `frame` rim at 0.6). Depth 1000.
  The cue (`levelUpCue`, "Risen to level N") is a 16 px `levelUp` text right of the panel that
  holds 900 ms then fades over 1400 ms while rising 12 px. A redraw only when the progress changes.
  Placed at `PROGRESS_HUD_AT`: hub (16, 16), run (10, 16). `drawXpBar` is also read by the gear
  overlay (`GearOverlay.ts`) and the character list (`MainMenuScene.ts`); `xpCount` also by the
  character sheet (`characterSheet.ts`); `levelLabel` only by `ProgressHud`.
- **Mounting:** `HubScene.ts` (~2181, from `state.current_player` via `progressOf`) and
  `BarrowspireScene.ts` (`showProgress`, called with every state's `current_player`, alive, dead,
  spectating or escaped). `FieldScene.ts` mounts none, yet its `state.current_player` carries
  `level`, `experience`, `level_floor` and `next_level_at` (game-service serializes every world's
  player through one serializer), so no server change is needed.
- **The bottom edge:** the chat window stands at x 10, 420 wide (`CHAT_WINDOW_X`,
  `CHAT_WINDOW_W`), its bottom 16 px up (`CHAT_WINDOW_MARGIN`), folded or not, in every world: its
  right edge is x 430. The corner icon row (`ui/hudCornerLayout.ts`): five plates 54 wide, 2 apart,
  16 px in from the right and the bottom (`CORNER_MARGIN`), the same in every world: its left edge
  is the Mailbox plate's, `W − 294`. The ability card and the dead spectator's Leave button stand
  above the row, at the right. The run's resolved bottom-centre row (Watch the delve, Leave,
  Settlement) stands 200 px above the margin (its buttons end at y 504), the settlement record over
  it. Nothing else stands along the bottom middle in any world.
- **The logical view** is 720 tall and 1080 to 1280 wide (`LOGICAL_MIN_WIDTH`,
  `LOGICAL_MAX_WIDTH`). Between the chat window and the row there are `W − 724` px: 356 at 1080,
  556 at 1280. The canvas centre `W / 2` lies 110 px right of the chat window at 1080 (210 at 1280)
  and 246 px left of the row at 1080 (346 at 1280): **the room is not centred on the canvas**; its
  middle is 68 px right of the canvas centre at every width.
- **The top-left stack:** run: the resource bars at `RESOURCE_HUD_AT.run` = (10, 56), derived from
  `PROGRESS_HUD_AT.run` (+ 34 + 6); the potion cell right of them, top-aligned; the party frames at
  `PARTY_FRAMES_PLACEMENT.run` top 132 (the bars at their tallest + 24). Field: the bars at (10,
  16), the frames at top 92. Hub: no bars, the frames at (16, 56), under the XP bar (`underXpBar`).
  The column is 180 wide: `RESOURCE_HUD_W` and the frames' `FRAME_W` both read `PROGRESS_HUD_W`
  *(Amended 2026-11-14, `HUD_COLUMN_W`: so at ffba8ee4; the change drops the alias, and the
  column's one constant is `HUD_COLUMN_W = 180` in `ui/ResourceHud.ts`, which `FRAME_W` reads)*.
  Pinned by `ResourceHud.test.ts`, `partyFramesLayout.test.ts` and a stack test in
  `BarrowspireScene.test.ts`.
- **Resize:** each scene's `relayoutHud` (on `relayoutOn`) re-places what keeps to the right or
  the centre and re-crispens moved text (FS-ZAJMH R5). The XP bar is not among them today (it keeps
  to the left).
- **The chat window's studs** (`ui/carvedPanel.ts`): a brass circle r 2 with a bright-brass
  highlight r 0.9 offset −0.5, −0.5. In the canvas palette, `palette.frame` is brass and
  `palette.frameBright` bright brass.
- **The design guideline** (`game-client/docs/design-guideline.md` "UI Chrome") describes the
  countdowns, the open bar and the health bars by the XP bar's look; it has no XP-bar bullet of its
  own.

## Requirements

### §A. The bar's place

1. **Bottom middle, in every world it is shown in.** The bar piece (the two numerals, the two
   studs and the bar between them) is centred across the canvas on `W / 2`, its lowest point (the
   numerals' text boxes) 16 px up from the canvas bottom (`CHAT_WINDOW_MARGIN`, the chat window's
   and the row's bottom margin), within 2 px. **(charter default: owner, "middle and bottom")**
2. **As wide as the room allows, centred, capped.** The piece's width is the widest span centred
   on `W / 2` that keeps a 16 px clear gap from the chat window's right edge and from the corner
   row's left edge, capped at 480 px, rounded down to a whole even px:
   `min(480, 2 × min(W/2 − (chatRight + 16), (rowLeft − 16) − W/2))`, with `chatRight` and
   `rowLeft` read from `chatWindowLayout` and `hudCornerLayout`, never restated. At 1080 that is
   188 px; at 1280, 388 px. The cap and the gap are named constants. **(charter default: "spread
   across the bottom … centred on the canvas, capped at about 480"; derived here: centred on the
   canvas and clear of both neighbours, the chat window is always the nearer, so it sets the
   width and the cap does not bind between 1080 and 1280; see Edge States, "The room is
   off-centre")**
3. **It shrinks, never overlaps, never hides.** At every logical width from 1080 to 1280 the piece
   is drawn, and no part of it overlaps the chat window (folded or not) or the corner row; the bar
   between the studs is what shrinks, the numerals and studs keep their size. **(charter
   default)**
4. **It follows a resize.** When the logical view changes, the piece is placed again by the same
   rule and its numerals are re-crispened (FS-ZAJMH R5), from each scene's `relayoutHud`. **(derived
   here: the piece now keeps to the centre, which a width change moves)**
5. **Depth unchanged:** the HUD's 1000, under the notices and every overlay or popup. **(charter
   default)**

### §B. The bar's look

6. **The bar is 5 px tall** and drawn by `drawXpBar` exactly as today: `xpTrack` at 0.9, the
   `xpFill` share, a 1 px `frame` rim at 0.6. **No backing panel**: no `hudPanel` fill or panel rim
   under or round the piece. **(charter default: "small and neat"; today's colours)**
7. **A brass stud at each end of the bar**, like the chat window's corner studs: a `palette.frame`
   circle r 2 with a `palette.frameBright` highlight r 0.9 offset (−0.5, −0.5), centred on the bar's
   centre line, 6 px beyond each end of the bar. Drawn in code; no new art, no new token. **(charter
   default; derived here: the 6 px leaves a 4 px clear gap each side of the stud, and the tokens
   are the canvas palette's names for the brass the studs are)**
8. **The ends are bare numerals** in the body serif (`CANVAS_FONT.body`), 12 px, `hudText`, with a
   2 px `markerStroke` stroke so they read over a lit ground with no panel behind them: the
   current level at the left end, right-aligned 6 px beyond the left stud's centre; the next level
   (the current + 1) at the right end, left-aligned 6 px beyond the right stud's centre; their
   vertical middles on the bar's centre line. Each end keeps a fixed slot (a named constant, wide
   enough for "Cap" at 12 px) so the bar's length never changes with the level. **(charter default:
   owner, the levels at the ends, body serif; derived here: 12 px is today's smallest HUD type and
   the count's size; the stroke is the target frame's way of setting words over the world, and
   the fixed slot keeps the bar still from level 9 to 10)**
9. **At the cap** the bar is full and the right end reads "Cap"; the left end reads the cap level
   ("20"). **(charter default: keeps today's meaning)**
10. **No count on the HUD.** "50 / 130" is not drawn on the HUD; the gear overlay's character sheet
    keeps its count (`characterSheet.ts`, FS-HRH2J R25–R26) unchanged. **(charter default)**
11. **The ends' words come from a pure helper** in `ui/progress.ts` (the level and the next level
    or "Cap"), tested without a canvas. `levelLabel` ("Level 7", "Level 20 · Cap") is removed if no
    reader is left; `xpCount` and `xpFraction` stay. **(derived here: the words are copy, so they
    are pinned as `levelLabel` was; dead code is deleted, `docs/specs/README.md` "Removal")**
12. **A redraw only when the progress or the place changes**, as today: a state that changes
    nothing draws nothing. **(derived here: today's rule)**

### §C. Where it is shown

13. **The town, every field and every run.** The hub and the run keep their mounts; the field
    mounts the bar from `state.current_player` through `progressOf`, as the hub does. A world whose
    state carries no level draws no bar (`progressOf` null), as today. **(charter default: owner,
    "everywhere, even in town or non-spire areas")**
14. **It stays up while the player is dead, fallen, spectating or escaped**, for as long as the
    world's scene is up: experience is kept either way. It shows the player's own progress, never
    a watched player's. **(charter default)**
15. **Never on the menus, character creation, the loading screen or game-over**: those scenes
    mount no bar. The character list's own bar (FS-BDA7X req 44) and the gear overlay's bar are not
    this bar and are unchanged. **(charter default)**

### §D. The level-up cue

16. **The cue rises from above the bar's centre** and fades as today: the same words, 16 px
    `levelUp` in the body serif, its bottom centred 6 px above the piece's top on the bar's centre
    x, holding 900 ms then fading over 1400 ms while rising 12 px, taking no input. It plays only
    when the level rises between two states; a fresh widget takes its first state as the baseline,
    as today. **(charter default; derived here: the hold, fade and rise are today's values)**

### §E. The top left closes up

17. **In a run the stack rises into the XP bar's old place:** the Health and resource bars at
    (10, 16) (`RESOURCE_HUD_AT.run`, the field's place), the potion cell beside them, top-aligned,
    and the party frames' run top at 92 (the bars at their tallest + 24, as today's rule). A run's
    top left then matches a field's. Every build and every floor. **(charter default)**
18. **In the hub the party frames rise to the corner:** (16, 16) (`PARTY_FRAMES_PLACEMENT.hub`),
    x unchanged. **(charter default; derived here: the decision moves y only and the hub's x 16 is
    the hub's inset)**
19. **The left column keeps its 180 px width.** The resource bars and the party frames stay one
    column, 180 wide, clear of the T panel; the width is a named column constant they share,
    `HUD_COLUMN_W` in `ui/ResourceHud.ts` *(Amended 2026-11-14, `HUD_COLUMN_W`)*, no
    longer read from the XP bar's panel. `PROGRESS_HUD_AT` and the 180 × 34 panel's constants go
    once nothing places by them. **(derived here: the width was the XP panel's; the column must
    not shrink because the panel left)**
20. **Every clearance still holds:** at 1080 and 1280, in each world, the frames at their tallest
    (four rows) clear the chat window, the resource bars, the potion cell, the T panel, the invite
    prompts and the ready check, as `partyFramesLayout.test.ts` pins today; the run's stack clears
    the top-right column, the spectate HUD and the target frame, as `BarrowspireScene.test.ts`
    pins today. **(charter default)**
21. **A field is unchanged** (bars (10, 16), frames top 92). **(derived here)**

### §F. Docs

22. **The design guideline's "UI Chrome" gains an "Experience bar" bullet**, one paragraph naming
    this look (bottom middle between the chat window and the corner row, no panel, a 5 px
    bright-brass bar on its charcoal track in a brass rim, a brass stud at each end, bare
    numerals for this level and the next or "Cap", every world but the menus), marked
    "*(Added by FS-77DVN, 2026-11-14.)*". **(derived here: the countdowns and the open bar already
    name the XP bar's look; the guideline is the single source of truth for appearance)**
23. **No dev-gallery card.** HUD chrome is not a tracked family (`dev/gallery/families.ts`).
    **(derived here, as FS-56CKV §E.24)**

## User Stories

1. As a player, I want my experience bar along the bottom middle of the screen, so that it sits where my eye rests between the chat and my icons.
2. As a player, I want the bar small and neat, with no panel, so that it does not cover the world.
3. As a player, I want my level at the bar's left and the next level at its right, so that I read where I am and where I am going at a glance.
4. As a player at the level cap, I want the bar full and its right end to read "Cap", so that I know there is nothing more to earn.
5. As a player, I want the bar in the town, so that I see my progress where I gear up.
6. As a player in a field, I want the bar there too, so that hunting outside the Spire shows what it earns me.
7. As a player in a run, I want the bar along the bottom, so that the top left holds my health, which matters more in a fight.
8. As a player who has fallen or is watching my party, I want my bar still shown, so that I see the experience I kept.
9. As a player who has escaped, I want my bar still shown until I leave, so that I see what the delve brought me.
10. As a player, I want the bar never to overlap the chat window or my icons, so that neither hides the other.
11. As a player on a narrow window, I want the bar shorter rather than gone, so that it is there on every screen.
12. As a player resizing the window, I want the bar to stay centred, so that it never drifts or is left behind.
13. As a player, I want the bar's length to stay still as I level from 9 to 10, so that it does not jump.
14. As a player, I want the bar in the XP bar's colours with brass studs, so that it reads as part of the barrow's chrome.
15. As a player, I want the level-up cue to rise from the bar, so that I see which bar rose.
16. As a player, I want the cue brief and out of my way, so that a level-up never stops a fight.
17. As a player, I want the numbers "50 / 130" off the HUD, so that the screen holds less clutter.
18. As a player who wants the exact count, I want it still in my character sheet, so that I can look when I care.
19. As a player in a run, I want my Health and resource bars at the very top left, so that the top left holds no gap.
20. As a player in a party in a run, I want my party frames under my bars, as in a field, so that the HUD reads the same in both.
21. As a player in a party in the town, I want my party frames at the top-left corner, so that the corner holds no gap.
22. As a player in a party, I want my frames to keep clear of the chat window and the prompts, so that nothing covers them.
23. As a player, I want notices and overlays drawn over the bar, so that what asks for me is never hidden.
24. As a player on the menus, I want no in-world HUD there, so that the menus stay clean.
25. As a developer, I want the bar's place as a pure function of the view, so that every width is tested without a canvas.
26. As a developer, I want the bar's look in the design guideline, so that the next HUD bar matches it.
27. As a developer, I want the cap, the gaps and the end slots as named constants, so that a later tune is values-only.

## Acceptance Criteria

- [ ] A pure layout function of the view gives the piece, the bar, the two studs and the two numeral anchors; for every logical width 1080 to 1280: the piece centred on `W / 2` (within 1 px), its width the §A.2 rule (188 at 1080, 388 at 1280, never over 480), whole px; the piece's left edge ≥ the chat window's right edge + 16 and its right edge ≤ the corner row's left edge − 16; its lowest point within 2 px of `720 − 16` and not below it (a layout test).
- [ ] The chat window's right edge and the row's left edge come from `chatWindowLayout` and `hudCornerLayout`, not restated numbers.
- [ ] The bar is 5 px tall, drawn through `drawXpBar` with today's values; no `hudPanel` fill and no panel rim is drawn by the widget (a recording-stage test).
- [ ] Two studs, `frame` r 2 with a `frameBright` r 0.9 highlight, centred on the bar's centre line 6 px beyond each end.
- [ ] The numerals: 12 px body serif, `hudText`, a 2 px `markerStroke` stroke; the left reads the level, right-aligned; the right the level + 1, left-aligned; middles on the bar's centre line; the bar's length the same at level 9 and level 10 at the same width.
- [ ] At the cap (no `next_level_at`) the bar is full and the right end reads "Cap", the left the level.
- [ ] No "N / M" count is drawn on the HUD; the character sheet still shows its count (its test unchanged).
- [ ] The ends' words come from a helper in `ui/progress.ts`, tested for a mid level, level 1 and the cap; `levelLabel` gone if unread; `xpCount`, `xpFraction` and `progressOf` tests unchanged.
- [ ] A second state with the same progress draws nothing new.
- [ ] The hub, a field and a run each mount the bar from `current_player`; a field state with a level shows it; a state with no level shows none; it stays drawn while the run's player is dead, spectating or escaped, and a field's player fallen, showing their own progress (scene tests).
- [ ] On a view resize each scene re-places the piece by the rule and re-crispens its numerals.
- [ ] The widget's depth is 1000 in every world.
- [ ] The cue: today's words, 16 px `levelUp`, its bottom 6 px above the piece's top, centred on the bar; holds 900 ms, fades over 1400 ms rising 12 px, then is destroyed; not played on a fresh widget's first state.
- [ ] `RESOURCE_HUD_AT.run` is (10, 16), equal to `RESOURCE_HUD_AT.field`; `PARTY_FRAMES_PLACEMENT` run {x 10, top 92}, field {x 10, top 92}, hub {x 16, top 16}; `HUD_COLUMN_W` *(Amended 2026-11-14, `HUD_COLUMN_W`; was `RESOURCE_HUD_W`)* and the frames' width 180 (`ResourceHud.test.ts`, `partyFramesLayout.test.ts`).
- [ ] In each world, four-row frames clear the chat window, the bars, the potion cell, the T panel, the prompts and the ready check at 1080 and 1280; the run's stack clears the top-right column, the spectate HUD and the target frame (`partyFramesLayout.test.ts`, `BarrowspireScene.test.ts`).
- [ ] No reference to `PROGRESS_HUD_AT` remains; no raw colour literal added; the token fence passes.
- [ ] The design guideline's "UI Chrome" has an "Experience bar" bullet marked "Added by FS-77DVN".
- [ ] No dev-gallery card or family is added.
- [ ] Headless captures at 1080 and 1280 of the town, a field and a run (alive, and dead spectating), chat folded and unfolded, at render scales 1 and 2, checked by eye for a crisp, clear bar.
- [ ] Typecheck, lint and the full vitest suite pass.

## Edge States

- **The room is off-centre (charter default kept; owner confirmed, *Amended 2026-11-14, centred on the canvas*):** the room between the
  chat window and the row is 356 px at 1080 and 556 at 1280, but its middle is 68 px right of the
  canvas centre. Centred on the canvas, the chat window is always the nearer neighbour, so the
  piece is 188 px at 1080 and 388 at 1280, the 480 cap never binds, and up to 136 px of the room
  right of the piece stays empty. The decision's "centred on the canvas" and "never overlapping"
  are honoured; its "spans the room … capped at about 480" is honoured only as "as much of the room
  as a centred bar can take". Rejected: centring in the room instead (324 to 480 px, 68 px right
  of the canvas centre). *(Amended 2026-11-14, centred on the canvas: asked at the look, Kranti
  answered "centered"; the bar stays centred on `W / 2`, as built, and the empty room right of it
  is accepted.)*
- **The narrowest view (1080):** the bar between the studs is 116 px (188 less two 24 px slots and
  two 12 px stud gaps). Shown, never hidden. A view narrower than 1080 does not exist
  (`LOGICAL_MIN_WIDTH`).
- **Chat folded or unfolded:** the window's width and bottom are the same, so the piece does not
  move.
- **The chat's channel list open:** it opens above the input row, inside the window's column, so
  it never reaches the piece.
- **Before the first state with a level:** no bar, as today; it appears on that state.
- **A reconnect or a world change:** the scene's widget is new; it takes its first state as the
  baseline and plays no cue, as today.
- **Level 1 at 0 experience:** "1" and "2", the bar empty (the track and rim only).
- **Two levels in one state:** one cue for the new level, as today; the ends read the new level
  and the next.
- **Dead and spectating in a run:** the bar stays and reads the player's own progress; the
  bottom-centre resolved row and the settlement record stand 200 px above the margin, well clear
  of it.
- **Escaped, until the run ends:** the bar stays while the scene is up; the run's end goes to its
  next scene, which mounts none.
- **A field's fallen countdown:** centred in the view, far above the bar; both shown.
- **A popup or overlay over the bottom** (the gear overlay, a container view, the NPC dialogue in
  the bottom-right, the menu): drawn over the bar, which stays under it.
- **A notice:** at 2000, over the bar if they ever meet; none stands at the bottom today.
- **Over a bright ground** (the town's lit paving): the numerals' dark stroke and the bar's rim
  keep them legible with no panel. Accepted.
- **In the town, inside a building** (the indoor blackout, FS-9PN7X): the bar is HUD, so it stays.
- **Party frames at their shortest or with no party:** placed by the same fixed top; nothing
  jumps.
- **The run's dev position readout** stands in the minimap's corner or under the top-right column
  (FS-56CKV §C), never at the top left, so the stack's rise covers nothing.

## Out of Scope

The character list's bar (FS-BDA7X req 44); the gear overlay's bar and count (FS-HRH2J R25–R26);
the experience curve, the level cap or any experience rule; the cue's words; the chat window's and
the corner row's places, sizes or looks; the resource bars', the potion cell's and the party
frames' looks; a field's top left; the run's top-right column, the spectate HUD and the resolved
row; new art, new tokens or a dev-gallery family; any server, proto, gateway or contract change.
