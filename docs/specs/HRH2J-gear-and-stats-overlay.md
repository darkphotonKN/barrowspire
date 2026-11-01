# FS-HRH2J: Gear, bag and stats overlay

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Character" (gear and bag overlay · character stats overlay), "### Hub" (supersedes "Loadout access from the hub" → FS-29KSH); `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (bag capacity limit) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection across hub and run), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas palette), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (Shadow Shot hold is client presentation) · Builds on: [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) R56 (one equip HUD every world with a body shares), [FS-BDA7X](BDA7X-character-leveling.md) R42–45 (level, XP and "Requires level N" on the wire and in views), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) R17 (class resource on `current_player`), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) R42, R54, R59 (equip swap rule, item stats, item lines), [FS-JTNPR](JTNPR-shadow-shot.md) R15–16 (opening a panel ends a hold) · Supersedes in part: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (the storekeeper opening the loadout; FS-29KSH is not edited) · Related, out of scope: [FS-VPD8Y](VPD8Y-town-stash.md) (town stash) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Carried items" (*bag*, *bag capacity*, *worn gear*, added by this FS), "NPCs" (*storekeeper NPC* corrected); [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*container view* is not the bag)

> **Decision provenance.** The thread is the 2026-10-30 `/scope-it` notes (no challenge-me pass;
> the user asked for simple and cheap) plus the approved /charter defaults. Every default is
> marked **(charter default)** with its reason. Where neither settled a point, the smaller v1 was
> taken and marked **(v1 pick)**; those are listed as escalation candidates in the charter report.

## Summary

Gear and the bag move off the full-screen black LoadoutScene and into a Path of Exile / Diablo
style overlay drawn over the live game: a gear-and-bag panel on the right edge, a stats panel on
the left, the world still visible and still running between them. `I` or `B` opens it anywhere a
player has a body: the hub, a run and a field world. No NPC gate. The bag gets a hard limit of 30
items, enforced by game-service in runs and field worlds, so the grid's 30 cells are the bag.

**Lane:** the bag-capacity guard in game-service is built by an agent for this FS **(charter
default: small and testable; no human-lane split)**. Everything else is game-client.

## Requirements

### A. The overlay (game-client)

1. **One overlay, two panels.** A right panel (gear slots on top, bag grid below) and a left
   panel (stats). Both open and close together; neither is shown alone.
2. **Layout.** Each panel is anchored to its side edge of the screen and may touch it. Each panel
   is about 95% of the screen's height with a small gap at the top (not flush). Each reaches
   toward the centre but leaves a clear band of 20–30% of the screen's width in the middle, so
   the player's body and the world stay visible. Small corner radius. The two panels mirror each
   other in size and position. The overlay scales with the canvas size it is opened at; a resize
   while open re-lays it out.
3. **Look.** World panels per `game-client/docs/design-guideline.md` "UI Chrome": dark vellum and
   carved stone, 1px brass borders, the game palette (not the menus' Bone & Soot), smooth fills.
   Rarity is shown by the guideline's rarity edge. Item icons are the baked item icons with the
   generic fallback (`src/render/art/itemIcons.ts`); any new art is built in code, no stock assets
   **(charter default)**. The overlay draws above the run's HUD (resource bars, ability card,
   progress HUD) and covers it where they overlap.
4. **Open and close keys.** `I` and `B` both toggle the overlay: either opens it, either closes
   it. `ESC` closes it. Where `Q` closes the equip panel today (run, field world) it still closes
   the overlay **(v1 pick: keep the existing binding rather than remove it)**.
5. **ESC precedence.** One ESC press closes exactly one thing, in this order: an open hub dialogue
   (unchanged), then the overlay, then the world's ESC menu opens. In a run, ESC with the overlay
   open closes the overlay and does not open the run's ESC menu **(charter default)**.
6. **While the ESC menu or a hub dialogue is open, `I` and `B` do nothing** (the menu and the
   dialogue already own the keyboard, FS-9K8EZ R5, FS-G4VMQ R5). **(v1 pick.)**
