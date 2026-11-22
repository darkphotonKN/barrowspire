---
id: I-8RZ51-3
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-2]
labels: [blocked]
title: "FS-8RZ51 slice 3: spend_passive_point in town, the ranks on the character in play, and the tree on current_player (game-service)"
---
Implements FS-8RZ51 §D (R16–R22), §E (R23), §API surface rows 3–4

**Author: agent.** Do not touch `internal/matchmaker` or `internal/match_queue` (user-owned);
the queue entry serialises `types.CharacterInPlay` already, so a new field rides it untouched.

## Files it expects to touch

- `game-server/game-service/internal/types/game.go` (`CharacterInPlay.PassiveRanks`)
- `game-server/game-service/grpc/character/client.go` (map ranks; `SpendPassivePoint`, mapping
  ErrorInfo codes to typed errors) and its test
- `game-server/game-service/common/constants/game.go` (`ActionSpendPassivePoint`)
- `game-server/game-service/internal/gameserver/hub.go` (dispatch, off the loop; refusal words)
- `game-server/game-service/internal/gameserver/server.go` (`CharacterReader` grows the spend, or a
  narrow `PassiveSpender` interface owned here; the town and queue checks; the record merge) and a
  new `passive_spend_test.go`
- `game-server/game-service/internal/types/messages.go` (`CurrentPlayerState` gains
  `passive_ranks`, `passive_points`), `internal/serializer/state_serializer.go` and its test
- the player entity's ranks for the serializer: `internal/game/factory.go` (`PlayerConfig`) and
  `internal/components` (a small component holding the held ranks; slice 4 builds the bonuses on it)

## What to Build

- Entry loads the ranks (`GetCharacter` already carries them after slice 2) onto the character in
  play; the same-pod switch, the return to the HUB, field visits and the handoff seat carry them
  as they carry level.
- `spend_passive_point {node_id, rank}`: the connection's player (ADR-0079). Refuse without a call
  when the record's world is not the HUB world, when the member is queued (the existing
  `QueuedCharacter` read), or when the spend rule refuses against the character in play. A target
  already held: nothing sent, nothing called. Otherwise call character-service **off the message
  hub's loop** with a timeout. On OK merge the returned ranks into the record by higher rank per
  node; nothing is sent. Refusals use `refuse(action, words)` with §Edge States' words; a
  `PASSIVE_NO_POINTS` from character-service that the local check passed reads "Your new level is
  still being recorded. Try again in a moment."; Unavailable / timeout / NotFound read "Could not
  save the point. Try again."
- The body carries its held ranks (a component), set at seating from the character in play, and
  replaced on a successful spend in the HUB world (slice 4 recomputes bonuses from it).
- `current_player` carries `passive_ranks` (node → rank, `{}` when none) and `passive_points`
  (`passivetree.Unspent` from the body's current level) in every world; `other_players` neither.

## Acceptance Criteria

- [ ] The "Spend over the socket" and "Wire" criteria of FS-8RZ51 §Acceptance Criteria, each as a
      test (fake character-service; a blocking fake proves the loop is not held).
- [ ] A spend in a field or run, or while queued, never calls character-service.
- [ ] Two OK answers arriving out of order leave the record at the higher ranks.
- [ ] A level-up in a run raises `passive_points` in that tick's state.
- [ ] `make test` (and lint, check) green in game-service.

## Blocked By

I-8RZ51-2 (the RPC and the ranks on the character read).

## Spec Reference

FS-8RZ51 §D R16–R22, §E R23, §F R31 (ranks on the body), §API surface rows 3–4, §Edge States
(not in town, queued, settling, down, duplicate, two tabs, switch). User stories 9, 11, 12, 15, 24,
25.

## TDD Approach

- RED: a hub spend with a point calls the fake spender once and the next state carries the rank.
- GREEN: the action case, the server method and the serializer fields.
