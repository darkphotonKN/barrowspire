# FS-3EBCA: Panel shortcut icons on the HUD

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### HUD" → "Panel shortcut icons on the HUD" → this FS · Owners carrying a stub: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (R29, the ability card's place), [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (req 10, the dead spectator's leave button), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (R4, a new way to open the overlay) · Changes made alongside: [FS-1GZGD](1GZGD-in-game-mailbox.md) § Change: The envelope toggles the letter panel and stands in the corner row; [FS-R82NV](R82NV-party-formation.md) § Change: The party panel closes on its × and stands nearer the middle; [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) § Change: The ESC menu in a field world · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the HUD is on the game palette) · Builds on: [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) R12–R15 (anchors, re-layout, logical units) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Corner row**

## Summary

A row of small drawn icons stands in the bottom-right corner of the screen in every world, from
the right: **Menu** (a gear), which does what Esc does; **Character**, which opens the gear and
bag overlay; **Party**, which opens the party panel; and **Mail**, the mailbox's envelope in the
town, a greyed envelope that cannot be pressed anywhere else. A press on an icon opens its panel,
and a second press closes it; the keys stay as they are (Esc, I or B, T). Under the pointer an
icon brightens and names itself and its key. In a run and a field the ability card and the dead
spectator's leave button stand just above the row, right-aligned with it.

Charter run "右下角圖示與面板操作", approved by the owner 2026-11-12 ("核准"). The owner's words:
"右下角新增組隊的icon", "道具欄也在右下角顯示icon 快捷鍵用I", "道具欄名稱改成角色英文",
"mail沒有快捷鍵 所以就顯示mail就好"; and, added the same day before any slice was built:
"esc的icon也加入 一般是齒輪嗎 會用setting嗎", "進入攻擊地圖這些也都可以開 所以在村莊以外的地圖
除了email都一樣顯示在右下角吧", then "野外 email也不用消失 就顯示灰色表示不能按", and
"村莊以外會顯示右鍵的技能 就放在icon上方的位置". (His "目前野外按esc沒反應 野外按esc跟村莊一樣行為" is
FS-G4VMQ § Change: The ESC menu in a field world.) Each requirement below is a **charter default** (the locked
decisions, approved by the owner) or says **derived here** and why. Recorded without adversarial
review: no `challenge-me` pass.

**Why a new FS.** No thin line owns a row of panel icons; the only HUD icon today is the
mailbox's envelope (FS-1GZGD, town only). The envelope's own changes (it toggles, it moves into
the row) are FS-1GZGD's change section; the party panel's (its ×, its place) are FS-R82NV's. The
ability card and the leave button keep "bottom right" in their owners' words; only the lift is
specified here, with a stub on each owner. The field's ESC menu, which the Menu icon opens there,
is FS-G4VMQ's change section (its owner, the ESC menu).

## Facts this spec rests on

Verified 2026-11-12 on main 321d2b23; client paths under `game-client/src/`.

- **The envelope** (`ui/MailboxEnvelope.ts`, `ui/letterPanelLayout.ts` `envelopeFrame`): a
  58 × 46 carved plate (`carvedPanel`, opacity 0.85) 16 px in from the view's right and bottom
  edges, at depth 1000; its lines 1.5 px in `palette.interactable` at 0.85, in
  `palette.interactableBright` at 1 under the pointer; a hand cursor; mounted by the hub only
  (`mailboxHud.ts`).
- **The view** is 720 logical px tall and 1080–1280 wide (`render/viewport`); HUD widgets are
  placed by `anchorAt` and re-placed by each scene's `relayoutHud` (FS-ZAJMH R12–R13).
- **The gear overlay** (`ui/GearOverlay.ts`, `ui/gearOverlayLayout.ts`) is at depth 1100; its
  right panel spans from 8 px off the right edge across to the clear band, and from 4% to 98% of
  the view's height (`TOP_GAP` 0.04, `HEIGHT` 0.94). Its hint line is at the panel's foot.
