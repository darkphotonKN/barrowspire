---
id: I-BDA7X-2
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-1]
labels: [ready-for-agent]
title: "FS-BDA7X slice 2: Typed gateway character surface with level and experience"
---
Implements FS-BDA7X §Requirements (Gateway read 35–36, 38), §API surface

**Domain:** api-gateway + generated client (`openapi.yaml`, `game-client/src/api/generated/`) · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

The member's characters, with level and experience, readable and manageable over HTTP.

- Typed Huma operations under a new `characters` tag, all protected (per-operation JWT, as the
  other serialized groups): `create-character` (POST `/api/characters`), `list-my-characters`
  (GET `/api/characters`), `get-character` (GET `/api/characters/{characterId}`),
  `delete-character` (DELETE `/api/characters/{characterId}`). Wire types `CharacterCreate`,
  `Character`, `CharacterList` exactly as §API surface (camelCase). Member identity from the JWT
  only.
- Remove the legacy gin `POST /api/character/` and its handlers (no client consumer). This is a
  deliberate replacement, not a serialize-on-touch wrap: ADR-0002 §5 puts new/changed endpoints
  on the normal chain. Record the before/after in the PR.
- Fix the gateway character client's `serviceName` (`auth` → `character`).
- Error mapping through the FS-22WKC seam: InvalidArgument → `400 · VALIDATION_FAILED`,
  AlreadyExists → `409 · ALREADY_EXISTS`, NotFound → `404 · NOT_FOUND`, Unavailable → `503`.
  Read `docs/agents/contract-patterns.md` before mapping.
- `make openapi && make client`; commit handler, `openapi.yaml` and generated client together.

## Acceptance Criteria

- [ ] All four ops match §API surface (paths, status codes, `status · code` errors, fields).
- [ ] Unauthenticated calls → `401 · UNAUTHENTICATED`; another member's id → 404.
- [ ] `POST /api/character/` is gone; gin and Huma do not both own any path.
- [ ] `openapi.yaml` + generated client regenerated, not hand-edited; `make gates` passes.
- [ ] Handler tests with a fake character client cover each error row.

## Blocked By

I-BDA7X-1 (character gRPC contract)

## Spec Reference

FS-BDA7X §Requirements 35–36, 38; §API surface (all `characters` rows); §Acceptance Criteria
"Character identity" (gateway rows) and "Contract". User Stories 2–5, 25.

## TDD Approach

- RED: `list-my-characters` returns the fake client's characters with `levelFloor` / `nextLevelAt`.
- GREEN: typed op + registration in `contract.RegisterOperations`.
