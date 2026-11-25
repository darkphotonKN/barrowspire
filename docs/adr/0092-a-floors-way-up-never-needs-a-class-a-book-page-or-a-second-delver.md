# ADR-0092 — A floor's way up never needs a class, a book page or a second delver

Status: accepted
Date: 2026-11-25
Scope: `game-server/game-service` (the run floor build), `game-client` (its presentation)
Realized by: [FS-5FZ4J](../specs/5FZ4J-sealed-floors.md) (sealed floors), and constrains
[FS-X2CMM](../specs/X2CMM-class-books.md) (class books) and
[FS-4EC7Z](../specs/4EC7Z-dungeon-encounters.md) (hired allies)

## Context

On 2026-11-25 the user turned the Spire into a slow party dungeon crawl: every floor's stairs are
sealed, and the seal is a puzzle (levers in an order, pressure plates held at once, a key behind a
secret door, a chasm, braziers lit against a clock). In the same session the class books were
scoped: per-class pages such as Levitate, Far Hand, Witchlight, Heave and Pick the Lock, each of
which answers one of these puzzles faster.

That pairing invites a design where a page is the answer: the chasm needs Levitate, the far lever
needs Far Hand, two plates need two bodies. Each such floor would stop a party that lacks the
class, a solo delver, and a party that lost a member on the floor before. A run is one-shot (a
delver who dies loses the run's finds), so a floor that cannot be climbed by who is left is a
dead end the player did not choose.

The user approved the rule as a proposal ("book pages are shortcuts, never the only way") and set
the solo rule in their own words: every seal is solvable by one living delver, covering solo
delves and a party reduced mid-run by deaths.

Recorded without adversarial review: no `challenge-me` pass; approved under the 2026-11-25
Spire charter.

## Decision

**Every floor's way up (its seal, any gap on the path to the stairs, and every hidden room the
seal depends on) has a way past that one living delver of any class can take with no book page.**

- A book page, a hired ally, the archer's hound or a second delver may make the way **faster or
  safer**, never **possible**.
- A puzzle that would need two bodies at once is built so one body can do it (Weighted Plates
  always place enough stone blocks to cover every plate), or it does not roll when only one
  delver is alive at the floor's build.
- Timed puzzles size their window to the living count (the Braziers window widens for one delver).
- The slower way is a real, playable path (a spike-gauntlet detour around the chasm, a searchable
  crack in the wall), not a hidden fallback.

## Consequences

- Any party mix, a solo delver and a party reduced by deaths can always climb. A dead end can come
  only from choice (staying, dying), never from the roster.
- The floor build owns a check: each seal it rolls must pass "solvable by one" for the living
  count it was built for, and the property test over many seeds is the gate for that.
- Book pages lose some force as puzzle keys; their value is time and risk saved. Page design in
  FS-X2CMM has to make that worth it (the cooldowns are sized against a 6 to 10 minute floor).
- Puzzle design is constrained: no seal kind may ship whose only answer is a class tool. A new
  kind proposed later must name its one-delver way first.
- The rule binds the way up only. An optional reward (a hidden room's better chest that no seal
  depends on) may still be easier to find with a page.
