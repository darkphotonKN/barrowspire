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
