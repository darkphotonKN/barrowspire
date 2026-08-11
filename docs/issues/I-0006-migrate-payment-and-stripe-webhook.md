---
id: I-0006
status: open
implements: FS-0001
blocked_by: [I-0001]
labels: [ready-for-agent]
title: "FS-0001 slice 6: migrate `payment` including POST /webhook/stripe (10 writes)"
---
Implements FS-0001 §Requirements, §API surface, §Edge States

## What to Build

Route all 10 error writes in `api-gateway/internal/gateway/payment/handler.go` through the seam
and delete the last of the six duplicated `status.FromError` switches (FS-0001 §Requirements 6).

**`POST /webhook/stripe` is migrated like everything else — no exemption.** This was decided
explicitly during promotion: Stripe keys its retry behavior off the **HTTP status**, which this
feature does not change, so the body shape is free to move. A first carve-out is how a gate
starts eroding, and this endpoint would have been the precedent.

The webhook is unauthenticated and third-party-driven, which is why this slice is HITL: a
regression here is discovered by Stripe, not by a test.

- Missing/invalid signature header → `400 VALIDATION_FAILED`; Stripe retries on non-2xx exactly as before
- Every webhook failure status must be **compared before/after** against current behavior — status parity is the contract with Stripe, and no automated gate can check it (see I-0008: there is no `openapi.yaml` to diff against)

Success responses (200/201/202) are **untouched** and must stay byte-identical — this matters
more here than anywhere else, because a 2xx is Stripe's "stop retrying" signal.

### Status deltas are expected — record them per site

The 24 old switches disagreed with each other: each handled only a subset of gRPC codes and fell
through to 500 for the rest. Unifying them therefore **changes HTTP statuses**, not only body
shape — FS-0001 §Summary's "nothing about what the gateway does changes" holds for the body and
not for the status. Confirmed on `example` in I-0001, where an unhandled `AlreadyExists` moved
500 → 409 and `GetExample` (which had no switch at all) gained the whole mapping.

`payment` has **one** switch for 10 writes, so its unhandled codes will move the same way. Diff
its current switch against §API surface before touching it, and treat any webhook path whose
status moves as a blocker to raise, not a delta to accept.

## Acceptance Criteria

- [ ] All 10 `payment` error writes go through the seam
- [ ] `grep 'c.JSON(http.Status'` over this package returns only success statuses
- [ ] The last `status.FromError` switch is deleted — all six duplicates are now gone
- [ ] Each migrated path has a test asserting **status + `code` + `Content-Type`**
- [ ] `POST /webhook/stripe` emits problem+json on failure
- [ ] **Webhook HTTP statuses are unchanged from today**, verified by an explicit before/after comparison per failure path, recorded in the PR
- [ ] Missing signature header → `400 VALIDATION_FAILED`
- [ ] Webhook success path still returns 2xx byte-identically
- [ ] No payment provider error text reaches any response body
- [ ] Gateway test suite passes

## Blocked By

I-0001 — the seam and the vocabulary.

## Spec Reference

FS-0001 §Requirements 4–9, 11 (Stripe migrated, no exemption), 12, §Edge States (webhook with
missing signature). Covers user stories 2, 5, 6, 10, 14, 15, 17.

## Merge Policy

Land on `feat/fs-0001-error-contract`, not main. See I-0008.

## TDD Approach

- RED: webhook failure tests asserting the *existing* status plus the new `code` + `Content-Type`
- GREEN: seam call; last local switch deleted
- Manual: record each webhook failure status before and after, side by side, in the PR body
