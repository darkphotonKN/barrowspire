---
id: I-8RZ51-15
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-13]
labels: [blocked]
title: "FS-8RZ51 slice 15: a one-time migration clears every passive rank, and the side lock holds under a race (character-service)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-D (V20–V22)

**Author: agent.** Never start a backend. DB tests run with `make test-db` in `game-server/common`'s
pattern (`docs/db-tests-guide.md`). The migrations redesign is deferred: add a plain numbered pair,
which the Dockerfile already copies.

## Files it expects to touch

- `game-server/character-service/migrations/000005_clear_passive_ranks.up.sql` (new, `DELETE FROM
  passive_ranks;`, a comment naming FS-8RZ51 §Change V20 and the one-time refund)
- `game-server/character-service/migrations/000005_clear_passive_ranks.down.sql` (new, a commented
  no-op: the refund cannot be undone)
- `game-server/character-service/internal/character/passive_repository_test.go` (DB tests: the wipe
  and the race)
- `game-server/character-service/internal/character/passive_spend_test.go` (only if the race needs
  a service-level case)

## What to Build

- Existing spends are void. One migration empties `passive_ranks`, which is a full refund for
  every character, ability and specialization included.
- The table, key and rank check are unchanged.
- Two concurrent spends on opposite sides of one character are decided under the existing
  `SELECT … FOR UPDATE`: one lands, and the other is `PASSIVE_SIDE_TAKEN` and writes nothing.

## Acceptance Criteria

- [ ] After `000005` up, `passive_ranks` is empty. A character reads no ranks and no
      specialization, and its unspent points are `earned(level)`.
- [ ] `000005` down changes nothing.
- [ ] DB test: two concurrent spends of `ua1` and `ub1` for one character; exactly one row
      exists after, and the other call is refused `PASSIVE_SIDE_TAKEN`.
- [ ] A spend of a retired id is refused `PASSIVE_UNKNOWN_NODE` and writes nothing.
- [ ] `make test` green in character-service; `make test-db` green.

## Blocked By

I-8RZ51-13 (the side-taken rule and code).

## Spec Reference

FS-8RZ51 §Change: Tree v2 V20–V22, §Edge States (two clients racing, the wipe while online).
User stories 13, 15, 21.
