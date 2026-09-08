---
id: I-0051
status: open
implements: FS-0008
blocked_by: [I-0050]
labels: [blocked]
title: "FS-0008 slice 7: storekeeper NPC opens the loadout"
---
Implements FS-0008 §Requirements 29-30

**Author: agent**

## What to Build

The second function NPC. Interacting with the storekeeper opens the loadout UI; the loadout is
no longer reachable from the main menu.

The loadout stays **REST-only** — `getItemInstances`, `getLoadout`, `PUT /api/items/loadout`.
**No new endpoints and no new WebSocket actions.** `LoadoutScene` already exists and already
talks to those; this slice changes how it is reached, not what it does.

Reuses the function-NPC machinery from I-0050.

**Decide and proceed** (marked AFK deliberately): the storekeeper's dialogue line, in the same
lore voice.

Watch the existing hazard: equipment slot naming diverges between backend
(`chest`/`gloves`/`legs`) and frontend (`body`/`hands`/`feet`), mapped in two places. Do not add
a third mapping site.

## Acceptance Criteria

- [ ] Interacting with the storekeeper NPC opens the loadout.
- [ ] Equipment changes made there persist via the existing REST endpoints.
- [ ] The loadout cannot be reached from the main menu.
- [ ] No new HTTP endpoint and no new WebSocket action was added.
- [ ] The storekeeper is at a fixed position, identical for two different clients.
- [ ] `go test ./...` passes and `golangci-lint run` is clean.

## Blocked By

I-0050 — function NPC placement, interaction and dialogue land there.

## Spec Reference

FS-0008 §Requirements 29-30. Note FS-0008 has no §API surface section: this feature changes no
HTTP contract.

## TDD Approach

- RED: assert the main menu exposes no loadout entry point.
- GREEN: entry removed, storekeeper interaction opens `LoadoutScene`.
