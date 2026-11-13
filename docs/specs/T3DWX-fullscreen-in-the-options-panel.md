# FS-T3DWX: Fullscreen in the OPTIONS panel

> Status: work-order · SPECIFICATION.md: none (a change FS has no thin line; owners
> [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) "Fullscreen and windowed play" (§E R18–R23, A16),
> [FS-28DDG](28DDG-music-in-the-hub.md) "Set the music's volume" (§ Change: Music volume in an
> Options panel, the OPTIONS panel's list, C4) and [FS-56CKV](56CKV-minimap-look-and-run-hud-layout.md)
> (§ Change: Minimap at the top, fullscreen button beside it, C2–C4, C6, C8, C9) each carry a stub
> `## Change: Fullscreen in the OPTIONS panel → FS-T3DWX`) · Builds on: [FS-WDM0X](WDM0X-interface-sound-effects.md)
> S17–S19 (the Sound effects row this row stands under; its criteria are untouched) · Related ADRs:
> [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)
> (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)
> (the row is canvas, so it wears the panel's canvas tones, not the web UI's) · Surface:
> game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new
> terms; *Game frame* is reworded, the button gone from it)

## Summary

Asked by the owner on 2026-11-13: 「把右上角的全螢幕按鈕 搬到menu的options面板裏面」 (move the
fullscreen button in the top-right corner into the menu's OPTIONS panel). The DOM button over the
canvas's top-right corner goes; the shared OPTIONS panel, opened from every world's ESC menu, gets a
**Fullscreen** row under *Sound effects* whose On/Off toggle enters and leaves fullscreen. What
fullscreen does (the game frame on screen, Esc given to the game where the browser has Keyboard
Lock, a held Esc to leave) is unchanged; only the control that asks for it moves.

Scoped and promoted in one approved charter run (2026-11-13). Every decision marked
**[charter default F*n*]** is one the owner approved with the charter; **[derived]** applies one
to a case the charter did not name.

## Facts (verified 2026-11-13 on feat/client-fullscreen-in-options, cut from main da3bf329)

- The toggle is `src/components/FullscreenButton.tsx`, a React `<button>` mounted by
  `GameFrame.tsx` in the game stage beside the canvas. Its logic is `src/components/fullscreen.ts`:
  `fullscreenOf(doc, keyboard)` gives `active()`, `toggle(frame)` and `watch(changed)`, or `null`
  where there is no Fullscreen API (R23); `toggle` locks `Escape` after entering where
  `keyboardLockOf(navigator)` finds Keyboard Lock (A16) and swallows a refusal.
- The button's other helpers in `fullscreen.ts` (`fullscreenLabel`, `keepFromGame`,
  `handBackFocus`) serve only the DOM button: its words, keeping its presses from Phaser, and
  handing focus back after a click.
- `src/ui/optionsPanel.ts` builds the OPTIONS panel for every world: `openOptionsPanel` makes the
  rows (Music, Sound effects, each a 0–5 slider), `showOptionsPanel` lays out any list of rows.
  Its marks answer `pointerup` on camera-fixed hit rectangles; ←/→ nudge `rows[0]`; `moveTo`
  re-centres it when the logical view changes. The town (`HubScene.openOptions`), the field
  (`FieldScene.openOptions`) and the run (`BarrowspireScene.openOptions`) each call it.
- Phaser 4.2.1 handles the mouse synchronously inside the DOM event:
  `InputManager.onMouseUp` → `updateInputPlugins` → the game object's `pointerup`. So a `pointerup`
  on a canvas row is still the user gesture `requestFullscreen` and `keyboard.lock` need.
  `ScaleManager.startFullscreen`'s doc says to call it from `pointerup`, never `pointerdown`.
- `src/render/viewport/fullscreenButton.ts` holds the button's footprint (`FULLSCREEN_BUTTON`,
  `FULLSCREEN_CORNER`, `FULLSCREEN_BUTTON_CLEARANCE`) and `FullscreenButtonPlace`, which the scenes'
  top-right column hands the button's place to (FS-56CKV § Change C6). The column, the minimap's
  mode icon, its name plate, the dev position readout and the gear overlay lay themselves out
  round that footprint. `fullscreenHintSide` serves only the DOM hint.
- `PhaserGame.tsx` owns the game frame (`frameRef`) and builds the `Phaser.Game`. A Phaser game's
  `registry` is a per-game data store that every scene reads as `this.registry`, and it dies with
  the game.