- **The keys:** the hub reads I and B once a frame (`offerGear`), dropped while the ESC menu, a
  dialogue or the letter panel is open; a run toggles the overlay on I or B unless its ESC menu is
  open, and the overlay's opening ends a Shadow Shot hold (`toggleInventory`); a field toggles it
  on I or B and ends a hold the same way. T toggles the party panel in every world unless a text
  field has focus or the scene's `blocked` says another owner has the keys (`PartyPanel`).
- **Bottom right in a run and a field:** the ability card (`ui/AbilityHud.ts`, 280 × 72) has its
  bottom-right corner 16 px in from both edges (`ABILITY_CARD_MARGIN`, the field's `HUD_MARGIN`);
  in a run the dead spectator's Leave the barrow button (200 × 38) is centred 16 px in from both
  edges (`LEAVE_BUTTON_MARGIN`), and the card is down while it is up (FS-8AY7S req 32).
- **A press in a run** (`BarrowspireScene` `pointerdown`) and **a field** (`FieldScene`
  `takesPointer`) is an attack, a cast or a Shadow Shot hold unless a HUD piece covers its point.
  The hub has no press in the world.
- **What Esc opens** is a game menu, not a settings panel: in the town the hub menu (Change
  character, Leave the queue while queued, Back; FS-G4VMQ), in a run the run menu (Fall where you
  stand or Leave the barrow, Back; FS-9K8EZ). Esc first closes what is open over the world (the
  letter panel, the gear overlay; FS-HRH2J R5). A field has no ESC menu today: Esc only closes
  the gear overlay (`FieldScene` `keydown-ESC`).

## Requirements

### §A. The row

1. **Which icons, in what order.** From the right edge leftward: **Menu**, **Character**,
   **Party**, **Mail**. Every world (the town, a field, a run) shows all four in the same places,
   so none ever shifts between worlds. In the town Mail is the mailbox's envelope (FS-1GZGD
   § Change); elsewhere it is a greyed envelope (R8). **(charter default; owner, 2026-11-12:
   "esc的icon也加入", "在村莊以外的地圖 除了email都一樣顯示在右下角吧", "野外 email也不用消失")**
