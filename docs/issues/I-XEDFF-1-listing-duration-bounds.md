---
id: I-XEDFF-1
status: done
implements: FS-XEDFF
blocked_by: []
labels: [ready-for-agent]
title: "FS-XEDFF slice 1: a listing must last 1 hour to 7 days (marketplace + api-gateway + game-client)"
---
Implements FS-XEDFF §Requirements 1–4, 10–12, §API surface

## What to Build

- **Domain.** `listing.CheckDuration(now, endsAt)` (name free) with `MinListingDuration = 1h`, `MaxListingDuration = 7d`, `ListingDurationSlack = 5m`: allowed range [1h−5m, 7d+5m] inclusive; outside → new `ErrListingDurationOutOfRange`; `endsAt <= now` stays `ErrInvalidEndTime`.
- **Request time only.** `ReserveItemUC` calls it before reserving; `CreateListingUC` / `NewListing` keep only "endsAt after now" (Req 2).
- **Transport.** marketplace `mapError` sends `ErrListingDurationOutOfRange` as the registered refusal `LISTING_DURATION_OUT_OF_RANGE`; register the code (and `LISTING_LIMIT_REACHED`, used by I-XEDFF-2) in `common/errcode`. Gateway create-listing description documents the range and both codes; `make openapi && make client`.
- **Client.** `createListingFailureMessage` (`game-client/src/marketplace/listRelic.ts`) maps both codes to the FS Req 12 copy.

## Acceptance Criteria

- [ ] Domain boundary table per FS (55m and 7d+5m allowed; 54m59s and 7d+5m+1s refused; past → `ErrInvalidEndTime`).
- [ ] `ReserveItemUC` refuses out of range without calling items.
- [ ] `CreateListingUC` with endsAt 30 min ahead still creates the listing.
- [ ] gRPC ListItem → FailedPrecondition reason `LISTING_DURATION_OUT_OF_RANGE`; gateway → `400 · LISTING_DURATION_OUT_OF_RANGE`; both codes in `errcode` domain codes.
- [ ] Client maps both codes; existing mappings unchanged; tsc/vitest/lint clean.

## Files expected to touch

- `game-server/common/errcode/errcode.go` (+ refusal test) — **shared with I-V7A5S-1**
- `game-server/marketplace-service/internal/listing/domain/listing/listing.go`, `errors.go` (+ tests) — **shared with I-V7A5S-1**
- `game-server/marketplace-service/internal/listing/usecase/reserve_item_usecase.go` (+ test), `create_listing_usecase.go` test only
- `game-server/marketplace-service/internal/listing/grpc/handler.go` (+ test) — **shared with I-V7A5S-1**
- `game-server/api-gateway/internal/gateway/listing/typed.go` (+ test) — **shared with I-V7A5S-2**
- `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts` — **generated, hotspot (also I-V7A5S-2)**
- `game-client/src/marketplace/listRelic.ts` (+ test)

## Blocked By

None

## Spec Reference

FS-XEDFF §Requirements 1–4, 10–12; §User Stories 1–3, 6, 8; §Acceptance Criteria rows 1–4, 8; §API surface.
