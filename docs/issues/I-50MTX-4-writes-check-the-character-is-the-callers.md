---
id: I-50MTX-4
status: done
implements: FS-50MTX
blocked_by: [I-50MTX-3]
labels: [ready-for-agent]
title: "FS-50MTX slice 4: gear writes check the character belongs to the caller"
---
Implements FS-50MTX §Character ownership

**Hotspot:** one writer at a time on `items-service/internal/items/{service,handler}.go`.

## Files owned

- `game-server/items-service/grpc/character/client.go`, `model.go`, `client_test.go` (new, the shape of `grpc/auth`)
- `game-server/items-service/cmd/server/main.go`
- `game-server/items-service/config/routes.go`
- `game-server/items-service/internal/items/service.go`: `NewService`, a consumer-owned interface, the guard in `UpdateLoadout` and `MoveItemInstance`
- `game-server/items-service/internal/items/handler.go`: the two handlers' error mapping
- `game-server/deploy/kind/items-config.yaml`
- Every `NewService(` call in `internal/items` tests, a mechanical argument: `checkout_test.go`, `grant_test.go`, `handler_test.go`, `process_extracted_test.go`, `repository_test.go`, `service_test.go`, `snapshot_test.go`

## What to Build

**The check (R10, R11).** `service.go` defines a narrow interface for one question, whether this
character belongs to this member, injected through `NewService`. The `grpc/character` client backs it
with character-service's existing `GetCharacter(member, character)`. `NotFound` and `InvalidArgument`
become a not-found error; anything else becomes an unavailable error (`game-service/grpc/character`
makes the same split).

`UpdateLoadout` and `MoveItemInstance` run it first, **before the transaction and never under the
account lock**. A foreign, deleted or unknown character answers `404 · NOT_FOUND`. character-service
unreachable answers `503 · SERVICE_UNAVAILABLE` (gRPC `codes.Unavailable`, which the gateway surfaces
as 503) and writes nothing. Reads and checkout make no such call (R12, R27).

character-service runs no auth interceptor (`character-service/cmd/server/main.go`), so the call needs
no forwarded token. The dial is lazy, so items-service boots with character-service absent.

**Configuration (R13, charter default).** items-service reads `CHARACTER_ADDR`, same pattern as
`AUTH_ADDR`: `commonhelpers.GetEnvString("CHARACTER_ADDR", "localhost:7123")` in `main.go`, and
`CHARACTER_ADDR: "character-headless:7123"` in `deploy/kind/items-config.yaml`.

**Not in this issue:** `deploy/gke/items-config.yaml` also lacks `CHARACTER_ADDR`, and the charter names
only the kind file. Without it GKE items-service falls back to `localhost:7123` and every equip and move
answers 503. It needs adding before this reaches GKE; that is a separate call from this charter.

## gRPC compile

**No request field changes.** `character.proto` is used as it is. Nothing else needs to compile
differently. `NewService` gains an argument, so its call sites in `internal/items` tests move with it,
in this slice.

## Acceptance Criteria

- [ ] `UpdateLoadout` or `MoveItemInstance` naming a foreign, deleted or unknown character answers `404 · NOT_FOUND`, nothing written.
- [ ] character-service unreachable on those writes answers `503 · SERVICE_UNAVAILABLE`, nothing written.
- [ ] The check runs before the account lock is taken: a stub proves no transaction opened on refusal.
- [ ] A loadout read, an instance list and a checkout make no character-service call.
- [ ] `CHARACTER_ADDR` is read as `AUTH_ADDR` is, and is set in `deploy/kind/items-config.yaml`.
- [ ] `go test ./...` in `items-service` passes.

## Blocked By

I-50MTX-3 (one writer on the hotspot). Nothing else waits on it.

## Spec Reference

FS-50MTX R10-R13, R27; user story 20; Edge States "Unauthorized".

## TDD Approach

- RED: `UpdateLoadout` with a stub saying the character is not the caller's returns not found, and with a stub returning unavailable returns the unavailable error, both with no repository call.
- GREEN: the guard at the top of both service methods, then the handler mapping and the client.
