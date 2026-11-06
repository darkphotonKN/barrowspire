---
id: I-3R77D-3
status: open
implements: FS-3R77D
blocked_by: [I-3R77D-1, I-3R77D-2]
labels: [blocked]
title: "FS-3R77D slice 3: browser check of stash-only listing (HITL, Nick)"
---
Implements FS-3R77D §Acceptance Criteria "Browser check (Nick)", §Edge States (relic moved to the bag after the drawer opened)

HITL: needs Nick with the local stack (items, marketplace, api-gateway under air) and the web
client running, after I-3R77D-1 and I-3R77D-2 are merged.

## What to Check

1. In town, put one relic in the stash, keep one in the bag, wear one, and have one listed.
2. Open the web marketplace and "List a relic": only the unworn, AVAILABLE stash relic is shown.
   The bag, worn and listed relics do not appear. Nothing is greyed or tagged.
3. List it: it posts and appears under Mine.
4. With no listable stash relic left, reopen the drawer: "Nothing in your stash to list. Move a
   relic into your stash in town." and submit is disabled.
5. Move a relic from the bag into the stash in town, reopen the drawer: it shows and lists.
6. Open the drawer, then move the shown stash relic to the bag in town, then submit it: "Only
   relics in your stash can be listed. Move it into your stash in town."

## Acceptance Criteria

- [ ] Steps 2–6 behave as written.

## Blocked By

I-3R77D-1, I-3R77D-2

## Spec Reference

FS-3R77D §Acceptance Criteria "Browser check (Nick)"; User Stories 1–8.