2. **Where.** Each icon is a 58 × 46 plate, the envelope's size; the row's right and bottom edges
   stand 16 px in from the view's, the envelope's margin; 8 px between plates. At 1080 × 720:
   Menu x 1006–1064, Character x 940–998, Party x 874–932, Mail x 808–866, all y 658–704. Placed
   by the bottom-right anchor and re-placed whenever the view's size changes (FS-ZAJMH R12, R13).
   These are named constants in one pure layout module. **(derived here: the envelope's plate and
   margin keep the row one family with it and leave the envelope's look untouched)**
3. **How each is drawn.** Each plate as the envelope's: `carvedPanel` at opacity 0.85, and on it a
   line glyph 1.5 px wide in `palette.interactable` at 0.85, in `palette.interactableBright` at 1
   under the pointer, with a hand cursor. **Menu** is a gear: a toothed ring round a small hub.
   **Character** is a bust: a head over the curve of the shoulders. **Party** is two busts, one
   stepped behind and above the other, the front one drawn over it. Drawn in code from palette
   tokens; no baked art, no emoji, no texture file. **(charter default: "same drawn style as
   today's envelope"; owner: "一般是齒輪嗎"; the glyphs derived here)**
4. **Depth.** The row is in the HUD band, depth 1000, as the envelope is: under the gear overlay
   (1100), the letter panel (1800) and every popup. **(derived here: nothing that opens over the
   world is drawn under an icon)**
5. **Hover text.** Under the pointer an icon shows its name and key in a small label above it:
   "Menu (Esc)", "Character (I)", "Party (T)", "Mail" (Mail has no key), and the greyed Mail
   "Mail · town only". 12 px, `palette.hudText` on `palette.hudPanel` at 0.85, padding 6 × 3, its
   bottom 6 px above the plate, centred on the plate but kept at least 8 px inside the view's
   right edge. It goes when the pointer leaves. **(charter default: the words; "道具欄名稱改成角色英文"
   names the bag's icon Character, in English; "mail沒有快捷鍵 所以就顯示mail就好"; "Menu", since Esc
   opens a game menu and no settings panel exists (§Facts; owner: "會用setting嗎"); "town only"
   derived here, the terse voice; the label's look derived here, the HUD's text on its panel)**

### §B. Presses

6. **Menu** does what one Esc press does in that world, under the same rules: in the town and a
   field it closes the one thing on top (FS-R82NV § Change C2's order), else opens or closes the
   ESC menu, and does nothing while a dialogue is open; in a run likewise with the run's menu, and
   after the run's end it only closes what is open. **(owner: "esc的icon也加入"; charter: "clicking
   it toggles the same thing Esc does")**
7. **Character** toggles the gear and bag overlay exactly as I does in that world, under the same
   guards: in the town not while the ESC menu, a dialogue or the letter panel is open; in a run or
   a field not while its ESC menu is open. Opening it ends a Shadow Shot hold, as I does.
   **(charter default)**
8. **Party** toggles the party panel as T does, under the scene's same `blocked` rule (in the
   town: a dialogue, the ESC menu, the gear overlay or the letter panel; in a run: the ESC menu,
   the run's end, the gear overlay or an open container; in a field: the ESC menu or the gear
   overlay). A text field holding focus does not stop a press: a press is not typing. **(charter
   default; derived here: the T rule's text-focus clause exists so a typed T stays a letter)**
9. **Mail** in the town toggles the letter panel (FS-1GZGD § Change). **Outside the town, in a
   field and in a run alike, Mail is greyed**: its envelope lines and its dark seal in
   `palette.hudFaint`, no count, no brightening and no hand cursor under the pointer, and a press
   does nothing; only its label shows. **(owner, 2026-11-12: "野外 email也不用消失 就顯示灰色表示不能按";
   he named the fields, and a run is outside the town too, so the same rule holds there,
   derived here; never amber, since an amber thing the player cannot act on is a defect)**
10. **A press on an icon is the icon's alone**: in a run or a field it never attacks, casts or
    starts a Shadow Shot hold, as a press on any other HUD piece. **(derived here)**
11. **Under the open gear overlay the row is the overlay's.** The overlay's right panel covers the
    row while it is open (§Facts); a press there is the overlay's (FS-HRH2J R8), so no icon
    answers it, whichever lies under it. I, B and Esc close the overlay, as its hint says.
    **(derived here: the alternative, an invisible icon closing the overlay from under its hint
    line, is a press on the panel doing something the panel does not show. Raised to the owner:
    the Character icon cannot be pressed to close the overlay it opened.)**
12. **The keys do not change.** Esc, I and B, T and M keep their meaning; Mail has no key.
    **(charter default)**

### §C. The corner in a run and a field

13. **The ability card stands directly above the row**, right-aligned with it: its bottom-right
    corner 16 px in from the right edge and 70 px up from the bottom (the row's margin, its height
    and the row's 8 px gap), in a run and a field alike, and re-placed with the row when the view
    changes. Its size, look and when it shows are unchanged (FS-8AY7S R29–R32). **(owner,
    2026-11-12: "村莊以外會顯示右鍵的技能 就放在icon上方的位置")**
14. **The dead spectator's Leave the barrow button stands above the row** the same way: centred
    116 px in from the right edge (as today) and 89 px up from the bottom (70 + half its height).
    The card is still down while it is up (FS-8AY7S req 32). **(derived here, as R13)**

## User Stories

1. As a player, I want an icon for my character's gear and bag in the corner, so that I can open it without knowing the key.
2. As a player, I want an icon for my party in the corner, so that I can open the party panel without knowing the key.
3. As a player, I want a gear icon that does what Esc does, so that I can reach the game's menu with the mouse.
4. As a player in the town, I want the mailbox's envelope beside them, so that all the panels I open live in one corner.
5. As a player in a field or a run, I want the envelope still there but greyed, so that I know the mailbox exists and that it opens only in town.
6. As a player, I want the icons in the same places in the town, a field and a run, so that my hand finds them without looking.
7. As a player, I want an icon to name itself and its key when I point at it, so that I learn the key as I go.
8. As a player, I want a second press on an icon to close what it opened, so that the icon is a switch.
9. As a player, I want the keys I already use to keep working, so that nothing I learned is lost.
10. As a player in a run, I want a press on an icon never to swing my weapon, so that opening my bag never wastes an attack.
11. As a player outside the town, I want my ability card just above the icons, so that the bottom-right corner reads as one column.
12. As a dead spectator, I want my Leave the barrow button clear of the icons, so that I can still leave with one press.
13. As a player with a dialogue or a menu open, I want the icons to open nothing new, so that one thing owns the screen at a time.
14. As a player typing in chat, I want a press on Party to open the panel, so that a focused field never makes an icon dead.
15. As a player, I want the icons to look like the envelope, amber because I can press them, so that the HUD reads as one set.
16. As a player who resizes the window, I want the icons and the card above them to keep to the corner, so that nothing ends up off-screen.

## Acceptance Criteria

- [ ] At 1080 × 720 the row's rects are Menu (1006, 658, 58, 46), Character (940, 658, 58, 46), Party (874, 658, 58, 46) and Mail (808, 658, 58, 46); at 1280 each is 200 px further right; the town, a field and a run draw them at the same rects.
- [ ] Each live icon is drawn on a carved plate at depth 1000 with its glyph in `interactable`, brightening to `interactableBright` under the pointer; the greyed Mail is drawn in `hudFaint` and never brightens; no raw colour literal (the lint fence passes).
- [ ] Under the pointer each icon shows "Menu (Esc)", "Character (I)", "Party (T)", "Mail" or, greyed, "Mail · town only" above it, kept inside the view's right edge; the label goes when the pointer leaves.
- [ ] A press on Menu does what one Esc press does in the town, a field and a run (closes the one thing on top, else opens or closes the ESC menu).
- [ ] A press on Character toggles the gear overlay in every world, under the same guards as I there, and ends a Shadow Shot hold on opening.
- [ ] A press on Party toggles the party panel in every world, refused while the scene's `blocked` holds, accepted while a text field has focus.
- [ ] A press on the greyed Mail in a field or a run does nothing.
- [ ] A press on an icon in a run or a field sends no attack, cast or hold.
- [ ] While the gear overlay is open, a press at an icon's place opens and closes nothing.
- [ ] Esc, I, B, T and M behave as before (Esc's new order and the field's menu are FS-R82NV's and FS-G4VMQ's changes).
- [ ] In a run and a field the ability card's bottom-right corner stands at (width − 16, 650); the dead spectator's leave button is centred at (width − 116, 631); neither overlaps the row; both follow a view-size change.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint` pass.

## Edge States

- **A dialogue open (town):** Menu, Character and Party do nothing (the dialogue keeps Esc,
  FS-G4VMQ R2); Mail opens nothing.
- **The ESC menu open:** Menu closes it, as Esc does; Character, Party and Mail open nothing.
- **The letter panel open (town):** Menu closes it (one Esc); Mail closes it; Character and Party
  open nothing.
- **The gear overlay open:** its right panel covers the row; no icon answers (R11). Closing it
  shows the row again.
- **The run has ended:** Menu only closes what is open; Party opens nothing; Character toggles as
  I does.
- **Spectating, dead:** the row stays; the leave button stands above it, the card down (R14).
- **No class card (a class with no row):** the row is unchanged; the space above it stays empty.
- **A resize while hovered:** the row and an open label move with the corner.
- **A text field focused:** a press on Party still toggles the panel (R8); typing T in it does not.

## Out of Scope

- New keys, rebinding, a key for the mailbox, or a settings panel.
- Badges or counts on Character, Party or Menu (the envelope's seal is FS-1GZGD's, town only).
- The mailbox itself outside the town: its fetches, its seal and its panel stay town only
  (FS-1GZGD D11); only a greyed icon stands in its place.
- Shortening the gear overlay's right panel or drawing the row over it (R11; raised to the owner).
- Renaming the gear overlay's own panel titles; the dev gallery (HUD chrome is not a tracked
  family, FS-1819Q).
- Any server, proto or gateway change.
