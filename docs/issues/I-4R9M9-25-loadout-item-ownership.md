---
id: I-4R9M9-25
status: open
implements: FS-4R9M9
blocked_by: [I-4R9M9-24]
labels: [ready-for-agent]
title: "A loadout can only hold the member's own items"
---
Follow-up from the final code review (2026-10-10), under the user decision "items-service verifies the caller owns what they read or change". Not yet scheduled.

`UpdateLoadout` (items-service service.go, repository.go:~757-791) never checks that each `ItemInstanceId` belongs to the member, and no DB constraint enforces it; `GetLoadoutWithItems` (service.go:~965-999) hydrates without an owner filter. A member can slot another member's item id and see/carry it into a run. Fix: refuse foreign or non-AVAILABLE instances on UpdateLoadout (and filter by owner on hydration); test both.
