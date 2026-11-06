---
id: I-7TGZ3-1
status: open
implements: FS-7TGZ3
blocked_by: []
labels: []
title: "FS-7TGZ3 slice 1: the purse line under the bag, read from the wallet on every open of the overlay, in the hub, a run and a field world (game-client)"
---
Implements FS-7TGZ3 §A, §B, §C R8, R10–11, §D

**Lane: agent (AFK).** Branch `feat/client-gear-gold`.

## What to Build

- `gearOverlayLayout.ts`: the gear panel reserves a purse row under the bag grid and above the
  hint; `gearPanelLayout` returns its rect. The grid's bottom moves up by the row's height.
- `src/ui/purse.ts` (Phaser-free): `purseView(account)` (the total by `formatGold`, the tip
  "Available X · Held in bids Y", "—" and no tip without an account) and `PurseReader`, which
  reads `getWalletAccount`, hands the view to its shelf, shows "—" on a 404 or any failure with
  no notice, and drops an answer a later read has overtaken.
- `GearOverlay` draws the line (coins icon + amount) and the tip on hover; `setPurse(view)`.
- `EquipmentHud` and `HubGear` read the purse on every open (`toggle`, `openStash`); the run,
  field and hub scenes compose a `PurseReader` over their overlay and `apiClient`.

## Acceptance Criteria

- [ ] Layout tests: the purse row is under the grid, above the hint, inside the panel, at 1080×720, a short window and an over-capacity bag.
- [ ] `purseView` tests: grouping, the tip copy, zero and all-held, "—" without an account.
- [ ] `PurseReader` tests: a read shows the total; 404 and other failures show "—" with no notice; a stale answer is dropped; a failure after a success shows "—".
- [ ] `GearOverlay` tests: the line draws the total and the coins icon; hover shows the tip and leaving hides it; "—" shows no tip; the line takes no right-click or `E`.
- [ ] `EquipmentHud` and `HubGear` tests: each open (stash mode too) reads once; closing reads nothing.
- [ ] `npx vitest run`, `npx tsc --noEmit` pass.

## Blocked By

None.

## Spec Reference

FS-7TGZ3 §A R1–4, §B R5–7, §C R8, R10–11, §D R12–13, §Edge States.