7. **The game keeps running while the overlay is open (charter default: multiplayer, no
   pause).** WASD still moves the body in the hub, the run and a field world; monsters, other
   players and the tick go on. Nothing is sent to pause or slow anything.
8. **Pointer over a panel is the overlay's (charter default).** A press, click or right-press
   whose point lies over either panel never sends an attack, never casts the class ability and
   never starts or feeds a Shadow Shot hold. A press in the clear middle band behaves as it does
   with the overlay closed (left-click attack, right-click ability). This replaces today's rule
   that any click while the equip panel is open is swallowed.
9. **Opening the overlay ends a Shadow Shot hold** (FS-JTNPR R15, unchanged).
10. **`E` while the overlay is open is the overlay's**, as it is for the equip panel today: it
    equips or unequips the hovered item and reaches for nothing in the world (no door, chest,
    pile or NPC). With nothing hovered it does nothing. **(v1 pick: keep the existing ownership
    rather than fall through to world interaction.)**
11. **The controls help (H, run) lists `I / B` for the overlay** in place of `I` "Equipment".
12. **One implementation for every world.** The hub, the run (`BarrowspireScene`) and the field
    world (`FieldScene`) compose the same overlay; the run and field keep feeding it through
    `EquipmentHud` (FS-X2F2H R56). The hub feeds it from REST (§E). No world copies it.

### B. The gear and bag panel (right)

13. **Gear slots.** The ten slots the equip panel has today: weapon, head, body, hands, feet,
    ring 1, ring 2, consumable 1–3. An empty slot shows its label; a worn slot shows the item's
    icon and rarity edge.
14. **Bag grid: 6 columns × 5 rows = 30 cells.** The grid's cell count **is** bag capacity
    (game-service `BagCapacity`). Items fill cells in bag order, left to right, top to bottom;
    empty cells are drawn as empty wells. A count reads `N / 30`.
15. **Hover shows the item tip** (`src/ui/itemTip.ts`: name, rarity, stats, affixes, unique
    effect, "Requires level N") for a bag cell or a worn slot.
16. **Equip: hover a bag item and right-click, or hover it and press `E`.** Both work. The item
    goes into its slot. If the slot it goes to already holds an item, that item swaps out to the
    **end** of the bag. Which slot it goes to follows the server's rule (first empty slot the item
    fits, else the first of its slots; FS-4R9M9 R42).
17. **Unequip: hover a worn slot and right-click, or press `E`.** The item goes to the end of the
    bag.
18. **No drag, no sort, no manual arrangement.** New items always append to the end. Left-click
    on an item does nothing in v1. Drag is parked, not rejected.
19. **Items above the character's level** stay dimmed with "Requires level N" (FS-BDA7X R45,
    unchanged). The run's server refusal (`ErrBelowRequiredLevel` and its message) stays the
    gate.
20. **Full bag, unequip (run and field).** With 30 items in the bag, unequip is not sent: a "Your
    bag is full." toast shows and the item stays worn **(charter default: client-side pre-check,
    the server refusal stays authoritative)**. An equip that swaps is net-zero and is allowed at
    full; an equip into an empty slot frees a cell.
21. **Full bag, pickup (run and field).** With 30 items in the bag (counting items taken and still
    pending, `EquipmentHud` `PENDING_MS`), taking an item from a container view (click or `F`) or
    a field pile is not sent: the "Your bag is full." toast shows and the item stays where it lies
    **(charter default)**. This holds whether or not the overlay is open.
22. **The toast** uses each world's existing passing-notice (run `showNotification` in the refused
    register, field `notice`, hub `notice`). Copy: "Your bag is full." **(v1 pick: plain words, no
    lore, per game-client/CONTEXT.md "No lore in error messages that must be acted on")**.
23. **Over capacity in the hub (charter default: no data loss for live players before the
    stash).** When the hub bag holds more than 30 items (§E), the grid grows extra rows of 6 below
    the 30 cells, those extra cells tinted as over capacity, and the count reads e.g. `34 / 30`
    in the over-capacity tone. Nothing is hidden, dropped or deleted. If the panel cannot fit the
    extra rows, the grid area scrolls (mouse wheel) inside the panel; the 30 base cells never
    shrink. The same rendering applies if a run or field bag ever reports more than 30.

