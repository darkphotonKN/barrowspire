---
id: I-ZPX58-5
status: open
implements: FS-ZPX58
blocked_by: [I-ZPX58-1, I-ZPX58-2, I-ZPX58-3, I-ZPX58-4, I-ZPX58-6, I-ZPX58-7]
labels: []
title: "FS-ZPX58 slice 5: browser check — a session survives past the access token's hour (HITL, Nick)"
---
Implements FS-ZPX58 §Acceptance Criteria (browser check)

**Lane: human (Nick).** Needs auth-service and the gateway restarted on the merged code (air
rebuilds both on save; otherwise restart them) and the client rebuilt.

## Steps

1. **Reactive REST.** Sign in, open `/game`. In devtools → Application → Local Storage →
   `auth-storage`, change one character in the middle of `state.accessToken` and save. Open the
   gear overlay (it reads the wallet). Expected: gold shows; the Network tab shows one `401`,
   one `POST /api/member/refresh` `200`, and the wallet call again `200`; no login page.
   `auth-storage.state.accessToken` is a new token; `refreshToken` unchanged.
2. **Refused renewal.** Corrupt both `accessToken` and `refreshToken`, open the gear overlay.
   Expected: one refresh `401`, then `/login` (today's sign-out).
3. **Socket 4001.** Corrupt only `accessToken`, reload `/game`. Expected: the first socket
   closes `4001`, a refresh `200`, a second socket opens and the hub loads; no login page.
4. **Proactive.** Sign in fresh and leave the tab in the foreground a little over 58 minutes
   (or play). Expected: a `POST /api/member/refresh` about 2 minutes before the hour, no `401`s.
5. **Past the hour, delve.** After step 4, queue a delve on a two-pod setup if available.
   Expected: the run handoff URL carries the new token and the run starts.
6. **Gear past the renewal, one socket (R27–R32).** Sign in, enter the hub, and play on the same
   connection past the proactive renewal at about 58 minutes (do not reload). In devtools → Network
   → WS, the game socket shows a sent `renew_token` and a received `token_renewed` right after the
   `POST /api/member/refresh`. Then walk into a field, and queue a delve. Expected: gear loads both
   times, with no "Your gear could not be fetched".
7. **Auth outage (M3).** Stop auth-service only, corrupt `accessToken`, reload `/game`. Expected: the
   socket shows reconnecting and retries with growing gaps (1 s, 2 s, 4 s …), REST errors do not
   sign you out, `auth-storage` keeps `refreshToken`. Start auth-service again: the next retry
   renews and the hub loads.
8. **Run handoff refused (L4)**, two pods only, optional: corrupt `accessToken` just before a
   matched delve starts. Expected: the handoff socket closes `4001`, one refresh, a second handoff
   socket, and the run starts.

## Acceptance Criteria

- [ ] Steps 1–5 behave as expected.
- [ ] Steps 6–7 behave as expected; step 8 if a two-pod setup is at hand.

## Spec Reference

FS-ZPX58 §Acceptance Criteria, §Edge States, §Follow-ups.
