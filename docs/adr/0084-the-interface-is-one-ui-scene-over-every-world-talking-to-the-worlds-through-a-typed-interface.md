# ADR-0084 — The interface is one UI scene over every world, talking to the worlds through a typed interface

Status: accepted
Date: 2026-11-14
Scope: game-client's in-world interface: the corner row, the ESC menu and OPTIONS, the interface
sounds, and in later phases the gear overlay, party panel, minimap, mailbox, the run's HUD and chat.
Not the main menu or character creation (their own canvas menus), not the disconnect notice (its own
scene, FS-R6EYZ), not the web platform's React UI.
Specified by: [FS-TQZ5J](../specs/TQZ5J-ui-scene.md) (phase 1, and each later phase as a
`## Change:` there).
Builds on: [ADR-0057](0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md)
(Phaser 4, the render scale), [FS-R6EYZ](../specs/R6EYZ-disconnect-notice.md) R11 (a scene drawn
over every world is already how the disconnect notice works).
Amended by: [ADR-0085](0085-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md)
— Decision 2 ("socket messages stay the world's": world-play messages do; a moved piece's own
commands, reading only app state, go from the piece)
Amended by: [ADR-0086](0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md)
— Decision 5 (what moves: each piece decided by ADR-0086's rules, some of the run's pieces staying
in the world) and the "Depth inversion" consequence (a world piece meeting a UI piece is moved into
the UI scene or the world avoids the overlap)

## Context

The owner's charter, approved 2026-11-13/14: 「把ui介面獨立成一個scene 當模組 之後就不用每張地圖都要
寫一次」 (make the UI its own scene, a module, so it need not be written again for every map), and
「就照你說的分階段進行」 (go in the phases you proposed). Recorded without adversarial review: no
`challenge-me` pass was run.

Today each world scene (`HubScene` ~3.5k lines, `FieldScene` ~1.3k, `BarrowspireScene` ~6.3k)
builds its own interface in `create`: the corner row, the ESC menu and OPTIONS, the interface
sounds, the gear overlay, the party panel, the minimap, the mailbox, and in the run its HUD. The
pieces are shared modules, but each world wires them again: its own `menu` field guarding its
clicks and keys, its own Esc step, its own key bindings, its own sound wrapper. A fourth world would
wire them a fourth time, and a fix to the wiring lands three times.

The forces:

- **Phaser 4.2.1 hands pointer input top scene first.** `InputManager.updateInputPlugins` walks the
  scenes from the top, and with `globalTopOnly` (default `true`) stops at the first scene whose
  interactive objects took the event. A scene above the world therefore takes its own presses and
  leaves the rest to the world, without the world testing every panel's rect.
- **Keyboard events reach every scene's keyboard plugin**, but not top first: each plugin hears the
  input manager's `process` event in the order it subscribed, which is the order the scenes
  started. The FS-TQZ5J spike showed the world ahead of a UI scene it launched, and behind it after
  one world switch. A key event's `stopPropagation()` keeps it only from the plugins after the
  stopper, so it shields the world in some sessions and not in others.
- **The keys collide.** The menu's 1 is the run's potion, its Enter opens chat, its ←/→ walk, and
  Esc is shared between the menu, the world's windows and the town's dialogue. Today each world's
  `menu` field settles who answers.
- **Depth does not cross scenes.** Inside one scene the corner row (1000) and the menu (2000)
  interleave with world objects; a scene above the world draws over all of them.
- **Two other branches are editing the world scenes** (the tower music, the minimap labels), so a
  big-bang move would collide.
- **A scene over the worlds already exists:** the disconnect notice, last in the scene list, held
  across world switches.

Alternatives weighed:

- **Keep the interface in the worlds and share more code** (one `mountInterface(scene)` per world).
  Shrinks the files but keeps three menus, three key paths and three guards; the owner asked for the
  interface to stop being per map.
- **A React/DOM overlay instead of a Phaser scene.** Leaves the canvas palette, knockout renderer,
  render scale and crisp text (ADR-0057, ADR-0080) behind, and every piece would be redrawn: a look
  change, which this work must not be.
- **Move everything at once.** One unreviewable diff over three busy files, colliding with the
  branches in flight.

## Decision

1. **One UI scene.** The in-world interface lives in one Phaser scene, `UIScene`, registered after
   the world scenes and before the disconnect notice. It is launched on the first world entry,
   survives world switches, sleeps while no world scene is up (main menu, character creation) and
   is destroyed with the game. It is fitted to the render scale like every scene (`ViewportFit`,
   `fitGame`).
2. **A typed interface, never a direct call.** The UI scene and the world scenes talk only through
   one typed interface per game, lent through the game's registry. The world **reports** its state
   (which world, the player's state, its blockers, its open windows, what its menu rows read); the UI
   scene **reports** whether its menu is open and **requests** what only the world can do (close a
   world window, toggle one, leave the queue, change character, leave the run, fall, set the music
   level). Requests are synchronous. No scene imports or calls another scene; socket messages stay
   the world's.
3. **Pointer input: the top scene takes its own presses.** `globalTopOnly` stays `true` and the UI
   scene stays above the worlds in the scene list. A world no longer tests a moved piece's rect in
   its click paths.
4. **Keys: one owner at any moment, by binding and state, never by event order.** A key the UI
   scene owns outright is bound by no world scene (Esc, from phase 1). A key shared by state
   (Enter, 1–3, ←/→) is the UI scene's only while its menu is open, and the world's handlers stay
   guarded by the UI's reported menu state. No scene settles a key's owner with
   `stopPropagation()`. Keyups always reach the world. A hotkey moves into the UI scene with the
   window it opens.
5. **Phased.** The interface moves in groups, each merged before the next: (1) the shell, the
   interface, the corner row, the ESC menu with OPTIONS, and the interface sounds; then the gear
   overlay; the party panel; the minimap; the mailbox; the run's ability, potion, target and
   settlement pieces; chat. Each move is a pure move: no behaviour or look change, checked by
   before-and-after screenshots.

## Consequences

- **A new world gets the interface free.** It reports its state and answers requests; it builds no
  corner row, menu or sound wrapper. A fix to any of those lands once.
- **The world scenes shrink and lose their `menu` field**; their guards read the UI's reported state.
  Until the last phase lands, the worlds still own some windows, so the interface carries both
  directions (the Esc step reads the world's open windows; the sounds hear the world's player
  actions through the interface's `act`).
- **The interface is a contract.** Adding a piece to the UI scene means adding the facts it reads to
  the world's report or the requests it sends; it cannot reach into a world's fields. That is the
  point, and it is also friction.
- **Depth inversion.** Whatever in a world draws over a moved piece today draws under it afterwards
  (the gear overlay's tips over the corner row, notifications level with the menu). Each move slice
  must find such overlaps and show them to the owner; a later phase that moves the overlapping piece
  into the UI scene restores the order inside one scene.
- **Two hard Phaser rules now carry weight:** the UI scene must stay above the worlds in the scene
  list (pointers go top first; below, the world takes the UI's presses), and a key the UI scene owns
  must not be bound by any world (key order follows scene start order, which a world switch
  changes). Both are tested in the shell slice.
- **The disconnect notice must hold the UI scene too**, or Esc would open the menu under it.
- **Phase-1 sequencing with other branches:** the move slices start only after the branches editing
  the world scenes (tower music, minimap labels) are merged.
- **Reversible per phase.** A phase that goes wrong is reverted alone; the shell can stand empty.