### C. The stats panel (left)

24. **Reads the world state only, no new fetch (charter default: already in state).** The hub,
    run and field all read the player's own `PlayerState` (`game-client/src/types/gameState.ts`)
    from the latest state, plus the class card and the worn items the overlay already holds.
25. **Header.** The class's display name (from `CLASS_LORE`, as the menus show it), the character
    name, and the level (`level`; absent means 1).
26. **Experience bar.** Filled by `xpFraction` from `src/ui/progress.ts` over `experience`,
    `level_floor`, `next_level_at`, with the numbers `experience − level_floor / next_level_at −
    level_floor`. At the cap (`next_level_at` absent) the bar is full and reads "Max level". With
    no level or experience in the state, the bar is empty at level 1. The bar shows in every world
    (it used to show only inside the Spire).
27. **Resources.** Health `current_health / max_health`, and the class resource from `resource`
    (`kind` named as the resource bars name it: Mana, Stamina, Parry; `current / max`). A field
    the state does not carry (for example in the hub) hides its row; it is not shown as zero.
28. **Class base stats.** The class card's numbers (`CLASS_LORE[class].stats`: HP, attack,
    defence, range, speed) under a "Class" heading. **Deviation from the charter default
    "PlayerState only":** `PlayerState` carries no base stats, so the panel reads the client's
    static class card, keyed by `PlayerState.class`. It is still no new fetch. These are the
    level-1 card values; the server's per-level class growth (FS-BDA7X) is not on the wire and is
    not shown **(v1 pick; escalation candidate)**.
29. **Stats from gear.** Under a "From gear" heading, the sum over worn items of each stat they
    carry: attack power, critical rate, defence rating, magic resistance, and each affix stat
    (summed per `stat`), worded as `src/items/itemLines.ts` words them. A stat no worn item has is
    not listed. The panel does not add gear to class numbers into one derived total, since the
    server does not send the derived stats and a client-computed total could disagree with it.
30. **Live.** The panel re-renders as new state arrives while open (health, resource, XP, level,
    worn gear).

### D. Bag capacity (game-service)

31. **`BagCapacity = 30`**, one named constant in game-service. **(charter default.)**
32. **`ErrBagFull`**, a sentinel beside the others in `internal/game/errors.go`.
33. **Pickup into a full bag is refused.** In `moveItemToSatchel`
    (`internal/game/session.go`), when the bag already holds `BagCapacity` items the move
    returns an error wrapping `ErrBagFull` and **nothing moves**: the container keeps the item at
    its place, the bag is unchanged, and `pickUpItem`'s existing refusal path releases the item
    (as it does for out-of-range). This covers every container: run chests, drop piles and field
    piles.
34. **Unequip into a full bag is refused.** In `handleEquip`'s unequip branch, when the bag holds
    `BagCapacity` items it returns an error wrapping `ErrBagFull` and the item stays worn.
35. **Equip is never refused for capacity.** An equip that swaps an item out (FS-4R9M9 R42) is
    net-zero and allowed at full; an equip into an empty slot shrinks the bag.
36. **The cap refuses growth; it never removes.** A bag already over capacity (seeded so, or from
    before this FS) keeps every item; only moves that would grow it are refused. Run and field
    seating (`carried` over-level loadout items, at most 10) is not capped.
37. **No new reply message (charter default).** The refusal sends nothing new on the wire; the
    client's pre-check (§B 20–21) is what the player sees. The WebSocket protocol, proto and
    HTTP contract are unchanged.
38. **Runs and field worlds only (charter default: the hub has no ECS bag; no new endpoint).** The
    HUB world's gear screen is REST-backed (§E) and is not capped; `PUT /api/items/loadout` is not
    changed.
39. **Tests**, table-driven, next to the code: pickup at 29 → taken, bag 30; pickup at 30 →
    `ErrBagFull`, container and bag unchanged; unequip at 30 → `ErrBagFull`, still worn; equip
    swap at 30 → allowed, bag stays 30; equip into an empty slot at 30 → bag 29; a bag seeded at
    31 → pickup refused, nothing removed.

