---
id: I-S109X-2
status: done
implements: FS-S109X
blocked_by: [I-S109X-1]
labels: []
title: "FS-S109X slice 2: place-bid and withdraw-bid descriptions say only leading withdrawals count (gateway + regen)"
---
Implements FS-S109X §Requirements 8–9, §API surface, §Acceptance Criteria

## What to Build

The published contract describes the rule slice 1 ships. Description text only: no request, response, status or code changes.

- `api-gateway/internal/gateway/listing/typed.go`: place-bid's `BID_WITHDRAW_LIMIT_REACHED` entry reads "3 or more withdrawals of a leading bid" on this listing and adds that withdrawing an outbid bid never counts; withdraw-bid's description adds that withdrawing a leading bid counts toward the bid withdrawal cap (after 3 on one listing, place-bid answers 400 BID_WITHDRAW_LIMIT_REACHED) and withdrawing an outbid bid doesn't.
- Regenerate in `game-server/api-gateway`: `make openapi && make client`. Never hand-edit the generated files. oasdiff must report no breaking change.
- Comment-only rewording: `common/errcode/errcode.go` `BidWithdrawLimitReached` comment, and the FS-ZE43K seam-row comment in `typed_test.go`, to say leading withdrawals.

## Acceptance Criteria

- [ ] Both descriptions carry FS-S109X Req 8's meaning; the seam-table row for `BID_WITHDRAW_LIMIT_REACHED` still maps to `400`.
- [ ] `openapi.yaml` and `game-client/src/api/generated/schema.d.ts` regenerated, committed together with `typed.go`.
- [ ] oasdiff: no breaking change (description-only diff).
- [ ] Tests pass (api-gateway, common).

## Blocked By

I-S109X-1 (the description must not claim a rule before marketplace enforces it)

## Spec Reference

FS-S109X §Requirements 8–9; User Story 16; §API surface (place-bid, withdraw-bid: description only).

## Expected files

api-gateway `internal/gateway/listing/{typed.go,typed_test.go}`; `common/errcode/errcode.go` (comment only); **generated**: `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts` (regenerate only).

## TDD Approach

- No behaviour change; the existing seam test stays green. Verify by `make openapi && make client`, the oasdiff check, and reading the regenerated description diff.
