---
id: I-ZPX58-3
status: open
implements: FS-ZPX58
blocked_by: [I-ZPX58-2]
labels: []
title: "FS-ZPX58 slice 3: the client renews on 401 (single-flight, retry once) and before exp (game-client)"
---
Implements FS-ZPX58 §C (Requirements 13–19)

**Lane: agent (approved by Nick).** game-client.

## What to Build

- A session-renewal module: `exp` decode (unverified), single-flight renewal with the three
  outcomes renewed / refused / unavailable, and the 2-minute-ahead schedule.
- `api.ts`: every authenticated call renews once on 401 and retries once; a stale-token 401
  retries without renewing; refused → today's logout + redirect; unavailable → throw, no logout.
  The renewal call goes through `publicClient`.
- `authStore.applyRefreshResult`: stores the new access token and member, keeps the refresh
  token.
- The proactive schedule is started once for the app.

## Acceptance Criteria

- [ ] Tests for each R13–R19 behaviour, with fake timers for R18.
- [ ] Full vitest and `tsc --noEmit` green.

## Blocked By

I-ZPX58-2 (the route in the generated schema).

## Spec Reference

FS-ZPX58 §Requirements C, §Edge States.
