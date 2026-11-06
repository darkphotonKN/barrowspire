# SPECIFICATION — items-service

<!-- Thin capability index: one line per capability, grouped by bounded context.
     Format authority: /docs/specs/README.md — capability names only, no design detail;
     sections are bounded contexts, never status; status is the checkbox ([x] shipped, [ ] not).
     Populate with /spec-bootstrap (from existing code) or /scope-it (for new work).
     Deep feature specs live in the root docs/specs/ as FS-NNNN. -->

## items-service

## Catalogue

- [x] Fantasy base-item catalogue and rarity tiers → FS-F8T3H
- [ ] Item levels and level-gated bases → FS-4R9M9
- [ ] Fabled unique catalogue → FS-4R9M9
- [ ] Ring item type → FS-4R9M9

## Inventory

- [x] Listing status on owned instances → FS-8EGFA
- [x] Item summaries by id → FS-8EGFA
- [ ] Affixes and item level on owned instances → FS-4R9M9
- [x] Bag and stash locations on owned instances → FS-VPD8Y
- [x] In-run status on owned instances → FS-18Z5F
- [x] Worn items refused for listing → FS-HBXZN
- [ ] Per-seller listed-item cap → FS-XEDFF
- [ ] Only stash items reserved for listing → FS-3R77D

## Grants

- [x] Idempotent item grants into the stash → FS-1GZGD
- [x] Item snapshots from templates and instances → FS-1GZGD

## Marketplace reservation

- [ ] Reservation confirm and release by listing → FS-04ZB6
- [ ] Page through stale reservations → FS-9BJCP

## Marketplace settlement

- [ ] Settlement saga activities → FS-NXP1W

## Run extraction

- [x] Deduplicated extracted-items consumption → FS-BVM9H
- [x] Settle checked-out items at run end → FS-18Z5F
- [x] Consumed items removed at extraction → FS-P9G8R
- [ ] Settle one player of a run without releasing the rest → FS-GV8WN
- [ ] Apply a run settlement on request → FS-GV8WN
