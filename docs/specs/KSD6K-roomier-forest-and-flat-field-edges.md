# FS-KSD6K: Roomier Forlorn Forest and flat field edges

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Field worlds" → "Roomier Forlorn Forest"; `game-client/SPECIFICATION.md` "### Field worlds" → "Field edges without a horizon" → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (fields built at boot per replica; unchanged) · Supersedes in part: [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) R11, R12, R16 and the Forest's horizon; [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) R54's horizon (see "Supersession") · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) "Field worlds may be daylit instead" · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md)

> Promoted `--from-thread` on 2026-10-30 from the draft's scoping notes (`/scope-it`, Kranti,
> 2026-10-30) and an owner-approved charter; no interview was held. **[user]** marks the owner's
> own call in scoping, **[charter default]** a default the owner approved wholesale (reason
> given), **[write-a-spec]** a gap this promotion filled at acceptance-criteria level. Code
> citations are against `f0aca6c` (feat/town-interiors-and-field-edges). Tuning and presentation,
> low cost if wrong; not challenged. Agent lane for server and client both.

## Summary

The Forlorn Forest is too small and too crowded: you see most of it from one spot and you get
stuck between monsters. It grows about 1.5× per axis with wider trails and about a third of
today's monster density, so walking on reveals more forest and there is room to fight. It stays
a branching-trail forest, never open country like the Meadows. Both fields also lose their
painted horizon: past the map's edge is a flat, moody tint per field, because the isometric view
is all that matters and whatever is cut off is simply off the map.

## Requirements

### §A. A roomier Forest (game-service, level generation)

1. **Size.** The Forest is **39 × 25 cells of 80 px = 3 120 × 2 000 px**.
   `levelgen.ForestParams.Cols/Rows` become 39/25, `CellSize` stays 80, and
   `constants.ForestMapWidth/Height` become 3120/2000. **[user]** ~1.5× per axis; **[charter
   default]** exactly 39 × 25: 26 × 1.5 = 39 and 17 × 1.5 = 25.5, rounded down to keep a whole
   cell grid at today's 80 px cell, so every cell rule and test keeps its unit.
2. **Trail width.** `TrailWidth` is **3 cells (240 px)**. **[user]** "a little bit more space
   because you get stuck a lot now".
3. **The other knobs scale to keep the generator valid.** Starting values, tuned only in
   `ForestParams` (`internal/levelgen/forest.go`): `Branches` 4–7, `BranchSteps` 3–6,
   `MaxBranchDepth` 2, `ClearingRadius` 3 (a clearing stays visibly wider than a 3-cell trail;
   2 is still legal under `Params.Validate` if 3 fails the gate), `SpanShare` 0.6,
   `TurnChance` 0.3, `Gap` 1, `Border` 1, `RetryLimit` 32. `WallBudget` is set to the
   1 000-seed test's logged maximum wall-rect count plus at least 20% headroom (starting 240).
   **[charter default]** the 1 000-seed property test stays the gate: whatever values pass it
   and keep R5 are correct, these are where to start.
4. **The gate.** `TestGenerate_ForestParams_EverySeedValid` passes over 1 000 seeds;
   `ForestParams.Validate()` passes; `TestForestParams_TrailFitsTwoBodiesSideBySide` passes; the
   golden ASCII (`testdata/forest-20261029.golden`) is regenerated with `-update` and the new
   picture is in the diff for review. Every generator rule of FS-3QHQZ R3–R7 still holds
   unchanged (tree of trails, gap, border, reachability, determinism).
5. **Still a forest, not a meadow.** The trail network stays a branching tree carved out of solid
   forest; no parameter makes it open country. The 1 000-seed test logs the mean open share of
   the map beside the wall maximum, so review can see the forest has not gone open. **[user]**
   "not as open-ended as the meadows".
6. **Size-dependent placement re-checked, not redesigned.** The entrance stays on the east edge
   facing the hub; `forestArrivalInset` (140 px) still sets an arriving player on open ground
   beyond the gate's range, clear of every wall by `PlayerRadius`, over 1 000 seeds with the
   3-cell mouth (tune the inset if not); elite clearings and chest clearings are assigned by
   FS-3QHQZ R15's rule, unchanged, from however many dead ends the new layout has. **[write-a-spec]**
   from the draft's edge cases.
