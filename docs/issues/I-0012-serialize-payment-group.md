---
id: I-0012
status: done
implements: FS-0002
blocked_by: [I-0009]
labels: [ready-for-agent]
title: "FS-0002 slice 4: serialize the payment group (5 routes, webhook fenced out)"
---
Implements FS-0002 §Requirements 5-7, 16, §Out of Scope

## What to Build

Transcribe the **payment group — 5 routes, all JWT**:

`POST /api/payment/customer` · `POST /api/payment/subscription/setup` ·
`POST /api/payment/subscribe` · `GET /api/payment/subscriptions/:customerId` ·
`GET /api/payment/subscription/permission`

## THE FENCE — restated here because it is easy to get wrong

**`POST /webhook/stripe` is NOT serialized.** It stays a legacy gin handler.

Three independent reasons, any one sufficient:
- the caller is Stripe, not our client, so there is no consumer for a generated client;
- signature verification needs the **raw request body**, which a typed decode has already
  consumed and re-encoded by the time a handler sees it;
- it has no `/api` prefix and is registered directly on the router.

Serializing it would break signature verification in a way that only shows up as failed live
payments. Leave it alone, and confirm it still works after the wrap.

## Acceptance Criteria

- [ ] All 5 payment routes in `openapi.yaml`; `make openapi && git diff --exit-code` clean
- [ ] `POST /webhook/stripe` is **absent** from `openapi.yaml` — asserted explicitly
- [ ] The webhook still verifies signatures and still returns its current statuses
- [ ] Stripe retry parity: every webhook path still returns non-2xx exactly where it did before
- [ ] Before/after recorded for all 5, byte-compatible except the annotated changes
- [ ] Docs UI lists the payment group and does not list the webhook
- [ ] Spectral passes; seam gate green; gateway suite passes

## Blocked By

I-0009.

## Spec Reference

FS-0002 §Requirements 5-7, 16, §Out of Scope (the webhook fence, verbatim).

## Notes

I-0006 already migrated this group's 10 error writes to the seam and deleted its private
`handleGrpcError` mini-seam. The error path is done; this slice is the request/response half only.
