# FS-3EBCA: Panel shortcut icons on the HUD

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### HUD" → "Panel shortcut icons on the HUD" → this FS · Owners carrying a stub: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (R29, the ability card's place), [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (req 10, the dead spectator's leave button), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (R4, a new way to open the overlay) · Changes made alongside: [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) § Change: Character and inventory apart; [FS-1GZGD](1GZGD-in-game-mailbox.md) § Change: The envelope toggles the letter panel and stands in the corner row; [FS-R82NV](R82NV-party-formation.md) § Change: The party panel closes on its × and stands nearer the middle; [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) § Change: The ESC menu in a field world · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the HUD is on the game palette) · Builds on: [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) R12–R15 (anchors, re-layout, logical units) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Corner row**

## Summary

A row of small drawn icons stands in the bottom-right corner of the screen in every world, from
the right: **Menu** (a gear), which does what Esc does; **Inventory** (a bag), which opens the
inventory (the gear slots, the bag and the gold); **Character** (a bust), which opens the
character panel (the stats); **Party**, which opens the party panel; and **Mail**, the mailbox's
envelope in the town, a greyed envelope that cannot be pressed anywhere else. A press on an icon
opens its panel, and a second press closes it; the keys are Esc, I or B, C and T. Under the
pointer an icon brightens and names itself and its key. The open inventory and character panel
stop above the row, so it stays pressable under them. In a run and a field the ability card and
the dead spectator's leave button stand just above the row, right-aligned with it.

Charter run "右下角圖示與面板操作", approved by the owner 2026-11-12 ("核准"). The owner's words:
"右下角新增組隊的icon", "道具欄也在右下角顯示icon 快捷鍵用I", "道具欄名稱改成角色英文",
"mail沒有快捷鍵 所以就顯示mail就好"; and, added the same day before any slice was built:
"esc的icon也加入 一般是齒輪嗎 會用setting嗎", "進入攻擊地圖這些也都可以開 所以在村莊以外的地圖
除了email都一樣顯示在右下角吧", then "野外 email也不用消失 就顯示灰色表示不能按", and
"村莊以外會顯示右鍵的技能 就放在icon上方的位置". (His "目前野外按esc沒反應 野外按esc跟村莊一樣行為" is
FS-G4VMQ § Change: The ESC menu in a field world.)

