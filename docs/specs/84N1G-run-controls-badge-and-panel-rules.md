# FS-84N1G: The run's controls badge, and the controls panel's auto-show, frame and close rules

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger): the controls panel has no line, and the work spans several owners. Each owning FS carries the stub `## Change: The run's controls badge and the controls panel's rules → FS-84N1G`: [FS-TQZ5J](TQZ5J-ui-scene.md) (the controls panel as phase 3 moved it, R50, R56, R58–R62, and its review fixes: the invite field under it), [FS-3EBCA](3EBCA-hud-corner-icons.md) (panel shortcut icons on the HUD; §F, one frame for every window), [FS-WDM0X](WDM0X-interface-sound-effects.md) (its pass 2b left the controls panel silent) · Related ADRs: [ADR-0080](../adr/0080-canvas-hud-icons-are-embossed-bronze-knockouts-from-one-shared-renderer.md) (the badge's look), [ADR-0081](../adr/0081-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md) (the bridge), [ADR-0082](../adr/0082-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md), [ADR-0083](../adr/0083-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (where the badge goes) · Builds on: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) req 29–32 (the ability card it sits on), [FS-PQ2TW](PQ2TW-arrival-card.md) R8 (arrival or return), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) § Change: Every hover keeps the bone hand · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Controls badge**, **Controls panel**

Scoped and promoted in one run under the owner's approved charter (2026-11-14), with the
integrator's defaults; no interview, no `challenge-me` pass (client chrome, cheap to change). The
owner's words are marked **[owner]**; what the code forces (read on feat/client-ui-scene, 6f5ca4f8)
**[code]**; the integrator's follow-ups from the phase-3 review **[integrator]**; a default applied
to a case the charter did not name, *Derived*.

**The owner's asks, 2026-11-14.** 「操作說明面板 進入塔的時候會出現」 (the controls panel appears as the
player enters the tower); 「幫我做一個徽章 放在 技能上方區塊」 (a badge above the ability card);
「幫助圖示 畫一本書的樣子」 (the help icon drawn as a book); 「音效用dialog的開關就可」 (its sounds are the
dialog open and close); 「樣式也調成跟其他面板一樣外匡」 (the same frame as the other panels);
「這個面板開啟其他面板時也要關閉 esc也可以關」 (opening another panel closes it, and Esc closes it).

**Lane.** game-client only. No server, proto, gateway or manifest change.

**Look.** Named visual changes: the badge, the panel opening by itself, the panel's frame. Every
other look and behaviour stays as it is but the presses and closes named here.

## Summary

In a run, a small bronze book stands above the ability card. Hovering it names it "Controls (H)";
pressing it opens and closes the controls panel, as H does. The panel now opens by itself the first
time the player sees the run's first floor, wears the frame every other window wears, with an × at
its top right, and steps aside when any other window opens. Esc and Q close it first. Opening it
plays `dialog_open`, closing it `dialog_cancel`; what the game opens or closes plays nothing.

## Facts (verified 2026-11-14 on feat/client-ui-scene, 6f5ca4f8)

