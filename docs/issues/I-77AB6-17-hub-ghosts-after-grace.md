---
id: I-77AB6-17
status: open
implements: FS-77AB6
blocked_by: [I-77AB6-16]
labels: [ready-for-agent]
title: "A delver whose run ends during the reconnect grace doesn't linger in the hub"
---
Follow-up from the final code review (2026-10-10). Not yet scheduled. Pre-existing, made more frequent now that network drops enter the grace.

`ReturnPlayersToHub` → `setCurrentWorld` (server.go:~257-267, ~386) marks a member Connected even while held in the reconnect grace; if the run ends during the grace, `cleanUpPlayerCompletely` never fires and the member stays on record with a hub body and no connection until they reconnect, occupying a hub capacity slot (I-0053). Fix: keep the reconnecting state through world changes (or seat a held member as away) so the grace timer still resolves them; test run-end during grace.
