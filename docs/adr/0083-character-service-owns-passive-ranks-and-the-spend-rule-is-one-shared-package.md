# ADR-0083 — character-service owns passive ranks; the spend rule is one shared package checked by both services; the target rank is the idempotency key

Status: accepted
Date: 2026-11-21
Scope: the passive tree's data and rule: `game-server/common/passivetree`, character-service's
ranks table and `SpendPassivePoint` RPC, game-service's pre-check of `spend_passive_point`, and the
client golden `game-client/src/data/passiveTree.golden.json`. Not where or when a spend is allowed
in the world (ADR-0082).
Specified by: [FS-8RZ51](../specs/8RZ51-passive-skill-tree.md) §A (R1, R5, R6), §B (R7–R10),
§C (R11–R15), §D (R17–R22), §API surface.
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) (idempotency belongs to the
caller), [ADR-0023](0023-one-postgres-instance-database-and-role-per-service.md) (a database per
service).

## Context

Taken as charter defaults (approval by Kranti, 2026-11-21) in FS-8RZ51: persistence in
character-service with derived points, the shared definition package, and the spend over the game
socket. The second check at the write is a v1 pick in the FS. Recorded without adversarial review:
no `challenge-me` pass was run.

Forces:

- **character-service owns the character.** Its level is already persisted there; ranks are more
  of the same character's state.
- **Two services must agree on every rule.** game-service holds the character in play and answers
  the player; character-service writes the rank. Two copies of the tree would drift, and FS-BDA7X
  R15 set the precedent of one shared definition in `game-server/common/`.
- **The check that answers the player is not the truth.** game-service's view can be stale (a
  level grant from a run still in flight, two tabs spending at once); only the owner of the data,
  inside its own transaction, sees what is actually held.
- **Spends are retried.** A lag spike or a client retry must never take a second point, and there
  is no respec to undo one.
- **Node ids are permanent.** Saved ranks point at them and nothing can refund a point.

## Decision

1. **character-service owns passive ranks**, persisted per `(character_id, node_id)` with the rank.
   Unspent points are **derived, never stored**: `earned(level) − Σ ranks held`.
2. **The tree and its spend rule live in one package, `game-server/common/passivetree`**: every
   node's id, tier, slot, max rank and per-rank values, the tier gates, the points earned per
   level, and one spend function that answers allowed or the rule that refused it. Neither service
   keeps its own copy; tuning is an edit to this package only.
3. **Both services run the same rule.** game-service checks it against the character in play and
   refuses without calling character-service; character-service runs it again inside one
   transaction that locks the character row and reads its level and ranks, and its answer is the
   truth.
4. **The target rank is the idempotency key.** A spend names the rank it wants (`rank n` needs
   `n − 1` held). A target already held is a no-op success (`applied = false`, nothing written,
   nothing called), so a retried or duplicated spend is safe without a caller-supplied key. Neither
   service retries a spend on its own; the client's retry is the same target rank.
5. **The client is pinned to the package by a golden.** A Go test in the package writes
   `passiveTree.golden.json` beside the client's data and fails on drift; the client reads the
   tree's structure and numbers from it and keeps only presentation.
6. **Shipped node ids (`<class>.<slot>`) are never removed, renamed, re-tiered or given fewer
   ranks.** Names, copy and per-rank values may be retuned.

## Consequences

- The rule that allows a spend is the rule that saves it; a change to either side is one edit plus
  a regenerated golden, and drift fails a test on both tiers.
- Every spend is one small idempotent write (about 20 in a character's life); concurrent spends are
  serialised by the row lock, and the character in play merges answers by higher rank per node, so
  out-of-order answers still leave it right.
- game-service's check can pass where character-service's refuses (a level still being recorded);
  that case is answered in its own words rather than hidden.
- A change that would invalidate saved ranks needs a refund path first, which does not exist.
- character-service has no SPECIFICATION.md or CONTEXT.md yet; its share of this decision is
  carried by game-service's records until it does.