- **The panel.** `controlsPanel.ts` draws it in a container at the view's centre: an ink rounded
  rect with a faint frame line, the windows' title "CONTROLS" (`drawPanelTitle`), 13 rows (key in
  `frameBright` 11 px, action in `hudLabel` 11 px) and "H to close" in `hudFaint`; 260 wide, 44 +
  20 × rows + 32 high, depth 1200. `controlsPiece.ts` builds it with a ground over its rect
  (`uiGround`, R59); `UiControlsSlot` in `uiSceneRecord.ts` opens and closes it: H (`keydown-H` on the
  UI scene's keyboard) toggles it in the run, refused under the menu slot and after the run's end;
  `endPopped` closes it; it goes as the run leaves. H plays nothing today (FS-WDM0X pass 2b, Out of
  Scope). **[code]**
- **The frame.** `drawPanelFrame` (panelFrame.ts) draws every window's frame, `carvedPanel`'s carved
  ground, double brass rule and corner studs, and the × glyph at `frameClose`; the party panel, the
  menu, the gear overlay's panels, OPTIONS and the letter panel call it. The party panel's × closes on
  the release (FS-R82NV R28's reason: on the press the panel still claims it) and lights under the
  pointer (`lightClose`). **[code]**
- **Esc and Q.** `escapeStep`: letter, menu, party, gear, then the menu opens. Q in the run: the gear
  overlay, else the container view (`UiGearSlot.key("close")`). **[code]**
- **The sounds.** `UiSounds.act` plays one sound per action: the first effect asked inside it, else
  the window rule's (`windowSound`), which knows the menu, the letter panel, the party panel, the
  inventory and the character panel only. A close outside an action plays nothing. **[code]**
- **The ability card.** The run's `showAbilityCard` draws `AbilityHud` at `ABILITY_CARD_PLACE`
  (bottom-right corner 16 px in from the right, `CORNER_ROW_CLEARANCE` = 70 px up), 280 × 72, from
  `abilityCard(state, …)`: none once the player is out of the delve (dead or escaped), while the dead
  spectator's leave button holds the corner, or for a class with no card. It stays in the world (FS-TQZ5J
  phase 6). **[code]**
- **Arrival.** The run's start data says whether the switch was an arrival (`arrival`, FS-PQ2TW R8;
  a reconnect or a refresh into the same run is a return). The first broadcast naming a floor plays
  the floor's card on an arrival (`arrived`); floor 1 is only ever arrived on, never climbed to
  (`placeCard`). A climb is not a world switch. The arrival card is up (`arrivalCard.up`) from create's
  dark until its words have left. **[code]**
- **The door.** `offerWatch`, the first time WATCH and LEAVE are offered to an escaped player whose
  teammate is still in play, asks `endPopped()` (R58 at the door); the party panel stays open there.
  **[code]**
- **The invite field.** `PartyPanelDeps.covered()`, read once a frame (`postupdate`), hides the DOM
  field (blurring it) while the UI scene's controls panel is open, whatever the layout; it shows again
  as that ends, its text kept, no focus taken back. **[code]**
- **The corner row's hover.** `CornerLabel` (12 px vellum on the HUD panel, its bottom 6 px over the
  plate, kept 8 px inside the right edge) and `menu_hover`; a press refused under the menu plays
  `menu_error` (FS-WDM0X M10), though the menu's blocker (1999) stands over every plate but Menu's.
  **[code]**
- **The gallery.** `src/dev/gallery/families.ts` tracks `effects` and `item-icons`; HUD icons are not
  a tracked family. **[code]**

## Requirements

### A. The panel opens by itself as the run begins

1. **One fact from the run.** The run tells the UI scene `runBegun()` through the bridge: a call with
   no data, meaning "the player has arrived in this run on its first floor, and it is in view". It is
   sent once a start, and only when the start was an arrival (FS-PQ2TW R8) and the first broadcast
   naming a floor names floor 1; it waits until the arrival card has gone (`arrivalCard.up` false), so
   the panel never covers the floor's card. Not on a climb, not on a return (a reconnect, a refresh into
   the same run), not on a start whose first floor is a later one. **[owner; code]** *Derived* (the
   wait for the card).
2. **The UI scene opens the panel, silently.** On `runBegun()` the controls panel opens as H would
   open it, if it is shut, the run is reported, the menu slot is empty and the run has not ended;
   otherwise nothing, and it is not tried again. It plays nothing (FS-WDM0X S4: the game opened it).
   It closes no other window. **[owner; charter]**

### B. The controls badge

3. **Where.** A plate the corner icons' size, 54 × 46 (`CORNER_ICON_W`, `CORNER_ICON_H`), its right
   edge on the ability card's (16 px in from the view's right), its bottom the corner row's gap
   (`CORNER_ROW_HEADROOM`, 8 px) above the ability card's top. Logical units; it stands again in its
   place on a new view (FS-ZAJMH R12, R13). **[owner]**
4. **When.** In the run only, exactly while the run's ability card is up and the run has not ended.
   The run says whether its ability card is up through the bridge (`abilityCard(up)`, plain data,
   sent again on a change); the UI scene reads the end from the run's facts. So it goes down with the
   card at the player's death or escape and while the dead spectator's leave button holds the corner,
   at `end_game`, and as the run leaves. A field's ability card says nothing: no badge in a field or
   the town. **[owner; code]**
