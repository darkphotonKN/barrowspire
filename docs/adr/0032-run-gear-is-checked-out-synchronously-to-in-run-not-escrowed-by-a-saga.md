# ADR-0032 — Run gear is checked out synchronously to `IN_RUN`, fenced by run id; no gear-escrow saga

Status: accepted
Date: 2026-10-31
Scope: `game-server/items-service` (item status, checkout RPC, settlement), `game-server/game-service`
(seating, extraction), `game-server/marketplace-service` (unchanged; relies on its conditional writes)
Realized by: [FS-18Z5F](../specs/18Z5F-run-gear-checkout-and-unsafe-finds.md) (run gear checkout and
unsafe finds)
Builds on: [FS-NXP1W](../specs/NXP1W-auction-settlement-saga.md) (conditional status writes and the
`listing_id` fence), [ADR-0031](0031-field-visits-settle-as-match-ended-with-a-world-type-consumers-skip-fields.md)
(field visits settle through the same extraction path)

## Context

FS-VPD8Y and FS-18Z5F make the bag something a delver carries into a run or a field world: worn
items plus every bag-location item. Until now only the 10 worn slots entered a run, and nothing
on the item marked it as being in one. Two problems follow once the bag goes in:

- **A race with the marketplace.** A player could list an item from another tab while that same
  item is in their run. If the run then extracts it, the item exists twice in effect: once
  listed, once carried out.
- **Items that went in and did not come out** (lost on death, used up) keep their row untouched.

The refactor plan (`docs/refactor_plan.md`) names a flagship **gear-escrow saga** for this:
checkout on delve, the instance authoritative, return or forfeit on extract, death or crash, with
crash-recovery compensation.

The owner rejected the saga on 2026-10-31. The marketplace already uses semantic locking: every
listing, delisting and settlement write is conditional on the item's current status (AVAILABLE
before listing, LISTED before delisting) and fenced by `listing_id`. Nothing in that design needs
a second coordinator. What it needs is for an item in a run to stop being AVAILABLE before
anything else can see it.

The owner also rejected setting that status by an event. An event can fail and be requeued, and
in that window the player could list the same item from another tab.

Recorded without adversarial review. The decision converged in a `/scope-it` session and was not
put through `challenge-me`.

## Decision

**An item enters a run by a synchronous checkout that moves it to a new item status, `IN_RUN`,
tagged with the run's id. It leaves by the run's settlement. No saga coordinates it.**

- **New status `IN_RUN`** on item instances, beside AVAILABLE, LISTED and PENDING_SETTLEMENT.
- **Checkout is synchronous, at seating.** When a run or field world seats a member, game-service
  calls items-service directly (gRPC), before the body is built. In one transaction, items-service
  moves that member's worn and bag-location items from `AVAILABLE` to `IN_RUN` with a conditional
  write, records the run id on each, and returns what it checked out. An item not AVAILABLE
  (listed, mid-settlement) is not checked out and stays home.
- **The run id fences it.** The run id is stored on each checked-out item, copying the
  `listing_id` fence. Release acts only on items tagged with that run's id, so a late or replayed
  settlement can never release an item a later run checked out.
- **Release is asynchronous, by settlement.** The run's extraction event (the existing outbox →
  items-service inbox path, FS-BVM9H) releases every item tagged with that run's id. Releasing
  late is the safe direction: an item stays locked a little longer and is never unlocked early.
  Settlement releases every item tagged with the run id, not only the ones the run extracted.
  That covers a checkout that committed but whose reply the run never got.
- **The next checkout reclaims orphans.** A member is in one world at a time (one connection,
  ADR-0015), so at checkout any of their items still IN_RUN under a *different* run id are
  orphans of a run that never settled (pod crash) or has not settled yet. Checkout re-tags them to
  the new run. The old run's settlement, if it ever arrives, then acts only on instances it
  inserts or that still carry its run id, so it cannot touch them. A time-based sweeper was
  rejected for v1: field visits have no maximum length, so any TTL could release the items of a
  live visit and reopen the listing race.
- **Other writes need no extra checks.** The marketplace's existing conditional writes already
  refuse an item that is not AVAILABLE or LISTED, so IN_RUN fails them as is. A not-IN_RUN check
  is added only to item writes that do not already require a specific prior status, such as the
  bag ↔ stash move and the hub loadout update.

## Consequences

- **The listing race is closed at the database,** by the same mechanism that already guards
  listing against settlement. No new coordinator, workflow or compensation path is built.
- **The refactor plan's gear-escrow saga is not built.** The thin line "Gear escrow across the run
  lifecycle" now points at FS-18Z5F, which realizes it as this checkout and settlement.
- **Seating gains a synchronous dependency on items-service.** It already had one: the loadout
  fetch under the world lock, with a 3s timeout. The checkout replaces or extends that call
  rather than adding a second round trip. If the checkout times out, the delver is seated as
  today with `LoadoutUnknown`, and the run id fence lets settlement release whatever did commit.
- **Items can stay IN_RUN after a crash until the member's next seating.** The hub shows them as
  locked (not lost) in the meantime. A player who never plays again leaves them locked; a sweeper
  that can prove a run is dead is a later addition, not part of this decision.
- **Settlement is fenced on writes, not only on release:** an extracted instance is applied only
  if it is new or still carries the event's run id. That is also what makes redelivery safe.
- **A crash costs only unsafe run finds.** They never exist in items-service until extracted, and
  safe items are released, not forfeited.
- **One more status for every reader of item status.** Listings, summaries and the hub overlay
  must render or skip IN_RUN sensibly.
- **The extraction event carries more weight.** It now also releases locks. Its idempotency
  (FS-BVM9H inbox) and the run id fence keep that safe under redelivery.
