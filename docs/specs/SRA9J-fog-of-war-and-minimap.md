# FS-SRA9J: Fog of war and minimap on dungeon floors

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" → "Fog of war", "Minimap" → this FS

## Scoping notes (raw)

Charter run, 2026-11-06, item B. Nick approved the charter ("核准"); its locked block is the
residue. Recorded without adversarial review: no `challenge-me` pass. Client only.

### Locked decisions (charter)

- B1. Regions (rooms and corridor segments): unexplored is black, explored is dim with terrain
  and no monsters, a region a party member is in is fully visible.
- B2. Shared by the party. Reconnect resets exploration (v1).
- B3. Monsters are shown in regions a party member is in, plus within 400 px of any party member.
- B4. Minimap at the top right, always on. Explored regions, party dots, and the switch, escape
  door and stairs once seen. M toggles it. Mind the fullscreen button and the existing top-right
  HUD.
- B5. Lighting stays presentation-only (CONTEXT.md "Light source"). ADR for fog: client
  presentation only, region-based, party-shared, not anti-cheat; server-side fog is a later step
  tied to interest management.

### Owner constraint (coordinator relay): floor 1 only

Fog and minimap exist only on a floor whose `floor_map` carries regions (floor 1 today). Floors
2–3 and the field worlds have neither; floors 2–3 keep the indoor blackout.

### Depends on

FS-KE075: the floor map and its regions (§F.31), the dungeon-floor drawing and chunk grid (§H),
interest (§G: monsters beyond 1600 px are not even sent; party members always are).

### Facts

- Indoor blackout: `render/world/blackout.ts` (geometric under canvas, mask under WebGL), depth 500
  (`BLACKOUT.depth`): above light-map (135) and world effects (≥ 140), below dust (902), vignette
  (905), markers (950, 951) and the HUD (≥ 1000). Markers sit above it, so hidden monsters' plates
  must be hidden explicitly.
- Top-right HUD: escaped count then floor indicator, right-aligned at `TOP_RIGHT_HUD`
  (`BarrowspireScene.ts:283-287`), stepped down by `FULLSCREEN_BUTTON_CLEARANCE`
  (`render/viewport/fullscreenButton.ts`); `relayoutHud` re-anchors it on resize. Notices at the
  top centre, y 100 (`showNotification`). Logical view 1080–1280 × 720 (`viewport.ts:22-24`).
- M is not bound in the run scene.

### Derived while scoping

- Walls take the brightest state of the regions they border.
- Drop piles follow the monster rule; containers and interactables follow the region rule.
- Minimap drawn in the world's iso projection, so directions match the screen.
- Minimap ≤ 220 px wide, so at 1080 it clears a 600 px top-centre notice.
- Lights in regions that are not visible are off.
