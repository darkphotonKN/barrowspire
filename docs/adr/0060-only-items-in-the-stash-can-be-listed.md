# ADR-0060 — Only items in the stash can be listed

Status: accepted
Date: 2026-11-06
Scope: `game-server/items-service` (`ReserveItem`), `game-server/common/errcode`
(`ITEM_NOT_IN_STASH`), the gateway's create-listing description, game-client's List-a-relic
picker. Specified by [FS-3R77D](../specs/3R77D-only-stash-items-can-be-listed.md).
Builds on: [ADR-0001](0001-contract-layer.md) (a domain refusal is 400 with a code, decided by
the owning service)

## Context

Recorded without adversarial review. Decided by the owner, Nick, on 2026-11-06. He asked whether
trading could be limited to stash items, and chose: the marketplace shows only stash items, and
items being sold or not sellable need no special display.

Since FS-VPD8Y an owned item sits in one of two locations, the bag (at most 30, carried into runs
and field worlds) or the stash (at most 60, kept in town). Until now `ReserveItem` checked only
owner, status, worn and the listed-item cap, so a member could list anything in the bag, and the
web picker showed every owned item, greying out and tagging the ones it could not list.

That mixed two jobs in one place. The bag is what a member packs for a run. A bag item could be
listed while the member meant to carry it, and purchases already land in the stash
(FS-VPD8Y R7), so the two ends of a trade did not meet in one place.

Alternatives considered:

- **Recognise the stash but allow both.** Mark stash items in the picker and keep listing bag
  items. It keeps the two jobs mixed, and the picker grows another tag.
- **Enforce on the web page only.** Filter the picker and leave items-service as it is. Any API
  caller could still list a bag item, so the rule would not hold.
- **Move the item to the stash automatically on listing.** It writes a location the member did
  not choose and can hit the stash cap in the middle of a listing.
- **Cancel or move the existing bag listings.** It would touch live sales that buyers may have
  bid on, for a rule about new listings.

## Decision

**Only an item whose location is the stash can be put up for sale. items-service refuses to
reserve any other item with the registered code `ITEM_NOT_IN_STASH`.**

- **items-service decides it**, in `ReserveItem`, from the placement it already reads under the
  seller's account lock. marketplace-service passes the refusal through and does not restate it.
- **It is checked after status and worn, before the listed-item cap.** A worn item can be in
  either location, and taking it off comes first.
- **The conditional reserve stays on status only.** Every write that changes an AVAILABLE item's
  location takes the same account lock, so the read cannot go stale before the update.
- **Only new listings are affected.** Listings of bag items made before this decision stay as
  they are, with no migration. One that ends unsold or is withdrawn returns to the bag, as
  before (FS-VPD8Y R8).
- **The web picker shows only what can be listed now**: stash, AVAILABLE, not worn. Nothing else
  is shown, tagged or explained.

## Consequences

- **The stash is where trading happens and the bag is what a member carries.** A sale starts and
  ends in the stash.
- **The rule holds for every caller**, not just the web page.
- **Listing takes one more step for loot from a run.** Extracted finds land in the bag, so a
  member moves them into the stash in town before selling.
- **The picker loses its tags.** A member no longer sees their listed or worn items there. My
  listings and the gear overlay (FS-GTNP8) still show what is for sale.
- **Grandfathered bag listings exist for a while.** They are the only listed items outside the
  stash, and they disappear as they end.
- **Any future way to list an item** (a canvas action, a bulk listing, an admin tool) must go
  through `ReserveItem` or apply the same rule.
- **Any future write that changes an AVAILABLE item's location** must take the account lock, or
  the reserve check can be raced.
- **Not addressed:** listing from the game canvas; moving items from the web page; a hint that
  says why a given item is missing from the picker.