7. **No wire change.** No proto, message, field or endpoint changes. The Forest still reaches the
   client as walls, gate, chests and monsters in the existing state. **[charter default]** bounds.

### §B. A thinner, spread-out Forest population (game-service)

8. **12–16 standard spawn points.** `ForestSpawnPointsMin/Max` (`internal/game/monster_tuning.go`)
   become **12/16**. **[user]** roughly a third of today's density on ~2.25× the area.
9. **The Forest's own spacing.** A new tuning value, `ForestSpawnSpacing` (starting **240 px**,
   one trail width), in `monster_tuning.go`, is the minimum centre-to-centre gap between two
   Forest standard spawn points; `forestSpawnPoints` uses it in place of `MonsterSpacing`.
   `MonsterSpacing` (60 px) is **unchanged**. **[charter default]** the charter asked for the
   forest's spacing raised, and to give the forest its own value if the shared one is shared: it
   is (`spawnArea.open` in `monster_population.go` holds every Spire run spawn to it, and its 60 px
   is set by the movement spatial hash, FS-QG1HR D4), so changing it would move the Spire.
   If the population property test (R11) cannot place `ForestSpawnPointsMin` on every seed, lower
   `ForestSpawnSpacing`, never below 120 px (2 × `MonsterSpacing`).
10. **Entrance exclusion kept.** `ForestEntranceExclusion` stays **400 px**. **[charter default]**
    the arrival point stays quiet at any map size.
11. **The population gate.** `TestForestLayout_SpawnPoints` (`internal/game/forest_population_test.go`)
    pins 12/16 and `ForestSpawnSpacing`, and over its seeds every Forest places between 12 and 16
    standard points, each on an open trail cell, off every wall, outside every clearing, ≥ 400 px
    from the entrance and ≥ `ForestSpawnSpacing` from each other. A shortfall stays skipped and
    logged at run time (FS-3QHQZ R16), never forced, but the test treats one as a failure.
12. **Everything else about the population is unchanged:** who spawns (zombies, a ghost 1 in 12),
    the 45 s respawn at the same points (FS-X2F2H), elites only in clearings, chest restock,
    level band, stat and drop factors. **[user]** the change is density, not the cast.

### §C. Flat field edges (game-client)

13. **No horizon in either field.** The painted horizon (sky, hills, land) is removed from the
    Meadows and the Forest: `planHorizon`/`addHorizon`, `HORIZON_DEPTH`, `HorizonLook`/`HorizonPlan`,
    the `horizon` member of `FieldLook` and its two entries, and their uses in `FieldScene.ts`,
    `render/world/scene.ts` and `render/world/index.ts`. `render/world/horizon.ts` and
    `horizon.test.ts` are **deleted** (at `f0aca6c` nothing else imports them). **[user]** "too low
    resolution"; **[charter default]** delete the module when nothing else uses it.
14. **A flat tint past the edge, per field.** `FieldLook` gains one colour for what lies beyond
    the map (call it `beyond`); the field scene sets it as the camera's background and draws
    nothing else there. Mixed from `BARROW_HEX` tokens like every other colour. **[user]**
    - **Forlorn Forest: deep moss-black.** Starting value
      `mix(BARROW_HEX.pitch, BARROW_HEX.arcaneDeep, 0.3)`.
    - **Gentle Meadows: soft muted green-grey.** Starting value
      `mix(mix(BARROW_HEX.arcaneDeep, BARROW_HEX.slate, 0.5), BARROW_HEX.necrotic, 0.25)`.

    **[charter default]** final values are picked against the look and gated on a client-only
    screenshot (R18); the starting values are only where to start.
15. **`landBeyond` goes.** The ground-mean matching that painted the land beyond the edge in the
    ground's own colour is replaced by the flat tint, and removed with its tests.
