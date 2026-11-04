---
id: I-HBXZN-1
status: done
implements: FS-HBXZN
blocked_by: []
labels: [ready-for-agent]
title: "FS-HBXZN slice 1: items ReserveItem refuses a worn item, answers each failure with its own status (items-service)"
---
Implements FS-HBXZN §Requirements A1–A5, §API surface (Reserve item row), §Edge States (equip/list race, double listing, checkout race, worn and in a delve)

Backend (human lane): this slice was authorized by the user's approved charter. The rule ships
here: after this slice a worn item can no longer become LISTED. Until I-HBXZN-2 lands,
marketplace still turns the refusal into a 500, which the client already reads as "That relic
can't be listed right now", so nothing user-facing breaks in between.

## What to Build

In `game-server/items-service/internal/items/`:

- `service.ReserveItem`: inside its existing transaction, in order:
  1. `s.repo.LockAccountTx(ctx, tx, sellerID)` (the lock `UpdateLoadout`, `MoveItemInstance` and
     run checkout already take);
  2. `s.repo.ItemPlacementTx(ctx, tx, sellerID, itemID)` (separate statement; carries status and
     `worn` via the existing `wornByOwner` predicate, the three consumable slots included);
  3. first failing check answers: nil placement → `commonconstants.ErrNotFound`; status not
     AVAILABLE → `errcode.Refuse(errcode.ItemNotAvailable)`; worn →
     `errcode.Refuse(errcode.ItemWorn)` (status before worn: FS R4);
  4. the existing `ReserveItemTx` conditional UPDATE, unchanged; `ErrItemNotReservable` from it
     now answers `ITEM_NOT_AVAILABLE`;
  5. the outbox publish, unchanged. A refused reservation writes nothing.
  Keep the refusal unwrapped (or `errors.As`-reachable) so the handler can find it.
- `Handler.ReserveItem` (`handler.go` ~1240): refusal → `refusal.GRPCStatus().Err()`;
  `ErrNotFound` → `codes.NotFound` ("item instance not found"); anything else → slog the error
  with seller and item id, answer `codes.Internal` with a fixed message, never `err.Error()`. Same
  shape as `Handler.MoveItemInstance`.
- No second worn predicate, no schema change, no change to `UpdateLoadout`, checkout, transfer or
  the reconciler RPCs.

## Acceptance Criteria

- [ ] Reserving an AVAILABLE instance the seller wears in a weapon slot answers
      `FailedPrecondition` + `ErrorInfo` `ITEM_WORN`; same for a consumable slot.
- [ ] After that refusal the instance is AVAILABLE, `listing_id` and `reserved_at` are NULL, and no
      `ItemReserved` outbox row exists for it.
- [ ] Reserving an unworn AVAILABLE instance behaves exactly as today (LISTED, `listing_id`,
      `reserved_at`, one outbox row); the existing reserve tests stay green.
- [ ] A LISTED instance, and an IN_RUN worn instance, answer `ITEM_NOT_AVAILABLE`.
- [ ] A missing instance and another member's instance both answer `NotFound`.
- [ ] An unexpected failure answers `Internal` with a fixed message; the wire carries no error text.
- [ ] Concurrency (integration, real Postgres): an `UpdateLoadout` equip and a `ReserveItem` of the
      same instance run concurrently, repeated; every run ends with exactly one success and the
      instance is never both worn and LISTED.
- [ ] `go test ./...`, `go vet`, `golangci-lint run` clean in items-service.

## Blocked By

None

## Spec Reference

FS-HBXZN §Requirements A1–A5 (worn refused, one definition, lock-then-read-then-update, check
order, handler statuses); §Acceptance Criteria "items-service"; User Stories 1, 5, 6, 8, 10–12,
15, 17, 18.

## Files expected

- `game-server/items-service/internal/items/service.go` (ReserveItem)
- `game-server/items-service/internal/items/handler.go` (ReserveItem handler)
- `game-server/items-service/internal/items/service_test.go`, `handler_test.go`,
  `repository_test.go` or `checkout_test.go` (where the existing reserve tests live)

## TDD Approach

- RED: service test — wear an AVAILABLE instance, `ReserveItem` it, expect `*errcode.Refusal`
  with `ItemWorn` and the row unchanged.
- GREEN: lock + placement read + checks before `ReserveItemTx`.
- RED: handler test — a service returning `ErrNotFound` maps to `codes.NotFound`; a plain error
  maps to `codes.Internal` whose message does not contain the error text.
- GREEN: the handler switch.
