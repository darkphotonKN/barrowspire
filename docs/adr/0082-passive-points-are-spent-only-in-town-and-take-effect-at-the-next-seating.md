# ADR-0082 — Passive tree points are spent only in town and take effect when the character is next seated

Status: accepted
Date: 2026-11-21
Scope: `game-service`'s handling of a passive tree spend and how held ranks reach a character's
body in every world (the HUB world, fields, runs, the same-pod switch, the return to the HUB, a
field visit, a handoff seat); `game-client`'s tree overlay. Not the spend rule itself or who
stores the ranks (ADR-0083).
Specified by: [FS-8RZ51](../specs/8RZ51-passive-skill-tree.md) §D (R16–R22), §F (R24, R27),
§G (R38).
Builds on: [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one
connection, held across world switches),
[ADR-0079](0079-the-acting-player-of-an-inbound-message-is-the-connections.md) (the spender is the
connection's player).

## Context

Settled by Kranti during scoping on 2026-11-21 ("spending only in town and viewing anywhere"),
with the effect timing and the queued refusal taken as charter defaults and a v1 pick in the FS.
Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **The seating already builds the body.** Every world seats a character from its class, level
  and worn gear. One place to apply the tree keeps passives beside gear (FS-8RZ51 R25) rather than
  patched into live bodies in several places.
- **A spend can land while the body is elsewhere.** A field or a run may be on another pod, and a
  run's body was seated from the character as it was when the party was built. Pushing a mid-run
  change into that body would need a cross-pod update for a feature whose point is choice, not
  combat power.
- **A queued member's run is built from the character they queued with.** A spend between queueing
  and seating could be lost by a run on another pod, and the matchmaker is not to be touched.
- **The player expects to see a spend.** Spending in town with no visible change reads as a bug.

## Decision

1. **A passive point is spent only in the HUB world ("town").** game-service refuses a
   `spend_passive_point` from a player whose record names no world or any world but the HUB, and
   does so without calling character-service. The tree can be viewed in every world; outside
   town its nodes take no clicks ("Points are spent in town.").
2. **A spend is refused while the player is queued for a run**, again without calling
   character-service ("Leave the queue to spend points.").
3. **Held ranks take effect when a character is seated in a world.** Every seating (the HUB, a
   field, a run, the same-pod switch, the return to the HUB, a field visit, a handoff seat) builds
   the body's passive bonuses from the ranks held at that moment.
4. **The one exception: a spend in town updates the HUB body at once.** On success the character
   in play merges the returned ranks (higher rank per node wins) and the HUB body's bonuses are
   recomputed; a max HP or max resource that rose raises its current value by the same amount.
5. **A body already in a field or a run never changes for a spend.** It sees the new ranks from its
   next seating.

## Consequences

- There is one apply path (seating) plus one recompute (the HUB body after a spend); no cross-pod
  push, no live patching of combat bodies, and no change to the matchmaker.
- A point earned in a run shows in `passive_points` there at once, but can only be spent back in
  town. This is accepted: the run's level-up still pays off on return.
- Percent-of-max-HP bonuses are fixed at seating; a level-up later in the same world does not
  recompute them until the next seating (FS-8RZ51 R26).
- Leaving the queue is the price of spending while queued. A future feature that lets a spend
  reach a live combat body, or lets a queued member spend, supersedes this ADR.
- Reviewers can read any code that applies ranks outside seating (other than the HUB recompute) as
  a violation of this ADR.
