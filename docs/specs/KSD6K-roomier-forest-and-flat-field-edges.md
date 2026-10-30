# FS-KSD6K: Roomier Forlorn Forest and flat field edges

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Field worlds" → "Roomier Forlorn Forest"; `game-client/SPECIFICATION.md` "### Field worlds" → "Field edges without a horizon" · Supersedes in part: FS-3QHQZ R11/R12 (Forest size, trail width) and its spawn counts; FS-X2F2H R54 (horizon behind the far edge) and FS-3QHQZ's horizon look · Related: ADR-0030 (fields built at boot per replica)

## Scoping notes (raw)

Session 2026-10-30 `/scope-it`, Kranti. Tuning and presentation, low cost if wrong, **(not
challenged)**. Agent lane for server and client.

**Problem (user's words, condensed):** the Forest has too many enemies and needs to be bigger.
"There should be a little bit more space because you get stuck a lot now." Players can't zoom
out, so they should not see the full map at once: "you keep walking, you'll see more." Mobs
around, stuff to hit. "Later we'll add stuff to enter" (not now). Spacing bigger, "but not as
open-ended as the meadows". The backdrop should just be a colour that gives atmosphere, not a
picture like the Meadows has; remove the Meadows' picture too ("too low resolution"). "What
you're looking at from the 2D isometric perspective is all that matters. Everything cut off is
just off the map."

**Today (main ae6f2ad):** `levelgen.ForestParams` 26×17 cells of 80 px (2080×1360,
`constants.ForestMapWidth/Height`), `TrailWidth: 2` (160 px), `ClearingRadius: 2`,
`WallBudget: 120`; `ForestSpawnPointsMin/Max` 18/24, `MonsterSpacing` 60,
`ForestEntranceExclusion` 400 (`game/monster_tuning.go`). The "picture" is not an image file:
it is a horizon drawn in code (`render/world/horizon.ts`, `planHorizon`/`addHorizon`, the
`horizon` field of `MEADOWS_LOOK`/`FOREST_LOOK` in `render/world/fieldLook.ts`, used in
`FieldScene`). The hub draws no horizon.

**Decided** [user picked the recommended option on each]:
- **Forest ~1.5× per axis:** about 39×25 cells (~3100×2000 px), **3-cell (240 px) trails**,
  **12–16 monsters** (roughly a third of today's density). You cannot see the whole map from any
  one spot. Not as open as the Meadows: it stays a branching-trail forest.
- Other generator knobs (branches, branch steps, clearing radius, wall budget, spacing,
  entrance exclusion) scale as needed to keep the generator valid at the new size; the
  1 000-seed property test stays the gate.
- **No horizon in either field.** Past the map edge is a **flat tint per field**: deep
  moss-black for the Forest, a soft muted green-grey for the Meadows. No sky, hills or land.
- Meadows' size and population are unchanged.

**Rejected:** ~2× with the same monster count (too much walking between fights); same size
with fewer mobs (doesn't fix "you see the whole map"); plain black everywhere (loses mood).

**Edge cases raised:**
- Camera: with the horizon gone, whatever the camera shows past the edge is the tint; the
  ground must not end in a hard seam that looks like a bug.
- Arrival inset, gate range, elite clearings and chest placement depend on map size; re-check.
- Monster respawn (45 s) and spawn spacing at the new density.
- Server and client must agree on the forest's bounds (constants + the generated layout).
- Design guideline (`game-client/docs/design-guideline.md`) mentions the horizon for the
  fields; amend it.

**Open:** exact tint values (pick against the look; gate on a contact sheet / screenshot);
exact generator parameters (pick for validity + feel).

**Out of scope:** enterable Forest structures (later), new monster types, Meadows layout.
