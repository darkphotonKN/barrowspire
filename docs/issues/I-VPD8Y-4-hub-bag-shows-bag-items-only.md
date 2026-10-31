---
id: I-VPD8Y-4
status: done
implements: FS-VPD8Y
blocked_by: [I-VPD8Y-1]
labels: []
title: "FS-VPD8Y slice 4: the hub bag shows only bag-location items and a full bag refuses unequip"
---
Implements FS-VPD8Y §D Requirements 27–30

**Author: agent** (charter default)

## What to Build

The reported bug fixed in the client: the hub overlay's bag is the account's bag, not its whole
collection.

- `loadHubGear` (`game-client/src/ui/HubGear.ts`): loadout ids in slots; `location: "bag"`
  instances not worn → bag; `location: "stash"` instances not worn → a `stash` list returned
  alongside (unused until slice 5); REST order kept (R27). An instance with no `location` goes to
  the bag (R28).
- Hub unequip pre-check (amends FS-HRH2J R44): with 30 or more in the bag, unequip is not sent and
  the hub notice shows "Your bag is full."; a swap is always sent (R29).
- A refused `updateLoadout` whose `ApiError.code` is `BAG_FULL` shows "Your bag is full."; any
  other refusal keeps "Could not change your gear."; both reload (R29, FS-HRH2J R43).
- Over-capacity bag rendering (FS-HRH2J R23) unchanged (R30).
- Update the `HubGear.ts` header comment that says every other instance is the bag.

## Acceptance Criteria

- [ ] Hub bag lists only `bag` items not worn; `stash` items are not in it.
- [ ] An instance without `location` shows in the bag.
- [ ] Hub unequip with 30 in the bag sends nothing and shows "Your bag is full."; a swap is sent.
- [ ] A `BAG_FULL` refusal shows "Your bag is full." and reloads.
- [ ] `HubGear.test.ts` covers each case; the client test suite passes.

## Blocked By

I-VPD8Y-1 (`location` in the generated client types)

## Spec Reference

FS-VPD8Y §D R27–R30; §Edge States (gateway without `location`). User stories 1, 22–23.

## TDD Approach

- RED: `loadHubGear` test with mixed `bag`/`stash`/missing locations; HubGear test that unequip at 30 calls no API and notices.
- GREEN: filter by location; pre-check in the unequip path; code switch on refusal.

## Files it expects to touch

`game-client/src/ui/HubGear.ts`, `game-client/src/ui/HubGear.test.ts`