16. **No hard seam.** Where the ground ends, it meets the tint through a soft edge (starting
    value: the outermost tile-deep band of ground fades into the tint), so the edge reads as the
    map falling away into the field's mood, never as a missing texture or a bug. The Meadows' road
    leading off the west edge fades with the ground. The Forest's edge is mostly its border stands
    and needs the same treatment only where ground shows. **[write-a-spec]** from the draft's
    edge case; the method is the implementer's, the screenshot is the gate.
17. **The client knows the Forest's new size.** `FIELD_SIZE.forlorn_forest` in `FieldScene.ts`
    becomes 3 120 × 2 000, matching `constants.ForestMapWidth/Height` (R1), so the camera bounds
    cover the whole Forest. The test fixture `render/world/forest.fixture.ts`, which claims to be
    the server's golden layout, is regenerated from the new golden (R4) along with its size, and
    client tests that use 2 080 × 1 360 *as the Forest* move to the new size. The Forest's verge
    count (`FOREST_LOOK.verges.count`, 56) scales with the map so the trails keep today's dressing
    density (starting ~120). **[write-a-spec]** "server and client must agree on the forest's
    bounds".
18. **The screenshot gate.** The owner approves each field's edge (the ground meeting the tint)
    on a screenshot produced from the worktree with no backend started. If the field scene cannot
    be reached without a server, a swatch sheet of each field's lit ground tile, its fade band and
    its tint stands in. Tint values change only through this gate. **[charter default]** client-only
    demo flow; no agent-started backends.
19. **The design guideline is amended.** `game-client/docs/design-guideline.md` "Field worlds may be
    daylit instead" no longer promises a horizon backdrop: past a field's edge is a flat tint per
    field, mixed from `BARROW` tokens, that the ground fades into. The amendment is dated and cites
    FS-KSD6K, as earlier amendments do. **[charter default]**
20. **The hub and runs are untouched.** The hub draws no horizon today and changes nothing; runs
    are not field worlds.

### Supersession

FS-3QHQZ and FS-X2F2H are shipped and frozen; their bodies are not edited. From this FS on:

| Shipped clause | Superseded by |
|---|---|
| FS-3QHQZ R11 (26 × 17 cells, 2 080 × 1 360 px, "about twice a tower floor") | R1 (39 × 25, 3 120 × 2 000) |
| FS-3QHQZ R12 (starting parameters: `TrailWidth` 2, branch ranges, `WallBudget` 120) | R2, R3 |
| FS-3QHQZ R16 and its acceptance line (18–24 points, ≥ `MonsterSpacing` apart) | R8, R9, R11 (12–16, ≥ `ForestSpawnSpacing` apart) |
| The Forest's horizon (`FOREST_LOOK.horizon`, built under FS-3QHQZ R22 as amended) | R13, R14 |
| FS-X2F2H R54 "a horizon backdrop (sky and distant hills) behind the map's far edge", D18 "a horizon", user story 18 "with a horizon", and its acceptance line for the horizon | R13, R14, R16 |

Everything else in both FSs stands.

## User Stories