## Requirements

**A. The button goes**

1. **No fullscreen button over the canvas.** `GameFrame` renders the canvas's stage with no
   button, in every scene and state; its hover hint goes with it. The control moves; it is not
   copied. **[charter default F1]**
2. **The top-right HUD keeps its layout.** No widget moves: the minimap, its mode icon and name, the
   column's lines, the dev readout and the gear overlay stay where FS-56CKV and FS-ZAJMH placed
   them, round the footprint where the button stood, which is now empty. Reclaiming that space is
   a layout change for its own charter. **[derived]** Reason: the charter moves the control and
   names no new layout; seven layouts read the footprint.
3. **Only the button's own code goes.** `FullscreenButton.tsx`, its test, its CSS
   (`.fullscreen-button*`, `.fullscreen-hint*`), `fullscreenHintSide`, and the DOM-only helpers in
   `fullscreen.ts` (`fullscreenLabel`, `keepFromGame`, `handBackFocus`) are deleted.
   `fullscreenOf`, `keyboardLockOf` and what `toggle` does are unchanged. The footprint and
   `FullscreenButtonPlace` stay, since the layout reads them (R2). **[derived]**

**B. The Fullscreen row**

4. **A Fullscreen row under Sound effects.** The OPTIONS panel's list (FS-28DDG § Change C4) gains
   a third row, **Fullscreen**, under *Sound effects*, in every world. Its label is on the left in
   the rows' label style. On the right are two words, **Off** then **On**, right-aligned on the
   sliders' right edge. The current state's word is in the actionable tone and the other in the
   dim tone. The panel grows by one row through its list. Colour comes from the panel's tones
   (ADR-0013), the words are in the canvas body face, and no glyph or art is added.
   **[charter default F2]**
