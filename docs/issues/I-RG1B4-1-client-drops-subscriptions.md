---
id: I-RG1B4-1
status: open
implements: FS-RG1B4
blocked_by: []
labels: [ready-for-agent]
title: "FS-RG1B4 slice 1: the client stops offering subscriptions"
---
Implements FS-RG1B4 §Requirements 1–4, 12

## What to Build
Delete the `/subscription` page, the header's Subscribe link and the homepage footer's Premium
link. Drop `apiClient.subscribe` and `apiClient.checkSubscriptionPermission`, so nothing in the
client calls an `/api/payment/*` path. Delete the subscription page styles from `globals.css`.
Take `/subscription` out of the design guideline's page lists, keeping the money-clarity rule.
Keep the Stripe npm packages and the UI table's Stripe note in `theme.ts`.

## Acceptance Criteria
- [ ] No `game-client/src/app/subscription/` directory.
- [ ] `Header.tsx` and `app/page.tsx` link nowhere to `/subscription`.
- [ ] `apiClient` has no `subscribe` or `checkSubscriptionPermission`.
- [ ] `globals.css` carries no subscription page styles.
- [ ] The design guideline no longer lists `/subscription` as a live page.
- [ ] Typecheck, client tests and lint fence pass.

## Blocked By
None

## Spec Reference
FS-RG1B4 §Requirements 1–4, 12; §User Stories 1–3, 12, 13; §Acceptance Criteria (client rows).

## TDD Approach
- RED: a Header test asserting the nav has no link to `/subscription`.
- GREEN: remove the link (and the page it led to).