5. **Its home.** The UI scene, at the corner row's depth (1000): it is fixed to the screen (ADR-0083
   1.1). **[code]**
6. **Look (ADR-0080).** An embossed bronze knockout through the shared renderer (`Knockout`,
   `BRONZE`), its drop shadow and top-lit tint, lifted under the pointer. Its picture is a book
   (「幫助圖示 畫一本書的樣子」): a closed tome with spine bands, one picture function
   (`bookPicture` in `knockoutBook.ts`) that is all a later pick replaces. Where the scene cannot make
   the knockout's texture, the same shapes are drawn as lines in the line glyph width
   (`GLYPH_LINE_W`), no emboss: the slot is never empty. **[owner; ADR-0080]**
7. **Hover.** The pointer onto the plate lifts it, shows the label **"Controls (H)"** as the corner
   row labels its icons (`CornerLabel`), and plays `menu_hover` (FS-WDM0X M5, its cooldown); off the
   plate the label goes. **[owner]**
8. **Press.** A press toggles the panel as H does, acting on the release over the plate
   (`pointerup`), as the HUD buttons do (FS-R82NV R28), through the UI scene's act: its open plays
   `dialog_open`, its close `dialog_cancel` (R11). The press is the UI scene's: no attack, no cast. While
   the menu slot is filled it is refused with `menu_error`, changing nothing, as H is refused there
   (the menu's blocker stands over the plate, so this is the rule's, not a path a player meets).
   **[owner]**
9. **No cursor of its own.** The bone hand stays over it (FS-KYPQ9 § Change; `boneHand.test.ts`).
   **[owner]**
10. **No gallery card.** HUD icons are not a tracked family (`families.ts`). **[code]**

### C. The sounds

11. **The player's open and close.** Opening the panel by H or the badge plays `dialog_open`; closing
    it by H, the badge, its ×, Q or Esc plays `dialog_cancel`. One sound per action (FS-WDM0X M2):
    the action's own effect, asked inside its act. **[owner]**
12. **What the game opens or closes plays nothing** (S4): the auto-show (R2), the close as another
    window opens (R16), the run's end and the door (FS-TQZ5J R58), the run leaving. **[owner; S4]**

### D. The panel's frame

13. **Every window's frame.** The panel wears `drawPanelFrame`: the carved ground, the double brass
    rule, the corner studs and the × at the top right, in the party panel's look and place; the title
    stays `drawPanelTitle`'s "CONTROLS". Reused, not copied. Its size, its rows (keys in `frameBright`,
    actions in `hudLabel`), their places and "H to close" are unchanged; the ink ground and its faint
    line are gone. **[owner]**
14. **The ×.** Amber, brighter under the pointer (`lightClose`); a release over it closes the panel
    through the act with `dialog_cancel` (R11), on the release as the party panel's × does. Its hit
    stands over the panel's ground, so the press is the ×'s. No cursor of its own. **[owner;
    code]**
15. **Its ground.** Unchanged (FS-TQZ5J R59, R61): a press elsewhere on the panel is the panel's.

### E. The close rules

