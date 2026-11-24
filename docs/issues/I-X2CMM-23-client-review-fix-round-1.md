---
id: I-X2CMM-23
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-13", "I-X2CMM-22"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 23: client review fix round 1 (one aim at a time, server-sent cooldown words) and the used-up rune"
---
Implements FS-X2CMM §F R32, §G R37–R38, §H R40–R41, §E R24

**Author: agent**

## What to Build

Fixes from `/code-review` of the wave-1 client diff (`fe3282c1...` I-X2CMM-12), both axes, plus
one server LOW from the server re-review. See FS-X2CMM "Reconciled at review" for the decisions.

1. **One aim at a time (MED).** In `PlayerCombat` (`src/render/combat/playerCombat.ts`),
   `pressPage` ignores a running Shadow Shot hold or Arrow Rain aim, and `treeAbility` ignores an
   armed page: an archer can have the page reticle and the Arrow Rain circle live together, and
   releasing 3 fires `arrow_rain` while the page is armed (FS-04EEA "one hold at a time"). Make
   them exclusive: pressing a page while a hold or rain aim runs is refused (or cancels it), and
   pressing 3 or the right button while armed disarms first. Test both orders.
2. **No whole-panel rebuild on a state flip (MED).** Moved to the open tome (FS-X2CMM §Change:
   Illuminated pages and the open tome, C7; I-X2CMM-25), which redraws the panel anyway. Not
   done here.
3. **Server-sent cooldown words (MED, spec).** Server: each `current_player.book.pages[]`
   entry gains `cooldown_length` (seconds; 0 for a limited page) and `limit` (`"floor"` |
   `"delve"`, omitted for a timed page), from the `classBooks` table (`internal/serializer/book.go`,
   `internal/types/book.go`). Client: the tip reads them ("45 s", "Once a floor", "Once a delve");
   drop the hard-coded `recovers` strings from `src/data/classBooks.ts`.
4. **Book order (LOW).** `bookView` sorts the wire pages by the client's book order.
5. **Spent look (LOW).** Keep `dim` with the "spent" caption (FS amended); nothing to change
   beyond a test that asserts it.
6. **Pigments only via `palette.bookPigment` (LOW, ADR-0094).** `palette.bookEffect` reads
   `BARROW_HEX.pigment*` directly; read them through `palette.bookPigment`.
7. **Reticle shape by data, not id (LOW, OCP).** Replace `if (reticle.page === "call_the_hound")`
   in `pageReticle.ts` with a `reticleShape` field in `PAGE_COPY`.
8. **One fallback cell (LOW).** `BarrowspireScene` has `DEFAULT_CELL = 80` and `BOOK_CELL = 80`;
   keep one.
9. **Disarm tests (LOW).** Scene tests for disarm on death, floor change, leaving the run and
   another window opening, and the cast bar staying owner-only while watching a teammate.
10. **Per-frame allocation (LOW).** Build the armed aim's allies list once per state tick, not per
    frame; reuse the sweep polygon scratch if cheap.
11. **Used-up rune sent once more (LOW, server).** A rune removed on its third catch is still in
    the tick's snapshot and is broadcast once more; treat a rune with 3 catches as gone in
    `BookEffectExpired` (or equivalent). Also fix the stale "as a retaliation is held" comment in
    `book_long_night_test.go`. Test it.
12. **Hound slice findings**, if the review of I-X2CMM-13 adds any, are listed here by the
    coordinator before this issue starts.

## Acceptance Criteria

- [ ] Each item fixed; tests for 1, 3, 4, 9 and 11.
- [ ] Server: `make test` green, `go vet ./...` clean, `gofmt -l` clean on touched files.
- [ ] Client: `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-X2CMM-13, I-X2CMM-22

## Spec Reference

FS-X2CMM §F R32 and "Reconciled at review"; §G R37–R38; §H R40–R41; §E R24.

## TDD Approach

- RED: an armed archer pressing 3 does not raise the Arrow Rain circle.
- GREEN: exclusivity in `PlayerCombat`.