### E. The hub (game-client)

40. **The overlay replaces LoadoutScene in the hub (charter default: no second gear screen).**
    `I` or `B` opens it anywhere in the hub; the player stays in the hub world, visible and
    walkable, and is never taken to another scene.
41. **Hub data is REST, as LoadoutScene read it (charter default).** Each open loads
    `apiClient.getItemInstances()`, `apiClient.getLoadout()` and `apiClient.getItemRarities()`
    (rarities optional: without them items show no rarity badge), maps instances through
    `instanceItem`, puts loadout ids in their slots and every other owned instance in the bag.
    The bag order is the REST order.
42. **Hub equip/unequip** calls `apiClient.updateLoadout(slot, id | null)` with the backend slot
    names (chest/gloves/legs), applied optimistically (a swapped-out or unequipped item goes to
    the end of the local bag) and one at a time: while a call is in flight, further equip and
    unequip input on the overlay is ignored and the overlay shows it is busy. The hub's walk keys
    are not blocked.
43. **Hub refusals.** A failed update shows a passing hub notice ("Could not change your gear.")
    and reloads gear and bag from REST. A failed load shows the panels with an error line in the
    bag area; closing and reopening retries. **(v1 pick.)**
44. **No capacity pre-check in the hub.** The hub bag may hold more than 30 (§B 23); unequip is
    always sent there.
45. **The Quartermaster loses "Open pack" (charter default).** The storekeeper's dialogue in
    `HubScene.ts` `NPC_DIALOGUE` keeps its role and keeps a single dismiss choice; its line is
    replaced with a new one written by the implementing agent in the game's voice
    (design-guideline "Copy voice": grim, terse; game-client/CONTEXT.md lore vocabulary). It must
    not promise a function he no longer has. The server's NPC (`hub_map.go`, name "Quartermaster",
    function `storekeeper`) is unchanged.

### F. Retiring LoadoutScene (game-client)

46. **LoadoutScene is deleted and unregistered (charter default).** Removed from the Phaser scene
    list (`src/components/PhaserGame.tsx`), from the world-transition list
    (`src/components/worldRouting.ts`) and its tests, and `HubScene.openLoadout` is removed with
    its test. Nothing calls `scene.start("LoadoutScene")`.
47. **What only LoadoutScene used goes with it** (for example `MENU_EQUIPMENT_THEME` if nothing
    else reads it), and stale comments naming the loadout screen as a place are corrected
    (`MainMenuScene.ts` "the Quartermaster keeps it now", `src/utils/theme.ts`, the
    design-guideline "UI Chrome" sentences listing the loadout screen among the Bone & Soot menus
    and its panels as `MENU_EQUIPMENT_THEME`). The guideline correction removes a screen that no
    longer exists; it adds no rule.

## User Stories