16. **Another window opening closes it, silently.** When any other window opens while the panel is
    open, the panel closes, outside any action, so only the opened window's own sound plays: the gear
    overlay's inventory, character panel and stash, the party panel, the menu slot (the ESC menu,
    OPTIONS, the Fall confirm), the town's letter panel, the container view and the settlement record.
    Judged once a frame in the UI scene's update, before the frame draws: a window shut on the last
    frame and open now. A window already open as the panel opens does not close it (H or the badge open
    it over the inventory as today). **[owner]** *Derived* (once a frame: one place sees every window,
    the world's letter panel included).
17. **Esc closes it first.** With the panel open, one Esc closes it and nothing else, before the
    existing order (letter, menu, party, gear, then the menu opens), and plays `dialog_cancel`.
    **[owner]**
18. **Q closes it too.** With the panel open, Q closes it first, and nothing else, with
    `dialog_cancel`; else the gear overlay, else the container view, as today. *Derived* (the panel is
    on top: R16 means nothing it covers opened after it).
19. **The keys' refusals stand.** H, Q and Esc are refused under the menu slot and after the run's end
    as today (FS-TQZ5J R56); H refused plays nothing.

### F. The integrator's follow-ups

20. **Every window over the party panel hides its field.** The party panel's DOM invite field hides
    while any UI-scene window drawn over the party panel covers the field's rect: the controls panel
    (1200) and the settlement record (1600), the windows above 1110 that can stand over an open party
    panel (the letter panel closes as the party panel opens; the menu slot shuts it). Covering is the
    window's rect meeting the field's, in logical units, so a layout where they do not meet leaves the
    field showing. The same rules as the review fix: its hide blurs it, it shows again uncovered with
    its text kept and no focus taken back; the panel, T and the Party icon are not refused by it.
    `PartyPanelDeps.covered` is handed the field's rect. **[integrator]**
21. **The door closes the party panel too.** As WATCH and LEAVE are first offered at the door
    (`offerWatch`, the first time a run), the party panel closes, silently, in the party store, as R47
    closes it at the end; T and the Party icon reopen it while the run goes on. The end's own close
    (R47) and its `dialog_open` are unchanged. **[integrator]**

### G. Parity

22. **Shots.** In the harness (`game-client/tmp/ui-scene-corner/`, git-ignored), the branch before this
    change (6f5ca4f8) against after: the gear set, the party set and the earlier sets (corner, menu,
    dialogue, notices). Pixel-equal but for the named cases: every shot of the open controls panel (its
    frame), and the field under it where the two no longer meet (R20). New shots, after only: the badge
    idle and hovered with its label, the panel with its ×, at render scale 1, 1.5 and 2, windowed and
    fullscreen. **[charter]**

## User Stories

1. As a new player, I want the controls listed as I first step into the tower, so that I learn the keys
   without hunting for them.
2. As a returning player reconnecting mid-run, I want no panel thrown up at me, so that I am back in the
   fight at once.
3. As a player climbing, I want no panel on each new floor, so that the climb is not interrupted.
4. As a player, I want the floor's card to finish before the controls appear, so that neither hides the
   other.
5. As a player, I want a book above my ability card, so that I can find the controls again without
   remembering H.
6. As a player, I want the book named "Controls (H)" under my pointer, so that I learn its key too.
7. As a player, I want a press on the book to open and close the panel as H does, so that both ways
   agree.
8. As a player, I want the book gone when my ability card goes, so that a dead or escaped player is not
   offered a panel the run no longer has.
9. As a player, I want the book to look like the corner icons, so that the HUD reads as one set.
10. As a player, I want the bone hand to stay over the book, so that the pointer is one cursor
    everywhere.
11. As a player, I want the panel to open with a dialog's sound and close with its cancel, so that it
    sounds like the dialogs.
12. As a player, I want the panel that opens by itself to be silent, so that the game does not seem to
    answer a press I never made.
13. As a player, I want the controls panel to wear the same frame as the other windows, so that it
    belongs with them.
14. As a player, I want an × on it, so that I can close it with the mouse.
15. As a player, I want the panel to step aside when I open the inventory, the character panel, the
    party panel, the menu, a container or the record, so that the window I asked for is the one on top.
16. As a player, I want only the opened window's sound when the panel steps aside, so that one action
    makes one sound.
17. As a player, I want Esc to close the panel first, so that Esc always takes off what is on top.
18. As a player, I want Q to close it as it closes other windows, so that the "Close Panel" key does
    what the panel itself says.
19. As a party leader typing a name into the invite field, I want the field hidden while a window
    covers it and back with my text after, so that no box shows through a panel.
20. As an escaped player waiting at the door, I want the party panel out of the way of WATCH and LEAVE,
    so that both buttons can be pressed.
21. As the owner, I want the book's picture swappable in one function, so that I can pick from the
    previews without a redesign.

## Acceptance Criteria

- [ ] The run sends `runBegun()` once a start, on an arrival whose first named floor is floor 1, after
      the arrival card has gone; never on a return, a climb or a later first floor (R1).
- [ ] The UI scene opens the panel on `runBegun()` unless it is open, the menu slot is filled or the run
      has ended, with no sound and no other window closed (R2, R12).
- [ ] The badge stands 54 × 46, right-aligned with the ability card and 8 px above it, in the run only,
      exactly while the run says its ability card is up and the run has not ended; it stands again on a
      new view (R3–R5).
- [ ] The badge is a bronze knockout of `bookPicture()` through `Knockout`, lifted on hover, its lines
      drawn where the texture cannot be made (R6).
- [ ] Hover: "Controls (H)" over the plate and `menu_hover`; release over the plate: the panel toggles
      with `dialog_open` / `dialog_cancel`; under the menu slot `menu_error` and nothing changes; no
      cursor of its own (R7–R9).
- [ ] H opens with `dialog_open` and closes with `dialog_cancel`; the ×, Q and Esc close with
      `dialog_cancel`; one sound per action (R11).
- [ ] The panel wears `drawPanelFrame` and its × (lit on hover, closing on the release), its rows and
      size unchanged (R13–R15).
- [ ] Any other window opening closes the open panel within the frame, silently: the opened window's
      sound alone (R16).
- [ ] Esc and Q close the open panel first, and only it (R17, R18).
- [ ] The invite field hides while the controls panel or the record covers its rect, and only then, its
      text kept and no focus taken back (R20).
- [ ] At the door the party panel closes, silently, once (R21).
- [ ] Parity: the earlier sets, the gear set and the party set pixel-equal against 6f5ca4f8 but for the
      named cases, each shot; the badge and the framed panel shot at 1, 1.5 and 2, windowed and
      fullscreen (R22).
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.
- [ ] The owner's look-and-feel and listening check passes, and the owner picks the book.

## Edge States

- **H pressed while the floor's card is still up.** The panel opens then (H's own rule); `runBegun()`
  then finds it open and does nothing.
