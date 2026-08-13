---
id: I-0010
status: done
implements: FS-0002
blocked_by: [I-0009]
labels: [ready-for-agent]
title: "FS-0002 slice 2: serialize the items group (11 routes)"
---
Implements FS-0002 §Requirements 5-7, 16, §API surface

## What to Build

Transcribe the **items group — 11 routes, all JWT** — into typed handlers. The largest group,
and the one where transcription discipline matters most because several endpoints are known to
be superseded.

Creation: `POST /api/items/weapon` · `/template` · `/complete-weapon` · `/complete-armor` ·
`/complete-consumable`
Query: `GET /api/items/weapons` · `/types` · `/rarities` · `/instances` · `/loadout`
Mutation: `PUT /api/items/loadout`

## Acceptance Criteria

- [ ] All 11 routes in `openapi.yaml`; `make openapi && git diff --exit-code` clean
- [ ] Docs UI lists the items group
- [ ] Before/after recorded for all 11, byte-compatible except the annotated changes
- [ ] `make openapi-breaking` passes — a finding here means a transcription error, not a feature
- [ ] Spectral passes; seam gate green; gateway suite passes
- [ ] Legacy item handlers removed once their routes are serialized

## Blocked By

I-0009 (the mount, the identity bridge, and the error adapter must exist first).

## Spec Reference

FS-0002 §Requirements 5-7 (the transcription rule, per-operation transport types), 16
(before/after), §API surface (the `weapon` / `template` judgment row).

## Notes

`POST /weapon` and `POST /template` are labelled "Legacy/Advanced" in code and superseded by the
`complete-*` endpoints. **Transcribe them anyway** — removing an endpoint is a behavior change,
and the ratchet exists to make that deliberate later. Log the removal candidate; do not act on it.

From I-0004: three item handlers used to compute a status and discard it, and three had no
mapping at all. That is already fixed at the seam. If a transcription tempts you to "fix" a
status here, it is a transcription error — the status is whatever the endpoint returns today.
