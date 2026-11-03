---
id: I-V6SFK-5
status: done
implements: FS-V6SFK
blocked_by: [I-V6SFK-3]
labels: [ready-for-agent]
title: "FS-V6SFK slice 5: marketplace refuses list/bid/buyout for unverified members, client prompt"
---
Implements FS-V6SFK §Requirements E22, G29–G32, H38, §API surface

## What to Build

End to end: an unverified member trying to list, bid or buy out gets
`400 · EMAIL_UNVERIFIED` and a marketplace prompt to verify. Withdraw, accept and reads keep
working.

- **common/auth (R22):** `Claims` gains `email_verified` and `Identity` gains `EmailVerified`.
  Absent → false. The validator never refuses authentication over it.
- **common/errcode:** register `EMAIL_UNVERIFIED`.
- **marketplace-service (R29, R30):** the create-listing, place-bid and buyout gRPC handlers check
  `Identity.EmailVerified` first and `errcode.Refuse(EMAIL_UNVERIFIED)` before any read or write.
  Withdraw, accept and reads are untouched.
- **Gateway (R31):** no gating; confirm the 400 passthrough on the three routes (no route change
  expected, so no contract regen unless the declared errors change).
- **Client (R38):** on `EMAIL_UNVERIFIED` from list, bid or buyout, show a "verify your email"
  prompt that opens slice 4's panel. If slice 4 hasn't landed when this runs, link to the profile
  panel and report it.

## Acceptance Criteria

- [ ] The FS-V6SFK §Acceptance Criteria marketplace row holds (handler tests: unverified → refusal with no use-case call; verified → unchanged).
- [ ] A common/auth test: a token without the claim → `EmailVerified == false`; with `true` → true; authentication succeeds either way.
- [ ] The client marketplace shows the prompt on `EMAIL_UNVERIFIED` (component test).
- [ ] `go test ./...` passes for marketplace-service and common; the client suite passes.

## Blocked By

I-V6SFK-3 (the claim is minted there; `common/errcode` is serialized behind it)

## Expected files (hotspots marked ★)

- `game-server/common/auth/claims.go`, `identity.go`, `auth.go`, tests
- ★ `game-server/common/errcode/errcode.go`
- `game-server/marketplace-service/internal/listing/grpc/handler.go` + tests
- `game-client/src/app/marketplace/` (prompt on the refusal)

## Spec Reference

FS-V6SFK §E22 (claim reading), §G (gate), §H38 (prompt), §API surface (marketplace row). User stories 8–11, 28.

## TDD Approach

- RED: a handler test: CreateListing with an unverified Identity → `EMAIL_UNVERIFIED`, and the use case is never called.
- GREEN: the claim field plus the guard in the three handlers.
