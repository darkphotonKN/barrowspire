# FS-P0HSP: Minimap in the town and the fields

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" → "Town minimap", "### Field worlds" → "Field minimap" → this FS · Related ADRs: [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md), [ADR-0068](../adr/0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md); an ADR for the field's charted ground is escalated, not written (see notes) · Supersedes in part (stubs on each, their text unedited): [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md), [FS-56CKV](56CKV-minimap-look-and-run-hud-layout.md), [FS-1SEF0](1SEF0-minimap-modes-enlarged-and-overlay.md) · Surface: game-client only

## Scoping notes (raw)

Charter run "村莊與野外小地圖", 2026-11-12. The locked decisions below were approved by Nick on
2026-11-12 ("核准"); his own words are quoted. Decisions the charter set as defaults say so. Not
challenged (no `challenge-me` pass): the decisions arrived formed and approved under the charter.

**Shape (scope-it ownership check).** No line owns a minimap outside a run: "Minimap → FS-SRA9J" sits
under "### Escape run", and FS-SRA9J, FS-56CKV and FS-1SEF0 each put the hub and the fields out of
scope by name (FS-SRA9J §A.1, its Out of Scope and its criterion "Floors 2–3 and the fields show no
fog and no minimap"; FS-56CKV §D.22 and its Out of Scope "the hub's and fields' HUD"; FS-1SEF0's Out
of Scope "an overlay … in the hub or the field worlds"). So this is a **new capability with one FS
and a line in each bounded context it lives in** (### Hub, ### Field worlds), not `## Change:`
sections: the run's minimap keeps every acceptance criterion it has; what is new (a map built from
the town's buildings, NPCs and gates; charted ground in a field, remembered per character) has no
owner. Because three owners' scope exclusions and one criterion (FS-SRA9J's "the fields show no
minimap") stop being true, each gets a pointer stub, `## Change: Minimap in the town and the fields →
FS-P0HSP`, as FS-56CKV and FS-1SEF0 are stubbed on FS-SRA9J, so their ledgers point here without
their text being edited.

**Locked decisions (owner, 2026-11-12, "核准").**
- Scope: the hub (the town) and every field world get a minimap; floors 2–3 stay out. "村莊也要顯示地圖",
  "野外也顯示地圖".
- Town fog: none; the whole town map shows from the start. "村莊不用任何迷霧".
- Field fog: on the minimap only, never on the screen. "這些區域只有地圖有迷霧 畫面不需要迷霧". Charter
  defaults: revealed in a circle round the player as they walk, radius about half a screen width
  (one named value); remembered per character in browser storage (survives revisits on this
  machine, lost on another; try/catch; works without storage); not shared with the party.
- Drawn: the map's outline, walls as lines, buildings as solid footprints, door and road gaps left
  open, in the run minimap's language ("walls are lines, openings are gaps") and its candle-lit look
  (FS-56CKV).
- Icons (owner): "村莊有用的npc可以顯示對應小icon 倉庫顯示寶箱 道具店顯示袋子 塔顯示塔的圖案": stash → chest,
  item shop → bag, the tower (delve entrance) → tower; every other useful NPC or place its own simple
  glyph, listed for the owner. "其他地區接口顯示傳送的icon": every exit to another area shows a
  teleport icon. Field exits only once revealed. Drawn in code, no baked art, at the minimap's
  existing mark size, in amber (interactable).
- Other marks: self and party as in the run; no monsters, no other players, no text labels.
- Modes: M cycles normal → enlarged 1.5x → overlay, as in the run (FS-1SEF0).
- Placement: the top-right column, as in the run; whatever the hub/field has there moves down under it.
- Entering a building: the minimap still shows the whole map; no interior maps in v1.
- Data: only what the client already has; escalate anything server-only.

**What the code says (read 2026-11-12 on 321d2b23).**
- The town's layout reaches the client whole in every hub state: `walls[]` (each town building's
  walls, partition and furnishings, all carrying its `house_id`; `housesFrom` and `doorGaps` in
  `render/world` already rebuild footprints and door gaps), `npcs[]` with `function`
  (`"storyteller"` the Elder, `"storekeeper"` the Quartermaster, `""` everyone else), `gates[]`
  (`spire` (1000, 50), `forest` (40, 580), `meadows` (1960, 360), and `dev_test_room` (120, 900) on a
  dev server, which `gatesInThisBuild` drops in production). The stash chest is a client constant,
  `HUB_STASH_CHEST` at (1180, 245) (FS-VPD8Y). The town is 2000 × 1000 (`HUB_WIDTH`/`HUB_HEIGHT`)
  with no boundary walls: its edge is the server's movement clamp (hub_map.go).
- A field's layout reaches the client in its state too: `walls[]` are its keep-out rects (tree
  stands, rocks), `gates[]` its one entrance, destination `hub` (the road home); its size is the
  client's `FIELD_SIZE` (Meadows 2000 × 1000, Forest 3120 × 2000, dev test room 900 × 600). No
  field-to-field gate exists today (game-service `GateDestination` has spire, forest, meadows, hub,
  dev_test_room); a gate of any destination in a field's state would be drawn as an exit anyway.
- Party membership: `usePartyStore` members' `player_id` match `other_players[].id`
  (`partyFramesLayout.ts`). The character: `useGameStore().activeCharacterId`.
- Nothing stands in the hub's or a field's top-right corner today but the fullscreen button (DOM);
  no dev position readout in either. So nothing moves down; the minimap takes the column's top
  (y 44) alone.
- M is unbound in the hub and the fields.
- **No data is missing; nothing needs the server.**

**Useful NPCs and places in the town (the icon list for the owner).** Function NPCs (FS-MRZH7: an NPC
with a function): the Elder (storyteller) → a scroll; the Quartermaster (storekeeper, keeps the
Quartermaster's store, the owner's "道具店") → a bag. The stash chest → a chest. The Spire gate (the
tower's door) → a tower. The Forest gate, the Meadows gate, and the dev test room's gate in dev
builds → the teleport mark. A function the client has no glyph for → the function marker's lozenge.
Not marked, read from the code: the Inn and the Smithy (buildings; the Alewife and the Smith are
fixed residents with no function), the wandering residents and the Inn's patrons (ambient), the
mailbox (a HUD envelope with no place in the world, FS-1GZGD), the marketplace (a web page; the
town's market stalls are dressing with nothing to do), the well and the hearth (dressing). Amber on
any of these would be an amber thing the player cannot act on (design-guideline "Gameplay
accent").

**Derived here (spec child, to be marked so in the work order).**
- One minimap, two new plans: the run's `Minimap` look, modes, marks and hold, drawing a plan built
  from the town's or field's data instead of a region grid.
- Buildings and field keep-outs as solid footprints in the wall line's own ink (`minimapEdge`): "what
  cannot be walked through" in one ink; the ground in the one fill (`minimapExplored`).
- The map's outline is the world's edge, a gap at every gate within its reach of an edge (the gate's
  range each side): the road's way out.
- A door gap cut as a notch through the footprint, at least 2 logical px deep so it reads.
- Marks that would overlap (the stash chest and the Quartermaster, 5 × 4 px apart at normal size)
  set side by side.
- Field charting on a 40 world-px cell grid (one tile), radius 480 world px (≈ 540 logical px
  across half the 1080 view, as `worldToScreen` projects it), stored as a bitset per character and
  field, unioned on write.
- The stored mode is the run's one key, `barrowspire_minimap_mode`.
- Invite prompts and the ready check stepped right of the open party panel reach under the map at
  1080; they draw over it.

**Rejected.** A screen-space circle (it would reach 540 px up and down, past a 720 px view);
party-shared charting (charter: not shared); per-world mode keys (one choice should follow the
player); marking the Inn, the Smithy, the mailbox or the market (not interactable, or not in the
world); drawing roads (not asked; parked for the owner's look); soft fog edges on the minimap (the
run's minimap draws hard region edges).

**Escalated, not decided.** An ADR: charted ground is client-side, personal and kept in browser
storage, where ADR-0063 makes run fog party-shared and unstored (Decisions 3, 4) and gives other
worlds no fog (Decision 7). Draft title: "A field's minimap fog is the player's own, shown on the
minimap only, and kept per character in the browser".

**Open for the owner's browser check.** The glyphs by eye (scroll for the Elder especially); whether
roads should be drawn; the charting radius; whether the Inn should carry a neutral, non-amber mark.