1. As a player in the Forest, I want wider trails, so that I stop getting stuck between monsters and trees.
2. As a player, I want fewer monsters in the Forest, so that I fight a pack at a time instead of wading through a crowd.
3. As a player, I want the Forest's monsters spread out, so that a fight on one trail does not pull in the next.
4. As a player, I want the Forest too big to see from one spot, so that walking on reveals more of it.
5. As a player, I want the Forest to stay a forest of trails, so that it does not become a second Meadows.
6. As a player, I want the arrival point quiet, so that I am not attacked the moment I walk in.
7. As a player, I want the trail still to branch toward clearings with elites and chests, so that a bigger forest has more to find, not just more to walk.
8. As a player, I want monsters to come back at the same places after a while, so that the Forest does not empty out.
9. As a player, I want the Spire's monsters placed exactly as before, so that a Forest change does not change my runs.
10. As a player, I want the edge of a field to read as the edge of the world, so that I never wonder whether the map failed to load.
11. As a player, I want no low-resolution picture behind the fields, so that the view looks as crisp as the ground I walk on.
12. As a player in the Forest, I want the dark past its edge to feel like more forest swallowed by gloom, so that the mood holds right to the border.
13. As a player in the Meadows, I want a soft green-grey past the edge, so that the field still feels open and calm without a painted sky.
14. As a player, I want the ground to fade into that colour, so that there is no hard line where the world stops.
15. As a player, I want the road home in the Meadows to fade out with the ground, so that the way back still reads as leading somewhere.
16. As a player, I want the camera to follow me into every corner of the bigger Forest, so that I never walk off screen.
17. As a player on a slower machine, I want fewer things drawn behind the world, so that the fields cost no more frames than before.
18. As the owner, I want to approve each field's edge colour on a screenshot, so that the mood is right before it ships.
19. As the owner, I want the generator's 1 000-seed test to stay the gate, so that a bigger forest never ships a broken layout.
20. As the owner, I want the golden layout picture in the diff, so that I can see the new forest's shape in review.
21. As a developer, I want the Forest's size, trail width and population tuned in the same few places as before, so that the next tuning is one edit.
22. As a developer, I want the Forest's spawn spacing separate from the Spire's, so that tuning one never moves the other.
23. As a developer, I want the server's and the client's Forest bounds to match, so that the camera and the world agree.
24. As a developer, I want the horizon code deleted rather than left unused, so that nobody maintains a backdrop nothing draws.
25. As a developer, I want the design guideline to say what the fields now look like, so that the next art change does not bring the horizon back.
26. As an operator, I want no wire change, so that the change ships as tuning and art, not a protocol migration.

## Acceptance Criteria

**Server (game-service)**

- [ ] `levelgen.ForestParams` is 39 × 25 cells of 80 px with `TrailWidth` 3; `constants.ForestMapWidth/Height` are 3120/2000; the boot test asserts the built Forest's size equals them.
- [ ] `TestGenerate_ForestParams_EverySeedValid` passes over 1 000 seeds and logs the max wall rects, retries and mean open share; `WallBudget` is at least 20% above the logged max.
- [ ] `ForestParams.Validate()` and the two-bodies trail-width test pass.
- [ ] The golden ASCII for seed 20261029 is regenerated and committed; it shows a branching-trail forest with clearings, not open ground.
- [ ] Generator tests that need a first-attempt failure, or a too-small map, still find one (with their own params if `ForestParams` no longer produces one).
- [ ] Over 1 000 seeds the arrival point is on open ground, clear of walls by `PlayerRadius` and beyond the gate's range; the entrance is on the east edge.
- [ ] `ForestSpawnPointsMin/Max` are 12/16; `ForestSpawnSpacing` exists (starting 240 px, never below 120) and is the only spacing `forestSpawnPoints` uses; `MonsterSpacing` is 60 and every Spire spawn test passes unchanged.
- [ ] `TestForestLayout_SpawnPoints` pins 12/16, 400 px and `ForestSpawnSpacing`, and every seed it runs places 12–16 points meeting R11.
- [ ] No `.proto`, generated code, `internal/matchmaker` or `internal/match_queue` file changes; Meadows size, spawn points and tests unchanged.
- [ ] `go test ./...` and lint in game-service: no new failures versus the branch point.

**Client (game-client)**

- [ ] No file imports `horizon`; `render/world/horizon.ts` and its test are gone; `FieldLook` has no `horizon` member; `HORIZON_DEPTH`, `addHorizon` and `landBeyond` are gone.
- [ ] `FieldLook` carries a `beyond` tint for each field, mixed from `BARROW_HEX`; the field scene sets it as the camera background; the Forest's is a deep moss-black and the Meadows' a muted green-grey.
- [ ] The ground fades into the tint at the map edge in both fields; the Meadows road fades with it.
- [ ] `FIELD_SIZE.forlorn_forest` is 3 120 × 2 000; `forest.fixture.ts` matches the new golden; Forest-sized client tests use the new size; the verge count is scaled.
- [ ] An unknown field id still falls back to the Meadows look, tint included.
- [ ] The owner approved each field's edge on a client-only screenshot (or the swatch stand-in); the approved tints are what is committed.
- [ ] `design-guideline.md` is amended (dated, citing FS-KSD6K): flat per-field tint, no horizon.
- [ ] `npm test`, lint and `lint:fence`: no new failures versus the branch point.

