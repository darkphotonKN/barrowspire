# FS-MRZH7: Function NPC markers

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" → "Function NPC markers"; `game-server/game-service/SPECIFICATION.md` "### Hub world" → "Function NPCs kept clear of ambient NPCs" → this FS · Related ADRs: [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the canvas keeps its own palette), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only colour) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § NPCs (function NPC, ambient NPC), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (marker)

## Summary

The hub's function NPCs, the people a delver deals with for real (who give, take, or start a
system: today the Spirewarden, who opens the delve, and the Quartermaster, who opens the
loadout; later quest-givers and traders), should read as such at a glance. Today their names are
drawn in bright brass, the same ink as the delver's own name, and the Spirewarden stands inside
the Herbwife's wandering quarter, so an ambient NPC keeps walking over him. This feature gives
every function NPC its own marker (an amber nameplate under an amber sigil) and moves the
Herbwife's quarter off the Spirewarden's ground.

## Requirements

1. **Who counts.** A function NPC is any NPC whose broadcast `function` is non-empty. The client
   derives it from `NPCState.function`; no new field, message or protocol change. An NPC with a
   function the client does not yet know (a future one) still counts.
2. **Nameplate ink.** A function NPC's nameplate is drawn in a new canvas marker ink,
   `palette.markerFunction`, which resolves to the gameplay accent amber (`BARROW_HEX.amber`):
   the delver can act on a function NPC, which is what amber means on the canvas
   (design-guideline "Gameplay accent").
3. **Readability floor.** `markerFunction` joins `MARKER_INKS`, so the existing marker contrast
   test holds it to the same floor as every other marker ink.
4. **The sigil.** A function NPC carries a small lozenge (a diamond, about 8 px wide and 11 px
   tall at 1x) centred above its nameplate: amber fill, outlined in the marker stroke ink
   (`palette.markerStroke`). It is a marker: it draws at the nameplate's marker depth, above the
   light-map and vignette, and is placed over the head every frame with the nameplate. Static,
   no animation.
5. **Ambient NPCs unchanged.** An ambient NPC keeps the vellum hub nameplate
   (`palette.markerHub`) and has no sigil.
6. **Body tint unchanged.** A function NPC drawn with the placeholder (no baked sheet) keeps its
   brass body tint. Only its marker changes; the tint is not a marker.
7. **Name size.** A function NPC's nameplate is 13 px against the ambient 12 px, so the name
   carries a step more weight under the sigil. Body serif, as every marker.
8. **The Herbwife's quarter moves; the Cottar's narrows.** The Herbwife's wander region moves from
   x 1120, y 540, w 260, h 220 to **x 1260, y 540, w 240, h 220**, in the server's hub map data
   (`hub_map.go`, `hubResidents`) and identically in the client's mirror
   (`HUB_KEEP_OUT.wander` in `hubKeepOut.ts`). The Cottar's quarter narrows from w 260 to
   **w 180** (x 560, y 560, h 200 unchanged), which ended 40 px from the Quartermaster: found by
   requirement 9's test while implementing. The Spirewarden and Quartermaster keep their
   positions.
9. **Clearance rule.** No ambient NPC's wander region comes within a function NPC's talk range
   (`NPCInteractRange`, 80) plus a 40 px margin of that NPC's position. Tested on the server's
   map data and on the client mirror, so a future quarter or a future function NPC cannot
   reintroduce the clash.
10. **Dressing still clear.** The moved quarter keeps every existing hub keep-out rule (props,
    stalls, carts and paths stay out of wander regions); the existing keep-out tests pass
    unchanged apart from the moved quarter's own value.

## User Stories

1. As a delver arriving in the hub, I want the people who matter to stand out from the
   townsfolk, so that I know who to walk to without reading every name.
2. As a new delver, I want the Spirewarden visibly marked, so that I find the way into the Spire
   on my first visit.
3. As a delver, I want a function NPC's name in a different colour from my own name, so that I
   never mistake an NPC for myself or myself for an NPC.
