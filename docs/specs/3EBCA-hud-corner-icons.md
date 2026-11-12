# FS-3EBCA: Panel shortcut icons on the HUD

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### HUD" → "Panel shortcut icons on the HUD" → this FS · Surface: game-client only

## Scoping notes (raw)

Charter "右下角圖示與面板操作", approved by the owner 2026-11-12 ("核准"). Owner's words:
"信箱ui可以透過再按一次信箱關閉", "組隊ui增加右上角x關閉 然後移動到中間一點", "右下角新增組隊的icon",
"道具欄也在右下角顯示icon 快捷鍵用I", "道具欄名稱改成角色英文", "mail沒有快捷鍵 所以就顯示mail就好".

**Anchors (why):** no thin line owns a row of panel icons; the only HUD icon today is the
mailbox's envelope (FS-1GZGD "Mailbox in the hub HUD"), town only. Character and Party icons in
every world are a new capability, so a new FS and one new line (new `### HUD` section: the row
belongs to no one panel). The envelope's toggle and its place in the row are a behavior change on
its owner, FS-1GZGD (`## Change:`); the party panel's close button and new place are a behavior
change on FS-R82NV (`## Change:`). Clearing the corner in a run and a field moves the ability card
(FS-8AY7S R29) and the dead spectator's leave button (FS-QPDKN req 10) up; both still sit bottom
right, so neither owner's words change; the lift is this FS's, with a pointer stub on each. The
Character icon is a new way to open the gear overlay (FS-HRH2J R4); stub there too.

Locked (charter):
- From the right edge leftward: **Character** (opens the gear and bag overlay), **Party** (the
  party panel), **Mail** (town only, leftmost, so the other two never shift between worlds; the
  envelope moves left of them).
- Same drawn style as today's envelope: code-drawn on a carved plate, amber lines, brighter on
  hover. No baked art; tokens only (ADR-0013).
- Hover text "Character (I)", "Party (T)", "Mail" ("道具欄名稱改成角色英文": the bag's icon is named
  Character, in English).
- A press on each toggles its panel. Keys unchanged: Character I (B still works), Party T, Mail
  none; the minimap keeps M.
- Every world the same (town, field, run); Mail only in the town.
- Existing guards hold: no opening while a dialogue, a menu or an overlay owns the screen; text
  fields keep their keys.

Derived (charter run, to confirm at promotion):
- Plate size, gap and margins from the envelope (58 × 46, margin 16), gap 8.
- In a run and a field the ability card and the leave button stand above the row.
- A press on an icon is never an attack, a cast or a Shadow Shot hold.
- The gear overlay's right panel reaches 98% of the view's height and 8 px from its right edge, so
  it covers the row while open: a press there is the overlay's (FS-HRH2J R8). The Character icon
  then cannot be pressed to close the overlay; I, B and Esc close it. Raised to the owner.

Open: none beyond the escalation above.