1. As a player in a run, I want to open my gear and bag with `I` without the world going black, so that I can see danger coming while I swap gear.
2. As a player, I want `B` to open the same overlay as `I`, so that whichever key my hand reaches for works.
3. As a player, I want `I`, `B` or `ESC` to close the overlay, so that I can get back to fighting with one press.
4. As a player in a run, I want ESC to close the overlay before it opens the run menu, so that one press never opens a menu I did not ask for.
5. As a player, I want to keep walking with WASD while the overlay is open, so that I can step away from a monster while choosing gear.
6. As a player, I want my clicks on the panels never to fire an attack or start a Shadow Shot, so that equipping an item does not waste a cast or reveal me.
7. As a player, I want to still attack by clicking in the clear middle of the screen with the overlay open, so that I am not defenceless while it is open.
8. As a player, I want to equip a bag item by hovering it and right-clicking, so that gear swaps are one quick gesture.
9. As a player, I want hovering and pressing `E` to equip too, so that I can swap gear without the mouse button.
10. As a player, I want the item I replace to land at the end of my bag, so that I always know where it went.
11. As a player, I want to unequip a worn item with the same right-click or `E`, so that taking gear off is as easy as putting it on.
12. As a player, I want to see my bag as a 6×5 grid with a `N / 30` count, so that I know how much room I have left.
13. As a player, I want to hover any item to read its stats, affixes and level requirement, so that I can compare before I equip.
14. As a player with a full bag, I want a "Your bag is full." toast when I try to pick something up, so that I know why the item stayed on the ground.
15. As a player with a full bag, I want unequipping to be refused with the same toast, so that a worn item is never lost.
16. As a player with a full bag, I want to still swap a bag item for a worn one, so that a full bag never locks my gear.
17. As a player, I want the stats panel to show my class, level and an experience bar everywhere, so that I can see my progress in the hub too, not only in the Spire.
18. As a player, I want the stats panel to show my health and class resource, so that I can read my state at a glance while the HUD is covered.
19. As a player, I want to see my class's base numbers and what my worn gear adds, so that I can judge what a piece of gear does for me.
20. As a player, I want the stats panel to update while it is open, so that a level-up or a hit shows at once.
21. As a player in the hub, I want to open my gear anywhere with `I` or `B`, so that I do not have to walk to the Quartermaster.
22. As a player in the hub, I want to keep seeing and walking the hub while my gear is open, so that the town stays alive around me.
23. As a long-time player who owns more than 30 items, I want every item still shown in the hub, past the 30 cells and marked as over, so that nothing I own disappears before the stash exists.
24. As a player in the hub, I want a failed gear change to tell me and show my real gear again, so that what I see is never a lie.
25. As a player in a field world, I want the same overlay, keys and bag limit as in a run, so that the game feels like one game.
26. As a player talking to the Quartermaster, I want his line to fit the world and not offer a pack he no longer opens, so that the NPC makes sense.
27. As a player, I want no second gear screen, so that there is one place to learn.
28. As the server, I want to refuse a pickup or unequip that would grow a bag past 30, so that the cap is authoritative even against a stale or modified client.
29. As the server, I want the cap never to remove items from a bag already over it, so that no player loses an item to this change.
30. As a developer, I want one overlay composed by every world, so that a fix lands everywhere at once.

## Acceptance Criteria

- [ ] `I` and `B` each toggle the overlay in the hub, a run and a field world; `ESC` closes it; `Q` still closes it in a run and a field world.
- [ ] In a run, with the overlay open, one ESC closes the overlay and the run's ESC menu stays closed; the next ESC opens the menu.
- [ ] In the hub, with a dialogue open, ESC closes the dialogue; `I`/`B` do nothing while the dialogue or the ESC menu is open.
- [ ] Two panels, edge-anchored, ~95% of screen height with a top gap, small radius, leaving a 20–30% clear middle band; laid out again on resize.
- [ ] The panels use the game palette world-panel look (vellum/stone, brass 1px border); item icons are the baked icons with fallback; no sourced art is added.
- [ ] WASD moves the body with the overlay open in all three worlds; nothing is sent to pause.
- [ ] A left-click, right-click or right-press over either panel sends no `cast_skill` and starts no Shadow Shot hold; the same press in the middle band attacks or casts as with the overlay closed.
- [ ] Opening the overlay mid Shadow Shot hold cancels the hold.
- [ ] Right-click or `E` on a hovered bag item sends `equip` (run/field) or `updateLoadout` (hub); the displaced item appears at the end of the bag.
- [ ] Right-click or `E` on a hovered worn slot unequips it to the end of the bag.
- [ ] Left-click on an item does nothing; nothing can be dragged or reordered.
- [ ] The bag grid is 6×5, fills in bag order, and shows `N / 30`.
- [ ] Hovering a cell or worn slot shows the item tip.
- [ ] Run/field with 30 in the bag: unequip is not sent and "Your bag is full." shows; a container-view click or `F`, or a field-pile take, is not sent and the toast shows; an equip swap is sent.
- [ ] Hub with more than 30 owned unworn items: extra rows show tinted over capacity, the count shows over (e.g. `34 / 30`), every item is reachable (scroll if needed), and unequip still works.
- [ ] Stats panel shows class display name, character name, level, an XP bar from `xpFraction` (full with "Max level" at the cap), health, class resource (row hidden when absent), class card base stats and summed gear stats; it updates live while open.
- [ ] Stats panel makes no network request.
- [ ] game-service: `BagCapacity = 30` and `ErrBagFull` exist; pickup and unequip into a full bag return an error wrapping `ErrBagFull` with nothing moved; equip swap at full is allowed; a bag over capacity loses nothing; table-driven tests cover each case and `go test ./...` passes for game-service.
- [ ] No WebSocket message shape, proto, OpenAPI, generated client, items-service or DB change in the diff.
- [ ] LoadoutScene is gone from source, the Phaser scene list and the world-transition list; no `scene.start("LoadoutScene")` remains; its tests are removed or rewritten; the client test suite passes.
- [ ] The Quartermaster's dialogue offers no "Open pack"; it has a new in-voice line and one dismiss choice.
- [ ] Stale references to the loadout screen (MainMenuScene comment, `theme.ts`, design-guideline "UI Chrome") are corrected.

