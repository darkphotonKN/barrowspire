# FS-KBA4Q: Item links in chat

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Chat" (link an item into a chat line), `game-server/game-service/SPECIFICATION.md` "### Chat" (item links relayed in chat lines) → this FS · Related ADRs: [ADR-0092](../adr/0092-a-chat-item-link-carries-the-senders-own-snapshot-checked-for-shape-only.md) (the link carries the sender's snapshot, checked for shape only), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (chat is never stored), [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md) (area scope), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md) / [ADR-0085](../adr/0085-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md) (the UI scene, a piece's own commands), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) / [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (tokens only, the canvas palette) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (the chat envelope, relay and window), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (the gear and bag overlay), [FS-VPD8Y](VPD8Y-town-stash.md) (stash mode), [FS-TQZ5J](TQZ5J-ui-scene.md) § Change: Batch 6 (the chat on the UI scene), [FS-NV54P](NV54P-compare-bag-item-with-worn-gear.md) (the overlay's hint), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) R54, R59 (what an item carries and what a view shows) · Each of those carries a `## Change: Item links in chat → FS-KBA4Q` stub · Vocabulary: § Vocabulary below, to be folded into the two `CONTEXT.md` files by the slices that build it

> **Decision provenance.** Scoped and promoted in one run on 2026-11-25 under the owner's approved
> /charter, by `scope-it` pre-answered and `write-a-spec --from-thread`, with no interview and no
> `challenge-me` pass. The charter's locked decisions are marked **(charter default)** with the
> owner's reason where he gave one. What the code forces, read on `feat/chat-item-links` at
> d500fecb, is marked **(code)**. Where neither settled a point the smaller v1 was taken and
> marked **(v1 pick)**; those are escalation candidates, listed together in § V1 picks.

## Summary

A player shows an item to the people they are talking to. Holding Ctrl+Alt (or Cmd+Option) and
left-clicking an item in the bag, a worn slot or the stash writes `[Item Name]` into the chat
field, with whatever they type before and after it. Everyone who receives the line sees the name
as a small tag in the item's rarity colour, and hovering it shows the same item tip the bag shows.

The item's data travels with the line. The server checks its shape and size, relays it like text,
and keeps nothing. It does not check that the sender owns the item: a hover tip cannot cheat
anyone, and trading happens only on the Bazaar, which shows server truth.

To make linking usable, chat can now be opened and typed in while the inventory or the character
panel is open.

**Lane.** game-client (agent lane) and game-service's chat action and wire shape. The backend
part is in scope by the charter of 2026-11-25. No database, no api-gateway, no items-service, no
proto change.

## Facts (verified at d500fecb)

- **The relay passes a line's payload as a map.** `chatRelay.stamp` builds
  `map[string]interface{}`; area delivers it in-process, world publishes `json.Marshal(payload)`
  on the chat bus, party and whisper carry `line.Payload` in a pod inbox letter
  (`chat.go`, `chat_party.go`, `chat_whisper.go`). `decodeWorldChatLine` checks the seven stamp
  keys are strings and hands the payload on unchanged. A further key on the payload therefore
  rides every path without a change to the bus, the inbox or a letter. **(code)**
- **Check order in `relay` today:** not in a world → channel gate (`channel_closed`, `no_party`,
  `whisper_self`) → text normalised, empty dropped → `too_long` → flood window (`too_fast`) →
  stamp → deliver. **(code)**
- **Who owns the keys.** `chatWiring.mayOpen` (`uiSceneChat.ts`) refuses while `ui.menuOpen`,
  `ui.inventory`, `ui.character` or the world's `blockers().chat`. `ChatInput.sync` drops the
  draft when `mayOpen` turns false, unless `keepsDraft` (the letter panel). `ChatWindow.watchKeys`
  hides the DOM row while `mayOpen` is false. **(code)**
- **Typing already silences every UI key.** While the field is focused it stops each key's
  propagation, the UI scene's keyboard is off (`ChatInput.focused`) and the world's keyboard is
  off (`typingGuard`, FS-TQZ5J R127). So I, B, C, E, Q, Esc reach only the field. **(code)**
- **The overlay's presses.** `GearOverlay.onPointerDown` acts only when its own ground is the
  top-most hit; `pointer.button === 0` closes on the ×, `pointer.button === 2` wears, takes off or
  moves. Shift is read each frame from the scene keyboard, so it reads as up while typing
  (FS-NV54P R6). `BootScene` calls `disableContextMenu`. **(code)**
- **The overlay is the chat window's cover.** A press on the gear overlay while the field is
  focused blurs the field, the draft kept (FS-TQZ5J R130, R131; `ChatWindow.onPress`). **(code)**
