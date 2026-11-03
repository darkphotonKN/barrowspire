---
id: I-KCQ06-5
status: done
implements: FS-KCQ06
blocked_by: []
labels: [ready-for-agent]
title: "FS-KCQ06 slice 5: a character name is one word (character-service, migration 000003, game-client creation scene)"
---
Implements FS-KCQ06 §Requirements D17–D20

**Lane: character-service is server code, authorised by Nick's charter "私訊" addendum on 2026-11-03
("限制名字不能包含空格", "db創角色的名字條件要調整").** `/develop` may run this slice.

## What to Build

A new character's name may not contain whitespace, so that the whisper `@Name message` parse
(FS-KCQ06 R12, the name ends at the first whitespace) always finds the whole name.

- **character-service** `internal/character/service.go` `CreateCharacter`: after the existing
  `strings.TrimSpace`, refuse the name if any rune satisfies `unicode.IsSpace`. Use the existing
  `commonconstants.ErrInvalidInput`, with the text "A hero's name is one word.", next to the
  existing 1–32 rune length check. Nothing else about creation changes.
- **Migration `000003`, a NEW up/down pair** under `game-server/character-service/migrations/`.
  The up file adds a validated table `CHECK` constraint on `characters` (no `NOT VALID`):
  `CHECK (name !~ '[[:space:]]' AND strpos(name, U&'\3000') = 0)`. Keep the explicit U+3000
  test: `[[:space:]]` follows the database's ctype and may miss it under a C locale. The down
  file drops the constraint. No existing character has whitespace in its name (Nick,
  2026-11-03: "目前沒有舊角色名字有空白 就直接check"), so validation passes. If some environment
  does hold one, the up migration fails loudly when it adds the constraint. That is intended:
  rename that row and re-run, never weaken the constraint.
  **Never edit `000001` or `000002`.** A schema change is always a new migration (Nick,
  2026-11-03: "schema有調整要用新的add migration不是改舊檔案").
- **game-client** `src/scenes/CharacterCreationScene.ts`: after its existing trim, refuse a name
  containing whitespace before sending, with "A hero's name is one word.". Keep showing the
  server's refusal if one comes back. Canvas menus wear `palette.menu` (game-client/CLAUDE.md).
  Tokens only.
- **Existing characters:** none has whitespace in its name, so there is no rename and no data
  migration (R20).

## Acceptance Criteria

- [ ] `CreateCharacter` with a name containing a space, a tab or U+3000 after trimming returns `ErrInvalidInput` ("A hero's name is one word.") and writes no row (table-driven test).
- [ ] Leading and trailing whitespace is still trimmed and the name accepted.
- [ ] With `000003` applied, `characters` carries a validated `CHECK` constraint on `name` (not `NOT VALID`, and no trigger).
- [ ] With `000003` applied, an INSERT with a name containing a space, a tab or U+3000 fails with a check violation, and so does an UPDATE that sets `name` to one.
- [ ] With `000003` applied, a one-word character can still have an experience grant applied (`UPDATE ... SET level, exp`) and be soft-deleted.
- [ ] Migrating up, then down, then up again works on a clean database. Down drops the constraint.
- [ ] Only new migration files: `git diff` shows no change under `game-server/character-service/migrations/` except the new `000003_*.up.sql` / `000003_*.down.sql` pair. `000001` and `000002` are untouched.
- [ ] Client: `CharacterCreationScene` refuses a name with whitespace before sending, shows "A hero's name is one word.", and sends nothing (vitest).
- [ ] Client: a server refusal still shows.
- [ ] Tests pass: character-service `go test ./...` (repository tests that need a DB follow the service's existing opt-in; report if skipped), and game-client vitest.

## Blocked By

None. It is independent of I-KCQ06-1..4.

## Spec Reference

FS-KCQ06 §Requirements D17–D20; User Stories 25, 26, 28 (27 superseded); Acceptance Criteria (charter addendum rows 2–6); Edge States "Name with spaces", "An environment that does hold a whitespace name", "Name with only leading or trailing whitespace", "A caller that bypasses CreateCharacter's check".

## TDD Approach

- RED: `CreateCharacter("Dark Knight")` returns ErrInvalidInput; `CreateCharacter("Dark　Knight")` too.
- GREEN: the `unicode.IsSpace` rune scan after the trim.
- RED (DB, opt-in): an INSERT of 'Dark Knight' fails, an UPDATE setting a name to 'Dark Knight' fails, and an exp UPDATE on a one-word row succeeds.
- GREEN: migration 000003's `CHECK` constraint.
- RED (client): typing "Dark Knight" and confirming shows the message and sends nothing.
