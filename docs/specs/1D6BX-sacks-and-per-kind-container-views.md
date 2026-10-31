# FS-1D6BX: Sacks and per-kind container views

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Sacks as a floor container alongside chests"; `game-client/SPECIFICATION.md` "### Presentation" → "Distinct look per container kind" → this FS · Brownfield: retrofits [FS-2325V](2325V-pre-rendered-isometric-art.md) §D (container-open presentation, the satchel) and the FS-none "Container loot drops from the template pool" · Interacts with: [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (chest drop, drop piles R46/R61), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (field container roll R32, field piles), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (Forest clearing chests R19) · Blocked by: `docs/issues/I-UNANCHORED-2-containers-can-roll-empty.md` (the empty-then-count roll shape the sack roll uses) · Sibling tuning (not this FS): `docs/issues/I-UNANCHORED-3-loot-scarcity-tuning.md`

## Scoping notes (raw)

### How this arrived (scope-it, 2026-10-31)

The ask had three parts. (1) Make loot scarce: containers always held something (2–4 items),
so a party could run to every container and farm, and loot should be earned. (2) Add a second
floor container that looks like a bag on the floor, with even worse odds than a chest. (3) Give
each container kind its own pop-up view: the chest gets a plain box, the new floor bag keeps
today's satchel.

**Kranti split it explicitly:** the rate cuts, the empty roll and the lower Forest chest spawn
rate are **fixes and tweaks, not FS content**. They live in two issue files (I-UNANCHORED-2 fix,
I-UNANCHORED-3 tweak). This FS carries only the new capability: the sack as a container kind, and
a distinct look (floor prop + container view) per kind. Do not pull tuning numbers into the
requirements when this is promoted. The sack's odds being *lower than a chest's* is a rule here;
its actual numbers live in tuning (I-UNANCHORED-3).

### What exists today (read from code at scoping)

- `components.ContainerKind`: `chest`, `drop_pile`. Serializer emits `kind` on `containers[]`.
- Run floor: `buildFloor` calls `CreateContainer()` **once**, so exactly one chest per floor.
- Forest: each side dead-end clearing holds a chest at `ForestChestShare` (0.5), else an elite,
  and at least one chest is guaranteed when there are two or more dead ends.
- Chest contents roll on first open (`rollChest` → `generateItemsAt`, or the field roll derived
  from it × `DropFactor`). `generateItemsAt` always rolls 2–4 items, split by
  `weaponDropRate`/`armorDropRate`/`consumableDropRate` = 0.2 / 0.3 / 0.5 (Kranti's design).
- Drop piles: kill drops only (monster chances in `loot_tuning.go` `MonsterDrops`).
- Client: `ContainerView` is the leather **satchel** with a flap-open animation (FS-2325V §D).
  It opens for chests and drop piles alike. The chest floor sprite is `render/world/chest`, the pile
  is `render/world/dropPile` (bone heap placeholder).

### Decisions

- **Three container kinds, three looks:**
  | Kind | Floor look | Container view | Animation |
  |---|---|---|---|
  | chest | existing chest prop | **coffer**: a simple square open box facing the player, items seen inside it | none (no lid opening) |
  | **sack** (new) | new sack prop | today's **satchel** | keeps the flap opening |
  | drop pile | existing bone heap | **bone heap**: the heap with the items lying on top | none |
- **Name: "sack".** Rejected "bag": it collides with **Bag** (the carried inventory, FS-HRH2J,
  both CONTEXT.md files). Rejected "pouch" and "loot bag" (the latter sits too close to Bag).
- **The views are an art swap only.** Coffer and bone-heap views keep every satchel rule:
  they open and close on the same triggers, use the same item hover tips, send the same
  `Interact` loot message on click under the same pending (`lootedAt`) guard, and use the same
  item grid/slots. Only presentation and the missing animation differ.
- **Sack share:** a spawn that would place a chest places a sack instead at one tuning
  constant, default **~1 in 3** (0.33). Applies **wherever chests spawn**: the run floor's
  container and Forest clearing chests. Rejected: 50/50, and runs only.
- **Sack roll:** the same roll as a chest's (the empty roll first, then a 1–N count, with the
  0.2/0.3/0.5 type split untouched), at **lower odds than a chest's**. A field sack derives
  from it × `DropFactor`, the way a field chest does.
- **Odds ordering:** chest > sack > drop pile. Drop piles stay **kill-drops only** (not seeded
  on floors). "Lowest" is met by giving the monster drop chances the biggest cut
  (I-UNANCHORED-3).
- **Wire:** `containers[].kind` gains `"sack"`. WS contract, not the HTTP/OpenAPI one. The client
  treats an unknown kind as a chest (defensive), to be decided at promotion.
- **Field sacks restock like field chests** (implied by "wherever chests spawn"; confirm at
  promotion).

### Alternatives rejected (roll shape, decided here, implemented in I-UNANCHORED-2)

- Per-item keep chance over the old 2–4 slots: emptiness falls out naturally (~50%), but
  emptiness and count can't be tuned apart.
- Weighted count table (0/1/2/3 items): the most explicit, but more to tune.
- Chosen: an **empty roll, then a count**, with two numbers per container kind.

### Constraints

- Art is **built in code, never sourced** (ADR-0020, ADR-0021, memory "build art, don't
  source"). The sack floor prop and the coffer/bone-heap views are code-built, held to the
  Ultima Online fidelity bar, and gated on a contact sheet. Appearance work routes through
  `docs/theming_plan.md` and `game-client/docs/design-guideline.md`. The guideline needs a
  container-views amendment.
- Server is the **human lane**: server slices (sack kind, spawn share, sack roll, serializer)
  default to Kranti hand-coding them unless he asks otherwise at slicing.
- The ECS rule holds: `ContainerKindSack` is data on `ContainerComponent`, and behaviour stays in systems.

### Edge cases raised

- **An empty container still opens** and shows an empty coffer/satchel. Don't hide the view, or
  the player can't tell "empty" from "refused".
- With one container per run floor and a ~60% empty chest roll, most floors yield nothing from
  their container. This is intended ("needs to be earned"), but watch it in playtest.
- A drop pile's emptied state is already filtered from drawing (`kind !== "drop_pile" ||
  items.length > 0`). The bone-heap view only ever opens on a non-empty pile.
- A boss pile can hold 2–3 items (the boss drop). The bone-heap layout must fit at least that.

### Open questions (not settled)

- The coffer's exact perspective (straight-on front vs. slightly from above) is left to the art
  pass and the contact sheet.
- Whether an emptied sack keeps drawing on the floor (a chest does, as open) or disappears.
- Whether the unknown-kind fallback on the client is chest or satchel.
