---
id: I-NTPW2-5
status: done
implements: FS-NTPW2
blocked_by: [I-NTPW2-1, I-NTPW2-2, I-NTPW2-3, I-NTPW2-4]
labels: [ready-for-agent]
title: "FS-NTPW2 slice 5: game-client onto the generated client, and the lint fence"
---
Implements FS-NTPW2 §Requirements 17-18, §Acceptance Criteria

## What to Build

Generate the TypeScript client from the committed `openapi.yaml` and move `game-client`'s HTTP
call-sites onto it. This is the slice that makes the contract enforceable at the consumer.

- `make client` generates into `game-client/src/api/generated`; the output is **committed**, and
  CI fails if regenerating produces a diff.
- Every call in `src/utils/api.ts` that targets a serialized endpoint goes through the generated
  client. The `ApiError` handling from I-22WKC-8 is preserved — `code` remains the switch key.
- `login`/`register` raw `fetch` calls move too: their endpoints are serialized in I-NTPW2-1.
- **Lint rule** banning hand-written `fetch` against a serialized path. It must be demonstrated
  failing on a fixture, not merely configured (a gate nobody has watched reject something is
  unverified configuration).

## WebSocket code is untouched

`SocketManager`, `BarrowspireScene`, and `GameScene` talk to game-service on `:5668` directly.
That is plane 2; its contract is the typed game message layer, not OpenAPI. Do not migrate it,
and do not let the lint rule match it.

## Acceptance Criteria

- [ ] `make client` regenerates cleanly; committed output matches; CI fails on a stale client
- [ ] Every serialized endpoint is called through the generated client — no hand-written fetch remains
- [ ] The lint rule **fails on a fixture** that hand-fetches a serialized path, and passes on the tree
- [ ] The lint rule does not match WebSocket code or unserialized paths
- [ ] `tsc --noEmit` clean; `next build` succeeds; client tests pass
- [ ] `code`-based error handling from I-22WKC-8 still works end to end (401, 422, 404, 500)
- [ ] A 422 from a serialized endpoint renders a sensible message — this status is new to the
      client (FS-NTPW2 §Req 10)

## Blocked By

I-NTPW2-1, I-NTPW2-2, I-NTPW2-3, I-NTPW2-4 — the client can only be generated from a complete spec.

## Spec Reference

FS-NTPW2 §Requirements 17-18, §Acceptance Criteria.

## Notes

`game-client`'s error handling already switches on `code` and falls back on unknown codes
(I-22WKC-8, `src/utils/apiError.ts`). **422 is a code path the client has never seen** — it did not
exist before Huma was mounted. Verify it renders rather than falling through to a generic string.
