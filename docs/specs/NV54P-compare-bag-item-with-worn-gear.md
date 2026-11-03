# FS-NV54P: Compare a bag item with worn gear

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Character" (compare a bag item with worn gear) → this FS · Related ADRs: [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code; none is added), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas palette) · Builds on: [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) R13 (the ten gear slots), R15 (hover shows the item tip), R12 (one overlay in every world); [FS-VPD8Y](VPD8Y-town-stash.md) §F R35–38 (stash mode: the bag stays in the right panel); [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) R59 (the item tip's lines); [FS-WJGFJ](WJGFJ-in-game-chat.md) R27 (the open chat input owns the keyboard) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) *worn tip* (added by this FS), *bag*, *stash*, *container view*

> **Decision provenance.** The thread is an approved /charter with every decision locked; there
> was no interview and no challenge-me pass. Each locked decision is marked **(charter default)**
> with its reason. Where the charter left a point open, the smaller v1 was taken and marked
> **(v1 pick)**.

## Summary

In the gear overlay, holding Shift while the pointer is over an item in the bag shows the gear the
character wears in that item's slot beside the item's own tip, so the two can be read side by
side before equipping. A ring shows both worn rings. Each worn item's tip is the same item tip,
captioned "Worn". It works in every world the overlay opens, including the bag while the overlay
is in stash mode.

**Lane:** game-client only, agent-built (frontend lane). No server, WebSocket, proto, OpenAPI,
generated client or art change **(charter default: the feature is reading what the client already
holds)**.

## Requirements

### A. The trigger

1. **Hold Shift while hovering a bag item** in the gear overlay (`src/ui/GearOverlay.ts`) and the
   worn tips for it (§C) show beside its item tip. Release Shift and they go; the item's own tip
   stays **(charter default: a held modifier, the familiar ARPG pattern)**.
2. **Pressing or releasing Shift mid-hover** shows or hides the worn tips at once, without the
   pointer moving **(charter default)**.
3. **Shift already held counts.** If Shift is down when the pointer reaches a bag item (or when
   the overlay opens under it), the worn tips show with the item tip **(v1 pick: "held" means
   held, however it got there)**.
4. **Shift does nothing while the overlay is closed** **(charter default)**. The overlay listens
   for Shift only while open, the way it hangs its pointer handlers on in `show()` and takes them
   off in `hide()`. Nothing else in the Phaser client binds Shift today, and this FS binds it to
   nothing else. Shift sends nothing on the wire.
5. **Shift is never captured.** Listening for Shift must not stop the browser's own handling of
   it, so DOM text fields (the chat input, the web pages) keep typing capitals while the overlay
   is open **(v1 pick: a modifier read, not a key the canvas swallows)**.
6. **The open chat input owns the keyboard** (FS-WJGFJ R27): while it is open the scene keyboard
   is off, so Shift typed in chat never compares, and a Shift held as the input opens is let go
   (the input resets held keys) and the worn tips hide.
7. **Shift over anything that is not a bag item adds nothing:** a worn slot, a stash cell, an
   empty bag cell, the panels' empty space, the clear middle band **(charter default: v1; the
   user asked for bag items)**.

### B. What a bag item compares with

