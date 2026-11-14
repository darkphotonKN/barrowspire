# ADR-0086 — Which interface goes in the UI scene and which stays in the world

Status: accepted
Date: 2026-11-14
Scope: game-client's in-world interface: which pieces the UI scene holds and which a world scene
keeps, how state crosses between them, and the depth order inside the UI scene. Not the main menu,
character creation, the disconnect notice or the web platform's React UI (as ADR-0084).
Amends: [ADR-0084](0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md)
— Decision 5 (what moves, phase by phase: now decided per piece by the rules below, and some of
the run's pieces stay in the world) and its "Depth inversion" consequence (a world piece that meets
a UI piece is moved into the UI scene or the world avoids the overlap; depth cannot settle it). The
rest of ADR-0084, as amended by ADR-0085, stands.
Builds on: [ADR-0085](0085-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md)
(a moved piece's own commands).
Specified by: [FS-TQZ5J](../specs/TQZ5J-ui-scene.md) § Change: Phase 2: the party, its note of
2026-11-14 "Which interface goes where" (the classification of today's pieces, with their code
names and depths).

## Context

The owner approved this on 2026-11-14 with 「ok」 after reading the draft, and added one rule the
same day: 「任何ui都優先隊友列表」 (every UI piece comes before the party list). Recorded without
adversarial review: no `challenge-me` pass was run.

ADR-0084 Decision 5 lists what moves in each phase, but gives no test for a piece it did not
name, and its Scope says "the run's HUD" moves whole. Phase 2 (the party) showed what the list
leaves open:

- **Depth does not cross scenes.** The UI scene is always drawn over every world, so a world piece
  that meets a moved piece draws under it whatever its depth. The party panel (1110) now draws over
  the run's controls panel (1200), its resolved card (1500) and the gear overlay's tips (2200);
  the frames (1000) draw over the gear overlay's character panel (1100) (FS-TQZ5J R46, As built).
- **Pressing follows drawing.** The panel's ground over the run's end swallowed the top of WATCH
  THE DELVE and LEAVE THE BARROW (R47), and the frames over the gear overlay let the pointer
  through to stash cells the player cannot see (Amendment B1, accepted as transitional until
  phase 3).
- **Not everything on the screen is interface.** Name plates and health bars follow a creature;
  fog and darkness are the world itself. Moving them would make the UI scene track world objects
  through the bridge every frame, for nothing a player would see.
- **New HUD pieces keep coming**, and each will need a home without a new round of argument.

## Decision

1. **A piece goes in the UI scene if any one of these holds:**
   1. it is fixed to the screen, not following anything in the world (windows, panels, menus,
      button rows, notices);
   2. it is shared by more than one world (town, field, run);
   3. it overlaps another UI piece and must be ordered with it.
2. **A piece stays in its world if any one of these holds:**
   1. it is drawn at a world position and follows a world object (name plates, monster health
      bars, the open bar of a timed open over its container, the function markers over a function
      NPC or the stash; damage numbers and interact prompts too, when they come: none is drawn
      today);
   2. it is a world effect (fog, darkness, aim lines);
   3. it appears in one world only and overlaps no UI piece (the run's resolved card, WATCH THE
      DELVE and LEAVE THE BARROW, the field's FallenCountdown, the run's controls panel). Such a
      piece moves only if layering forces it. 2.3 is the one exception to 1.1; a piece that comes
      to overlap a UI piece leaves 2.3, and 1.3 moves it (or the world avoids the overlap, 5).
3. **Data.** The world owns the game state and hands it to the UI scene as typed data through the
   UiBridge: no functions cross it, and no scene calls another (ADR-0084 Decision 2). The UI scene
   asks the world to act with typed requests. A command a moved piece owns that reads only app
   state goes from the piece (ADR-0085).
4. **Depth order inside the UI scene, low to high:**
   - **the party frames lowest.** Every window draws over the frames and takes the presses there
     (the owner's rule above). Today they stand at 1000, level with the corner row (see
     Consequences);
   - **1000** the corner row (and, today, the invite prompt, the ready check, the party panel's
     invite field and the town's and the field's notice line);
   - **1100–1800** the windows: the gear overlay with the inventory, the character panel and the
     stash (1100–1103), the party panel (1110), the settlement record (1600–1601), the letter panel
     (1800), and the container view (at 1000 today, so it must come into this band);
   - **2000** the ESC menu (its blocker 1999, its rows and OPTIONS 2001), the NPC dialogue card, the
     run's notifications;
   - **2200** item tips (the gear overlay's and the letter panel's);
   - **2300** the gear overlay's flash.
5. **A world piece that overlaps a UI piece** cannot be fixed by depth, because the UI scene is
   always above. Either the piece moves into the UI scene, or the world avoids the overlap (as
   FS-TQZ5J R47 does: the run's end closes the party panel).

## Consequences

- **Phase 3's acceptance includes "the frames under every window, and presses don't pass
  through".** As the code stands (feat/client-ui-scene, 65e9a42c), the frames are not yet lowest:
  they share 1000 with the corner row, the invite prompt, the ready check and the notice line, and
  at an equal depth Phaser draws in the order added (each world's corner row is built before its
  party pieces, so a frame draws over the row where they meet). The container view is also at 1000,
  level with the frames. Phase 3 must:
  - put the frames below every other UI piece (a depth under 1000, or every other piece raised
    over them), and test the order;
  - put the container view, moving with the gear overlay, into the 1100–1800 band, over the frames;
  - give each moved window (the gear overlay's panels, the container view, the settlement record)
    an interactive ground over its rect at its own depth (`uiGround`, as R40's party pieces have),
    so a press, hover or wheel over a frame under a window reaches neither the frame's Travel nor
    the world. The gear overlay hit-tests by hand today; in the UI scene that is not enough.
- **Every new HUD piece is classified by these rules** when it is scoped, and its spec says which
  rule placed it.
- **A piece that stays in the world must not overlap a UI piece, or the world must avoid the
  overlap** (Decision 5). One known case is open: the run's controls panel (1200) meets the party
  panel today (R46, As built) and nothing avoids it. It is classified as staying (2.3), so it needs
  an avoidance or a move; this ADR does not choose which.
- **The bridge stays narrow.** Pieces that follow world objects stay where the objects are, so no
  per-frame world positions cross the bridge.
- **ADR-0084's header carries `Amended by: ADR-0086`**; its body is unchanged.
