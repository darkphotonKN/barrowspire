# FS-18Z5F: Run gear checkout and unsafe finds

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (bag carried into runs and field worlds · unsafe run finds lost on death), "### Cross-context flows" (gear escrow across the run lifecycle); `game-server/items-service/SPECIFICATION.md` "## Inventory" (in-run status on owned instances), "## Run extraction" (settle checked-out items at run end); `game-client/SPECIFICATION.md` "### Escape run" (unsafe marking on run finds) → this FS · Related ADRs: [ADR-0032](../adr/0032-run-gear-is-checked-out-synchronously-to-in-run-not-escrowed-by-a-saga.md) (synchronous IN_RUN checkout, run-id fence, no escrow saga, next checkout reclaims orphans), [ADR-0031](../adr/0031-field-visits-settle-as-match-ended-with-a-world-type-consumers-skip-fields.md) (a field visit settles through the run's extraction path under its visit id), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WS contract), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection, one world at a time), [ADR-0001](../adr/0001-contract-layer.md) (domain refusals are 400 with a domain code) · Depends on: [FS-VPD8Y](VPD8Y-town-stash.md) (the `location` column, BAG / STASH; this FS cannot be built before it) · Supersedes in part: [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md)'s "death loses everything" (never built): a dead delver keeps what they brought in and loses only what they found. FS-4R9M9 is not edited. · Related: [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (bag capacity 30, seating not capped R36), [FS-BDA7X](BDA7X-character-leveling.md) (over-level worn items are carried, R31), [FS-9K8EZ](9K8EZ-die-by-choice.md) / [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (forfeit, leave early), [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (extraction inbox), [FS-NXP1W](NXP1W-auction-settlement-saga.md) (the `listing_id` fence this copies), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (costless field death, visit settlement), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (handoff seating), [FS-22WKC](22WKC-uniform-error-contract.md) (the error seam), FS-P9G8R (consumed items deleted at extraction; concurrent draft, see *Merge overlap*)

## Summary

A delver now carries their **bag** into a run or a field world, not only the ten worn slots.
At seating, game-service checks the delver's worn and bag items out of items-service: one
synchronous call moves them to a new item status, `IN_RUN`, tagged with the run's id, so the
marketplace (and every other write that needs an AVAILABLE item) cannot touch them while they
are in play. Everything a delver picks up inside a run is an **unsafe find**, marked in the run
UI. If the delver dies before escaping, their unsafe finds are lost and what they brought in
comes home. Escaping brings everything home as ordinary owned items. The run's settlement
releases every item tagged with its id, and a later checkout reclaims items a run never
released.

## Requirements

### A. In-run status and the run fence (items-service)

1. **New item status `IN_RUN`** beside AVAILABLE, LISTED and PENDING_SETTLEMENT. A migration
   widens `item_instances_status_check` to include it. (charter default)
2. **New nullable `run_id UUID` column** on `item_instances` (no FK: runs live in game-service).
   A CHECK constraint holds `run_id IS NOT NULL` exactly when `status = 'IN_RUN'`, and a partial
   index on `run_id WHERE run_id IS NOT NULL` serves release. Same pattern as `listing_id`
   (FS-NXP1W R8). (charter default)
3. **The run id is the world's existing id, never a new one:** a run's session id; a field
   visit's visit id (`FieldVisit.ID`). Both are already the `session_id` of that world's
   `ItemsExtractedEvent` (ADR-0031), so settlement needs no new field on the event. Reason: both
   are already the extraction event's id, and game-service's CONTEXT forbids a separate run id.
   (charter default)
4. Every reader of item status renders or passes `IN_RUN`. `ListItemInstances` returns IN_RUN
   rows as they are. The gateway's item wire enum (`wire.go`, `AVAILABLE,LISTED,IN_ESCROW,
   PENDING_SETTLEMENT`) gains `IN_RUN`, regenerated into `openapi.yaml` and the client (§API
   surface). `GetItemSummaries` carries no status and is unchanged.

### B. The checkout RPC (items-service)

5. **New gRPC `CheckOutRunGear(member_id, run_id)`** on `ItemsService`. Its response is the
   loadout-with-items shape plus a `bag` list: it embeds a `GetLoadoutWithItemsResponse` (the
   worn slots) and adds `repeated ItemInstance bag`. Proto changes go in `items.proto` and are
   regenerated, never hand-edited. Reason: one round trip under the world's lock, replacing the
   loadout read rather than adding a second call (ADR-0032 Consequences). (charter default)
6. **Owner only.** The call carries the member's bearer token, as the loadout read does today;
   a caller checking out another member's gear is refused before any write (`ensureOwner`,
   FS-4R9M9 R53). A missing or malformed `run_id` or `member_id` is `InvalidArgument`.
7. **One transaction.** The checkout set is the member's worn instances (their loadout slots)
   plus their BAG-location instances that are not worn. Each is moved to `IN_RUN` with
   `run_id` set, by a conditional write that matches status `AVAILABLE`, or `IN_RUN` under any
   run id (R9). Rows are locked for the transaction so a concurrent equip, list or move
   serializes behind it. (charter default)
8. **Not AVAILABLE stays home.** A LISTED or PENDING_SETTLEMENT instance is neither checked out
   nor returned: a worn one comes back as an empty slot, a bag one is absent. A STASH-location
   instance is never checked out (FS-VPD8Y). (charter default)
9. **Orphan reclaim.** In the same transaction, every instance of the member still `IN_RUN`
   under a *different* run id is re-tagged to this run id. A member is in one world at a time
   (ADR-0015), so such items belong to a run that crashed, was discarded, or has not settled
   yet. Reclaimed instances that are worn or in the bag are returned and seated like any other
   checked-out item; any other is re-tagged but not returned, and this run's settlement releases
   it (R29). No time-based sweeper. Reason: a field visit has no maximum length, so any TTL
   could release a live visit's items (ADR-0032). (charter default)
10. **Idempotent per member and run.** A repeat call with the same run id returns the same set
    (already IN_RUN under this id) and changes nothing.
11. **What is returned** is exactly what is now IN_RUN under this run id and worn or in the bag,
    each with `status = IN_RUN`. Bag order is the order FS-VPD8Y gives the bag (until it
    defines one, newest first, as `ListItemInstances`). The bag list is not capped at 30
    (FS-HRH2J R36). A member with no loadout row checks out an empty loadout and their bag.
12. `GetLoadoutWithItems` stays, unchanged, for every read that is not seating: the hub body
    (`AddPlayer`, `AddPlayerAt`) and the pre-queue `CheckLoadout`.

### C. Seating (game-service)

13. **Every seating into a run or a field world checks out instead of reading** (charter
    default):
    - **run seat:** `addPlayerLocked` → `fetchLoadoutLocked` checks out under the run's session
      id when the session's world type is run; a hub session keeps the plain read (R12);
    - **handoff seat:** `setupHandoffConnectingPlayer` checks out under the handoff run's
      session id, and `SeatArrival` seats from the result;
    - **field entry:** `EnterField` checks out under the visit id, and `SeatVisitor` seats from
      the result.
    `CheckLoadout` (a pre-check, not a seating) keeps the plain read.
14. **The field visit id is minted before the checkout.** `EnterField` mints it and passes it
    to `SeatVisitor`, which opens the visit under that id (today `SeatVisitor` mints it after
    the loadout read). Every other visit property is as FS-X2F2H R13. (charter default)
15. **A checkout that fails or times out keeps each path's behavior today:** a run seat is
    seated without gear and with `LoadoutUnknown` (charter default); a handoff arrival is
    refused "loadout unavailable" (FS-K2HKP R22); a field entry is refused with `errNoLoadout`
    (FS-X2F2H D27). In every case, a checkout that committed but whose reply was lost is
    released by its run's settlement (R29) or reclaimed by the member's next checkout (R9).
16. **The checkout runs after the path's own pre-checks** (handoff: the run exists, is a run and
    has not ended; field: at the gate, not queued, a field that exists), so a refused entry
    rarely leaves a committed checkout behind. The K2HKP matchmaker and `match_queue` are not
    touched.
17. **Worn items seat as today**, including over-level items carried rather than worn
    (FS-BDA7X R31). **Bag items become the body's bag after those carried items**, in the order
    returned. Seating is not capped (FS-HRH2J R36). (charter default)
18. **Reconnect does not check out again.** A delver reconnecting into a run or field keeps the
    body they have. (charter default)

### D. Unsafe finds (game-service)

19. **`ItemComponent` gains `Unsafe bool`.** Every item entity built by seating (R17) is safe.
    Every other item entity is unsafe: container and chest contents, monster drops, field
    piles. The safe case is the explicit one in code (seating opts in), so a new item source is
    unsafe without anyone remembering to mark it. (charter default)
20. **Unsafe follows the item, not the slot.** Equip, unequip, pickup and floor change keep it;
    nothing in a world clears it. Extraction makes the item an owned instance, which the next
    seating builds safe.
21. **The WS item state carries `unsafe: true`** (`omitempty`) on every serialized item: bag,
    equipment and container contents. Reconnect restores it with the next state. game-service
    owns this contract (ADR-0004): no proto, no new WS message type. Reason: it survives
    reconnect because the server holds it. (charter default)
22. The flag is set in field worlds too; the server does not special-case them. The client
    does not mark it there (R34).

### E. Death (game-service, runs only)

23. **A dead delver loses their unsafe finds.** When a run's end state is built
    (`getRawMatchState`, then `rankPlayers`), a delver whose body is eliminated
    (`HealthComponent.IsEliminated`) and who did not escape has every unsafe item removed from
    both their equipment (the slot extracts empty) and their bag. This covers a fall, a forfeit
    (FS-9K8EZ), a delver left behind on an earlier floor, and a dead delver who left early with
    `leave_run` (FS-QPDKN keeps that body for settlement). Their safe items come home as they
    stand at the run's end. An escaped delver, and one still alive and not escaped, extract
    everything. (charter default)
24. **A delver whose body is gone before the run ends** (their connection was released, so
    `RemovePlayer` ran) is absent from the event. Their checked-out items are released by the
    run id untouched (R29), and their finds are lost, as today. (charter default)
25. **Field visits never drop anything.** Field death is free (FS-X2F2H); `PublishFieldVisit`
    is unchanged. (charter default)

### F. Settlement (items-service)

26. Settlement runs inside the existing extraction transaction behind the FS-BVM9H inbox, with
    the run id read from the event's `session_id`. Run and field events settle alike.
27. **Each extracted instance is applied only if the run still owns it** (charter default):
    - **no `instance_id`** (a find): inserted, `AVAILABLE`, `run_id` NULL, location BAG;
    - **an `instance_id` that is `IN_RUN` under this event's run id**: updated as today's
      conflict update (owner, source, rarity and roll stay fixed, FS-4R9M9 R20, R53), then
      `AVAILABLE`, `run_id` cleared; an extracted bag item gets location BAG, a worn one keeps
      its location;
    - **any other `instance_id`** (re-tagged by a later checkout, already released, or unknown):
      skipped and logged; nothing is written for it.
28. **Loadout:** equipment → loadout as today, unless `loadout_unknown` is set (as today) or any
    of the member's brought-in instances was skipped by R27's fence. A skipped instance means a
    later checkout owns the member's gear, so this event's loadout is stale and is not written.
    Finds are still inserted. (write-a-spec addition, follows from the fence)
29. **Then release by run id:** every instance still `IN_RUN` with `run_id` = the event's
    `session_id`, for any member, becomes `AVAILABLE` with `run_id` cleared and location
    unchanged. This covers delvers absent from the event, checkouts whose reply was lost, and
    handoff or field entries refused after a committed checkout. (charter default)
30. **Nothing is deleted.** A checked-out item that does not come out is released, never
    deleted. Deleting consumed items belongs to FS-P9G8R. (charter default)
31. **Redelivery is harmless twice over:** the inbox drops a duplicate (FS-BVM9H), and a re-run
    would find nothing still carrying the run id.

### G. Not-in-play checks

32. **The hub loadout update refuses an item that is not AVAILABLE.** `UpdateLoadout` (gRPC) and
    `PUT /api/items/loadout` refuse equipping an instance whose status is not AVAILABLE with
    `400 · ITEM_NOT_AVAILABLE`. The status read and the slot write are atomic against a
    concurrent checkout (one transaction, the instance row locked). Clearing a slot (empty
    `item_instance_id`) is not checked. (charter default)
33. **The code crosses the gRPC hop as a registered domain code.** items-service returns gRPC
    `FailedPrecondition` with a `google.rpc.ErrorInfo` detail whose `reason` is
    `ITEM_NOT_AVAILABLE`. The gateway's one error seam (`httperr.mapError`, FS-22WKC R4–R5) keeps
    the status the gRPC code decides and uses the detail's reason as the code when it is a code
    registered in `common/errcode`; otherwise it falls back to today's generic mapping.
    `errcode` gains `ItemNotAvailable`. FS-VPD8Y's move refusal needs the same mechanism and the
    same code; whichever feature lands first builds both, once, and the other reuses them.
34. **Marketplace writes are unchanged.** Verified 2026-10-31 against
    `items-service/internal/items/repository.go`: `ReserveItemTx` requires AVAILABLE;
    `CancelReservation`, `FreezeItem` and `ReturnItem` require LISTED; `UnfreezeItem` requires
    LISTED or PENDING_SETTLEMENT; `TransferItem` requires PENDING_SETTLEMENT. Every one fails on
    an IN_RUN item as is. (charter default, verified)
35. The bag ↔ stash move refuses an IN_RUN item. That endpoint and its check belong to FS-VPD8Y.

### H. Client (game-client)

36. **In a run, an unsafe item is marked** in a bag cell and in a worn slot by an oxblood inner
    edge, distinct from the rarity edge (which stays the only rarity colour, down the left
    side). Its item tip adds the line "Found this run: lost if you die before you escape."
    wherever the tip is shown in a run. (charter default)
37. **No marking in field worlds** (`world_type` field) or in the hub. (charter default)
38. **In the hub, an IN_RUN item** (worn or in the bag) is drawn dimmed, its tip reads "Still in
    a delve.", and it cannot be equipped, unequipped or moved: the overlay sends nothing for it.
    (charter default)
39. The client `ItemState` gains `unsafe?: boolean`; the hub's `ItemInstance.status` includes
    `IN_RUN` through the regenerated client, never a hand edit.
40. The design guideline (`game-client/docs/design-guideline.md`) records the unsafe edge and the
    in-run dim beside the rarity edge, as the art spec's single source.

### Merge overlap

FS-P9G8R (concurrent draft) adds consumed item ids to the extraction event and deletes them in
the same transaction, in `ProcessItemsExtracted` / `storeExtractedPlayerItems`. This FS changes
those two functions (R26–R30) but not the extraction proto. Whichever merges second rebases
onto the other. P9G8R's deletes must run before R29's release, or a consumed IN_RUN item would
be released first and then deleted, which is the same end state but should be asserted. This FS
does not build any part of P9G8R.

## User Stories

1. As a delver, I want my bag to come into a run with me, so that I can bring potions and spare
   gear I chose in town.
2. As a delver, I want my bag to come into a field world too, so that the bag means the same
   thing everywhere I go.
3. As a delver, I want the gear I brought in to come home even if I die, so that a bad run does
   not wipe out what I own.
4. As a delver, I want to see which items I found in this run, so that I know what is at stake
   before I take a risk.
5. As a delver, I want a found item to stay marked when I equip it, so that wearing it does not
   make me forget it is at risk.
6. As a delver, I want everything I carry out through the exit to become mine for good, so that
   escaping is the goal.
7. As a delver who dies, I want to lose my run finds whether I leave early or wait for the run
   to end, so that waiting out the party is not a loophole.
8. As a delver in a field world, I want death to cost nothing, so that fields stay a gentle
   place to level and gather.
9. As a delver, I want an item I have listed on the marketplace to stay home, so that a listing
   and a run can never claim the same item.
10. As a delver, I want an item in my run to be impossible to list from another tab, so that
    nobody can sell something they are carrying.
11. As a delver whose connection drops, I want my found-item markers back when I reconnect, so
    that I still know what is at risk.
12. As a delver whose run crashed, I want my gear to come back the next time I enter a run or a
    field, so that a server failure never costs me what I brought.
13. As a delver in the hub, I want gear that is still tied up in a delve shown as locked, so that
    I understand why I cannot equip it yet.
14. As a delver in the hub, I want equipping a locked item refused with a clear reason, so that
    my loadout never points at gear that is somewhere else.
15. As a delver joining a party on another server, I want my bag to come with me, so that a
    handoff seats me exactly as a local seat would.
16. As a delver whose items-service call timed out at seating, I want to be seated as today and
    get my gear back afterwards, so that a slow service never strands my items.
17. As a delver with a bag over 30 from before the cap, I want all of it seated, so that nothing
    I own is silently left behind.
18. As a delver who escaped while a party member died, I want my finds to be safe, so that
    someone else's death does not cost me.
19. As a party member, I want a dead delver's body to stay unlootable as today, so that finds do
    not move between players by dying.
20. As the operator, I want settlement to act only on items tagged with its run, so that a late
    or replayed settlement can never release an item a newer run holds.
21. As the operator, I want a run's settlement to release every item tagged with its id, so that
    a checkout whose reply was lost never locks an item for good.
22. As the operator, I want no item ever deleted by this feature, so that its failure modes can
    only lock an item for a while, never destroy one.
23. As a developer, I want a new item source to be unsafe by default, so that a future drop path
    cannot accidentally make finds safe.

## Acceptance Criteria

- [ ] A migration adds `IN_RUN` to the status check and a nullable `run_id` with the
      `IN_RUN ⇔ run_id` constraint and a partial index; down migration reverses it.
- [ ] `CheckOutRunGear` moves the member's AVAILABLE worn and bag (non-worn BAG-location)
      instances to IN_RUN under the run id in one transaction and returns them; stash items,
      LISTED and PENDING_SETTLEMENT items are untouched and not returned.
- [ ] A second `CheckOutRunGear` for the same run returns the same set and writes nothing new.
- [ ] A checkout under a new run id re-tags the member's IN_RUN items from an older run id and
      returns the worn and bag ones.
- [ ] `CheckOutRunGear` for another member's id is refused before any write.
- [ ] A run seat, a handoff seat and a field entry each call `CheckOutRunGear` (run: session id;
      handoff: the run's session id; field: the visit id, minted first) and no longer call
      `GetLoadoutWithItems`; the hub seat and `CheckLoadout` still read.
- [ ] A seated body wears its worn items as today and carries its bag items after any
      over-level carried items, uncapped.
- [ ] A checkout timeout seats a run delver with `LoadoutUnknown`, refuses a handoff arrival
      "loadout unavailable", and refuses a field entry, each as today.
- [ ] A reconnect into a run or field makes no checkout call.
- [ ] Every item entity created outside seating has `Unsafe = true`; seated items have
      `false`; equip and unequip keep the flag; the WS item state carries `unsafe: true` only
      for unsafe items.
- [ ] At a run's end, an eliminated, non-escaped delver's extracted equipment and bag contain no
      unsafe item; an escaped delver's contain all; a field visit's settlement drops nothing.
- [ ] Settlement inserts finds as AVAILABLE in the BAG, applies a brought-in instance only while
      it is IN_RUN under the event's run id, skips any other, and then releases every remaining
      IN_RUN instance with that run id, for any member, to AVAILABLE with location unchanged.
- [ ] Settlement does not write the loadout of a member with a fence-skipped instance or with
      `loadout_unknown`.
- [ ] Settlement deletes nothing.
- [ ] `PUT /api/items/loadout` equipping an IN_RUN, LISTED or PENDING_SETTLEMENT instance answers
      `400` with code `ITEM_NOT_AVAILABLE`; clearing a slot is not refused.
- [ ] The gateway seam maps a registered `ErrorInfo` reason to its code and falls back to the
      generic mapping for anything else; existing error mappings are unchanged.
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are regenerated with `IN_RUN` in the
      item status enum, never hand-edited, and the gates pass.
- [ ] In a run, an unsafe item shows an oxblood inner edge in its bag cell and worn slot and the
      tip line "Found this run: lost if you die before you escape."; a field world shows
      neither.
- [ ] In the hub, an IN_RUN item is dimmed, its tip reads "Still in a delve.", and equip,
      unequip and move send nothing for it.
- [ ] The design guideline records the unsafe edge and the in-run dim.

## Edge States

- **Item LISTED or PENDING_SETTLEMENT at seating:** stays home. A worn listed item seats as an
  empty slot; the run's settlement then writes that slot empty, so the item is no longer worn
  when its listing ends.
- **Checkout commits, reply lost (timeout):** the run delver is seated bare with
  `LoadoutUnknown`; the items are IN_RUN under this run id and are released by this run's
  settlement (R29). The handoff or field entry is refused; its items wait for a settlement that
  may never come (a refused field entry opens no visit) and are reclaimed by the member's next
  checkout (R9). Until then the hub shows them locked.
- **Seat refused after a committed checkout** (`SeatArrival` no seat, `SeatVisitor` already
  here): same as above. The pre-checks (R16) make it rare.
- **Pod crash mid-run:** no settlement. Items stay IN_RUN until the member's next checkout; finds
  are lost (they never existed in items-service). A member who never plays again leaves them
  locked (ADR-0032 accepts this).
- **A run shut down empty** (the last delver's connection released, `Shutdown` without
  `endSession`): no settlement is written today, so the same as a crash. See *Out of Scope*.
- **Back in the hub before settlement lands:** worn and bag items show locked ("Still in a
  delve.") and finds are not there yet, until the extraction is consumed and the overlay
  re-reads. This is the normal case after every run for a short time, not only after a crash.
- **Next world entered before the last one settled:** the checkout reclaims the IN_RUN items and
  seats them from the pre-settlement state. The late settlement then skips them (R27) and does
  not write the loadout (R28); its finds are still inserted into the bag. Nothing is
  duplicated or lost.
- **Two settlements out of order:** the fence makes the older one a no-op for brought-in items.
- **Reconnect:** no checkout; the body and its unsafe flags survive (R18, R21).
- **Bag over 30 at seating (legacy):** seated in full (HRH2J R36); pickups into it are refused
  as today.
- **Unsafe item equipped, then the delver dies:** lost (R20, R23).
- **Delver escapes, then a party member dies:** the escaped delver extracts everything (R23).
- **Dead delver's body:** not lootable in v1; players cannot drop items.
- **Concurrent equip and checkout:** the row locks serialize them. An equip that wins is
  checked out with the new loadout; a checkout that wins makes the equip fail
  `ITEM_NOT_AVAILABLE`.
- **Concurrent list and checkout:** the conditional writes serialize them; the loser fails as
  `ReserveItem` or the checkout's no-op.
- **Unknown or deleted instance in the loadout:** an empty slot, as `GetLoadoutWithItems` does
  today.
- **Extraction carries an instance id owned by someone else:** cannot carry this run id, so it
  is skipped.
- **Field visit settles:** same release and fence, nothing dropped (R25, R26).
- **Unauthorized checkout:** refused, nothing written (R6).

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| Check out run gear (internal, gRPC, items-service) | `ItemsService.CheckOutRunGear` | — | `member_id` (uuid string, required; must be the token's member), `run_id` (uuid string, required: the run's session id or the field visit id) | `CheckOutRunGearResponse { loadout: GetLoadoutWithItemsResponse; bag: repeated ItemInstance }`, every returned instance `status = IN_RUN` | `InvalidArgument` malformed ids · `PermissionDenied` another member's gear · `Unavailable` store down |
| Update loadout (existing) | `PUT /api/items/loadout` | — | unchanged (`slot`, `item_instance_id`) | unchanged | adds `400 · ITEM_NOT_AVAILABLE` (equipping an instance that is not AVAILABLE); existing rows unchanged |
| List my item instances (existing) | `GET /api/items/instances` | unchanged | — | unchanged; `status` enum gains `IN_RUN` | unchanged |

WS (game-service contract, not HTTP, ADR-0004): every item state gains `unsafe` (boolean,
omitted when false). No new message type.

## Out of Scope

- Deleting consumed items, and the extraction proto's consumed ids (FS-P9G8R).
- A time-based or liveness sweeper for orphaned IN_RUN items (ADR-0032 rejects it for v1).
- Settling a run that is shut down empty without `endSession` (today it writes no event).
  Its items wait for the next checkout like a crash's. A release on that path is a follow-up.
- A gear-escrow saga, coordinator or compensation workflow (ADR-0032).
- Looting a dead delver's body, or dropping items (players cannot drop).
- Changing marketplace-service or the marketplace's item writes (R34).
- The bag ↔ stash move, the `location` column, the stash and the hub overlay's bag-only view
  (FS-VPD8Y).
- Unsafe marking in field worlds or a field death penalty (FS-X2F2H).
- Refusing to clear a loadout slot whose item is IN_RUN; settlement rewrites the loadout, and
  clearing a pointer duplicates nothing.
- The K2HKP matchmaker and `match_queue` (user-owned).
- Any change to FS-4R9M9's text.

## Review notes (2026-11-01)

Recorded from the code review. No requirement above changes.

- **R28's guard is narrow.** It trips only when a brought-in instance was fence-skipped (R27).
  A member whose late event carries no brought-in instance gets a stale loadout written, and
  it stays until their next settlement writes the right one. Nothing is lost. A stronger guard,
  skipping the loadout when the member has any IN_RUN item under another run id, is a
  follow-up.
- **Rollout.** A run seated by the old game-service (no checkout) settles under the new
  items-service with every brought-in item fence-skipped and the loadout not written. Nothing
  is lost or duplicated, but equip changes made in that run are dropped. Deploy items-service
  first, ideally while no runs are in flight.
- **Container views show no "Found this run" line.** A tip in a container view leaves out
  R36's line: those items are not the player's yet. This is a deliberate reading of R36, which
  marks the delver's own bag cells and worn slots.