5. **A click toggles it.** A press released on the row (`pointerup` on its hit area, the row's
   width inside the panel's insets) leaves fullscreen when it is on, and asks for it on the game
   frame (FS-ZAJMH R19) when it is off. The ask happens inside that `pointerup`, inside the
   browser's mouse event, so it carries the user gesture. Under the pointer the current word
   brightens to the text tone, as the sliders' marks do. **[charter default F2]**
6. **The row shows the document's state.** On and Off read the document's real fullscreen state,
   never a local flag. While the panel is open it redraws whenever the state changes by any route:
   the row, Esc or a held Esc, the browser's UI. A refused request changes nothing, so the row
   stays Off (FS-ZAJMH R20, R23). The panel stops listening when it closes. **[charter default F3]**
7. **No row where there is no fullscreen.** Where the Fullscreen API is missing (iPhone Safari),
   the panel has no Fullscreen row and is the two-row panel it was. **[charter default F4]**
8. **Mouse only.** ←/→ still move Music only (FS-28DDG § Change C6, FS-WDM0X S18). Enter and the
   number keys still do nothing in the panel. No key is bound to fullscreen (FS-ZAJMH R22 stands).
   **[charter default F5]**
9. **Entering from the row keeps A16.** Where the browser has Keyboard Lock, the fullscreen the row
   enters locks Esc for the game, and a held Esc leaves. The lock is released on leaving by any
   route. Where there is no lock, the first Esc leaves. This is `fullscreen.ts`'s `toggle`,
   unchanged. **[charter default F6]**
10. **The panel stays open.** Toggling does not close the panel. The size change that follows
    re-fits the canvas, and the open panel re-centres as it does on any view change (FS-28DDG
    § Change C8, FS-ZAJMH R13). **[charter default F7]**
11. **Every world.** The town's, the field's and the run's OPTIONS panel all carry the row, because
    all three open the one shared panel. **[charter default F8]**

**C. Handing the frame's fullscreen to the game**

12. **The page lends it, the scenes read it.** `PhaserGame`, which owns the game frame, builds the
    frame's fullscreen control from `fullscreenOf(document, keyboardLockOf(navigator))`, bound to
    the frame. It is `null` where there is none. `PhaserGame` puts the control in the new game's
    registry. Each scene reads it from its registry as it opens the OPTIONS panel and passes it in.
    It is not a module-level holder, so a destroyed game takes its control with it. The panel
    depends only on a narrow control it defines: whether fullscreen is on, toggle, and watch.
    **[derived]** Reason: the charter's "a small bridge … the way other deps are passed, no global
    hacks".

**D. Docs**

13. `game-client/docs/design-guideline.md` stops placing a fullscreen button or icon on the canvas.
    Where it places HUD beside the button, it says the spot is kept empty. `game-client/CONTEXT.md`'s
    *Game frame*, *Map mode icon* and *Map name* entries say the same. **[charter default]**

### What this replaces

- FS-ZAJMH R18 (the button in the frame's corner: its fade, palette, names and keyboard focus), R22's
  second sentence (a click on the button triggers no game action) and R23's first sentence (the
  button is not rendered) now read as R4–R7 here. User Stories 20, 21, 23 and 25 move to the row.
  The keyboard path to fullscreen (US 25) ends, by F5.
- FS-56CKV § Change C2, C3 and C4 (where the button stands), C6 (handing it its place: the hand-off
  stays in code, but nothing shows it), C8 and C9 (its look and hint). Every other widget's place
  in that section stands (R2).
- FS-28DDG § Change C4's list grows to three rows, and the third is a toggle, not a slider.

## User Stories

1. As a player, I want fullscreen in the OPTIONS panel with the other settings, so that I find it
   where a game keeps its settings.
2. As a player, I want no button over the corner of the game, so that nothing sits on the view.
3. As a player, I want the row to say On or Off, so that I can tell which state I am in.
4. As a player, I want one click on the row to switch fullscreen, so that it is as quick as the
   button was.
5. As a player who left fullscreen with Esc or the browser's UI, I want the row to say Off when I
   look, so that it never lies.
6. As a player with the panel open, I want the row to change the moment fullscreen changes, so
   that it is never a frame behind.
7. As a player, I want the panel to stay open and centred after I toggle, so that I can toggle back
   or go on adjusting.
8. As a player in Chrome or Edge, I want Esc to stay the game's in the fullscreen I entered from
   the row, and a held Esc to get me out, so that it behaves as it did from the button.
9. As a player in Safari or Firefox, I want the first Esc to leave fullscreen as before, so that I
   am never stuck.
10. As a player on an iPhone, I don't want a row that does nothing.
11. As a player, I want ←/→ to keep moving the Music slider, so that the keys I learned still work.
12. As a player in the town, a field or the run, I want the same row, so that the setting is
    everywhere the panel is.
13. As a player, I want every HUD element where it was, so that I don't relearn the corner.
14. As a player whose browser refuses fullscreen, I want the row to stay Off and nothing to break,
    so that the refusal costs me nothing.
15. As a developer, I want the panel to depend on a narrow fullscreen control handed in by the page
    that owns the frame, so that it is testable and holds no global.

## Acceptance Criteria

- [ ] `GameFrame` renders no button: the frame holds the stage, and the stage holds the canvas
      only. `FullscreenButton.tsx`, its test and its CSS are gone. No `.fullscreen-button` or
      `.fullscreen-hint` rule is left.
- [ ] `fullscreen.ts` still exports `fullscreenOf` and `keyboardLockOf`, and their tests pass
      unchanged. `fullscreenLabel`, `keepFromGame` and `handBackFocus` are gone, and so is
      `fullscreenHintSide`.
- [ ] Every HUD position test for the top-right corner passes unchanged (R2).
- [ ] Given a fullscreen control, `openOptionsPanel` draws three rows in order (Music, Sound
      effects, Fullscreen), and the panel is one `OPTIONS_ROW` taller than without it.
- [ ] The Fullscreen row's words are **Off** and **On**, right-aligned on the sliders' right edge.
      The state's word is in `tones.actionable` and the other in `tones.dim`. Every colour drawn is
      one of the panel's tones.
- [ ] A `pointerup` on the row's hit calls the control's toggle once, and a `pointerdown` alone
      calls nothing. The hit is camera-fixed, above the panel's depth, and spans the row inside the
      insets.
- [ ] Under the pointer, the state's word is in `tones.text`. Out, it is back in `tones.actionable`.
- [ ] When the control reports a change, the row redraws to its new state without the panel
      reopening. After the panel is destroyed, the row no longer listens.
- [ ] With no control (`null` or absent), the panel has exactly the two rows it had.
- [ ] ←/→ change Music only, with the row present. Enter and the number keys do nothing.
- [ ] Toggling leaves the panel open. `moveTo` moves the row's hit with the box.
- [ ] The town, the field and the run each pass the control from their game's registry to the
      panel. `PhaserGame` lends the frame's control to the game's registry, or `null` where there is
      no Fullscreen API.
- [ ] The lent control's toggle asks the frame for fullscreen, and locks Escape after entering
      where Keyboard Lock exists. Its state and watch are the document's.
- [ ] The guideline and `CONTEXT.md` place no fullscreen button on the canvas.
- [ ] **Owner's browser check (HITL):** in Chrome, the row enters and leaves fullscreen, a single
      Esc in fullscreen opens the game's Esc handling, and a held Esc leaves with the row going to
      Off. In Safari, the first Esc leaves. The corner shows no button. In the town, a field and
      the run.

## Edge States

- **Fullscreen left by Esc, a held Esc or the browser's UI with the panel open**: `fullscreenchange`
  redraws the row to Off. The canvas re-fits and the panel re-centres (R10).
- **Held Esc in Chrome fullscreen with the panel open**: the first keydown reaches the game, so the
  panel's Esc (Back) reopens the ESC menu. Then the browser leaves fullscreen. Accepted, as
  FS-ZAJMH's held-Esc edge.
- **The request refused** (a permission policy, an embedded frame): the row stays Off, nothing is
  shown, and nothing throws.
- **Keyboard Lock refused or missing**: fullscreen works and the first Esc leaves it (A16).
- **Browser fullscreen by F11 or the menu**: the document has no fullscreen element, so the row
  reads Off. A click asks for the frame's fullscreen as usual. No Escape lock is taken without it
  (Keyboard Lock §4.2).
- **The panel opened in fullscreen**: the row reads On from the start.
- **A double click**: two `pointerup`s, two toggles. The second toggle reads the document's state
  at that moment, so the end state is whatever the document says.
- **The page unmounts with the panel open**: the panel's container is destroyed with the game, and
  its watch is released.
- **The empty footprint** where the button stood (R2): the corner shows game, not a control.

## Out of Scope

- Moving or re-spacing any HUD widget into the freed corner (R2).
- A keyboard route to the row (focus, Enter, a key for fullscreen).
- Any change to `fullscreen.ts`'s toggle, lock or watch semantics, to the fit, or to the render
  scale.
- A fullscreen control anywhere but the OPTIONS panel (the main menu, the site header).
- Any change to the game-server.

## Change: The top-right HUD fills the button's spot
Status: work-order
Date: 2026-11-13

Asked by the owner on 2026-11-13, after the move: 「空出來的就補上」 (fill the gap the removed button
left). The defaults below were approved with the coordinator's charter. For the run's map overlay
the owner chose option A on 2026-11-13 (「1.A」). This section replaces R2 ("the spot stays empty")
and the part of R3 that kept the footprint and `FullscreenButtonPlace`. It also retires what is left
of FS-56CKV § Change C2–C4 and C6 (the button beside the map, and the hand-off of its place). Each of
those FS-56CKV sections keeps its stub here.

**Facts (read 2026-11-13 on f6cb7391).** `topRightCorner` (`ui/topRightColumn.ts`) already stands
the normal and the enlarged map on `TOP_RIGHT_EDGE`, 10 px in from the right and the top. With
the overlay up, or with no map, the column started at `TOP_RIGHT_HUD` (y 44: 10 plus the button's
clearance of 34). The map mode icon (`minimapModeIconPlace`), the map name (`minimapNamePlace`) and
the dev readout (`positionReadoutPlace`) were placed off the button's spot. The scenes and
`WorldMinimapController` handed that spot to `FullscreenButtonPlace`, which nothing reads since
R1. The gear overlay keeps no clearance in code; only a test checks it against the button.

### Requirements

G1. **Nothing reserves the spot.** `render/viewport/fullscreenButton.ts`
    (`FULLSCREEN_BUTTON`, `FULLSCREEN_BUTTON_CLEARANCE`, `FULLSCREEN_CORNER`, `FullscreenButtonPlace`,
    `fullscreenButtonPlace`), its exports and its test go. So do `TOP_RIGHT_HUD`, the scenes' and
    `WorldMinimapController`'s hand-off and take-back of the button's place, and the gear overlay's
    test against the button. **[charter default]**
G2. **The normal map does not move.** It stays at (W − 226, 10), 216 × 108. The icon, the name and
    the readout stay inside it, where FS-56CKV put them. **[charter default; derived: it already
    stands in the true corner]**
G3. **The enlarged map does not move, and its name closes up to it.** The map stays at
    (W − 334, 10), 324 × 162. The map name stands `MINIMAP_NAME.gap` (6 px) left of the map's left
    edge. Its middle stays 10 px under the map's top (y 20), where it stood beside the button. Its
    right edge is at 740 at width 1080 (was 714) and 940 at 1280 (was 914). The dev readout stays
    `POSITION_READOUT.beside` (6 px) left of the name's plate, on its middle, as before. Where no
    name stands, the readout is 6 px left of the map itself (was: of the button). **[charter
    default: the name keeps its place relative to the map, minus the button]**
G4. **The overlay: the icon and the name take the corner (owner, option A).** With the map overlay
    up, in a run, the town or a field:
    - The map mode icon's right edge is on the column's x (W − 10), its top at y 10. So its 9 × 9
      box is x 1061–1070, y 10–19 at width 1080, and x 1261–1270 at 1280. Its hit area keeps its
      2 px pad. Its hint's right edge stays `gap` (6 px) left of the icon.
    - The map name stands `gap` (6 px) left of the icon, its middle on the icon's (y 14.5). Its
      right edge is 1055 at 1080 and 1255 at 1280.
    - The column starts at **y 31**, under that row: `TOP_RIGHT_EDGE`'s 10 plus the row's
      clearance of 21 (the name's plate, about 17 px, and the column's 4 px gap). In a run that
      puts the escaped count at y 31 (the floor line is hidden, since the name names the floor),
      and the dev readout 4 px under it. The town and a field stand nothing in the column.
    **[owner: 「1.A」]**
G5. **No map: the column starts at the top.** Where no minimap is shown (a floor with no regions,
    before the map is in, a world before its first state), the column starts at `TOP_RIGHT_EDGE`,
    y 10. In a run that puts the floor line at y 10 and the escaped count under it. The dev readout
    stays under the column's last line. **[charter default]**
G6. **No sizes change.** The map, the icon, the name's type and plate, the lines, the readout and
    the gaps are as they were. Only the positions above move. **[charter default]**
G7. **Docs.** The design guideline's map section and `CONTEXT.md` (*Map mode icon*, *Map name*,
    *Game frame*) describe these places, and no button or spot kept for one. **[charter default]**