8. **The item's own valid slots,** as `getValidSlotsForItem` (`src/types/gameState.ts`) names
   them: a weapon with `weapon`; armour with its one slot (`head`, `body`, `hands`, `feet`); a ring
   with both `ring_1` and `ring_2` **(charter default: the user's ring rule)**.
9. **Consumables never compare** **(charter default: three interchangeable slots, no stats to
   weigh)**. An item with no valid slot (unknown kind, armour without a slot) never compares
   either.
10. **An empty slot contributes nothing** **(charter default: smaller v1).** One worn tip per
    target slot that holds an item: a ring with one ring worn shows one worn tip, with two worn
    shows two. With nothing worn in any target slot the item's own tip shows alone, with no
    placeholder and no "Nothing worn" tip.
11. **Every world the overlay opens** (hub, run, field world), and the bag in stash mode (FS-VPD8Y
    R35) **(charter default)**. What is worn is the overlay's own copy of the worn gear
    (`updateEquipment`, or the hub's REST load), the same copy the gear slots draw.
12. **Comparing is reading, not equipping.** A bag item the character cannot wear yet (above their
    level, or dimmed as not available, FS-VPD8Y R40, FS-18Z5F R38) still compares, and a set
    status line (the hub's loading or busy line, FS-HRH2J R42) does not stop it; hover and tips
    already read under a status **(v1 pick)**.

### C. The worn tip

13. **Built with the same `buildItemTip`** (`src/ui/itemTip.ts`), the same width and the same
    look as today's tip, from the same item view (`itemView` with the character's level and the
    overlay's world), so a worn item's rarity edge, standing note (unsafe find, in-run), level
    requirement and lines read exactly as its own hover tip reads them **(charter default)**.
14. **Captioned.** Each worn tip carries a caption as its first line: "Worn" for a weapon or
    armour; "Worn · Ring 1" and "Worn · Ring 2" for the ring slots **(charter default)**. The
    caption is set in the tip's existing caption style (the badge's caption size, label tone and
    letter-spacing, upper-cased as the badge is), so no new type size or colour is added **(v1
    pick)**. The hovered item's own tip carries no caption and is unchanged.
15. **No stat deltas** **(charter default: smaller v1).** No differences, arrows, better/worse
    colours or highlights on either tip.
16. **No new art and no new colour.** The tips use the canvas palette tokens they use today
    (ADR-0025); nothing is baked or sourced.

### D. Placement

17. **One row:** the hovered item's tip first, then the worn tips in slot order (`ring_1` before
    `ring_2`), side by side with a small gap, their tops aligned **(charter default: matches
    existing tip behaviour)**.
18. **Beside the cursor, flipped like today's tip** (`moveTip`): the row sits right of the
    pointer at today's offset; where its right edge would leave the screen, the whole row moves to
    the left of the pointer. The order inside the row does not change when it flips **(v1
    pick)**. Vertically it follows today's rule using the row's tallest tip: where it would leave
    the bottom, it rises above the pointer, never above the top edge.
19. **The whole row stays on screen** **(charter default).** Where neither side of the pointer has
    room, the row is pushed in from the right edge, and never past the left edge; on a screen
    narrower than the row, the left edge wins. The row may then sit under the pointer.
20. **The row follows the pointer** as today's tip does, and sits at today's tip depth, above the
    panels.

### E. Staying true

21. **The worn tips live and die with the item tip.** They show, move, hide and rebuild with it:
    leaving the cell, moving to another cell, the overlay redrawing (a state that changes the bag
    or worn gear, an equip or unequip, a stash move, a resize), closing the overlay (`I`, `B`,
    `Esc`, `Q`) and the scene shutting down all take them with the item tip. A worn tip never
    outlives its item tip.
22. **They always show what is worn now.** After an equip with Shift held (right-click or `E`),
    the overlay's redraw re-hovers what is now under the pointer, and its worn tips read the worn
    gear after the swap.
23. **Closing lets go of Shift.** On `hide()` the overlay stops listening for Shift, so a later
    Shift with the overlay closed does nothing (R4).

### F. The hint

24. **The hint line names it** **(charter default: otherwise undiscoverable).** `GEAR_HINT` and
    `STASH_HINT` (stash mode compares too, R11) each gain "Shift: compare" as their own part,
    between the gesture part and the close part, in the existing `//` style:
    - `Right-click or E: wear or take off  //  Shift: compare  //  I, B or Esc: close`
    - `Right-click or E: move between bag and stash, or take off  //  Shift: compare  //  I, B or Esc: close`
25. **The longer hint stays inside the right panel** and clear of the bag grid at every size the
    overlay lays out at (it wraps today within the panel's inner width).
26. **The controls help (H, run) is not changed** **(v1 pick: the overlay's own hint is where the
    overlay's gestures are taught)**.

## User Stories

1. As a player, I want to hold Shift over a sword in my bag and see the weapon I am wearing beside it, so that I can tell which is better before I swap.
2. As a player, I want to hold Shift over a ring and see both rings I wear, so that I know which one it would sit beside and what each gives.
3. As a player with only one ring on, I want to see just that ring beside the new one, so that an empty finger does not clutter the comparison.
4. As a player wearing nothing in that slot, I want just the item's own tip, so that I am not shown an empty card.
5. As a player, I want to press Shift while already hovering an item and have the comparison appear without moving the mouse, so that I can glance at it on demand.
6. As a player, I want to let go of Shift and have the comparison go at once, so that the screen clears as soon as I am done.
7. As a player, I want Shift held before I reach an item to still compare, so that I can sweep across my bag with Shift down.
8. As a player, I want each worn tip captioned "Worn" (and which ring), so that I never mistake my gear for the item I am considering.
9. As a player, I want the worn tips to look exactly like the tips I already know, so that I read them the same way.
10. As a player, I want the tips in one row beside my cursor that flips at the screen edge, so that nothing I am comparing is cut off.
11. As a player, I want the comparison to update right after I equip with Shift still down, so that what I see is what I now wear.
12. As a player, I want consumables not to compare, so that potions do not throw three cards at me.
13. As a player, I want Shift to do nothing when my gear is closed, so that holding it in the world never pops anything up.
14. As a player typing in chat, I want Shift to type capitals and never compare, so that chatting is unaffected.
15. As a player in the hub, a run or a field world, I want the comparison to work the same, so that the game feels like one game.
16. As a player at the stash, I want to compare a bag item with my worn gear too, so that I can decide what to keep in my bag.
17. As a player, I want items above my level to still compare, so that I can plan the gear I am saving for.
18. As a new player, I want the hint line to tell me "Shift: compare", so that I can discover it without being told.
19. As a player, I want Shift over my worn slots or the stash to do nothing extra, so that the comparison only appears where it means something.
20. As a developer, I want the worn tip built by the same tip builder, so that a change to the tip lands on both at once.

## Acceptance Criteria

- [ ] With the overlay open and the pointer over a bag weapon or armour item, holding Shift shows one more tip captioned "Worn" for the item worn in its slot; with the slot empty it shows none.
- [ ] Over a bag ring with Shift held: two worn tips captioned "Worn · Ring 1" and "Worn · Ring 2" with both rings worn; one with one ring worn (its own caption); none with no ring worn.
- [ ] Over a bag consumable, or an item with no valid slot, Shift shows no worn tip.
- [ ] Pressing Shift mid-hover shows the worn tips and releasing it hides them, with no pointer move; the item's own tip stays throughout.
- [ ] Shift already held when the pointer reaches a bag item shows the worn tips with the item tip.
- [ ] Shift over a worn slot, a stash cell, an empty cell or outside the cells adds no tip.
- [ ] With the overlay closed, Shift creates nothing and the overlay holds no Shift listener; after closing, its Shift listener is gone.
- [ ] Listening for Shift does not prevent the browser's default for it (no key capture).
- [ ] In stash mode a bag item compares exactly as outside it; a stash item does not.
- [ ] Worn tips are built by `buildItemTip` from the same item view as the item's hover tip (same width; rarity edge, standing note and requirement shown the same); no stat delta, arrow or better/worse colour is drawn.
- [ ] The hovered item's tip is unchanged and carries no caption.
- [ ] The row is hovered tip first, then worn tips in slot order, tops aligned; it sits right of the pointer and flips whole to the left where it would leave the right edge; it rises above the pointer where it would leave the bottom; every tip in it lies fully on screen at the overlay test sizes, the left edge winning on a screen narrower than the row.
- [ ] Moving to another cell, a redraw (bag or worn change, equip, unequip, stash move, resize), closing the overlay and the scene shutting down leave no worn tip behind.
- [ ] After an equip with Shift held, the worn tips shown read the gear worn after the swap.
- [ ] `GEAR_HINT` and `STASH_HINT` read as in R24, and the hint stays inside the right panel, clear of the bag grid.
- [ ] Below-level and not-available bag items still compare; a set status line does not stop it.
- [ ] Unit tests (vitest, next to the code) cover each criterion above, table-driven where cases repeat; the client test suite, typecheck and lint pass.
- [ ] No WebSocket message, proto, OpenAPI, generated client, game-server or art change in the diff.

## Edge States

- **Nothing worn anywhere:** every bag item's Shift-hover shows its own tip alone.
- **Empty bag:** nothing to hover; Shift does nothing.
- **Both rings worn, ring hovered near the right edge:** the three-tip row flips left; where even
  that does not fit, it is pushed in from the right edge and may sit under the pointer (R19).
- **Very small window (narrower than the row):** the row's left edge is kept on screen; tips past
  the right edge may be cut. Accepted for v1; the overlay's own small-window floor (FS-HRH2J
  edge state "Small window") keeps this rare.
- **Very tall tips (many affixes, a unique, lore):** the row's tallest tip sets its vertical
  placement; it never rises above the top edge (today's rule).
- **Worn gear changes while comparing** (a state lands, a hub REST reload, a stash move): the
  overlay redraws and the worn tips are rebuilt from the gear now worn (R21–22).
- **Equip or unequip with Shift held:** the action happens as today (Shift changes no gesture);
  the redraw re-hovers whatever is now under the pointer and compares it.
- **Hub REST busy or loading:** hover still reads, so compare still works on the items shown; a
  failed load shows no items, so nothing compares.
- **Chat input opened with Shift held:** the input resets held keys; the worn tips hide (R6).
- **Window or canvas loses focus with Shift held:** the scene keyboard lets go of held keys, so the
  worn tips hide and never stick on the next return **(v1 pick: the keyboard's own blur reset is
  relied on; if it does not let go, the overlay must clear compare on blur itself)**.
- **Both Shift keys:** left and right Shift both compare; releasing one while the other is still
  held may hide the tips (v1: accepted; the keyboard reports one Shift key).
- **Overlay over capacity (hub, more than 30 bag items):** the extra rows are bag cells and compare
  like the rest.
- **World switch while comparing:** the overlay closes with its scene and takes the tips and the
  Shift listener with it.
- **Same item in the bag and worn:** cannot happen; a worn item is not in the bag.

## Out of Scope

- Comparing from the container view (coffer, satchel, bone heap), from stash cells, from the
  marketplace or anywhere outside the gear overlay's bag cells.
- Shift over a worn slot showing anything.
- Stat deltas, better/worse marks, summed "after the swap" numbers, or any change to the stats
  panel.
- A placeholder tip for an empty slot.
- Consumable comparison.
- Rebinding the compare key, a toggle mode, or a setting.
- Adding Shift to the controls help (H).
- Any server, WebSocket, proto, OpenAPI, generated-client or art change.
