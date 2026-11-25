# ADR-0099 — Movement pace is one scale on every travel speed, and never on timings

Status: accepted
Date: 2026-11-25
Scope: `game-service` (every speed in px/s), `game-client` (anything that copies one)
Realized by: [FS-TAGWA](../specs/TAGWA-exploration-pace.md)

## Context

The run is being slowed to the pace of an old first-person dungeon crawl. The owner wants to set
that pace by feel after playing it, so it has to be one number, and changing it must not leave a
speed behind: a monster still at the old pace, a projectile that no longer matches the walk it was
tuned against, a client constant animating a block at the old rate.

Speeds live in many places: the delver's `DefaultSpeed`, every monster sheet, the variant step
gain, the ally sheets, the hub residents' amble, the monster shots and the delver attack table.
Some things are stated relative to one of them (the hound at the archer's base speed, the block push
at half the walk) and follow it already. The client keeps a few copies: a block slide rate, the
class cards' Speed figure, comments and tests that say "200".

Timings are the other half of a fight's feel: wind-ups, intervals, cooldowns. Scaling them with the
walk would slow combat, which the charter does not want.

## Decision

1. **One scale.** `PaceScale` in `game-service/common/constants/game.go` is the only pace knob.
2. **Every travel speed is written as its full-pace figure times the scale, where it is defined**
   (`MoveSpeed: 150 * constants.PaceScale`). Not a multiply at a read point: the sheet must say what
   the body does, and a speed added later sits next to fifty examples of the rule.
3. **Projectiles are travel.** Their speeds scale with the walk, so the geometry of stepping out of
   a shot in flight is the same at any pace.
4. **Timings and reach never scale.** Wind-ups, intervals, cooldowns, pins, ranges, radii and max
   flights stay. A move that carries a body a fixed distance in a fixed time (the warrior's charge,
   a monster's pounce) is an attack's timing and reach, not travel, and stays too.
5. **A pin test holds the rule.** One server test lists every class of speed with its full-pace
   figure, and every monster archetype, ally kind and projectile row must appear in it.
6. **The client reads the pace from a server-written golden.** A Go test writes
   `game-client/src/data/pace.golden.json` (`paceScale`, `defaultSpeed`, `blockPushSpeedShare`) and
   fails while it is stale. The client imports it and keeps no literal of a server speed. This is the
   first golden the client reads outside its tests; the hub town golden stays test-only.

## Consequences

- A pace tweak is one constant and `go test ./internal/systems -run TestPaceGolden -update`. The
  client follows with no edit.
- Adding a monster, ally kind or projectile row without the scale fails the pin test.
- A fight keeps its rhythm while walking slows, so a delver steps half as far during a wind-up as
  before. Accepted: tells are read, not outrun.
- Clip strides (`WALK_PACE`, `RUN_PACE`, `HOUND_PACE`) are facts of the baked art, not speeds, and
  are not paced. Playback follows the drawn speed, so feet stay planted at any pace.
- A golden in production code means a server change can break the client build. That is the point:
  the two cannot drift.
