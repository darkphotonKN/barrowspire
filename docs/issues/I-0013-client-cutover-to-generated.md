---
id: I-0013
status: open
implements: FS-0002
blocked_by: [I-0009, I-0010, I-0011, I-0012]
labels: [ready-for-agent]
title: "FS-0002 slice 5: game-client onto the generated client, and the lint fence"
---
Implements FS-0002 §Requirements 17-18, §Acceptance Criteria

## What to Build

Generate the TypeScript client from the committed `openapi.yaml` and move `game-client`'s HTTP
call-sites onto it. This is the slice that makes the contract enforceable at the consumer.

- `make client` generates into `game-client/src/api/generated`; the output is **committed**, and
  CI fails if regenerating produces a diff.
- Every call in `src/utils/api.ts` that targets a serialized endpoint goes through the generated
  client. The `ApiError` handling from I-0008 is preserved — `code` remains the switch key.
- `login`/`register` raw `fetch` calls move too: their endpoints are serialized in I-0009.
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
- [ ] `code`-based error handling from I-0008 still works end to end (401, 422, 404, 500)
- [ ] A 422 from a serialized endpoint renders a sensible message — this status is new to the
      client (FS-0002 §Req 10)

## Blocked By

I-0009, I-0010, I-0011, I-0012 — the client can only be generated from a complete spec.

## Spec Reference

FS-0002 §Requirements 17-18, §Acceptance Criteria.

## Notes

`game-client`'s error handling already switches on `code` and falls back on unknown codes
(I-0008, `src/utils/apiError.ts`). **422 is a code path the client has never seen** — it did not
exist before Huma was mounted. Verify it renders rather than falling through to a generic string.