- **A window opened before the card has gone** (I during the dark). The auto-show opens the panel over
  it, as H would (R2); the next window opening closes it (R16).
- **The menu open as the card goes.** The auto-show is refused and not tried again.
- **Death, escape or the end before the card goes.** The panel does not open after the end (R2); death
  alone does not stop it (H is not refused by death).
- **A refresh into a run with blocked tab storage** reads as an arrival (FS-PQ2TW Edge States): on
  floor 1 the panel opens again; on a later floor it does not.
- **The floor's map never comes.** The dark holds, the card never goes, and the panel never opens by
  itself; H still works.
- **The panel and a window opening in the same frame.** The panel closes (R16).
- **The badge pressed during a world press elsewhere** (a release over it after a drag that began on
  the world): it toggles, as a HUD button's release does.
- **A run left with the panel open.** Closed with the run, silently (as today).
- **The record reopened over the party panel by SETTLEMENT.** The panel (if open) closes as the record
  opens (R16); the invite field hides where the record meets it (R20).
- **A layout where the controls panel does not meet the invite field** (a wide fullscreen view): the
  field stays shown with the panel open; before this change it hid.

## Out of Scope

- The ability card, the potions, the target frame (FS-TQZ5J phase 6); a badge in a field.
- Changing the panel's rows, its wording or its size; a scroll.
- The final book: the owner picks from the previews made in parallel; the swap is one function.
- Any server change.

## As built (2026-11-14)

Appended after the slices; the text above is not edited. Built in I-84N1G-1 (the frame, the × and
H's sounds), I-84N1G-2 (the close rules), I-84N1G-4 (the badge) and I-84N1G-5 (the field and the door);
the owner's check is I-84N1G-6. I-84N1G-3 (the auto-show) was built and then reverted: see Amendment
A1 below.

- **The book (R6).** The owner picked variant D of the previews (「Ｄ」) during the run: a closed book
  from the front, its spine and a title band cut, the page block under the cover's foot (a cut that
  curls at the fore-edge) and a swallowtail ribbon hanging from the pages. It is `BOOK` (a
  `KnockoutPicture`) with its 2.25 px line glyph `drawBookLines` in `knockoutBook.ts`, beside
  `knockoutRucksack.ts`, in place of R6's `bookPicture` placeholder; swapping the book is that file
  alone. Drawn by the shared `Knockout` at `controlsBadgeFrame`, it matches the approved previews pixel
  for pixel at render scale 1, 1.5 and 2, idle, hovered and greyed (the badge itself, idle, too). The
  greyed ink (`GREYED`, `GREYED_ALPHA`) moved from `HudCorner.ts` to `knockout.ts`, shared, not copied;
  the badge has no greyed state.
