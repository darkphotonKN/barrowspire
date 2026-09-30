---
id: I-8EGFA-8
status: done
implements: FS-8EGFA
blocked_by: [I-8EGFA-2, I-8EGFA-4, I-8EGFA-7]
labels: [ready-for-agent]
title: "FS-8EGFA slice 8: listing detail and bidding"
---
Implements FS-8EGFA §Requirements 24, 26, 27, 29

## What to Build

### The detail dialog

Activating a row opens a detail dialog. The dialog refetches the listing through `get-listing`.

- **Content:**
  - full stats and the description;
  - the start price, current price, minimum bid and bid count;
  - the end time, both absolute and relative.
- **Behaviour:** focus is trapped inside the dialog. Esc and the close control dismiss it, and
  focus returns to the row.

### Who sees what

- **Signed out:** "Sign in to bid" instead of the bid box.
- **The listing's own seller:** "Your listing" and no bid box.
- **Any other signed-in delver:** the bid box.

### The bid box

- It is pre-filled with `minimumBid`. `availableGold`, from `get-wallet-account`, is shown beside
  it.
- Submit is disabled when the amount is below `minimumBid` or above `availableGold`. Put this
  rule in a pure module with tests.
- Each submit mints one `Idempotency-Key` UUID, and a retry of the same bid reuses it.
- On 201, refetch the listing and the wallet, then show "Your bid of ⟡N leads." Never read the
  empty response body.
- When the countdown reaches zero, the bid box disables and reads "This auction has ended".

### Error copy (req 29)

| Response | What the user sees |
|---|---|
| 400 `VALIDATION_FAILED` | Refetch first, then "Someone bid higher — the minimum is now ⟡N." |
| 400 `FAILED_PRECONDITION` | "Not enough gold" if `availableGold < amount`, otherwise "This auction has ended." |
| 409 | "Someone bid at the same moment — try again." |
| 404 from the wallet | "Your purse isn't ready yet — try again shortly." Bid is disabled. |

### Client plumbing and styling

- Add to `src/utils/api.ts`:
  - `apiClient` methods for place-bid and for the wallet;
  - a `publicClient` method for get-listing.
- Amber appears only on the Bid CTA and the focal price.

## Acceptance Criteria

- [ ] Brenna bids on Aldric's Longsword (start ⟡50) as `brenna@`:
  - the box pre-fills 50;
  - bidding 50 leads;
  - the price shows ⟡50;
  - her available gold drops by 50.
- [ ] Corwin then opens the same listing as `corwin@`: the box pre-fills 51, and bidding 51 leads.
- [ ] A stale dialog that submits below the new minimum shows "Someone bid higher — the minimum is now ⟡N" with the correct N.
- [ ] A rapid double submit sends the same Idempotency-Key on both requests, and only one bid results.
- [ ] Aldric sees "Your listing" and no bid box on his own listing.
- [ ] The focus trap, Esc, and returning focus to the row all work.
- [ ] The bid-box rule module has Vitest tests.
- [ ] Lint, fence, token check and tests pass.

## Blocked By

- I-8EGFA-2 (wallet)
- I-8EGFA-4 (get-listing)
- I-8EGFA-7 (page and table)

## Spec Reference

- FS-8EGFA §Requirements 24, 26, 27, 29.
- FS-8EGFA §Edge States: wallet 404, the listing ending while the dialog is open, being outbid while viewing, 409, the viewer's own listing, large gold amounts.
- User stories 9 and 11–18.