**The owner's decision on the overlay split, 2026-11-12**, settling what this FS first left out
(raised from R11 and Out of Scope): "道具欄跟角色面板拆開顯示 角色面板維持快捷鍵C 道具欄是I 右下角也多做一個道具欄
然後這兩個右上角都要多加X關閉按鈕", then "裝備欄一般不是跟著道具欄嗎" (the gear slots belong with the
inventory), and "選單快捷鍵是esc". The split itself, its keys, its × and the shortened panels are
FS-HRH2J § Change: Character and inventory apart; this FS takes the fifth icon, the row's new
order and labels, and the row answering under the open overlay (R1–R3, R5, R7, R11, R12, edited
in place on this work order). The same day: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框": the panels
Menu, Inventory and Character open wear the party panel's frame (FS-G4VMQ § Change: The menu
wears the party panel's frame; FS-HRH2J § Change C16). And, the same day: "開道具欄跟角色欄時開不了隊伍"
(with the inventory or the character panel open, the party panel cannot be opened): T and the
Party icon open the party panel over either or both, which it is drawn above (R8, R11; FS-R82NV
§ Change C2, C8). And, the same day: "信箱似乎也會卡住其他面板 但信箱是全畫面 那設定成開信箱時其他視窗會被關閉
開其他視窗時信箱會被關閉 開menu時其他視窗也會關閉 然後menu開啟時其他都不能按" (the mailbox seems to block the
other panels; since the letter panel is full-screen, opening it closes the other windows, opening
another window closes it, opening the menu closes every window too, and while the menu is open
nothing else can be pressed): §D (R15–R19), with R6–R9 and R11 edited in place; FS-1GZGD § Change
C1, C4; FS-R82NV § Change C8, C9; FS-HRH2J § Change C2, C11; FS-G4VMQ § Change C4. And, the
same day: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣" (every window's title sits somewhere different; put them all in one style,
centred, the same size and colour), "menu目前沒標題也加上" (the menu has no title now; give it one) and
"全大寫也統一" (all capitals too, uniformly): §E (R20–R24), this FS owning the shared frame's title.
And, the same day: "mailbox的x關閉按鈕好像位置跟其他的不太一樣" (the mailbox's × close button seems to sit
differently from the others'): §F (R25), every window in the one frame, the letter panel joining
it (FS-1GZGD § Change C5). And, the same day: "menu無法再按一次icon關閉" (with the menu open, pressing its icon again does not
close it): the Menu icon is a switch, the one corner icon the open menu lets through (R6, R18,
edited in place).

Each requirement below is a **charter default** (the locked
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
  the view's height (`TOP_GAP` 0.04, `HEIGHT` 0.94). Its hint line is at the panel's foot. Both
  panels open and close together, on one open state (`GearOverlay` `visible`) that the hub's
  `HubGear` and the run's and field's `EquipmentHud` drive. (Before FS-HRH2J § Change: Character
  and inventory apart, which makes them two panels that stop 70 px above the bottom.)
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

1. **Which icons, in what order.** From the right edge leftward: **Menu**, **Inventory**,
   **Character**, **Party**, **Mail**. Every world (the town, a field, a run) shows all five in the
   same places, so none ever shifts between worlds. In the town Mail is the mailbox's envelope (FS-1GZGD
   § Change); elsewhere it is a greyed envelope (R8). **(charter default; owner, 2026-11-12:
   "esc的icon也加入", "在村莊以外的地圖 除了email都一樣顯示在右下角吧", "野外 email也不用消失"; the Inventory icon and its place,
   owner 2026-11-12: "右下角也多做一個道具欄", the row's order as relayed: Menu (Esc), Inventory (I),
   Character (C), Party (T), Mailbox)**
2. **Where.** Each icon is a 58 × 46 plate, the envelope's size; the row's right and bottom edges
   stand 16 px in from the view's, the envelope's margin; 8 px between plates. At 1080 × 720:
   Menu x 1006–1064, Inventory x 940–998, Character x 874–932, Party x 808–866, Mail x 742–800,
   all y 658–704; at 1280 each 200 px further right. Placed
   by the bottom-right anchor and re-placed whenever the view's size changes (FS-ZAJMH R12, R13).
   These are named constants in one pure layout module. **(derived here: the envelope's plate and
   margin keep the row one family with it and leave the envelope's look untouched)**
3. **How each is drawn.** Each plate as the envelope's: `carvedPanel` at opacity 0.85, and on it a
   line glyph 1.5 px wide in `palette.interactable` at 0.85, in `palette.interactableBright` at 1
   under the pointer, with a hand cursor. **Menu** is a gear: a toothed ring round a small hub.
   **Inventory** is a bag: a rounded pouch under a gathered neck tied with a cord, a flap across
   its top. **Character** is a bust: a head over the curve of the shoulders. **Party** is two busts, one
   stepped behind and above the other, the front one drawn over it. Drawn in code from palette
   tokens; no baked art, no emoji, no texture file. **(charter default: "same drawn style as
   today's envelope"; owner: "一般是齒輪嗎"; the glyphs derived here)**
4. **Depth.** The row is in the HUD band, depth 1000, as the envelope is: under the gear overlay
   (1100), the letter panel (1800) and every popup. **(derived here: nothing that opens over the
   world is drawn under an icon)**
5. **Hover text.** Under the pointer an icon shows its name and key in a small label above it:
   "Menu (Esc)", "Inventory (I)", "Character (C)", "Party (T)", "Mailbox" (it has no key), and the greyed Mail
   "Mailbox · town only". 12 px, `palette.hudText` on `palette.hudPanel` at 0.85, padding 6 × 3, its
   bottom 6 px above the plate, centred on the plate but kept at least 8 px inside the view's
   right edge. It goes when the pointer leaves. **(charter default: the words; "道具欄名稱改成角色英文"
   names the bag's icon Character, in English; "mail沒有快捷鍵 所以就顯示mail就好", then "信箱hover改mailbox" (2026-11-12): "Mailbox", the name the
   panel and the vocabulary already use; "Menu", since Esc
   opens a game menu and no settings panel exists (§Facts; owner: "會用setting嗎"); "town only"
   derived here, the terse voice; the label's look derived here, the HUD's text on its panel;
   "Inventory (I)" and "Character (C)" as relayed from the owner's decision, 2026-11-12)**

### §B. Presses

6. **Menu** opens the world's ESC menu at once, closing every open window first (R17): in the
   town, a field and a run alike. With the menu open it closes it, as the menu's ×, its Back row
   and Esc do (R18); in a run's Fall confirm it does what the confirm's × and Esc do there, Not
   yet: the whole menu goes, nothing sent. It does nothing while a dialogue is open (the dialogue
   keeps Esc); after the run's end, with no menu to open, it only closes every window. Esc itself keeps one press, one
   thing (FS-R82NV § Change C2's order). **(owner: "esc的icon也加入"; charter: "clicking it toggles
   the same thing Esc does", replaced by the owner's 2026-11-12 rules (§D): "開menu時其他視窗也會關閉
   然後menu開啟時其他都不能按"; the icon opening at once, where Esc closes the topmost first, derived
   here: a press on the menu's own icon asks for the menu, and players expect Esc to peel one
   window at a time; the icon closing the open menu, owner 2026-11-12: "menu無法再按一次icon關閉",
   replacing this requirement's version under which it did nothing then; the Fall confirm's
   answer derived here: the icon is the menu's ×, and there the × is Not yet)**
7. **Inventory** toggles the inventory exactly as I does in that world, and **Character** the
   character panel exactly as C does (FS-HRH2J § Change C2), under the same guards: in the town
   not while the ESC menu or a dialogue is open; in a run or a field not while its ESC menu is
   open. An open letter panel closes as either opens (R16). Opening either ends a Shadow Shot hold,
   as its key does. **(charter default; the two icons, owner 2026-11-12; the letter panel no longer
   a guard, owner 2026-11-12, §D)**
8. **Party** toggles the party panel as T does, under the scene's same `blocked` rule (in the
   town: a dialogue or the ESC menu, an open letter panel closing as it opens, R16; in a run: the
   ESC menu, the run's end or an open container; in a field: the ESC menu). The inventory and the character panel are not in
   it: with either or both open, T and Party open and close the party panel, drawn above them
   (FS-R82NV § Change C8), in every world. A text field holding focus does not stop a press: a
   press is not typing. **(charter default; derived here: the T rule's text-focus clause exists so
   a typed T stays a letter; the overlay taken out of the rule, owner 2026-11-12:
   "開道具欄跟角色欄時開不了隊伍", replacing this requirement's first version, under which the open
   inventory or character panel refused T and Party)**
9. **Mail** in the town toggles the letter panel (FS-1GZGD § Change), closing every other window
   as it opens (R15). **Outside the town, in a
   field and in a run alike, Mail is greyed**: its envelope lines and its dark seal in
   `palette.hudFaint`, no count, no brightening and no hand cursor under the pointer, and a press
   does nothing; only its label shows. **(owner, 2026-11-12: "野外 email也不用消失 就顯示灰色表示不能按";
   he named the fields, and a run is outside the town too, so the same rule holds there,
   derived here; never amber, since an amber thing the player cannot act on is a defect)**
10. **A press on an icon is the icon's alone**: in a run or a field it never attacks, casts or
    starts a Shadow Shot hold, as a press on any other HUD piece. **(derived here)**
11. **The row answers under the open overlay.** The inventory and the character panel stop above
    the row (FS-HRH2J § Change C12), so the row stays drawn and pressable while either is open,
    each icon under its own rule: Menu does one Esc (which closes the topmost, the party panel
    before the overlay, R6), Inventory and Character toggle their panels (R7), Party opens and
    closes the party panel over them (R8); Mail opens the letter panel, closing them (R15; FS-1GZGD
    § Change C4). **(owner, 2026-11-12, as relayed: shorten the inventory "so the row
    stays visible and clickable while it is open"; replaces this requirement's first version,
    under which the panel covered the row and no icon answered; Party, owner 2026-11-12:
    "開道具欄跟角色欄時開不了隊伍"; Mail, owner 2026-11-12: "開信箱時其他視窗會被關閉")**
12. **The keys.** Esc, I and B, T and M keep their meaning; C, new, opens the character panel
    (FS-HRH2J § Change C2); Mail has no key. **(charter default; C, owner 2026-11-12)**

### §C. The corner in a run and a field

13. **The ability card stands directly above the row**, right-aligned with it: its bottom-right
    corner 16 px in from the right edge and 70 px up from the bottom (the row's margin, its height
    and the row's 8 px gap), in a run and a field alike, and re-placed with the row when the view
    changes. Its size, look and when it shows are unchanged (FS-8AY7S R29–R32). **(owner,
    2026-11-12: "村莊以外會顯示右鍵的技能 就放在icon上方的位置")**
14. **The dead spectator's Leave the barrow button stands above the row** the same way: centred
    116 px in from the right edge (as today) and 89 px up from the bottom (70 + half its height).
    The card is still down while it is up (FS-8AY7S req 32). **(derived here, as R13)**

### §D. Windows give way (owner, 2026-11-12)

The **windows** are the inventory, the character panel, the party panel and, in the town, the
letter panel. The menu is the world's ESC menu (in a run its Fall confirm too). **(owner,
2026-11-12: "信箱似乎也會卡住其他面板 但信箱是全畫面 那設定成開信箱時其他視窗會被關閉 開其他視窗時信箱會被關閉
開menu時其他視窗也會關閉 然後menu開啟時其他都不能按")**

15. **The letter panel clears the screen.** Opening the letter panel (the envelope, the town
    only) first closes the inventory, the character panel and the party panel; none of them refuses
    the envelope any more. A dialogue and the ESC menu still do. **(owner: "信箱是全畫面
    那設定成開信箱時其他視窗會被關閉")**
16. **A window closes the letter panel.** I, B, the Inventory icon, C, the Character icon, T and the
    Party icon open their window with the letter panel open, closing it first; the letter panel no
    longer refuses them. `E` at the stash chest stays dropped under the letter panel, as a press to
    talk is (FS-1GZGD R40): it reaches into the world, which the full-screen letter panel covers.
    **(owner: "開其他視窗時信箱會被關閉"; E derived here)**
17. **The menu opens over no window.** Opening the menu closes every window first, in every world.
    Esc keeps one press, one thing: with a window open it closes the topmost (FS-R82NV § Change C2),
    and it opens the menu only with none open. The Menu icon opens the menu at once, closing every
    window (R6). **(owner: "開menu時其他視窗也會關閉"; Esc's order kept and the icon opening at once,
    derived here, R6)**
18. **The menu owns the screen.** While it is open only its rows (a press, Enter, a number), its ×,
    Esc and the Menu icon (which closes it, R6) answer, in every world: no other corner icon, no
    I, B, C or T, no envelope,
    no M and no map mode icon, no press in the world (attack, cast, Shadow Shot hold), no E or F,
    and nothing else drawn under it (the queue's Leave, the party frames' Travel, an invite
    prompt's or the ready check's buttons, the dead spectator's Leave the barrow, the chat window's
    tabs and names). The chat input takes no focus, by Enter or a click, and its row is hidden. The
    menu hangs a blocker over the whole view, under its rows and × and over the HUD and every panel,
    which takes every press and hover there and lets none reach the world, but for the Menu
    icon's plate, which it leaves to the icon: a press there closes the menu, a hover there
    brightens the icon and shows its label, and a press beside the plate is the blocker's.
    **(owner: "menu開啟時其他都不能按"; the blocker derived here: one rule for everything drawn
    under the menu rather than a guard on each; the Menu plate let through, owner 2026-11-12:
    "menu無法再按一次icon關閉", replacing the first version, under which no icon answered)**
19. **The stash counts as the inventory.** At the stash chest the stash and the inventory open
    together (FS-HRH2J § Change C9); for R15 and R17 they are the inventory: the envelope and the
    menu close them together. **(derived here: the pairing opens and closes as one)**

### §E. One title for every window (owner, 2026-11-12)

**(owner, 2026-11-12: "每個ui視窗的標題都不同位置 都統一放在中間的樣式好了 大小顏色也一樣", "menu目前沒標題也加上", "全大寫也統一")**

20. **One title drawing.** Every in-game window's title is drawn by one shared drawing beside the
    shared frame (`panelFrame`'s `drawPanelTitle`), so a later window takes it by calling it:
    centred across the panel, its top 14 px below the panel's top edge, in the body face at 14 px,
    `palette.frameBright`, letter-spacing 4: the inventory's and the character panel's heading as
    it stood, the style three of the five titled windows already wore. The words are uppercased by
    the drawing itself, so no caller can forget. **(owner: "都統一放在中間的樣式", "大小顏色也一樣",
    "全大寫也統一"; the style derived here: the most common one, the gear overlay's)**
21. **Clear of the ×.** The title stays centred between the panel's edges; the × keeps its place at
    the top right (R82NV § Change C1), and the title's band (its top 14 px down, its foot 36 px
    down: `PANEL_TITLE_BAND`, the × box's foot, under the title's line) is the title's and the
    ×'s alone. No title is as wide as
    its panel less both × margins. **(derived here)**
22. **Which windows, and where their titles were.** The party panel ("Party" or "Party (n/m)",
    15 px, left at the inner edge, now "PARTY" or "PARTY (n/m)" centred at 14 px); the inventory,
    the character panel and the stash (already centred at 14 px in this style, unchanged); the
    letter panel ("MAILBOX" at 12 px `hudLabel`, letter-spacing 2, left at the header, now centred
    in this style); the run's controls panel (H: "CONTROLS" centred at 16 px, letter-spacing 5, a
    few px higher, now this style); the settlement record ("Escaped the barrow", "Fallen in the
    barrow" or "Out of the delve" in the blackletter at 30 px `hudText`, now in this style and in
    capitals; the guideline permits the blackletter there but does not require it). The town's,
    the field's and the run's ESC menu and the run's Fall confirm, which had no title, take
    **MENU** (R23). Not windows, so not titled here: the chest's satchel (no title), the NPC
    dialogue card (the speaker's name plate), the party invite prompt and the ready check (a
    question, no title), the arrival card, the run's resolved card and the field's fallen card
    (notices that fade or wait, not windows a player opens). **(derived here: what is opened and
    closed over the world, with a heading)**
23. **The menu's title.** The ESC menu (town, field, run) and the run's Fall confirm (whose copy
    line is not a heading) read **MENU** in the title band; the rows, the copy line and their keys
    keep their order and gaps, moved down by the band, the box growing by as much; the width and
    the centre in the popup band are as before. **(owner: "menu目前沒標題也加上"; the word derived
    here: the corner icon's and the key help's name for it, in capitals like the other titles)**
24. **Contents move only as needed.** Under every other title nothing moves: each already began
    below the band. **(derived here)**

### §F. One frame for every window (owner, 2026-11-12)

25. **One frame drawing.** Every in-game window that opens over the world wears the party panel's
    frame by calling the shared drawing (`panelFrame`'s `drawPanelFrame`), never a copy: the
    carved ground, and its × a 24 × 24 box 12 px in from the panel's top and right edges, the ×
    glyph amber and brighter under the pointer. The party panel, the ESC menu (and the Fall
    confirm), the inventory and the character panel already did; the letter panel now does too
    (FS-1GZGD § Change C5), its × moving from 20 px in to the shared place. **(owner, 2026-11-12:
    "menu跟道具欄跟角色欄的ui調整成跟party一樣外框", then "mailbox的x關閉按鈕好像位置跟其他的不太一樣")**

## User Stories

1. As a player, I want an icon for my inventory (gear slots and bag) and one for my character's stats in the corner, so that I can open either without knowing its key.
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
17. As a player with my inventory open, I want the corner icons still in view and pressable, so that I can close it or open my stats with the mouse.
18. As a player in town, I want the envelope to open my letters whatever window is open, closing it, so that the full-screen letter panel never fails to open.
19. As a player reading my letters, I want I, C, T or their icons to open their window and put the letters away, so that I never have to close one to reach the other.
20. As a player, I want the menu to stand alone, closing every window as it opens and letting nothing else answer while it is up, so that what I press while it is open is the menu's.
21. As a player, I want every window's title in the same place, size, colour and case, so that the windows read as one set.

## Acceptance Criteria

- [ ] At 1080 × 720 the row's rects are Menu (1006, 658, 58, 46), Inventory (940, 658, 58, 46), Character (874, 658, 58, 46), Party (808, 658, 58, 46) and Mail (742, 658, 58, 46); at 1280 each is 200 px further right; the town, a field and a run draw them at the same rects.
- [ ] Each live icon is drawn on a carved plate at depth 1000 with its glyph in `interactable`, brightening to `interactableBright` under the pointer; the greyed Mail is drawn in `hudFaint` and never brightens; no raw colour literal (the lint fence passes).
- [ ] Under the pointer each icon shows "Menu (Esc)", "Inventory (I)", "Character (C)", "Party (T)", "Mailbox" or, greyed, "Mailbox · town only" above it, kept inside the view's right edge; the label goes when the pointer leaves.
- [ ] A press on Menu opens the ESC menu at once in the town, a field and a run, closing every open window; with the menu open (in a run its Fall confirm too) it closes it, nothing sent; it does nothing while a dialogue is open; after the run's end it only closes every window. Esc still closes the topmost window first.
- [ ] A press on Inventory toggles the inventory and one on Character the character panel in every world, under the same guards as I and C there, and ends a Shadow Shot hold on opening.
- [ ] A press on Party toggles the party panel in every world, refused while the scene's `blocked` holds, accepted while a text field has focus; with the inventory, the character panel or both open it opens the party panel over them, as T does.
- [ ] A press on the greyed Mail in a field or a run does nothing.
- [ ] A press on an icon in a run or a field sends no attack, cast or hold.
- [ ] While the inventory or the character panel is open the row stays drawn and answers: Inventory and Character close their panels on a second press, Menu opens the menu closing them, Party toggles the party panel over them; Mail opens the letter panel closing them.
- [ ] In the town, the envelope opens the letter panel with the inventory, the character panel, the stash or the party panel open, closing them; a dialogue or the ESC menu still refuses it.
- [ ] In the town, with the letter panel open, I, B, C, T and the Inventory, Character and Party icons open their window and close the letter panel.
- [ ] Opening the menu, by Esc or the Menu icon, leaves no window open, in every world.
- [ ] While the menu is open no corner icon but Menu, no I, B, C or T, no envelope and no press under it answers (a press beside the Menu plate included), and the chat input takes no focus, in every world; Esc, its ×, its rows and the Menu icon still do, the Menu icon brightening and naming itself under the pointer.
- [ ] Esc, I, B, T and M behave as before (Esc's new order and the field's menu are FS-R82NV's and FS-G4VMQ's changes); C toggles the character panel.
- [ ] In a run and a field the ability card's bottom-right corner stands at (width − 16, 650); the dead spectator's leave button is centred at (width − 116, 631); neither overlaps the row; both follow a view-size change.
- [ ] The party panel, the inventory, the character panel, the stash, the letter panel, the run's controls panel, the settlement record and every ESC menu (and the Fall confirm) draw their title through `drawPanelTitle`: centred, 14 px below the panel's top, 14 px `frameBright`, letter-spacing 4, in capitals; the menus read MENU, their rows moved down by the title band.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint` pass.

## Edge States

- **A dialogue open (town):** Menu, Inventory, Character and Party do nothing (the dialogue keeps Esc,
  FS-G4VMQ R2); Mail opens nothing.
- **The ESC menu open:** no icon but Menu answers, and nothing else under the menu takes a
  press or a hover (R18); Esc, its ×, Back or the Menu icon close it (R6).
- **The run's Fall confirm open:** the Menu icon closes it whole, as its × and Esc do (Not yet),
  nothing sent (R6).
- **The letter panel open (town):** Menu opens the menu, closing it; Mail closes it; Inventory,
  Character and Party open their window, closing it (R16).
- **The inventory or the character panel open:** the row stays in view above them and answers
  (R11); Party opens the party panel over them (R8); Menu opens the menu, closing them and the
  party panel (R17); Mail opens the letter panel, closing them (R15).
- **The stash open (town):** Inventory closes the stash with the inventory, as I does; Character
  does nothing (FS-HRH2J § Change C9); Mail and Menu close it with the inventory (R19).
- **The run has ended:** Menu only closes every window, there being no menu (R6); Party opens
  nothing; Inventory and Character toggle as I and C do.
- **Spectating, dead:** the row stays; the leave button stands above it, the card down (R14).
- **No class card (a class with no row):** the row is unchanged; the space above it stays empty.
- **A resize while hovered:** the row and an open label move with the corner.
- **A text field focused:** a press on Party still toggles the panel (R8); typing T in it does not.

## Out of Scope

- Other new keys (C is FS-HRH2J § Change C2's), rebinding, a key for the mailbox, or a settings panel.
- Badges or counts on Inventory, Character, Party or Menu (the envelope's seal is FS-1GZGD's, town only).
- The mailbox itself outside the town: its fetches, its seal and its panel stay town only
  (FS-1GZGD D11); only a greyed icon stands in its place.
- Drawing the row over the overlay's panels (they stop above it instead, FS-HRH2J § Change C12).
- The dev gallery (HUD chrome is not a tracked
  family, FS-1819Q).
- Any server, proto or gateway change.
- The split itself (its keys, its ×, stash mode, the panels' extent and titles): FS-HRH2J § Change:
  Character and inventory apart. First recorded here as out of scope and raised to the owner;
  settled 2026-11-12 (Summary).

## Change: Bare corner icons → FS-J1672

## Change: The inventory icon is an inked backpack
Status: work-order
Date: 2026-11-13

> Promoted `--from-thread` on 2026-11-13 from the approved charter (owner, 2026-11-13). Each
> requirement marked **(charter default)** is one of its locked decisions D1–D7, with its reason;
> **(spec)** fills an acceptance-level gap the charter left, and is this section's own. Recorded
> without adversarial review: no `challenge-me` pass (client art, cheap to redo, judged by eye).
> Code citations are against `d819a33a` (FS-J1672 built, not yet on main). Builds on FS-J1672.

### Summary

The Inventory icon in the corner row stops being a thin line bag and becomes a small inked
illustration of an adventurer's backpack, in the manner of a dark-fantasy game's hand-inked art: a
heavy ink outline, flat fills of muted leather and old brass, and fine ink hatching for its shade,
stitching and scratches. It shows a flap, two straps closed by brass buckles, a side pouch, a rolled
bedroll tied on top, and a shoulder strap. A thin amber line along its silhouette says it can be
pressed, brighter under the pointer, as the other icons' amber lines do. It is drawn in code from
palette tokens. The other four icons, and where the Inventory icon is, what pressing it does, its
key and its label, stay as they are.

The owner, 2026-11-13: 「道具藍幫我重做成一個背包的圖示 可以圖示複雜有質感一點」 (redo the inventory's icon as a
backpack; it may be more complex, with more texture). A baked, realistic backpack was tried first
on another branch (`feat/client-backpack-icon-baked`, abandoned and never merged; its section and
its issues I-3EBCA-10 and I-3EBCA-11 are not on this ledger, and this section's issues start at
I-3EBCA-12 so the ids never collide). Seeing it, he said 「感覺風格不太對 可能還是要複雜的圖示 不要寫實風格」
(the style feels wrong; it should still be a complex icon, but not realistic) and 「黑暗奇幻風格」
(dark fantasy style).

**Why a change on this FS.** This FS owns the Inventory icon (R3), and only that capability
changes, so its thin line ("Panel shortcut icons on the HUD") is untouched. FS-J1672 is a change FS
with no capability of its own; this section narrows its R3 for this one icon, below, without a stub
there.

**On the guideline.** The charter gave D1's reason as "per the guideline's 'hand-drawn, inked'". The
design guideline has no such words: its medium is pre-rendered 3D, and its target is Ultima Online,
"realistic, gritty" (§ Art Technique). The corner icons were never part of that medium. They are HUD
chrome drawn in code (R3; § UI Chrome). D1's style therefore rests on the owner's own words above and
on the guideline's identity line, "Dark fantasy, not bright high-fantasy". R12 records the exception
in the guideline's Corner row paragraph, so the next icon does not copy it by accident.

### Bounds

Issues under this section may change `game-client/src/ui/HudCorner.ts`,
`game-client/src/ui/HudCorner.test.ts`, and the **Corner row** paragraph of
`game-client/docs/design-guideline.md`. A screenshot harness for R13 is throwaway. It lives under a
git-ignored path (`game-client/tmp/`, ignored by the root `.gitignore`'s `tmp/`) or outside the
worktree, and it is never committed.

They may **not** change `hudCornerLayout.ts` (rects, labels), `cornerLabel.ts`,
`MailboxEnvelope.ts`, `carvedPanel.ts`, `canvasPalette.ts` or `theme.ts` (so no new token), the Menu,
Character, Party or Mailbox glyphs, any scene, anything under `public/art` or `tools/bake`, the server,
or the existing text of this FS or of FS-J1672. A slice that finds one of these unavoidable stops and
escalates.

### Facts this section rests on

Verified 2026-11-13 on `d819a33a`. Paths are under `game-client/`.

- **Today's Inventory icon** (`src/ui/HudCorner.ts` `drawBag`, used nowhere else) is a bare line
  bag: a half-circle pouch of radius 11, a V flap, a gathered neck and a cord, 1.5 px, in
  `palette.interactable` at 0.85 and `palette.interactableBright` at 1 under the pointer. It is drawn
  on the slot's centre, `(f.x + 29, f.y + 23)`, into the icon's own graphics at depth 1000, which
  `draw` clears and redraws on hover, on leave and on `relayout`. The slot is (940, 658, 58, 46) at
  1080 × 720 and 200 px further right at 1280 (`cornerIconFrame`).
- **The glyphs draw through `Ink`**, a `Pick` of Graphics with stroke methods only (`lineStyle`,
  `strokeCircle`, `lineBetween`, `beginPath`, `arc`, `strokePath`, `closePath`), which is how
  FS-J1672 R3 ("no fill") is held in the types.
- **The tests** (`src/ui/HudCorner.test.ts`, block "FS-J1672 R1–R3, R7: bare glyphs") assert, for
  every graphics in the row, no call in `FILLS` (`fillStyle`, `fillRect`, `fillRoundedRect`,
  `fillCircle`, `fillPath`, `fillTriangle`, `fillGradientStyle`), and that Menu, Inventory, Character
  and Party are each stroked in `interactable` alone at 0.85. The fake graphics record `fillStyle`,
  `fillPath`, `arc`, `lineBetween` and the rest, but not `moveTo`, `lineTo`, `fillPoints`,
  `strokePoints`, `fillEllipse` or `strokeEllipse`.
- **Phaser 4.2.1 Graphics** (`node_modules/phaser/types/phaser.d.ts`) offers `fillStyle(color,
  alpha)`, `lineStyle(width, color, alpha)`, `beginPath`, `moveTo`, `lineTo`, `arc`, `closePath`,
  `fillPath`, `strokePath`, `fillPoints`, `strokePoints`, `fillEllipse`, `strokeEllipse`,
  `fillTriangle` and `fillRoundedRect`.
- **How WebGL strokes a path** (`node_modules/phaser/src/renderer/webgl/renderNodes/StrokePath.js`):
  each segment is its own quad, and adjacent segments get a connecting quad **only when the line
  width is over 2**. The width is the Graphics' own, before the camera's zoom. At 2 px or less a
  path's corners are not joined, and can show notches at render scale 2. Points closer together
  than `pathDetailThreshold` screen px are skipped (default 1; this game does not set
  `render.pathDetailThreshold`).
- **Render scale** (`src/render/viewport/camera.ts`) is the camera's zoom. A HUD object at logical
  (x, y) draws at backing (rs·x, rs·y), so a vector icon is drawn from the same commands at twice
  the backing px at render scale 2.
- **Colours.** The game palette has no backpack token. It does have leather, brass and cloth
  tones: `palette.floor` (barrow brown), `palette.ground` (barrow deep), `palette.frame` and
  `frameBright` (brass), `palette.hudLabel` (vellum dark), `palette.ink` (charcoal, "outlines and
  the deepest shadow"), and the satchel's own leather family (`satchelFlap`, `satchelLip`,
  `satchelStrap`, mixed from barrow brown and brass). `shade`, `tint` and `mix` from
  `@/utils/canvasPalette` are already applied to palette tokens at call sites in `src/ui`
  (`LetterPanel.ts`, `carvedPanel.ts`, `satchel.ts`), and the lint fence passes them, since no
  literal is written.
- **The guideline** says darks are "never pure black" (§ Palette rules), and HUD amber is reserved
  for what the player can act on (§ Gameplay accent).

### Requirements

#### The picture

1. **What it shows.** An adventurer's backpack, seen from the front and turned a little so one side
   shows. It has a tall, rounded leather body. A flap covers its top third, with a curved lower edge.
   Two straps run down over the flap onto the body, each closed by a brass buckle: a small
   rectangular frame with its tongue. A side pouch sits on the visible side, with its own small flap.
   A rolled bedroll lies across the top, a little wider than the body, its rolled ends showing, tied
   by two cords whose loose ends hang. A shoulder strap curves from the top down behind the
   visible side. Rows of short stitches run along the flap's edge and the pouch's seams, and three to
   five short wear scratches mark the body and the flap. **(charter default, D2: the owner wants
   「複雜」)**
2. **Its style.** Every part is outlined in ink, and the whole silhouette in a heavier ink line:
   - the silhouette's outline is **2.5 px** (over 2 px, so the renderer joins its corners), in
     `palette.ink` at 1;
   - lines between parts (the flap's edge, the straps, the pouch, the bedroll's turns) are 1 to
     1.5 px ink;
   - every part is one flat fill, with no gradient, no `fillGradientStyle`, and no stack of
     translucent fills standing in for one;
   - shade is fine ink hatching: parallel strokes 1 px or finer, ink at 0.6 alpha or less, on the
     side turned away, under the flap and under the bedroll;
   - stitching and scratches are fine ink lines, too;
   - nothing imitates real light: no specular spot, no glow, no soft shadow.

   "Black" here is `palette.ink`, because the guideline's darks are never pure black. **(charter
   default, D1: the owner's 「黑暗奇幻風格」 and 「不要寫實風格」. The guideline phrase the charter
   cited for D1 is not in the guideline, Summary. The line widths and the hatching's alpha are
   derived here: the join rule in § Facts, and hatching that reads as shade and not as a second
   outline)**
3. **Its tones.** The body is a muted leather brown. The flap, the straps and the shoulder strap
   are a darker leather. The buckles are old brass (`palette.frame`). The bedroll is an undyed cloth,
   a muted vellum-dark. The cords are darker than the bedroll. Each tone is a `palette` token, or
   `mix`, `shade` or `tint` of palette tokens (the helpers in `@/utils/canvasPalette`). Each is named
   once, in one table of the backpack's tones at the top of `HudCorner.ts`. There is no hex literal
   and no new token. A starting point, to be tuned by eye in the owner's rounds (R14): body
   `mix(palette.floor, palette.frame, 0.35)`, the satchel's leather; darker leather
   `mix(palette.ground, palette.frame, 0.3)`; cloth `shade(palette.hudLabel, 0.3)`. None of them is
   `interactable` or `interactableBright`. **(charter default, D1, D6. The single table and the
   starting tones are derived here: `canvasPalette.ts` is outside the bounds, and call-site
   derivation from tokens already has precedent, § Facts)**
4. **Its size and place.** The drawn silhouette, the amber edge (R6) included, is 32 to 36 px tall
   and no more than 44 px wide. Its bounding box is centred on the slot's centre, `(f.x + 29, f.y +
   23)`, within 1 px: (969, 681) at 1080 × 720, and (1169, 681) at 1280. It lies wholly inside the
   58 × 46 slot. It moves with the slot on every `relayout` (FS-ZAJMH R12, R13). **(charter default,
   D4: similar weight to the other icons; the width cap and the 1 px tolerance derived here, to
   keep it clear of the 8 px gaps)**
5. **The one filled icon.** The Inventory icon is the only corner icon that fills shapes. Menu,
   Character, Party and the Mailbox stay line-only, exactly as FS-J1672 R2 and R3 say. Every fill
   lies inside the backpack's own ink outline: no plate, no ground, and no shadow is laid on the
   world (FS-J1672 R1). **(charter default, D5: the illustration needs fills)**

#### Pressable

6. **The amber edge.** A 1 px amber line runs along the outer side of the silhouette's ink outline,
   all the way round. It is `palette.interactable` at 0.85 when idle and
   `palette.interactableBright` at 1 under the pointer, the alphas the other glyphs use. It is the
   only part of the icon that changes under the pointer: the fills, the ink, the hatching and the
   brass are drawn the same either way. Nothing else of the backpack is amber. **(charter default,
   D3: amber means "pressable" in the game. That only the edge changes, and its alphas, are derived
   here, so the hover reads the way it does on the other four icons)**
7. **Its label and zone are unchanged.** "Inventory (I)" shows above the slot under the pointer and
   goes when it leaves (R5). The 58 × 46 zone, the hand cursor and `covers` are unchanged, and a
   press anywhere in the slot is still the icon's (FS-J1672 R4). **(charter bounds)**

#### Drawn in code

8. **Graphics, nothing else.** The backpack is drawn with Phaser Graphics commands into the icon's
   existing graphics object, at depth 1000, fixed to the screen. There is no image, texture, render
   texture, `generateTexture`, bake, or file under `public/art`. It is cleared and redrawn wherever
   the icon is redrawn today (hover, leave, `relayout`), so it is drawn from the same commands at
   render scale 1 and 2. **(charter default, D6: crisp at render scale 2)**
9. **Tokens only.** Every colour the row draws is a `palette` token or derived from tokens (R3).
   The lint fence passes (ADR-0013, ADR-0025). **(charter default, D6)**
10. **Everything else stays.** The other four icons' glyphs, strokes, colours and alphas; the greyed
    Mailbox; every rect, zone, cursor, press, guard, key and label (FS-3EBCA R1, R2, R5–R19). The
    row's constructor and `HudCornerDeps` keep their shape. **(charter bounds)**
11. **Taken down with the row.** Nothing new is created beyond the icon's existing graphics, so
    `destroy` takes the backpack down with it. **(spec)**

#### The record

12. **The guideline says so.** The design guideline's **Corner row** paragraph is rewritten to
    what the row now is:
    - from the right: Menu (a gear), Inventory (an inked backpack), Character (a bust), Party (two
      busts) and Mailbox (the envelope);
    - bare over the world, with no plate (FS-J1672), on 58 × 46 press areas, 8 px apart, 16 px in
      from the corner;
    - the line glyphs are 1.5 px interactable amber, brighter under the pointer, and a greyed icon
      is `hudFaint` and never brightens;
    - a 12 px vellum label names the icon and its key;
    - **the Inventory icon is the one filled exception**: an inked illustration, with a heavy ink
      outline, flat muted leather and old brass, and ink hatching, but no gradient and no realistic
      light, whose pressable cue is a thin amber edge;
    - everything is drawn in code from tokens, with no baked art;
    - the ability card stands directly above the row.

    It cites FS-3EBCA § Change: The inventory icon is an inked backpack, and its "Added by" note is
    kept. **(charter default, D5, D6, and the charter's bounds. Bringing the paragraph's other facts
    up to date in the same edit is derived here: it still names four plated icons, which FS-HRH2J §
    Change and FS-J1672 made false)**

#### The check

13. **Screenshots for the owner.** The agent slice renders the corner row with this icon and saves
    eight PNGs:
    - **idle** and **under the pointer** (the amber edge bright, the label up);
    - at **render scale 1** and **render scale 2**;
    - over a **light ground** (a daylit field's tone) and a **dark ground** (the town's dusk, e.g.
      `palette.ground`).

    Each shows the whole row, so the backpack is judged beside the four line glyphs, at backing
    resolution with no resampling. The slice also saves one enlargement per render scale, of the
    Inventory slot alone, scaled up with nearest-neighbour. The slice lists the files' absolute
    paths in its issue. The harness is throwaway (§ Bounds). **(charter default, D7: art is judged
    by eye; the eight shots are the charter's; the enlargement is derived here, since a 34 px icon is
    hard to judge at 1:1)**
14. **At most two rounds.** After the screenshots the owner may ask for shape or tone tweaks, in at
    most two rounds. Each round changes only this section's files and re-shoots R13's set. A third
    request is a new change. **(charter default, D7)**

### What this changes in its owners

Where an owner's text below and this section disagree, this section wins. The owners' text is not
edited (write-once, `docs/specs/README.md`).

- **FS-3EBCA R3**: "a line glyph 1.5 px wide" and "**Inventory** is a bag: a rounded pouch under a
  gathered neck tied with a cord, a flap across its top". The Inventory icon is the inked backpack
  instead (R1–R6). "Drawn in code from palette tokens; no baked art, no emoji, no texture file"
  still holds.
- **FS-3EBCA's acceptance criterion** "Each live icon is drawn … its glyph in `interactable`,
  brightening to `interactableBright` under the pointer", as FS-J1672 reworded it: for Inventory
  that holds of its amber edge (R6). Its fills, ink and brass are not amber and do not change
  under the pointer.
- **FS-J1672 R2** ("Glyphs unchanged") and **R3** ("No fill behind a glyph"), and their criteria:
  these hold for Menu, Character, Party and the Mailbox. The Inventory icon fills shapes, but only
  inside its own outline (R5).
- **FS-J1672 R6** ("No outline or halo … for legibility"): its meaning is unchanged. The ink outline
  is the illustration's own line, and the amber edge is the pressable cue, not a dark halo. Nothing
  is drawn round any other icon, and nothing beyond the 1 px amber edge round this one.
- **The guideline's Corner row paragraph**: rewritten (R12).

### User Stories

1. As a player, I want the Inventory icon to look like a backpack, so that I can tell at a glance
   where my gear and bag are.
2. As a player, I want it drawn like a dark-fantasy illustration, inked and hatched rather than
   photographic, so that it fits a grim, hand-made world.
3. As a player, I want to see its flap, buckled straps, side pouch and tied bedroll, so that the
   icon rewards a closer look.
4. As a player, I want it about the size of the other icons, so that the row keeps its rhythm.
5. As a player, I want a thin amber edge on it, so that I know it is pressable, like every amber
   thing in the game.
6. As a player, I want that edge to brighten under the pointer, so that it answers my hand as the
   other icons do.
7. As a player, I want the label "Inventory (I)" as before, so that I still learn the key.
8. As a player, I want pressing it, I and B to do what they did, so that nothing I learned
   changes.
9. As a player, I want a press anywhere in its old square to count, so that the new drawing never
   makes it harder to hit.
10. As a player on a high-density screen, I want it sharp, so that its detail is really there.
11. As a player on a plain screen, I want its silhouette, flap and buckles still to read, so that
    it works at render scale 1 too.
12. As a player in a daylit field and in the dark town, I want it legible over either ground, so
    that the icon never sinks into the world.
13. As a player, I want the other four icons unchanged, so that only the icon the owner asked for
    changes.
14. As a player who resizes the window, I want the backpack to stay in its slot, so that it never
    drifts from where I press.
15. As the owner, I want screenshots idle and hovered, at both render scales, over light and dark
    ground, so that I can judge the art by eye without setting up a run.
16. As the owner, I want up to two rounds of tweaks, so that the shape and tones end up right.
17. As a maintainer, I want the guideline to name this icon as the one filled, inked exception, so
    that the next icon is not drawn this way by imitation.

### Acceptance Criteria

- [ ] On the recording graphics, the Inventory icon's ops include fills in at least four distinct
      colours (body leather, darker leather, brass, cloth), none of them `interactable` or
      `interactableBright`, and no `fillGradientStyle`. Every fill colour, and every stroke colour
      but the amber edge's, is `palette.ink` or one named in the backpack's tone table in
      `HudCorner.ts`.
- [ ] Its outline is stroked in `palette.ink` with a line width over 2. Hatching strokes are
      `palette.ink` at alpha 0.6 or less and width 1 or less; stitching and scratches are
      `palette.ink`, width 1 or less.
- [ ] Idle, its strokes include `interactable` at 0.85 and no `interactableBright`. Under the
      pointer they include `interactableBright` at 1 and no `interactable`. Every other op (fills,
      ink, hatching) is identical idle and hovered.
- [ ] The bounding box of everything it draws is 32–36 px tall, no more than 44 px wide, inside
      (940, 658, 58, 46), and centred within 1 px of (969, 681) at 1080 × 720. At 1280 it is centred
      on (1169, 681). It follows a `relayout`.
- [ ] Menu, Character, Party and the greyed Mailbox still fill nothing, and are stroked as before
      (the FS-J1672 block's assertions, now over those four).
- [ ] The Inventory zone, hand cursor, `covers`, press and "Inventory (I)" label are unchanged.
      `destroy` takes its graphics down.
- [ ] No image, texture or render texture is created by the row. No file under `public/art` or
      `tools/bake` changes.
- [ ] The guideline's Corner row paragraph reads as R12, and cites this section.
- [ ] The eight screenshots and two enlargements of R13 exist, and their absolute paths are listed
      in the agent slice's issue.
- [ ] No raw colour literal. `npx vitest run --maxWorkers=4 --minWorkers=1`,
      `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.

**By eye (the owner, from the screenshots):**

- [ ] It reads as a dark-fantasy inked backpack, not a realistic one. Its flap, buckles, straps,
      side pouch, bedroll and shoulder strap read at render scale 2, and its silhouette, flap and
      buckles at 1.
- [ ] It sits with the four line glyphs in weight, and its amber edge reads as "pressable" and
      brightens under the pointer, over the light ground and over the dark ground.
- [ ] Tweak rounds: at most two (R14). The owner approves the icon.

### Edge States

- **Render scale 1:** fine hatching and stitches may merge into the fills. The silhouette, the flap
  and the buckles must still read. The owner judges this from the screenshots.
- **A light ground** (a daylit field): the ink outline carries the silhouette.
  **A dark ground** (the town, a run): the amber edge, the brass and the cloth carry it.
- **Hovered during a resize:** the backpack, its bright edge and the label all move with the corner.
- **The ESC menu open:** Inventory takes no hover (FS-3EBCA R18), so it stays idle-drawn.
- **The inventory open:** the icon is drawn as always. There is no "open" state.
- **Never greyed:** Inventory has no greyed form. Only the Mailbox does, and it is unchanged.

### Out of Scope

- Restyling Menu, Character, Party or the Mailbox to match the backpack.
- A new palette token, or any change to `canvasPalette.ts` or `theme.ts`.
- Any baked art, image, texture or bake change, and the abandoned baked-backpack branch.
- An "open" or pressed state, animation, or a hover glow beyond the amber edge.
- Rects, zones, keys, labels, the row's order, and any scene's wiring.
- `game-client/CONTEXT.md`: its **Corner row** entry ("Inventory (a bag)") stays true of a
  backpack.
- The guideline's art-direction sections beyond the Corner row paragraph.
- Any server, proto, gateway or contract change.

## Change: Richer corner glyphs → FS-QHN87