## Edge States

- **Empty bag / nothing worn:** 30 empty wells, `0 / 30`; every slot shows its label; the "From gear" section shows nothing (or a single "Nothing worn" line).
- **Bag exactly full (run/field):** pickups and unequips are pre-checked and toasted; equip swaps and equips into empty slots still work.
- **Pending pickups:** items taken but not yet confirmed (`PENDING_MS`) count toward the 30 in the pre-check, so two quick takes at 29 send only one.
- **Stale client state (run/field):** the client thinks there is room but the server's bag is full: the server refuses with `ErrBagFull`, the item stays in the container, and the next state removes the pending item from the bag. No toast in that case (no reply message) **(accepted by charter default)**.
- **Two players reach for the last item / two pickups in one tick:** the tick serialises intents; the second sees the updated bag and container and is refused as today.
- **Over capacity at ship (live prod):** run/field bags start at most 10 (over-level loadout items) and cannot exceed 30 by play after this ships; a bag that is somehow over keeps everything (R36). Hub bags over 30 render over-capacity rows (R23). Overflow into the stash is FS-VPD8Y's work.
- **Consumable slots full:** equipping a consumable with all three consumable slots full is refused as today ("slots are full" flash; the server's existing refusal), not a capacity case.
- **Below required level:** dimmed with "Requires level N"; in a run the server refuses and its message shows, as today.
- **Hub REST slow:** the overlay opens at once with a loading state in the gear and bag panel; the stats panel renders from state immediately.
- **Hub REST failed:** load failure shows an error line, reopen retries; update failure shows a notice and reloads from REST.
- **Hub update in flight and the overlay is closed:** the call finishes; the next open reloads from REST.
- **World switch while open** (hub → run, run → hub, handoff, field visit): the scene that owned the overlay shuts down and the overlay goes with it; it opens closed in the next world.
- **Dead, fallen, escaped or spectating in a run/field:** the overlay still opens and shows the last known gear and stats; equip/unequip sends are refused by the server as today. No new gating **(v1 pick)**.
- **Disconnect / reconnect:** the overlay reflects the next state after reconnect; nothing is cached across connections.
- **Small window:** the clear middle band never drops below 20% of the width; panel contents scroll rather than overlap the band.
- **Hub with no `resource` or `current_health` in state:** those rows are hidden; level/XP still render.
- **Level fields absent (older server):** level 1, empty XP bar.

## Out of Scope

- The town stash, moving items between bag and stash, and overflow into the stash (FS-VPD8Y).
- Drag-and-drop, sorting, manual arrangement, splitting stacks, dropping or destroying items.
- A capacity limit on the hub's REST path (`PUT /api/items/loadout`), or any new or changed HTTP
  endpoint, proto, WebSocket message, items-service or database change.
- A new server reply message for a full bag.
- Server-derived character stats on the wire (class growth per level, gear-adjusted totals).
- Changing the Quartermaster NPC beyond his line and choices (name, position, art, server function
  id), or making him the stash keeper.
- Pausing or slowing the game while the overlay is open.
- The matchmaker / match queue (FS-K2HKP).