- **Geometry at the 720-high logical view.** The chat window's panel spans y 468–704 at the left
  edge, its input row about y 669–699. The overlay's left panel (the character panel, or the stash)
  spans y 29–650 from x 8, at depth 1100 over the chat's 1000. So the left panel covers the chat's
  lines and tabs but not its input row; the inventory, on the right edge, covers none of it.
  **(code)**
- **`ChatWindow.drawLines`** makes one Phaser Text per entry with a custom wrap callback
  (`wrapChatText`), lays entries bottom-up, and records one name hit rect per entry for
  click-to-whisper (FS-KCQ06 C15). **(code)**
- **`itemView(item, characterLevel?, world?)`** marks the requirement too high only when given a
  level, and marks a standing only from `item.status` or `item.unsafe`. `buildItemTip` draws what
  the view says. **(code)**
- **Control+click on a Mac.** Chrome and Safari report `button` 0 with `ctrlKey` true on
  mousedown, then fire `contextmenu`. Firefox reported `button` 2; a fix was filed for Firefox 77
  ([bug 1615732](https://bugzilla.mozilla.org/show_bug.cgi?id=1615732)), but a 2026 W3C
  pointer-events thread says Firefox release still reports 2
  ([thread](https://lists.w3.org/Archives/Public/public-pointer-events/2026JanMar/0018.html)).
  Unsettled for Firefox: R6 and the owner's check cover it.

## Vocabulary

- **Item link** — an item shown inside a chat line: a `[Name]` token in the line's text paired
  with an **item snapshot** in the line's `items`.
- **Item snapshot** — the item's data as it stood when the line was sent (R17). It names no
  owner, no instance and no standing.
- **Link tag** — how the chat window draws an item link: the name alone on a faint ground (R36).
- **Link press** — a left-press with the link modifiers held (R1).
- **Held link** — an item snapshot the chat input keeps beside the draft until it is sent or
  dropped (R9).

## Requirements

### A. Linking from the overlay (game-client)

1. **The link press.** A left-press (`button` 0) on an item, with **Ctrl and Alt** both held or
   **Meta and Alt** both held, links that item. Both combinations are accepted on every platform;
   there is no OS detection. On a Mac these are Control+Option and Cmd+Option. Shift's state does
   not matter. The modifiers are read from the press's own event, not from a Phaser key, so they
   read true while the game's keyboards are off for typing. **(charter default L1)**
2. **Where.** Any item drawn in a bag cell, a worn slot or a stash cell of the gear overlay
   (`GearOverlay`), in the hub, a field world and a run, in stash mode and out of it, over-capacity
   rows included. **(charter default L1, L10)** A dimmed item (listed, settling, still in a delve,
   above the character's level) and an item still pending a pickup link like any other: a link
   moves nothing. **(v1 pick)**
3. **What it does.** `[Item Name]` is written into the chat field at its caret, replacing a
   selection if there is one, and the caret lands just after the `]`. If the chat input is closed,
   it opens with the token in it, as a press on the chat bar opens it; the caret a closed field
   last had is used, which is the draft's end when the field was never focused. A folded window
   unfolds, as any opening does. No space is added on either side. **(charter default L1: as Path
   of Exile does)**
4. **Typing goes on.** After a link press the chat field is focused, whether it was before or
   not. This amends FS-TQZ5J R130 and R131 for this one press: a link press on the gear overlay
   does not let go of the field. Every other press on the overlay still does. **(code; derived)**
5. **Nothing else changes on the overlay.** A plain left-press on an item still does nothing
   (FS-HRH2J R18, FS-VPD8Y R38). Right-click and E still wear, take off or move. Shift-hover still
   compares. The item tip still follows the hover. A link press never wears, takes off, moves or
   closes anything, and a link press on the × or on an empty cell does nothing.
   **(charter default L1)**
6. **A right-button press with the link modifiers held does nothing**: no link, and no wear,
   take-off or move. Reason: on a browser that reports Control+click as `button` 2, the player
   meant a link, and wearing the item instead is the worse surprise. On such a browser
   Control+Option does not link and Cmd+Option does. If the owner's check finds a browser where
   neither works, or where this rule misfires, that is an escalation to the owner; no agent picks
   another key. **(v1 pick; the escalation is a charter default)**
7. **Where chat may not open, a link press does nothing**, silently: the menu, a dialogue card,
   the letter panel, an open container in a run, the run's end (R21). **(v1 pick)**
8. **The hint line** gains the control as its own part, before the close part. The two strings
   (FS-NV54P R24) become:
   - `Right-click or E: wear or take off  //  Shift: compare  //  Ctrl+Alt+click: link in chat  //  I, B or Esc: close`
   - `Right-click or E: move between bag and stash, or take off  //  Shift: compare  //  Ctrl+Alt+click: link in chat  //  I, B or Esc: close`

   The hint names one combination only. **(v1 pick)** It may wrap to a further row inside the
   hint's 40 px band; it must not overlap the purse line or the grid.

### B. Links in the draft (game-client)

9. **In the text field a link is plain text**, `[Name]`. The field stays one ordinary browser
   text field. Beside it the chat input keeps the draft's **held links**: one item snapshot per
   link press, in the order their tokens stand in the text (a link inserted before an earlier one
   is held before it). **(charter default L3)**
10. **Pairing.** Held links are paired with the draft's text left to right: the first held link
    takes the first occurrence of exactly `[` + its name + `]`; each next one takes the first
    occurrence of its own token after the end of the previous pair. A held link with no such
    occurrence is unpaired and is skipped; the search for the next one goes on from the same
    place. Pairing is worked out from the text and the held links whenever it is needed (a count,
    a send); nothing tracks caret positions. **(v1 pick: the smallest rule that is deterministic)**
    What follows from it:
    - **Edited inside the brackets**, or a bracket deleted: the token no longer matches, the held
      link is unpaired, and the characters are sent as ordinary text. **(charter default L3)**
      Typing the exact token back pairs it again.
    - **The same item linked twice:** two held links, two tokens, two pairs.
    - **Two items with the same name:** each held link takes the next matching token in text
      order, so each token shows the item that was clicked for it.
    - **`[Something]` typed by hand:** ordinary text, unless it is exactly a held link's token and
      stands where that link's search finds it first. Then the typed token is the link and the
      later one is text. Accepted: the item shown is the one the player linked either way.
11. **At most three links in a line.** A link press while the draft already has three paired links
    inserts nothing, plays `menu_error`, and adds the system line "Three items to a line, no
    more." (client-held, code `too_many_links`, nothing sent). **(charter default L4; the notice a
    v1 pick)**
12. **The name counts toward the line's limit.** The token's characters, brackets included, count
    toward the 200 code points like any typed text (FS-WJGFJ R5; for a whisper, the message alone,
    FS-KCQ06 R5). A link press whose token would take the draft past the limit inserts nothing,
    plays `menu_error`, and adds the system line "No room left in this line for that item."
    (client-held, code `link_too_long`). A token is never inserted cut short.
    **(charter default L4; the notice a v1 pick)**
13. **A name the token cannot carry.** An item whose name is empty, or holds `[`, `]` or a control
    character, cannot be linked: the press does nothing. No item has such a name today.
    **(v1 pick)**
14. **Sending.** Enter sends the line as today, with `items`: the paired held links' snapshots in
    text order. With none paired, `items` is left out and the line is exactly today's. Unpaired
    held links are dropped. After a send the held links are empty.
15. **Dropping.** Esc, and every way the draft is thrown away today (`cancel`, the run's end, the
    world leaving), drops the held links with it. Wherever the draft is kept (a press in the
    world, the letter panel opening), its held links are kept with it.
16. **Recall.** ArrowUp and ArrowDown walk sent lines as text only: a recalled line carries no
    links, and a `[Name]` in it is ordinary text. The half-typed draft that comes back past the
    newest line comes back with its held links. **(v1 pick)**
17. **The snapshot** is taken at the link press from what the overlay holds for the item, and is
    never updated: a later change to the item changes neither the draft nor a sent line.
    **(charter default L7)** It carries only the fields of § The item snapshot. It never carries
    the item's id, its instance id, its status, its unsafe-find mark, its quantity or its
    durability. A rarity outside the five tiers is left out; text fields are trimmed.

### C. Chat while a panel is open (game-client)

18. **The inventory and the character panel no longer keep chat shut.** Chat may be opened (Enter,
    a press on its bar, a name click, a link press) and typed in while either or both are open,
    stash mode included. The chat's row stays shown while they are open. This replaces "no gear
    panel is open (inventory, character)" in FS-TQZ5J R126, and the gear overlay's part of
    FS-WJGFJ R27 and of its 2026-10-31 amendment (the row hidden while the gear overlay owns the
    keys). **(charter default L2)**
19. **A draft survives a panel opening or closing.** Opening or closing the inventory or the
    character panel, by its corner icon, its ×, or any other way, neither drops nor changes the
    draft and its held links. **(charter default L2)**
20. **While typing, the keys are the field's.** I, B and C type letters and toggle no panel; E, Q
    and every other UI key likewise; Esc closes the chat input and drops the draft, and leaves the
    panels open; Shift types capitals and does not compare. This is what FS-TQZ5J R127 and
    FS-NV54P R6 already give; it is stated here because it now holds with a panel open.
    **(charter default L2; code)**
21. **Every other blocker stays as it is.** The menu, the town's dialogue card and letter panel, a
    run's open container and the run's end keep chat shut and drop or keep the draft exactly as
    today. **(charter default L2)**
22. **What the overlay's own keys need.** Nothing new is bound. With a panel open and the chat
    input closed, the keys are the overlay's as today: I/B and C toggle, Esc and Q close the
    panels (the Esc order is unchanged), E wears or moves, Shift compares, and Enter, which the
    overlay never used, opens chat. With the chat input open, R20. Exactly one thing owns the keys
    at a time, as FS-WJGFJ R27 requires; the owner is now decided by whether the field is focused,
    not by whether a panel is open. The pointer is unaffected by typing: right-click still wears,
    takes off or moves, hover still shows the tip, a link press links. **(code; derived)**
23. **Layering is unchanged.** The chat window keeps its depth under the overlay. An open left
    panel (the character panel, or the stash) covers the chat's lines, tabs and the channel
    picker's open list, and the covered rule holds there (FS-TQZ5J R130). The input row stays
    visible and usable below the panel; Tab and the prefixes still pick the channel. With only the
    inventory open the whole window is visible. **(v1 pick: no relayout and no re-layering)**

### D. The wire (game-client and game-service)

24. **Inbound.** The `chat` action's payload gains one optional member, `items`: an array of item
    snapshots (§ The item snapshot). Absent, or an empty array, is a line with no links, handled
    exactly as today. `channel`, `text` and `target` are unchanged. **(charter default: trust,
    option B)**
25. **Outbound.** A stamped line whose inbound `items` passed validation carries `items`: the
    validated snapshots, in order, rebuilt by the pod from the fields it read (R29). A line with
    no links carries no `items` member at all, so every line without links is byte-for-byte what
    it is today. The seven stamp fields are unchanged, and `target_id` / `target_name` on a
    whisper.
26. **The pod does not look the item up.** It checks no ownership and asks no other service; the
    relay still never touches a world (FS-WJGFJ R11 stands). Nothing is stored, and no log line
    carries a snapshot or any part of one; a Debug line may carry the count of links (R14 stands,
    ADR-0033). **(charter default: trust. The owner's reason: a hover-only tip cannot cheat
    anyone; trading only happens on the Bazaar, which shows server truth.)**
27. **Validation.** A line with a non-empty `items` is checked after the `too_long` check and
    before the flood window, so a refused line does not use the sender's window. It is refused
    whole, delivered to nobody, with one `chat_notice`, when any of these fails:
    - `items` is an array of at most **3** objects (`chatItemLinksMax`);
    - each object has only the keys of § The item snapshot, each of the stated type, range, length
      and closed set; an unknown key refuses the line;
    - the snapshots pair with the normalised text by R10's rule, every one of them: the text holds
      `[name]` for each, in order, each after the one before;
    - the rebuilt `items`, encoded as JSON, is at most **4096 bytes** (`chatItemLinksBytesMax`).

    The limits are named constants beside `chatTextMax`. **(charter default: validation defined
    concretely so a modified client cannot push large or malformed payloads through Redis to every
    pod)**
28. **The refusal.** `chat_notice` with code **`bad_item_link`** and the words "That item could
    not be shown. Your line was not sent." One code for every failure in R27: the stock client
    never sends such a line, so only a modified or out-of-date client sees it. **(charter default:
    refused with a notice; the code and words picked here)**
29. **Rebuilt, not passed through.** The pod builds each outbound snapshot from the validated
    values, key by key. Nothing of the inbound object that R27 did not read reaches the stamped
    line.
30. **Every channel, every path.** Area, world, party and whisper lines carry `items` alike: the
    in-process delivery, the chat bus, the party-chat letter, the whisper letter, and the
    whisper's echo to its sender, which is the same line. A receiving pod relays what the sending
    pod stamped and validates nothing again (the pod is trusted, as for text). The flood window
    is unchanged: 2 seconds, one line, however many links. **(charter default L8)**
31. **The client reads `items` tolerantly.** A stamped line whose `items` is not an array is
    still a line, drawn as text. A snapshot the client cannot read, or one that does not pair by
    R10, gives no link, and its token is drawn as text. A line is never dropped for its `items`.
    **(v1 pick)**

### The item snapshot

The names and meanings are the world state's `ItemState` (FS-4R9M9 R54), so the client reads a
snapshot with the item view it already has. "cp" is Unicode code points.

| Field | Type | Rule |
|---|---|---|
| `name` | string | **required**; 1–100 cp; no control character, no `[`, no `]`, no leading or trailing whitespace |
| `item_type` | string | **required**; one of `weapon`, `armor`, `ring`, `consumable` |
| `rarity` | string | optional; one of `normal`, `uncommon`, `rare`, `runed`, `fabled` |
| `weapon_type` | string | optional; 1–32 characters of `a`–`z` and `_` **(v1 pick: game-service holds no closed set of weapon kinds)** |
| `armor_slot` | string | optional; one of `head`, `chest`, `legs`, `gloves` |
| `attack_power`, `defense_rating`, `magic_resistance`, `healing_amount`, `mana_amount` | number | optional; a whole number, 0–999999 |
| `critical_rate` | number | optional; 0–1 (a fraction, as the world state sends it) |
| `item_level`, `required_level` | number | optional; a whole number, 1–999 |
| `affixes` | array | optional; at most **6** (`chatItemAffixesMax`) of `{stat, tier, value}`: `stat` one of the eleven affix stat codes game-service knows (FS-4R9M9 R17), `tier` a whole number 0–9, `value` a whole number 0–999999; no other key |
| `unique_effect` | string | optional; 1–200 cp; no control character |
| `description` | string | optional; 1–300 cp; no control character |

The numeric bounds are sanity bounds, far above any real item, and are named constants; they say
nothing about game balance. **(v1 pick: the numbers)** An item that fails them on the stock client
is a bug to fix by raising the constant, not by loosening the rule.

### E. Links in the chat window (game-client)

32. **A paired token is drawn as a link tag**: the item's name alone, without its brackets, in
    place of the token. Everything else in the line is drawn as today, in the channel's colour.
    **(charter default L6)** Owner tune (I-KBA4Q-7 check): the tag keeps its brackets, `[Name]`,
    so a common item's tag in the plain text colour still reads as a link; a cut name keeps both
    brackets, `[Nam…]`.
33. **The tag's look.** The name in the item's rarity colour, the same palette tokens the item tip
    uses (`palette.rarity[token]`); an item with no rarity uses the ordinary text colour
    (`palette.hudText`). Behind it a faint ground in the same hue with a thin border in that hue,
    and a little clear space before and after the tag, so it reads as an item at a glance. No
    icon, no thumbnail. **(charter default L6)** Owner tune (I-KBA4Q-7 check): the border is
    gone; only the faint ground stays.
34. **Tuning constants.** The ground's alpha, the border's alpha and width, the tag's inner
    padding and the space outside it are named constants in the chat window's layout module, a
    first pass the owner tunes in game. First values: ground alpha 0.16, border 1 px at alpha 0.5,
    inner padding 3 px each side, outer space 3 px each side. Retuning them is `Tunes FS-KBA4Q`.
    **(charter default L6: first pass; the values a v1 pick)** Owner tune (I-KBA4Q-7 check): the
    name sat too tight against the ground's top and foot, so a row that holds a tag stands 3 px
    taller above and below its words (`CHAT_TAG_PAD_Y`); a row of words only keeps a plain row.
    With the border dropped (R33), its two constants are removed.
35. **A tag never splits across rows.** If it does not fit in what is left of a row it moves
    whole to the next row. A tag wider than a whole row is drawn on a row of its own and cut at
    the row's width, its name ending in `…`. **(charter default L6; the over-wide case a v1 pick)**
36. **What must still hold in the window**, however the lines are drawn (today one Phaser Text per
    entry with a custom wrap; the implementation is free to change that):
    - text wraps as today around the tags: filling each row before breaking, CJK breaking
      anywhere, clear of the scrollbar;
    - entries stack bottom-up, a taller entry pushing older ones up, clipped at the message
      area's top;
    - the sender's name keeps its click-to-whisper hit area on the entry's first row
      (FS-KCQ06 C15), and a tag is never part of it;
    - the wheel, the scrollbar, following, the fold, the filter tabs, the idle and typing opacity
      and the text's soft shadow behave as today; the tag's ground and border fade with the panel
      as the text does;
    - text is rendered as text, never as markup (FS-WJGFJ R22), a tag's name included;
    - a line with no links is drawn exactly as today.
37. **Hovering a tag shows the item tip**: the bag's tip (`buildItemTip`) for the snapshot, at the
    tip's depth above every panel, placed beside the pointer and kept inside the view. It shows
    wherever the tag is visible: in the hub, a field and a run, the input open or closed, and only
    while the chat window is the top-most thing under the pointer (FS-TQZ5J R130), so a tag under
    an open panel shows nothing. It goes when the pointer leaves the tag, the line scrolls or is
    redrawn away, the window folds, or the world changes. **(charter default L6, L10)**
38. **What the tip shows.** The name, the rarity badge and the kind, the base stats, "Item level
    N", "Requires level N", each affix, a unique's effect and its lore: what `itemView` gives for
    the snapshot. **No standing**: no "Listed on the Bazaar.", "Sale settling…", "Still in a
    delve." or unsafe-find note, for any viewer, the sender included; the snapshot carries nothing
    to derive one from (R17). **The requirement is never marked too high**, neither against the
    sender's level nor the viewer's. **(charter default L9; no viewer mark a v1 pick)** No
    "Worn" caption and no compare: Shift over a tag adds nothing. **(charter default L6)**
39. **A tag takes no click.** A press or release on a tag does nothing of its own: it does not
    start a whisper, pick anything or change focus beyond what a press on the window's lines does
    today. **(charter default L6)**
40. **The sender sees their own line** drawn from what the pod sent back, tags and tips included,
    like every other line (FS-WJGFJ R4); the whisper echo `To Name: …` too. **(charter default
    L8)**
41. **Held like any line.** A line and its snapshots live in the chat store with the stream: 100
    per channel, kept across world switches, gone on a page reload, never written to browser
    storage. **(charter default L7)**

## User Stories

1. As a player, I want to Ctrl+Alt+click an item in my bag and have its name appear in my chat
   line, so that I can show people what I found.
2. As a player on a Mac, I want Cmd+Option+click to do the same, so that I have a combination my
   browser does not read as a right-click.
3. As a player, I want to link an item I am wearing or one in my stash, so that I can show gear I
   am not carrying loose.
4. As a player, I want to type before and after the item's name, so that the link sits inside a
   sentence.
5. As a player with chat closed, I want the link press to open chat with the item in it, so that
   linking is one gesture.
6. As a player, I want to open my inventory without losing the line I was typing, so that I can
   go and fetch an item to link.
7. As a player typing a line, I want I, B and C to type letters, so that my panels do not flap
   open and shut as I write.
8. As a player, I want to link up to three items in one line, so that I can compare a few at once.
9. As a player, I want to be told when a fourth item or a too-long name will not fit, so that I
   know why nothing appeared.
10. As a player, I want a link I broke by editing its name to be sent as plain words, so that I
    never send a link to the wrong thing.
11. As a player reading chat, I want a linked item to stand out in its rarity colour on its own
    small ground, so that I can tell an item from words at a glance.
12. As a player reading chat, I want to hover a linked item and see its full tip, so that I can
    judge it without asking.
13. As a player in a run, I want to hover an item a friend in town linked, so that chat works the
    same everywhere.
14. As a party member or a whisper's receiver on another server, I want the linked item to arrive
    whole, so that where we each play does not matter.
15. As a player who linked an item, I want my own line to show the tag and the tip, so that I can
    see what the others see.
16. As a player, I want a linked item's tip to say nothing about whether it is listed, in a delve
    or unsafe, so that a link does not leak what I am doing with it.
17. As a player, I want a line I read an hour ago to still show the item as it was linked, so that
    scrolling back makes sense.
18. As a player, I want right-click, E and Shift on my items to work exactly as before, so that
    linking costs me nothing I had.
19. As a player, I want the hint line to tell me how to link, so that I can find it without being
    told.
20. As a player, I want a long item name never to be split across two rows, so that a tag always
    reads as one thing.
21. As a player, I want clicking a sender's name to still start a whisper on a line that has
    links, so that links break nothing in the window.
22. As the server, I want to refuse a line whose item data is malformed, oversized or out of its
    closed sets, so that no client can push arbitrary payloads to every pod.
23. As the server, I want to rebuild the item data from what I validated, so that nothing I did
    not read is relayed.
24. As the server, I want to relay links without a lookup, a store or a world, so that chat stays
    a relay (ADR-0033).
25. As a reviewer, I want a line without links to be byte-for-byte what it was, so that this
    feature cannot regress plain chat.
26. As the owner, I want the tag's ground, border and spacing to be named constants, so that I
    can tune the look in game without a redesign.

## Acceptance Criteria

### Server (game-service)

- [ ] `chat {channel:"area", text:"look [Rusty Blade] here", items:[{name:"Rusty Blade", item_type:"weapon", rarity:"rare", attack_power:4}]}` is delivered to the pod's seated players with the seven stamp fields and `items` equal to the validated snapshot.
- [ ] The same line on `world` arrives off the chat bus on another pod with `items` intact; on `party` and on `whisper` it arrives through the pod inbox letter with `items` intact; the whisper's sender is echoed the same line with `items`.
- [ ] A line with no `items`, and one with `items: []`, produce a stamped payload with no `items` key, equal to today's.
- [ ] Four snapshots, an `items` that is not an array, and an entry that is not an object are each refused with `chat_notice {code:"bad_item_link"}` and delivered to nobody.
- [ ] Each of these refuses the line with `bad_item_link`: a missing `name`; a 101-cp `name`; a `name` holding `[`, `]`, a line break or a leading space; a missing or unknown `item_type`; an unknown `rarity`; an unknown `armor_slot`; a `weapon_type` with an upper-case letter or 33 characters; `attack_power` of -1, 1.5 or 1000000; `critical_rate` of 1.1; `item_level` of 0; seven affixes; an affix with an unknown `stat` or a fourth key; a 201-cp `unique_effect`; a 301-cp `description`; an unknown top-level key (`status`, `entity_id`).
- [ ] A snapshot whose `[name]` is not in the text, and two snapshots whose tokens stand in the other order in the text, are refused with `bad_item_link`.
- [ ] A line whose rebuilt `items` encodes to more than 4096 bytes is refused with `bad_item_link`; one at the limit is delivered.
- [ ] A 100-cp name, six affixes, a 200-cp effect and a 300-cp description at once are accepted when the text holds the token and stays within 200 cp.
- [ ] A refused line does not start the sender's flood window: a valid line sent at once after it is delivered. A valid line with three links starts the same 2 s window as any line.
- [ ] `too_long` is still decided on the text alone and comes before `bad_item_link`.
- [ ] No log line produced by a relay with links contains a snapshot's name or any other field of it.
- [ ] The relay makes no call to a world, a database or another service for a line with links; no chat handling path gains a store.
- [ ] Table-driven tests cover every row of § The item snapshot at its boundary, the count, the pairing and the byte limit, and each of the four channels' paths.

### Client: linking

- [ ] With the inventory open and chat closed, Ctrl+Alt+left-click on a bag item opens the chat input with `[Name]` in it and the caret after it; Meta+Alt+left-click does the same.
- [ ] With a draft `hello  world` and the caret between the spaces, a link press gives `hello [Name] world` with the caret after `]`.
- [ ] A link press on a worn slot and on a stash cell (stash mode) each link that item; in a run, a field and the hub alike.
- [ ] A link press sends no equip, unequip or move, and closes nothing; a plain left-press on an item still does nothing; right-click, E and Shift-hover behave as before.
- [ ] A right-button press with Ctrl+Alt held neither links nor wears, takes off or moves.
- [ ] After a link press with the input already open, the field is still focused and the draft holds the token.
- [ ] A fourth link press inserts nothing and adds the system line "Three items to a line, no more."; a link whose token would pass 200 code points inserts nothing and adds "No room left in this line for that item."; both play `menu_error` and send nothing.
- [ ] With a dialogue card or the menu open, a link press changes nothing.
- [ ] Both hint strings read as R8 gives them.
- [ ] Sent `items` hold the paired snapshots in text order; a snapshot carries no `item_id`, `entity_id`, `status`, `unsafe`, `quantity` or `durability`, whatever the source item held.
- [ ] Editing a character inside a token and sending sends the text with no snapshot for it; deleting a whole token likewise; a line whose every link was broken is sent with no `items`.
- [ ] The same item linked twice sends two snapshots; two items of one name, linked A then B, send A's snapshot for the first token and B's for the second.
- [ ] Esc drops the held links with the draft; a press in the world keeps both; ArrowUp to a sent line and ArrowDown back restores the draft with its links; a recalled line is sent with no `items`.

### Client: chat with a panel open

- [ ] With the inventory or the character panel open, Enter opens the chat input and the input row is shown.
- [ ] With a half-typed draft, opening and closing the inventory and the character panel (corner icons, ×) leaves the draft and its held links as they were.
- [ ] While typing with a panel open, I, B, C, E and Q type letters and no panel toggles, nothing is worn; Esc closes the input and leaves the panels open; a second Esc then closes the panels.
- [ ] With the menu, a dialogue card, the letter panel, a run's open container or the run's end, chat stays shut exactly as before.

### Client: the window

- [ ] A received line with one link draws the name as a tag in its brackets, in the rarity's colour token, on its ground (no border, owner tune); an item with no rarity draws in the ordinary text colour.
- [ ] The tag's ground alpha, inner padding, outer space and tag-row padding are named constants, and the fence (`npm run lint:fence`) passes.
- [ ] A tag that does not fit the rest of a row starts the next row whole; text before and after it wraps as plain text does; a line with no links is drawn exactly as before.
- [ ] On a line with links, a click on the sender's name still starts a whisper to them; a click on a tag starts nothing.
- [ ] Hovering a tag shows the item tip with the snapshot's name, rarity, kind, stats, item level, requirement, affixes, unique effect and lore; the requirement is never in the too-high colour; no standing note is shown.
- [ ] The tip shows for a line on each of area, world, party and whisper, the sender's own echo included, in the hub, a field and a run, with the input open or closed.
- [ ] A tag under an open character panel or stash shows no tip; moving off a tag, scrolling the line away or folding the window removes the tip.
- [ ] A stamped line with a malformed `items`, or a snapshot that pairs with no token, is drawn as text and nothing throws.
- [ ] Lines with links survive hub → field → run → hub and are gone after a page reload; nothing about them is in `localStorage`.
- [ ] Unit tests cover pairing (R10's cases), the snapshot builder, the count and length refusals, the tolerant read, the tag wrap, and the key ownership with a panel open.

### Owner's check (HITL)

- [ ] On a Mac in the owner's browser: Control+Option+left-click on an item links it and does **not** wear, take off or move it, and no browser context menu shows. Cmd+Option+left-click links it.
- [ ] If a browser reads Control+click as a right-click so that Control+Option cannot link, the finding is escalated to the owner. No other key is picked.
- [ ] The tag reads as an item at a glance in each rarity and with none, idle and typing; the owner tunes R34's constants or accepts them.
- [ ] Two browsers: a link sent in area, world, party and whisper shows its tag and tip on the other side, in the hub and in a run.
- [ ] The hint line reads well in the inventory and in stash mode and overlaps nothing.
- [ ] Typing with the character panel or the stash open: the input row is usable under the panel and the covered lines are acceptable as R23 leaves them.

## Edge States

- **Chat input closed, link press** — opens with the token at the last caret (R3).
- **Chat may not open** (menu, dialogue, letter panel, container, run's end) — the link press does
  nothing (R7).
- **No world reported / between worlds** — no overlay and no chat window; nothing to press.
- **Draft at 200 code points** — any link press is refused with the no-room line (R12).
- **Whisper draft** — the token goes at the caret like anywhere; the message alone is counted. A
  token inserted where the name belongs (`@[Iron …`) makes a whisper to nobody real: the server
  answers `not_online`, as for any mistyped name.
- **Input method composing** — a link press during composition inserts after the composition is
  committed or is ignored; it must never corrupt the composing text. **(v1 pick: ignored while
  composing)**
- **Item changes after the press** (worn, moved, sold, lost on death) — the draft and any sent
  line keep the snapshot (R17).
- **Item with no rarity, no stats, no affixes** — a valid snapshot of `name` and `item_type`; the
  tag in the ordinary colour; the tip shows what there is.
- **Pending pickup, locked or dimmed item** — links like any other (R2).
- **Name with brackets or control characters** — cannot be linked (R13); the server would refuse
  it anyway (R27).
- **Hand-typed `[Name]` matching a held link** — R10.
- **Sender's client modified** to send a forged or oversized item — refused by R27 if malformed;
  a well-formed forgery is relayed and shown. Accepted by the trust decision (R26).
- **Out-of-date client** that does not know `items` — sends none; receives lines whose `[Name]`
  it draws as text. Nothing breaks.
- **Refused with `bad_item_link`** — the notice is a system line; the draft was already cleared by
  the send, as for `too_long` today.
- **Flood window** — a line with links inside the window is refused `too_fast` like any line; its
  links are gone with it.
- **Writer queue full, recipient gone, pod inbox or bus publish failed** — the line is missed as
  any line is (at-most-once); nothing about links is retried.
- **Cross-pod** — `items` rides the line's JSON; the receiving pod validates nothing again (R30).
- **Tag wider than a row** — its own row, cut with `…` (R35); the tip still shows the whole name.
- **Line scrolled while a tip shows** — the tip goes (R37).
- **Left panel open over the lines** — tags under it show no tip; the picker's list is covered
  (R23).
- **Channel hidden by its filter tab** — its lines and their links are held and reappear with it.
- **Run's end while typing a line with links** — the input is cancelled, the draft and held links
  dropped (FS-TQZ5J R128).
- **Mac Firefox reporting Control+click as button 2** — R6: nothing happens on Control+Option;
  Cmd+Option links. Checked and, if found, escalated in the owner's check.
- **Linux window managers that take Alt+click** — the press may never reach the page; accepted.

## V1 picks (escalation candidates)

1. R2: dimmed, locked and pending items can be linked.
2. R6: a right-button press with the link modifiers held does nothing.
3. R7: a link press where chat may not open is silent.
4. R8: the hint names Ctrl+Alt only, not Cmd+Option.
5. R10: pairing by text order, with no caret tracking; a hand-typed exact token can take a link.
6. R11, R12: the two refusals are client-held system lines with `menu_error`.
7. R13: names with brackets or control characters cannot be linked.
8. R16: recalled sent lines carry no links.
9. R23: no relayout or re-layering; an open left panel covers the chat's lines and picker list.
10. R27, § The item snapshot: the numeric and length bounds, the 4096-byte cap, `weapon_type` by
    pattern, at most six affixes; one refusal code `bad_item_link`.
11. R31: the client reads `items` tolerantly and never drops a line for it.
12. R34: the tag's first tuning values. R35: an over-wide tag is cut with `…`.
13. R38: the requirement is never marked against the viewer's level.
14. Edge: a link press while an input method composes is ignored.
15. The tag drops the brackets (R32, read from "the item's name only"). Reversed by the owner's
    tune: the tag keeps them.

## Out of Scope

- **Server-resolved links**: the pod looking the item up by id and stamping server truth. To
  revisit if player-to-player trading ever needs a link that can be trusted. **(charter default)**
- Dragging an item into chat, or anywhere.
- Clicking a link: no pin, no whisper, no Bazaar search, no compare.
- Linking from the container view, the Bazaar or mail.
- The trade channel.
- An icon or thumbnail, in the line or in the tip.
- Persistence: links are never stored server-side and are gone from the client on reload
  (ADR-0033).
- Marking a linked item's requirement against the viewer's level.
- Moving or re-layering the chat window so its lines show beside an open left panel.
- Any database, api-gateway, items-service or proto change.
- Mute and report (FS-4HEG7): a reported line's evidence carrying its links is that FS's to say.
