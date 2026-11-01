---
id: I-RG1B4-2
status: open
implements: FS-RG1B4
blocked_by: [I-RG1B4-1]
labels: [ready-for-agent]
title: "FS-RG1B4 slice 2: the gateway stops exposing the payment API"
---
Implements FS-RG1B4 §Requirements 5–11, §API surface

## What to Build
Remove the five `/api/payment/*` operations from the api-gateway's typed surface and delete the
legacy gin handlers behind them. Shrink the gateway's payment client and its consumer-owned
interface to `ProcessWebhook`. Leave `POST /webhook/stripe` exactly as it is. Regenerate
`openapi.yaml` and the generated client (`make openapi && make client`), list each removal in
`game-server/.oasdiff-ignore`, and drop the `payment` tag if nothing carries it.

## Acceptance Criteria
- [ ] `openapi.yaml` and `game-client/src/api/generated/` have no `/api/payment/` path.
- [ ] `PaymentClient` lists only `ProcessWebhook`; `routes.go` still registers the webhook.
- [ ] The webhook tests pass unchanged.
- [ ] `.oasdiff-ignore` lists the five removals and `make -C game-server/api-gateway gates` passes.
- [ ] `go build`, `go vet` and `go test` pass in `game-server/api-gateway`.
- [ ] No change under `payment-service/`, `auth-service/` or `common/api/proto/`.

## Blocked By
I-RG1B4-1 (the client must stop calling the paths before the generated client drops them)

## Spec Reference
FS-RG1B4 §Requirements 5–11, §API surface, §Edge States; §User Stories 4–11.

## TDD Approach
- RED: a gateway test that `GET /api/payment/subscription/permission` answers `404 · NOT_FOUND`.
- GREEN: stop registering the payment operations.
