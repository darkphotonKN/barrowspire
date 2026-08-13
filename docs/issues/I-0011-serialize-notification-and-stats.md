---
id: I-0011
status: done
implements: FS-0002
blocked_by: [I-0009]
labels: [ready-for-agent]
title: "FS-0002 slice 3: serialize notification + stats (5 routes)"
---
Implements FS-0002 §Requirements 5-7, 16, §API surface

## What to Build

Two small groups sharing a slice, and together the only place a public and a JWT group are
serialized side by side.

notification (JWT, 3): `GET /api/notification/` · `PATCH /api/notification/:id/read` ·
`PATCH /api/notification/read-all`
stats (**public — no AuthMiddleware**, 2): `GET /api/stats/player/:playerId` ·
`GET /api/stats/leaderboard`

## Acceptance Criteria

- [ ] All 5 routes in `openapi.yaml`; `make openapi && git diff --exit-code` clean
- [ ] The stats operations are documented as requiring **no** authentication — matching reality
- [ ] Docs UI lists both groups
- [ ] Before/after recorded for all 5, byte-compatible except the annotated changes
- [ ] Spectral passes; seam gate green; gateway suite passes
- [ ] Pioneer-log entry: "stats routes unauthenticated — transcribed as-is, candidate for a
      future auth decision"

## Blocked By

I-0009.

## Spec Reference

FS-0002 §Requirements 5-7, 16, §API surface (the stats judgment row).

## Notes

**The stats routes are public and that is probably a bug.** The gateway's own SPECIFICATION.md
flags it: "stats routes have no AuthMiddleware — public by design, or missing auth?"

Serialize them as public. Documenting a route as unauthenticated does not bless it; it records
what it does. Adding auth here would be a behavior change riding a wrap, which ADR-0002 §2
forbids, and it would break `game-client`'s leaderboard silently. Log it; spec it separately.
