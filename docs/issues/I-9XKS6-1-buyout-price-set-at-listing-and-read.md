---
id: I-9XKS6-1
status: done
implements: FS-9XKS6
blocked_by: []
labels: [ready-for-agent]
title: "FS-9XKS6 slice 1: buyout price set at ListItem, carried to the listing's birth, and read back"
---
Implements FS-9XKS6 §Requirements 1–3, 5–10 (Req 10 first half), §API surface

**Author: agent**

## What to Build

The tracer for the whole term, end to end, on the path `start_price` already travels:

- Migration `000006`: nullable `listings.buyout_price` with `CHECK (buyout_price IS NULL OR buyout_price > start_price)`.
- Domain: `NewListing` takes an optional buyout price (`ErrInvalidBuyoutPrice` when `<= startPrice`); snapshot + rehydration carry it.
- Carriage: `ListItemRequest` → `ReserveItemCommand` (validated by the existing `NewListing` draft) → items `ReserveItemRequest` → `ItemReservedEvent` → `CreateListingCommand`. items-service is a pass-through.
- Repository insert and load; GetListing, BrowseListings, ListMyListings and the proto `Listing` message expose it.
- Gateway: `CreateListingBody.buyoutPrice` (optional, `minimum:1`) and `Listing.buyoutPrice` (optional). Regenerate `openapi.yaml` + client.
- `ErrInvalidBuyoutPrice` → `InvalidArgument` in the handler and non-retryable in the `ItemReserved` consumer.

## Acceptance Criteria

- [ ] Migration up/down work; existing rows read back with no buyout price
- [ ] `NewListing`: nil ok, `> startPrice` ok, `<= startPrice` → `ErrInvalidBuyoutPrice`
- [ ] Repository round-trips set and nil buyout prices
- [ ] ListItem with an invalid buyout is refused before items' `ReserveItem` is called
- [ ] A valid buyout reaches the born listing; an event without the field births a listing without one
- [ ] The three reads return it when set and omit it when not; the gateway mirrors it
- [ ] Contract regenerated; oasdiff non-breaking
- [ ] `make test` green in marketplace, items and api-gateway

## Blocked By

None.
