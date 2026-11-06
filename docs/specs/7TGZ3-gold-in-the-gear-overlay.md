# FS-7TGZ3: Gold in the gear overlay

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Character" → "Gold in the gear overlay" → this FS · Surface: game-client only · Builds on: [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (the overlay: one implementation for every world, R12; the right panel, §B; the hub reads REST on every open, R41), [FS-VPD8Y](VPD8Y-town-stash.md) (stash mode keeps the right panel), [FS-1GZGD](1GZGD-in-game-mailbox.md) (a Take credits a gold enclosure to the wallet before it answers, D5, D16), [FS-8EGFA](8EGFA-marketplace-web-page.md) (`GET /api/wallet/account`, `formatGold`, "—" for a purse not read) · Related ADRs: [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md) (the wallet account is created after signup, so a 404 means "not yet"), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas palette) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) *Purse line* (added by this FS)

> **Decision provenance.** The owner (Nick) approved every default in the 2026-11-06 brief:
> placement, which number, the tip, every world, when to read, and the failure display. Each is
> marked **(approved default)**. Where the brief left a point open, the smaller choice was taken
> and marked **(v1 pick)**.

## Summary

The player cannot see their gold anywhere in the game: it shows only in a letter's enclosures
and on the web marketplace page. The gear and bag panel gets a **purse line** under the bag
grid: the coin icon and the account's total gold, digit-grouped. Hovering it shows what is
available and what is held in bids. It is read from the existing wallet endpoint each time the
overlay opens, in the hub, a run and a field world, and again after the mailbox takes a letter
that carries gold. A failed read or a wallet that does not exist yet shows "—", with no toast.
No endpoint, contract or server change.

## API surface

None changed. The client reads the existing `GET /api/wallet/account` (`get-wallet-account`,
`apiClient.getWalletAccount`): `gold` (total), `heldGold`, `availableGold`, all int64.

| Case | Response | Purse line |
|---|---|---|
| account read | `200` | the total, with its tip |
| account not created yet (just after signup) | `404 · NOT_FOUND` | "—", no tip |
| any other failure (gateway down, network) | any | "—", no tip |

## Requirements

### A. The purse line

1. **Placement (approved default).** In the right panel, under the bag grid and above the hint
   line: the baked `coins` item icon (`src/render/art/itemIcons.ts`, the icon a letter's gold
   enclosure wears), then the amount. It is left-aligned with the grid. Its height is reserved
   in the panel layout, so it never overlaps the grid, a scrolled over-capacity bag (FS-HRH2J
   R23) or the hint.
2. **Look.** Game palette world panel (design-guideline "UI Chrome"): the amount in the vellum
   HUD text tone, 12 px, as the bag count beside "BAG". It takes no amber (amber means
   interactable) and no rarity colour. **(v1 pick.)**
3. **The amount (approved default)** is `gold`, the account total, digit-grouped by
   `formatGold` (`src/marketplace/gold.ts`, reused, not copied). `src/ui` already reads
   `@/marketplace` modules (`characterSheet.ts`), so the function stays where it is and keeps its
   tests. **(v1 pick: no move needed.)**
4. **Every world (approved default).** The line shows wherever the overlay opens: the hub
   (`HubGear`), a run and a field world (`EquipmentHud`), and in stash mode, since the right panel
   is the same (FS-VPD8Y R35).

### B. The tip

5. **Hovering the line shows a tip (approved default):**
   `Available <availableGold> · Held in bids <heldGold>`, both grouped by `formatGold`. Plain
   words, as the panel's other strings (game-client/CONTEXT.md, no lore in what the player acts
   on). A held amount of 0 still reads "Held in bids 0".
6. The tip is a small game-palette box beside the pointer, placed as the item tips are
   (`itemTipRow`): flipped or pushed in where it would leave the screen. It goes when the pointer
   leaves the line. The line takes no click and no right-click, and `E` over it does nothing.
7. While the line reads "—" it shows no tip.

### C. When it is read

8. **Every open reads it (approved default).** Each time the overlay opens, in every world,
   stash mode included, the client asks `GET /api/wallet/account` once. Gold cannot change
   inside a run, but the run reads it on open as well; one read per open is cheap.