4. As a delver in a crowd, I want the sigil to stay readable over other delvers and the dark
   ground, so that I can find the Spirewarden when the hub is busy.
5. As a delver walking up to the Spirewarden, I want no villager standing on top of him, so
   that I can reach him and press to talk without a body in the way.
6. As a delver, I want the townsfolk to keep their quiet vellum names, so that the marked few
   still stand out.
7. As a delver, I want the marker to follow the NPC's head as the camera moves, so that it never
   floats off the person it marks.
8. As a delver, I want the amber marker to mean "you can act on this", the same as amber
   everywhere else in the game, so that the colour teaches one thing.
9. As a delver who has visited before, I want the Spirewarden and Quartermaster where they have
   always stood, so that I don't relearn the hub.
10. As a delver on a machine where the baked art failed to load, I want function NPCs still
    marked, so that the placeholder hub is still navigable.
11. As a designer adding a quest-giver later, I want them marked by giving them a function, so
    that no client change is needed per NPC.
12. As a designer adding an ambient NPC later, I want a test to fail if their quarter crowds a
    function NPC, so that the clash cannot come back unnoticed.
13. As a developer, I want the new ink held to the marker readability floor by the existing
    test, so that it cannot drift into an unreadable value.
14. As a developer, I want the server's quarter and the client's mirror of it checked to agree,
    so that dressing is placed against where the Herbwife actually walks.

## Acceptance Criteria

- [ ] Spirewarden and Quartermaster nameplates draw in `palette.markerFunction` (amber) at 13 px.
- [ ] Each function NPC shows an amber lozenge sigil with a dark outline above its nameplate,
      moving with it.
- [ ] Ambient NPC nameplates are unchanged (vellum, 12 px) and carry no sigil.
- [ ] `markerFunction` is in `MARKER_INKS` and passes the marker contrast test.
- [ ] A function NPC with no baked sheet keeps its brass body tint and gets the new marker.
- [ ] The Herbwife's quarter is x 1260, y 540, w 240, h 220, and the Cottar's x 560, y 560,
      w 180, h 200, in `hub_map.go` and in `HUB_KEEP_OUT.wander`.
- [ ] A server test fails if any `hubResidents` region comes within 120 px (80 + 40) of any
      `hubNPCs` position.
- [ ] A client test fails if any `HUB_KEEP_OUT.wander` region comes within 120 px of any
      `HUB_KEEP_OUT.npcs.at` position.
- [ ] Existing hub keep-out and dressing tests pass with only the moved quarter's value updated.
- [ ] `tsc`, the client test suite, the lint fence, and `go test ./...` in game-service pass.

## Edge States

- **Unknown function.** A function string the client has no offer for still gets the marker
  (requirement 1); talking to it opens nothing, as today.
- **No baked art.** Placeholder bodies get the same marker; the sigil sits over the nameplate,
  not over the sprite's crown, so it does not depend on a measured head height.
- **Nameplates overlap.** A delver or resident standing in front of a function NPC: the sigil and
  nameplate draw at marker depth, above every body, so they stay visible; overlapping names are
  accepted as they are today.
- **Dialogue open.** The marker stays drawn while the dialogue card is open; the card sits above
  it (depth 2000 vs marker depth).
- **Server and client disagree on the quarter** (an old client against a new server, or the
  reverse during a deploy): dressing may sit where the Herbwife now walks for that session. No
  gameplay effect, since dressing never blocks; the next client build agrees.
- **Residents mid-walk on deploy.** A resident already outside the new quarter when the server
  restarts is re-placed inside it at hub build; no migration.

## Out of Scope

- A backend "important" or role flag on NPCs. Importance is derived from `function`; a separate
  flag waits until something other than a function needs to mark an NPC.
- Quests, traders, or any new function NPC.
- Moving the Spirewarden or the Quartermaster.
- A minimap, compass, or off-screen pointer to function NPCs.
- Sigil animation (bob, pulse, glow).
- The NPC dialogue card (shipped separately) and the canvas button labels (a separate copy fix).