- **Where it lives.** `ControlsBadge.ts` (the piece), `uiSceneControlsBadge.ts` (`UiControlsBadge`, when it
  stands and what its press does), `controlsBadgeFrame` and `CONTROLS_BADGE_LABEL` in `hudCornerLayout.ts`
  (`ABILITY_CARD_H` exported from `AbilityHud.ts`); the bridge's `abilityCard(up)`; the run's
  `showAbilityCard`, which tells it on each change.
- **The panel.** `drawControlsPanel` wears `drawPanelFrame`; `controlsPiece.ts` stands the ground and then
  the ×'s hit over it at 1200, again on a new view. `UiControlsSlot` plays `dialog_open` and
  `dialog_cancel` (`toggle`, `dismiss`), takes Q first (`closeKey`), and
  closes silently on `sync`, which the UI scene's update hands every other window's open state (the
  menu slot, the gear's inventory, character and stash, the container view, the party panel, the record
  as the run last showed it, the world's letter panel). `escapeStep` gains a first `controls` step.
- **R20, as built.** `PartyPanelDeps.covered(field)` is handed the invite field's rect; the UI scene
  answers by `rectsMeet` (`partyPanelLayout.ts`) against the open controls panel's and the open record's
  rects (`SettlementRecord.rect()`, kept as it is built).

## Amendment A1 2026-11-14 (no auto-show)

Appended; the text above is not edited. The owner, 2026-11-14, on the auto-show: 「誰說要自動打開」 (who
said it should open by itself?). The integrator had read 「操作說明面板 進入塔的時候會出現」 as asking for the
panel to open on entering the tower; the owner did not ask for that. **The controls panel never opens by
itself.** It opens only by H or the controls badge.

- **Withdrawn:** §A whole (R1, R2); R12's "the auto-show (R2)"; the first two Acceptance Criteria (the run
  sends `runBegun()`; the UI scene opens the panel on it); User Stories 1–4 and 12; the Edge States "H
  pressed while the floor's card is still up", "A window opened before the card has gone", "The menu open as
  the card goes", "Death, escape or the end before the card goes", "A refresh into a run with blocked tab
  storage" and "The floor's map never comes"; the Summary's "now opens by itself the first time the player
  sees the run's first floor"; the Look line's "the panel opening by itself".
- **Reverted, not rewritten:** I-84N1G-3's commits (70434161, the red tests; 88b60e2a, the build) by
  `git revert`. The bridge's `runBegun()` went with them: nothing else used it. The badge's
  `abilityCard(up)`, built beside it later, stays.
- **What stands:** everything else here: the book-D badge, the panel's frame and ×, `dialog_open` and
  `dialog_cancel`, the close rules, Esc and Q, the invite field under any covering window, the party panel
  closed at the door. R12 still holds for the game's closes.
- **Parity (R22):** the new shots drop the panel opened by the run's beginning.

## Amendment A2 2026-11-14 (no parity shots)

Appended; the text above is not edited. The owner changed the process the same day:
「剩下這些拉出來後檢查沒出錯就好了 不用比對 我測的時候再看就好」 (pull the rest out, check nothing errs, no
comparing: he looks when he tests). **R22 and its acceptance criterion are withdrawn**: no before/after
screenshot runs. The checks are the full client vitest, `tsc --noEmit`, `npm run lint` and
`npm run lint:fence`; the look is the owner's check (I-84N1G-6). The named look and depth changes stand
as R3–R9, R13–R16 and R20 say: the badge at 1000 above the ability card, the panel's carved frame and
×, the panel stepping aside under any window that opens, the invite field showing again where no window
meets it. The book's own match to the approved preview D (render scale 1, 1.5, 2) was shot before this,
pixel-equal.