9. **After a Take that carries gold (approved default).** When the mailbox takes a letter with a
   gold enclosure (FS-1GZGD R39), the hub reads the purse again. The claim credits the wallet
   before it answers (FS-1GZGD D16), so the read sees the new total. This holds whether or not
   the overlay is open; while it is closed the read only updates what the next open shows first.
10. **Until an answer lands** the line keeps what it last showed, "—" before the first answer
    of the scene. **(v1 pick: no loading word; the line never flickers on reopen.)**
11. **The latest read wins.** An answer that lands after a later read was started is dropped,
    so a slow early answer never overwrites a newer total.

### D. Failure

12. **A failed read, or a 404, shows "—" (approved default).** No toast, no notice, no retry
    timer; the next open reads again. A 404 is expected just after signup and logs nothing; any
    other failure logs one console warning.
13. A failed read after an earlier success shows "—" too: the line never shows a total it could
    not confirm on this open.

### E. Verification

14. Nick checks it in a real browser (issue I-7TGZ3-3).

## User Stories

1. As a player in the hub, I want to see my gold when I open my gear, so that I know what I can spend at the marketplace without leaving the game.
2. As a player in a run or a field world, I want the same purse line, so that the overlay reads the same everywhere.
3. As a player with open bids, I want to hover my gold to see what is available and what is held, so that I understand why I cannot spend all of it.
4. As a player who just took a letter's gold, I want my purse to show the new total, so that the gift is visibly mine.
5. As a new player whose wallet is still being made, I want a quiet "—" instead of an error, so that a few seconds of setup never looks broken.
6. As a player on a flaky connection, I want a failed read to show "—" without a toast, so that the overlay never nags me about something I cannot fix.

## Acceptance Criteria

- [ ] The right panel shows the coin icon and the total gold, digit-grouped, under the bag grid and above the hint, in the hub, a run, a field world and stash mode.
- [ ] The purse line never overlaps the grid, a scrolled over-capacity bag or the hint, at 1080×720 and at a short window.
- [ ] Hovering the line shows "Available X · Held in bids Y"; leaving it hides the tip; "—" has no tip.
- [ ] Every open of the overlay sends one `GET /api/wallet/account`.
- [ ] Taking a letter with a gold enclosure reads the purse again; a letter without gold does not.
- [ ] A 404 or any failed read shows "—"; no toast or notice shows.
- [ ] A read answered after a later one started is dropped.
- [ ] No change under `src/api/generated`, no new endpoint, no server change.
- [ ] `npx vitest run` and `npx tsc --noEmit` pass.

## Edge States

- **Wallet not created yet (404):** "—"; the next open reads again.
- **Zero gold:** "0", tip "Available 0 · Held in bids 0".
- **Large totals:** grouped ("9,007,199,254,740,991"); the line has the grid's width to grow into.
- **All gold held:** total shown, tip "Available 0 · Held in bids N".
- **Closed before the answer lands:** the answer is kept for the next open, which reads again.
- **Reopened quickly:** each open reads; only the latest answer shows.
- **World switch:** the next world's overlay starts at "—" and reads on its first open.
- **Signed out (401):** the client's usual sign-out redirect; nothing purse-specific.

## Verification (2026-11-06, agent, headless Chrome on its own dev server, port 3961)

A fresh local account (wallet 0 gold, welcome letter with 100 gold), archer, in the hub at a
1280-wide logical view. Opening the overlay read the wallet once and showed the coins icon and
"0" under the bag grid, above the hint; hovering it showed "Available 0 · Held in bids 0".
Taking the welcome letter read the wallet again. Reopening showed "100", with the tip
"Available 100 · Held in bids 0", and each open read the wallet once. Not checked by the agent:
a run, a field world, stash mode, held gold, the "—" of a real outage (all left for
I-7TGZ3-3; the unit tests cover the logic). The gateway's CORS admits only port 3938, so the
headless profile ran with web security off; nothing on the server was changed.

## Out of Scope

- A purse anywhere else in the canvas (HUD, menus, the letter panel).
- Live updates from the server (no push, no polling).
- Any endpoint, OpenAPI, generated client, wallet-service or gateway change.
- Showing the available amount as the headline number, or spending gold from the overlay.
