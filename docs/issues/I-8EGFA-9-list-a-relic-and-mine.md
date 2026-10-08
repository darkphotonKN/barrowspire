---
id: I-8EGFA-9
status: done
implements: FS-8EGFA
blocked_by: [I-8EGFA-1, I-8EGFA-5, I-8EGFA-7]
labels: [ready-for-agent]
title: "FS-8EGFA slice 9: list a relic and the Mine filter"
---
Implements FS-8EGFA §Requirements 23, 25, 29

## What to Build

### All / Mine toggle

- The toggle is shown only to signed-in delvers.
- **Mine** loads `list-my-listings` in every status and applies the status labels from slice 6.
  An ended listing reads "Ended — awaiting settlement".
- When Mine is empty, it shows "You have nothing listed." with a "List a relic" action.

### List a relic drawer

"List a relic" is the primary CTA and is shown only when signed in.

- **Picker:** the delver's `list-item-instances`, laid out as a card grid.
  - `AVAILABLE` items can be selected.
  - `LISTED` and `IN_ESCROW` items are disabled and tagged "Listed" or "In escrow".
  - If nothing can be listed, show a message and disable submit.
- **Start price:** a whole number, 1 or more.
- **Duration:** presets of 1h, 12h, 24h and 3d. The client computes `endsAt` from the chosen
  preset.
- **Submit:** calls `create-listing`.

### Posted poll

- On 202, show "Posted — your listing will appear in a moment." and switch the view to Mine.
- Refetch every 1.5s, up to 8 times, until a listing with that `itemId` is ACTIVE.
- If it never appears, show "Still processing — refresh in a minute".
- Refetch the instances whether the poll succeeds or gives up.
- The poll lives in a pure module with tests, with the clock and the fetcher injected.

### Errors

| Response | Message |
|---|---|
| 500 on create | "That relic can't be listed right now — it may already be listed." |
| 400 for an `endsAt` in the past | "That end time has already passed — check your clock" |

### Client plumbing

Add new `apiClient` methods in `src/utils/api.ts` for:
- create-listing
- list-my-listings
- list-item-instances

## Acceptance Criteria

- [ ] As `aldric@`, listing the Longsword for ⟡50 over 1h shows "Posted". It then appears under Mine within the poll window, and the Longsword shows "Listed" in the picker.
- [ ] Mine shows listings in every status with the right labels. An ended ACTIVE listing reads "Ended — awaiting settlement".
- [ ] When signed out, the toggle and "List a relic" are absent, and "Sign in to list" appears instead.
- [ ] The poll module's tests cover the listing being found on attempt n, and the poll giving up.
- [ ] Lint, fence, token check and tests pass.

## Blocked By

- I-8EGFA-1 (item status)
- I-8EGFA-5 (enriched my-listings)
- I-8EGFA-7 (page and table)

## Spec Reference

- FS-8EGFA §Requirements 23, 25, 29.
- FS-8EGFA §Edge States: empty Mine, no listable items, a listing that is posted but never appears, clock skew.
- User stories 19–24.
