# FS-GTNP8: Listed items marked in the gear overlay

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Character" (listed items marked in the gear overlay) → this FS · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only colour), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas palette), [ADR-0056](../adr/0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md) (render scale = camera zoom) · Amends: [FS-VPD8Y](VPD8Y-town-stash.md) R39 (the words a refused move of a `LISTED` or `PENDING_SETTLEMENT` item shows); FS-VPD8Y is not edited · Builds on: [FS-18Z5F](18Z5F-run-gear-checkout-and-unsafe-finds.md) §H R36–R38 (an item's *standing*: tip note, slot mark, the hub's pre-checked refusal), FS-VPD8Y R40 (items not `AVAILABLE` drawn faint), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) §E R43 (refusal → hub notice), [FS-V7A5S](V7A5S-withdraw-a-listing.md) (the seller can withdraw a listing) · Related: [FS-NXP1W](NXP1W-auction-settlement-saga.md) (`LISTED` → `PENDING_SETTLEMENT` at settlement step 0b) · Client only: no server, contract or generated-client change

## Summary

An item a player has put on the Bazaar is `LISTED` in items-service, and `PENDING_SETTLEMENT`
while its sale settles. The hub's gear overlay already draws such an item faint and will not
let it move, but says nothing about why: only an item still in a delve has a tip note. This
feature makes a listed or settling item explain itself where the player sees it. Its tip says
"Listed on the Bazaar." or "Sale settling…" in red. Its bag cell, stash cell or worn slot
carries a small red corner mark, so it reads as listed without a hover. Trying to wear, take
off or move it shows a plain refusal in the hub notice, and nothing is sent.

**Premise verified (2026-11-06).** `GET /api/items/instances` returns every owned instance with
its `status`. items-service's `ListItemInstances` has no status filter and selects `ii.status`,
`itemInstanceToProto` copies it, and the gateway's `ItemInstance` wire type publishes `status`
with `LISTED` and `PENDING_SETTLEMENT` in its enum. The local items DB held 20 `LISTED` and 10
`PENDING_SETTLEMENT` rows. The client's `instanceItem` carries `status` onto `ItemState`.

## Requirements

### A. Standing

1. An item's **standing** (FS-18Z5F §H) gains two kinds, both read from its status alone,
   whatever world the view is drawn in, as `inRun` is:
   - `listed`: status `LISTED`. Tip note "Listed on the Bazaar."
   - `settling`: status `PENDING_SETTLEMENT`. Tip note "Sale settling…"
2. The status-driven standings (`inRun`, `listed`, `settling`) are worked out in one place,
   `itemView`'s standing. Any view that needs to know why an item is locked reads them from
   there. No second status switch is written beside it.
