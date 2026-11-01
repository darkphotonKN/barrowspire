# FS-RG1B4: Subscriptions removed

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Billing" → "Subscribe", "Check subscription permission" (struck, removed by this FS); `game-server/api-gateway/SPECIFICATION.md` "### Downstream routing" → "Route payment traffic to payments, plus the unauthenticated Stripe webhook" (struck) and "Route the unauthenticated Stripe webhook to payments" → this FS · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (the generated contract; removing operations is a deliberate break, allowlisted) · Vocabulary: [`game-server/payment-service/CONTEXT.md`](../../game-server/payment-service/CONTEXT.md)

## Summary

The game stops selling subscriptions. A player no longer sees a Subscribe link, a Premium link,
or a subscription page, and the gateway no longer answers any player-facing payment request.
The payment plumbing stays: payment-service, its Stripe integration, and the Stripe webhook keep
running, so a later one-off founders package can be sold on top of them without rebuilding the
foundations.

## Requirements

1. The client has no `/subscription` route. Navigating to it lands on the site's not-found page.
2. The header nav has no Subscribe link. The homepage footer has no Premium link. No other view
   links to `/subscription`.
3. The client's API wrapper has no subscribe call and no subscription-permission call; nothing in
   the client calls any `/api/payment/*` path.
4. The subscription page's styles are deleted from `globals.css`.
5. The api-gateway registers no `/api/payment/*` operation. The five removed operations are
   `create-payment-customer`, `setup-subscription-product`, `subscribe`,
   `get-user-subscriptions` and `check-subscription-permission`. A request to any of those paths
   gets the gateway's no-route answer.
6. The legacy gin handlers behind the removed operations are deleted, and the gateway's payment
   client and its consumer interface shrink to what the webhook uses.
7. `POST /webhook/stripe` is unchanged: same path, no auth, raw-body signature verification,
   same downstream call to payment-service.
8. `openapi.yaml` and `game-client/src/api/generated/` are regenerated from the handlers, never
   hand-edited, and committed with the handler change.
9. The removal of the five operations is a chosen break: each is listed in
   `game-server/.oasdiff-ignore`, so the breaking-change gate passes on purpose rather than by
   accident.
10. The `payment` tag and its description leave the contract if no operation carries it.
11. payment-service, the payment proto and generated Go, auth-service's subscription status
    column and its write path, and the client's Stripe npm packages are untouched.
12. Docs that name the subscription page as a live surface stop doing so: the design guideline's
    page lists. The money-clarity rule stays, since it governs any real-money flow, the founders
    package included.

## User Stories

1. As a player, I want no subscription offer in the nav, so that the site does not sell me
   something the game no longer provides.
2. As a player on the homepage, I want the footer to show only links that lead somewhere real, so
   that I am not sent to a dead offer.
3. As a player with an old bookmark to `/subscription`, I want the not-found page, so that I do
   not reach a checkout that can take money for nothing.
4. As a player who once subscribed, I want no new charge to start from this site, so that I am
   not billed for a dropped feature.
5. As the developer, I want no unauthenticated or authenticated route that creates Stripe
   customers or subscriptions, so that nobody can drive Stripe calls through the gateway.
6. As the developer, I want the Stripe webhook to keep working, so that Stripe can still reach
   payment-service when the founders package ships.
7. As the developer, I want payment-service and its Stripe wiring left in place, so that the
   founders package reuses them instead of rebuilding them.
8. As the developer, I want the generated contract to drop the removed operations, so that the
   client cannot call them by accident.
9. As the developer, I want the breaking-change gate to pass because the break is listed, so
   that the removal reads as a decision in review, not a surprise.
10. As the developer, I want the gateway's payment client interface to list only the webhook
    call, so that the consumer owns exactly what it uses.
11. As the developer, I want the specs to stop claiming subscriptions, so that a spec audit does
    not report drift.
12. As a designer, I want the design guideline to stop listing a removed page, so that nobody
    themes a surface that no longer exists.
13. As the developer, I want the client's Stripe packages kept, so that the founders checkout can
    use Stripe Elements without re-adding them.

## Acceptance Criteria

- [ ] No `/subscription` page exists in `game-client/src/app/`.
- [ ] `Header.tsx` and `app/page.tsx` contain no link to `/subscription`.
- [ ] `apiClient` has no `subscribe` or `checkSubscriptionPermission` method.
- [ ] `globals.css` carries no subscription page styles.
- [ ] `openapi.yaml` contains no `/api/payment/` path and no schema used only by them.
- [ ] `game-client/src/api/generated/` contains no `/api/payment/` path.
- [ ] `routes.go` still registers `POST /webhook/stripe`, and the webhook tests pass unchanged.
- [ ] The gateway's `PaymentClient` interface lists only `ProcessWebhook`.
- [ ] `game-server/.oasdiff-ignore` lists the removal of each of the five operations, and
      `make -C game-server/api-gateway gates` passes.
- [ ] `go build ./...`, `go vet ./...` and `go test ./...` pass in `game-server/api-gateway`.
- [ ] Client typecheck, tests and lint fence pass.
- [ ] No file under `game-server/payment-service/`, `game-server/auth-service/` or
      `game-server/common/api/proto/` changes.

## Edge States

- **Old bookmark or cached page:** `/subscription` renders the not-found page; the client has no
  code left to call the removed endpoints.
- **Stale client build calling a removed endpoint:** the gateway answers `404 · NOT_FOUND`
  through its no-route handler. No Stripe call is made.
- **An existing Stripe subscription from before the removal:** out of this FS. Stripe keeps
  billing it until it is cancelled in the Stripe dashboard; the webhook still delivers its events
  to payment-service, which still records the status.
- **Webhook replay or retry:** unchanged; signature verification and downstream handling are
  untouched.

## API surface

Removed operations. Each now falls through to the gateway's no-route handler.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `create-payment-customer` | `POST /api/payment/customer` | removed | removed | removed | `404 · NOT_FOUND` |
| `setup-subscription-product` | `POST /api/payment/subscription/setup` | removed | removed | removed | `404 · NOT_FOUND` |
| `subscribe` | `POST /api/payment/subscribe` | removed | removed | removed | `404 · NOT_FOUND` |
| `get-user-subscriptions` | `GET /api/payment/subscriptions/{customerId}` | removed | removed | removed | `404 · NOT_FOUND` |
| `check-subscription-permission` | `GET /api/payment/subscription/permission` | removed | removed | removed | `404 · NOT_FOUND` |

`POST /webhook/stripe` is not a contract operation (FS-NTPW2 §Out of Scope) and does not change.

## Out of Scope

- The founders package: what it sells, its price, its checkout and its endpoint. A later FS.
- payment-service code, its gRPC surface, its Stripe client and its migrations.
- auth-service's Stripe customer and subscription status columns and their write path.
- Cancelling subscriptions that already exist in Stripe.
- Removing the client's Stripe npm packages or the UI table's Stripe Elements note in
  `theme.ts`.
- `game-server/payment-service/SPECIFICATION.md`, which today carries a copy of the gateway's
  lines rather than payment-service's own; that is a spec-audit finding, not this removal.