### Acceptance Criteria

- [ ] No `FullscreenButtonPlace`, `fullscreenButtonPlace`, `FULLSCREEN_BUTTON*`, `FULLSCREEN_CORNER`,
      `TOP_RIGHT_HUD` or `render/viewport/fullscreenButton.ts` is left in `game-client/src`.
- [ ] Normal map, at 1080 and 1280: map, icon, name and readout where they were.
- [ ] Enlarged map, at 1080 and 1280: map where it was; name right edge at map.x − 6 (740 / 940),
      middle y 20; readout 6 px left of the name, middle y 20, or 6 px left of the map with no
      name.
- [ ] Overlay, at 1080 and 1280: icon box at (W − 19, 10), 9 × 9; name right edge at W − 25, middle
      y 14.5; the run's column (the escaped count) at y 31; the readout 4 px under the column's last
      line.
- [ ] No map: the run's column starts at y 10.
- [ ] The town and a field: the same corner in each mode (the minimap through
      `WorldMinimapController`), with no button hand-off.
- [ ] The guideline's map section and `CONTEXT.md` match.
- [ ] **Owner's browser check (I-T3DWX-2):** the corner in the normal and the enlarged map, the
      overlay, and with no map, in the town, a field and the run, at windowed and fullscreen sizes.

### Edge States

- **The enlarged map's name under a boss's target frame** (x 351–729 from y 10 at 1080): the name
  now ends at 740, so it still meets the frame and gives way while the frame stands (FS-56CKV
  § Change: Map name, E7), as it did at 714. Its readout gives way with it.
- **The overlay at 1080 with a top-centre notice or a target frame**: the icon and the name stand
  at x ≥ ~950, clear of the 600 px notice (240–840) and of the frames.
- **A resize or an M press**: every place is recomputed from the view and the mode, as before.
- **Leaving a scene**: nothing is handed back. There is no place left to hand.

### Out of Scope

- Any size, colour or wording change in the corner.
- The target frame, the notices, the queue line, the ability card and the gear overlay's own
  layout.
