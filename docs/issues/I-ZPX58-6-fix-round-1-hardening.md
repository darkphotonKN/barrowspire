---
id: I-ZPX58-6
status: done
implements: FS-ZPX58
blocked_by: [I-ZPX58-1, I-ZPX58-2, I-ZPX58-3, I-ZPX58-4]
labels: []
title: "FS-ZPX58 slice 6: review fix round 1: no 4001 loop, outage keeps the session, handoffs renew, renewals never revive a session, access-only validation (game-client, auth-service, common)"
---
Implements FS-ZPX58 §C R17, R18, §D R21, §F R24–R26, §Deploy order, §Edge States

**Lane: agent (review fix round 1, 2026-11-06).**

## What was built

- H1: a refused handshake opens before its `4001`; the run of refusals resets only on a message
  that is not `auth_error` (or a promoted handoff), with a 1 s → 30 s backoff.
- M3: an unavailable renewal keeps the session and retries; only a refused one signs out.
- L4: run and hub handoffs renew once on `4001`; a redirect target keeps `redirected=1`.
- M1: a renewal answer is dropped if the stored session changed meanwhile.
- M2: `404` from the refresh route is refused; unavailable renewals cool down 5 s → 60 s.
- L2: proactive renewals are capped at the token's lifetime and at least 60 s apart.
- L1 / L7: `ValidateJWT` and `NewValidator` accept only `tokenType=access`; no secret, no token.

## Acceptance Criteria

- [x] Tests first (`test:` commit), then the fix (`fix(...)` commits).
- [x] go test + go vet green in every module that imports `common/auth`; vitest + tsc green.

## Spec Reference

FS-ZPX58 §Requirements C, D, F.