3. The unsafe-find standing is unchanged (R36–R37). It never applies to a listed or settling
   item, since those never enter a run (items-service's checkout leaves them home).

### B. Tip note

4. A `listed` or `settling` note is drawn where the in-run note is (after the badges), in the
   canvas palette's danger channel: `palette.listed`, the same lifted oxblood
   (`BARROW_HEX.oxbloodText`) as `palette.unsafeFind`. No new hex. The in-run note keeps the
   label tone.

### C. Slot mark

5. A `listed` or `settling` item's bag cell, stash cell or worn slot carries the **listed
   mark**: a filled right triangle in the well's top-right corner, its legs along the well's
   top and right edges, in `palette.listed`. It is drawn in code with Graphics (no new art,
   ADR-0021), above the item's icon, so the faint icon never hides it.
6. Its legs scale with the well: round(30% of the well's shorter side), never under 8 px and
   never over 14 px (logical units). Its corners are inset 2 px inside the well, so it stays
   within the well's rounded corner. It sits clear of the rarity edge down the well's left side
   and of the unsafe inner edge's left run. Its corners are whole logical pixels.
7. The mark is legible at render scale 1 and 2. Logical units are backing pixels × render scale
   (camera zoom = render scale, ADR-0056), so an 8 px leg is 8 backing px at scale 1 and 16 at
   scale 2.
8. An item with no listed or settling standing carries no mark: an `AVAILABLE`, `IN_RUN`,
   `IN_ESCROW` or status-less item, and an unsafe find.
9. The icon's faintness is unchanged (FS-VPD8Y R40).

### D. Refusal

10. In the hub, an equip of a listed or settling bag item, an unequip of one that is worn, an
    equip that would take one off (a swap), and a stash-mode move of one, are refused before
    anything is drawn or sent. The hub notice says why:
    - `listed`: "Listed on the Bazaar: withdraw it to use it."
    - `settling`: "That item's sale is settling."
    - `inRun`: "That item is still in a delve." (unchanged)
11. The refusal goes through the existing pre-check (`mayEquip`, `mayUnequip`, `mayMove`) and the
    hub's passing notice, the path an in-run item already uses (FS-18Z5F R38). It is never
    silent.
12. **Amends FS-VPD8Y R39:** a move of a `LISTED` or `PENDING_SETTLEMENT` item shows the words in
    R10, not "That item is not free to move.". Any other status that is not `AVAILABLE` (e.g.
    `IN_ESCROW`) keeps "That item is not free to move.".
13. The server stays the authority. A status that changes after the overlay loaded (listed from
    another tab, say) is refused by items-service. The refusal shows by `code` as today
    (`ITEM_NOT_AVAILABLE` → "That item is not free to move."), and the gear reloads.

### E. Where it shows

14. The marks apply to the gear overlay's worn slots, bag cells and stash cells, and to the
    tips shown from them. That includes the Shift-compare tip of a worn item. The overlay is the
    only canvas view that holds owned items with a hub status.
15. The container view (the satchel, a run's loot) and the letter panel (mail enclosures) are
    unchanged. Their items are not the player's owned instances and carry no `LISTED` or
    `PENDING_SETTLEMENT` status. The Bazaar's React pages already label a listed relic and are
    out of scope.
16. The design guideline's "Item marks in the gear and bag overlay" records the listed mark and
    its notes.

## User Stories

1. As a player, I want a listed item's tip to say it is on the Bazaar, so that I know why it is faded.
2. As a player, I want a settling item's tip to say its sale is settling, so that I know it is leaving.
3. As a player, I want a listed item to carry a mark on its slot, so that I can see which of my items are listed without hovering each one.
4. As a player, I want the mark in the same red as the tip note, so that the two read as one signal.
5. As a player, I want the mark not to look like a rarity edge, so that I never misread an item's rarity.
6. As a player, I want the mark legible on a small window and on a sharp HiDPI one, so that it reads at either render scale.
7. As a player, I want the mark drawn over the faded icon, so that the fading never hides it.
8. As a player, I want a clear refusal when I try to wear a listed item, so that I am not left wondering why nothing happened.
9. As a player, I want the refusal to tell me to withdraw the listing, so that I know how to get the item back.
10. As a player, I want a clear refusal when I try to move a listed item between bag and stash, so that I know it is locked.
11. As a player, I want a refusal for a settling item that does not tell me to withdraw it, since that is no longer possible.
12. As a player, I want no request sent for a locked item, so that I do not see a reload flicker for a change that was never possible.
13. As a player, I want an item listed from another tab still refused by the server, so that the lock holds even when my view is stale.
14. As a player, I want an in-delve item to keep its own note and refusal, so that the two locks are told apart.
15. As a player, I want items in other statuses (escrowed) to keep the general refusal, so that every locked item still says something.
16. As a player, I want the Shift-compare tip of a worn item to carry its note too, so that every tip of an item says the same.
17. As a player, I want a free item to carry no mark, so that the mark means only "on the Bazaar".
18. As a maintainer, I want the listed standing in the same place as the in-run one, so that a new lock status is one more case, not a second mechanism.
19. As a maintainer, I want the red taken from the canvas palette, so that the colour fence (ADR-0013) holds.

## Acceptance Criteria

- [ ] `itemView` gives a `LISTED` item the standing `{ kind: "listed", note: "Listed on the Bazaar." }` and a `PENDING_SETTLEMENT` item `{ kind: "settling", note: "Sale settling…" }`, in any world or none.
- [ ] `AVAILABLE`, status-less and `IN_ESCROW` items get no standing in the hub; `IN_RUN` keeps `inRun`.
- [ ] The tip draws a listed or settling note in `palette.listed`, which equals `palette.unsafeFind`'s hex. The in-run note stays in the label tone.
- [ ] A listed or settling item's bag cell, stash cell and worn slot each get one filled triangle in `palette.listed`, drawn after its icon, inside the well's top-right corner.
- [ ] The mark's legs are 8 px on the smallest well (26), 12 on a 40 px well and 14 on the largest (72). Its corners are whole numbers, 2 px inside the well, and right of the rarity edge.
- [ ] No mark on `AVAILABLE`, `IN_RUN`, status-less items or unsafe finds.
- [ ] In the hub, equip, unequip, swap-out and stash-mode move of a listed item send nothing and notice "Listed on the Bazaar: withdraw it to use it."; of a settling item, "That item's sale is settling."
- [ ] A move of an `IN_ESCROW` item still notices "That item is not free to move."; a server `ITEM_NOT_AVAILABLE` still maps to it.
- [ ] Design guideline updated.
- [ ] Full vitest suite and `tsc` green.
- [ ] Nick's browser check (hub, render scale 1 and 2) accepts the mark and the words.

## Edge States

- **Listed after the overlay loaded** (another tab): the item is drawn as free until the next
  load. The server refuses the change (`ITEM_NOT_AVAILABLE`), the generic words show, and the
  reload brings the mark (R13).
- **Withdrawn, or the sale rolled back, after the overlay loaded:** the item still shows the mark
  until the next open. The player closes and reopens the overlay. No live push of item status
  exists today.
- **Sold:** the settled item leaves the player's instances. The next load no longer has it.
- **A worn listed item:** worn items cannot be listed ([FS-HBXZN](HBXZN-worn-items-not-listable.md)). Should one be met anyway (old
  data), it is marked and its unequip refused the same way.
- **Swap onto a worn listed item:** refused with the listed words, as for in-run.
- **Over-capacity bag rows:** a listed item past cell 30 carries the mark over the tint.
- **Run and field worlds:** listed and settling items never enter them, so nothing shows there.

## Out of Scope

- Withdrawing a listing from the canvas (the Bazaar's My listings does it, FS-V7A5S).
- Showing a listing's price, bids or time left in the tip.
- Marks for `IN_ESCROW` or other statuses, beyond the existing faint icon and general refusal.
- A live status push to refresh an open overlay.
- Any server, contract or generated-client change.
