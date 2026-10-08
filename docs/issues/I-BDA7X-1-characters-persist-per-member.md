---
id: I-BDA7X-1
status: done
implements: FS-BDA7X
blocked_by: []
labels: [ready-for-agent]
title: "FS-BDA7X slice 1: Characters persist per member, with the shared experience table"
---
Implements FS-BDA7X §Requirements (Character identity 1–4; The experience table 14–15)

**Domain:** proto + character-service + `game-server/common` · **Touches `internal/game/session.go`:** no · **Lane:** backend human lane by default (root `CLAUDE.md`); agent-ready if handed to `/develop`.

## What to Build

The foundation: character-service actually owns characters, scoped by member, and knows their
level and experience.

- Reshape `common/api/proto/character/character.proto` (fix `package items` → `character`):
  `CreateCharacter(member_id, name, class)`, `ListCharacters(member_id)`,
  `GetCharacter(member_id, character_id)`, `DeleteCharacter(member_id, character_id)` (soft
  delete). The returned `Character` carries id, name, class, level, experience, level floor,
  next-level threshold (unset at the cap), created-at. Regenerate; never hand-edit `.pb.go`.
- character-service: the model maps `player_id`, `class_id`, `level`, `exp`, `deleted_at`; fix the
  broken insert (no `player_id` / `class_id`, five args for four placeholders); member-scoped
  reads and delete where another member's, deleted and unknown are all not-found; class must be
  `warrior|mage|archer`, name 1–32 after trim, case-insensitive uniqueness → AlreadyExists.
  Repos translate DB errors via `commonhelpers.WrapDBErr` (unique violation → sentinel).
- A small package under `game-server/common/` holding the R14 table: level-for-experience
  (capped at 20), level floor, next-level threshold. character-service uses it to fill the
  response fields. game-service will reuse it (slices 4–6).

No migration is needed for this slice (columns exist).

## Acceptance Criteria

- [ ] Create stores member, class, name; returns level 1, experience 0, floor 0, next 100.
- [ ] List returns only that member's live characters, oldest first.
- [ ] Get/Delete of another member's, a deleted, or an unknown character → NotFound.
- [ ] Unknown class / empty / over-32 name → InvalidArgument; taken name (any case) → AlreadyExists.
- [ ] Table-driven test pins every row of R14 (level boundaries, cap at 20, no next at 20,
      experience above the cap stays level 20).
- [ ] `go test ./...` green in character-service and common.

## Blocked By

None

## Spec Reference

FS-BDA7X §Requirements 1–4, 14–15; §Acceptance Criteria "Character identity" (service side);
§Edge States "Foreign character id", "fresh member". User Stories 1–3, 5, 25, 27.

## TDD Approach

- RED: progression table test (level for 0, 99, 100, 38,529, 38,530, 1,000,000).
- RED: repository test — create then list for member A is empty for member B.
- GREEN: package + repo + service + gRPC handler.