## Edge States

- **Camera in a corner.** With the horizon gone, most of the view near a corner is tint. That is
  the intended look; the fade (R16) keeps the boundary soft.
- **Window resized mid-field.** The tint is the camera background, so any size shows it; nothing
  to re-plan (the horizon's resize planning goes with it).
- **Unknown field id.** Falls back to the Meadows look, its tint included (FS-X2F2H's fallback).
- **A seed that cannot place 12 spawn points.** At run time the shortfall is skipped and logged
  (FS-3QHQZ R16) and the Forest runs with fewer monsters; the property test fails on it, so
  `ForestSpawnSpacing` or the parameters are retuned before merge.
- **A seed that needs generator retries.** Unchanged: deterministic retries from derived seeds up
  to `RetryLimit`, then `ErrNoLayout` at boot (FS-3QHQZ). The 1 000-seed test keeps every seed
  inside the limit.
- **More walls on the wire.** A bigger forest has more wall rects in every state broadcast; the
  wall budget (R3) caps it as before (FS-3QHQZ R21). The client draws a stand per wall rect, so
  the stand count rises with it.
- **Mixed versions while rolling out.** An old client against the new server clamps its camera to
  2 080 × 1 360 inside a 3 120 × 2 000 world, so a player can walk out of view. A new client
  against an old server only shows extra tint. Ship the client's bounds (R17) with or before the
  server's size (R1).
- **Reduced motion.** Nothing new moves; the horizon's parallax goes away.
- **Disconnect or death in the Forest.** Unchanged: respawn at the entrance's arrival point
  (FS-X2F2H), which R6 re-checks at the new size.

## Out of Scope

- Enterable Forest structures ("later we'll add stuff to enter").
- New monster types or a changed Forest cast; Meadows size, layout and population.
- Any change to `MonsterSpacing`, the Spire's spawn placement, or the hub.
- Any proto, message or endpoint change; the client learning a field's size from the wire.
- `internal/matchmaker`, `internal/match_queue`, stats, and starting any backend service.
- A zoom-out control; zoom stays as it is.
- **Vocabulary** (not written by this FS; route through `domain-model` if wanted): game-client
  `CONTEXT.md` may gain *Edge tint* (the flat colour a field shows past its map edge).

## Decision log

| # | Decision | Source |
|---|---|---|
| 1 | Forest ~1.5× per axis, 3-cell trails, 12–16 monsters; still a branching-trail forest | [user] |
| 2 | Other generator knobs scale; the 1 000-seed property test stays the gate | [user] |
| 3 | No horizon in either field; a flat tint per field past the edge (Forest moss-black, Meadows muted green-grey) | [user] |
| 4 | Meadows size and population unchanged | [user] |
| 5 | Exactly 39 × 25 cells of 80 px (3 120 × 2 000) | [charter default] whole cells at 1.5×, cell unchanged |
| 6 | Starting params: branches 4–7, steps 3–6, clearing radius 3, wall budget = 1 000-seed max + 20% | [charter default] tuned until the gate passes |
| 7 | `ForestSpawnSpacing` (240 px, floor 120) instead of changing the shared `MonsterSpacing` | [charter default] `MonsterSpacing` is shared with the Spire |
| 8 | `ForestEntranceExclusion` 400 kept | [charter default] |
| 9 | Tint starting values; final values through a client-only screenshot | [charter default] |
| 10 | Horizon module deleted; guideline amended | [charter default] |
| 11 | Ground fades into the tint at the edge (no hard seam) | [write-a-spec] from the draft's edge case |
| 12 | Client `FIELD_SIZE`, fixture and verge count follow the new size | [write-a-spec] server and client agree on bounds |
| 13 | Mean open share logged by the 1 000-seed test | [write-a-spec] makes "not as open as the Meadows" reviewable |
| R | Rejected: ~2× with the same monster count; same size with fewer mobs; plain black everywhere | [user] |
