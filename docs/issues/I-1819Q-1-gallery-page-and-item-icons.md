---
id: I-1819Q-1
status: done
implements: FS-1819Q
blocked_by: []
labels: []
title: "FS-1819Q slice 1: the /dev/gallery page with the item-icon grid (game-client)"
---
Implements FS-1819Q §A, §B (R5, R6, R8), §C

## What to Build

The gallery page itself, with its first tracked family. The effects section lands in slice 2. Build the page so a second section slots in without reshaping it.

- **Route** (R5, R6): `src/app/dev/gallery/page.tsx`, rendering in `next dev` and answering **404 in a production build** (the route returns not-found, not a hidden link). The page body is a client component under `src/dev/gallery/`.
- **Family list** (R3): `src/dev/gallery/families.ts` lists exactly `effects` and `item-icons`, the one place the tracked families are named. The page renders a section per family; `effects` can show a placeholder until slice 2.
- **Item-icon grid** (R9): reads `ITEM_ICONS` directly, one cell per icon drawn with `iconCrop` and the art manifest (loaded as `components/ItemIcon.tsx` does), with the name under it. No per-icon list in the gallery.
- **Leave the shimmer throwaway in place.** R7's deletion is slice 2's: the throwaway was never committed, and slice 2 reads its scene recipe before removing it.
- **CLAUDE.md pointer** (R1, R2, R4): a short "Dev gallery" section in `game-client/CLAUDE.md` giving the page, the family list's location, the registry-not-docs rule, and the same-change rule ("adding an effect? add a card in `src/dev/gallery/effects.ts`").
- **Vocabulary**: add "tracked family" and "gallery card" to `game-client/CONTEXT.md` with the FS's one-line definitions.
- Styling inside the token fence (R8). No polish beyond that.

Files expected: `game-client/src/app/dev/gallery/page.tsx`, `game-client/src/dev/gallery/families.ts`, `game-client/src/dev/gallery/Gallery.tsx` (or similar), `game-client/src/dev/gallery/ItemIconGrid.tsx` (or similar), `game-client/CLAUDE.md`, `game-client/CONTEXT.md`.

## Acceptance Criteria

- [ ] `next dev`: `/dev/gallery` shows one named cell per `ITEM_ICONS` entry.
- [ ] Production build: `/dev/gallery` answers 404.
- [ ] A temporary extra name in `ITEM_ICONS` appears (generic fallback if unbaked) with no gallery edit.
- [ ] Manifest load failure: cells show an empty well with names still visible.
- [ ] `families.ts` lists exactly `effects` and `item-icons`.
- [ ] `game-client/CLAUDE.md` has the "Dev gallery" section with R1 and R2.
- [ ] Token-fence lint and the vitest suite pass; no new dependencies; no `game-server/` change.

## Blocked By

None

## Spec Reference

FS-1819Q §A R1–R4, §B R5, R6, R8, §C R9; User Stories 2, 5, 6, 9, 10; Edge States (manifest fails, unbaked icon).

## TDD Approach

- RED: a test that the grid's cell list equals `ITEM_ICONS` (names, order); a test that the page answers not-found when `NODE_ENV` is `production`.
- GREEN: the grid maps `ITEM_ICONS`; the route gates on the build environment.
