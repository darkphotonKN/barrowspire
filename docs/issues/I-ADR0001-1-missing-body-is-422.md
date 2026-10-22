---
id: I-ADR0001-1
status: open
implements: ADR-0001
blocked_by: []
labels: []
title: "ADR-0001 §7: a missing required request body answers 422, not 400"
---
Implements ADR-0001 §7

**Author:** unassigned

## What to Build

Huma refuses a request whose required body is absent before it validates any shape, with `400`.
The seam (`internal/contract/contract.go`, `installSeamErrors`) passes that status through, so the
client gets `400 · VALIDATION_FAILED`. ADR-0001 §7 puts every shape failure, decided at the
boundary from the type, at **422**, and keeps 400 for domain refusals decided downstream. A missing
body is shape, so it is answered on the wrong status.

The cost is concrete since I-NXP1W-18: buyout's `400 · VALIDATION_FAILED` means both "no body" and
"amount is not the buyout price", and a client switching on `code` cannot tell them apart. The same
holds on every body-carrying operation (place-bid, create-listing, the member surface).

Make the seam answer a missing required body with `422 · VALIDATION_FAILED`, in one place
(`huma.NewError` is the documented extension point), not per operation. Recognise the case by what
Huma reports, not by matching prose, if Huma exposes it that way; if it only exposes the message,
say so in the code and pin the Huma version that test relies on.

## Acceptance Criteria

- [ ] An operation with a required body, called with none, answers `422 · VALIDATION_FAILED` and never reaches its handler. Proved on buyout and on one pre-existing operation (place-bid).
- [ ] A malformed body still answers 422 as today; domain refusals (`InvalidArgument` from downstream) still answer 400.
- [ ] `TestBuyout_NoBodyIsABadRequestBeforeCallingMarketplace` is changed to expect 422 and renamed to match.
- [ ] `openapi.yaml` regenerated if the error documentation changes; oasdiff result recorded. A status change on an error path may not show as breaking, so check `game-client` for any caller that branches on a 400 from a missing body.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

ADR-0001 §7 (validation is two layers with two statuses). Found in the I-NXP1W-17/18 code review
(finding S1), 2026-10-20.
