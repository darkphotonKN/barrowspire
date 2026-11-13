# FS-TQZ5J: The UI scene over every world (phase 1)

> Status: draft · SPECIFICATION.md: none (pure architecture: no capability added or changed; see "No thin line" below) · Related ADRs: ADR-0081 (to be recorded)

## Scoping notes (raw)

Scoped 2026-11-14 from the owner's approved charter (2026-11-13/14): 「把ui介面獨立成一個scene
當模組 之後就不用每張地圖都要寫一次」 (make the UI its own scene, a module, so it need not be written
again for every map) and 「就照你說的分階段進行」 (go in the phases you proposed). The charter arrived
with its defaults P1–P9 pre-answered; scope-it records them, it does not reopen them. Recorded
without adversarial review: no `challenge-me` pass was run (the pre-lock gate: these locked
without push-back, and they shape every world scene, so a wrong call is costly to unwind).

**Today.** Each world scene wires its own UI: `HubScene` (~3.5k lines), `FieldScene` (~1.3k),
`BarrowspireScene` (~6.3k). The UI is the corner row (`HudCorner`), the ESC menu and OPTIONS
(`menuPanel`, `optionsPanel`), the interface sounds (`UiSounds`), the gear overlay
(`GearOverlay`), the party panel, the minimap, the mailbox and the run-only HUD (ability, potion,
target, settlement). Each world builds them in `create`, keeps its own `menu` field, its own Esc
step (`escapeStep`) and its own key bindings. `DisconnectNoticeScene` is the precedent of a scene
drawn over every world (FS-R6EYZ R11).

**Decisions (the charter's defaults, locked):**

- **P1 scope.** Phase 1 is the UI scene's shell plus three moves: the corner row, the ESC menu
  with OPTIONS, and the interface sounds. Later phases, one group each, each merged before the
  next: gear overlay; party panel; minimap; mailbox; ability/potion/target/settlement; chat.
- **P2 lifecycle.** Launched on the first world entry; persists across world switches
  (`switchWorld`); hidden in the main menu and character creation; torn down with the game.
- **P3 interface.** A typed event interface between the world scenes and the UI scene.
  World → UI: the world type, the player's state (dead/resolved), blockers (a dialogue open, and
  so on). UI → world: requests such as "Leave the queue", "Change character", "Fall". The two
  scenes never call each other directly.
- **P4 mouse.** The UI scene sits above the world; Phaser 4.2.1's `InputManager.globalTopOnly`
  (default `true`, InputManager.js:382 and `updateInputPlugins`) stops click-through.
- **P5 keys.** The UI scene owns Esc, the menu's number keys and the corner hotkeys (I, C, T,
  M…). World scenes stop binding them. One owner per key.
- **P6 render scale.** The UI scene gets `ViewportFit` like the worlds (1×/1.5×/2×, fullscreen).
- **P7.** An ADR records the decision (next after ADR-0080).
- **P8.** A spike before development: a standalone Phaser 4.2.1 page, two stacked scenes, in
  headless Chrome through playwright-core `channel: "chrome"`; prove (a) a click on the UI panel
  does not reach the world and one beside it does, (b) a key the UI handles is not also acted on by
  the world under the planned split, (c) both scenes refit at a render-scale change.
- **P9.** Every moved component gets a before/after screenshot parity check, in its slice.
- **Bounds.** game-client only. No behaviour or look change.

**Read in the code (main 6328e797):**

- The ESC step is shared across UI and world: one Esc closes the letter panel, then the menu,
  then the party panel, then the gear overlay, and with nothing open opens the menu
  (`escapeStep`, FS-R82NV § Change C2). In phase 1 the menu moves and the other windows do not, so
  the UI scene must read which world windows are open and ask the world to close one.
- The hub's NPC dialogue keeps its own Esc (`offerConversation`). Esc then is the dialogue's.
- The menu's keys collide with world keys: `1` is the run's potion (`RUN_ACTIONS.drinkPotion`),
  `Enter` opens chat (`ChatWindow.onEnter`), `E` confirms the hub's dialogue, ←/→ move the player
  and the OPTIONS slider. Today each world guards with its own `menu` field.
- The world's click handlers bail while `this.menu` is set, and test `corner.covers(x, y)` so a
  press on the row is never an attack (`panelTakes`, FS-3EBCA R10). The menu has a full-view
  blocker (`menuBlocker`) at `MENU_DEPTH` 2000.
- `UiSounds.act` reads every window's state before and after a player action (S8, S9): the menu's
  (moving) and the letter/party/inventory/character (staying in the world for now).
- The hub's OPTIONS Music row drives the live `HubMusic`; elsewhere it is the stored level only.
- Every world's corner row sits at depth 1000 and the menu at 2000; some world objects draw above
  them today (gear tips 2200, flash 2300, letter panel 1800, settlement record 1600, resolved
  card 1500, controls panel 1200, notifications 2000). A scene above the world cannot interleave
  depths with it: whatever draws over a moved piece today will draw under it.
- `fitGame` re-fits every scene's main camera (`getScenes(false)`), and `ViewportFit` is a scene
  plugin in the game config, so a scene in the list gets both.
- `DisconnectNotice.holdWorlds` pauses `WORLD_SCENES` only; the notice's scene is last in the list.
- `HubScene` starts `MainMenuScene` from inside itself (Change character), and
  `DisconnectNotice.returnToMenu` starts it too: not every way to the menu goes through
  `switchWorld`.

**Alternatives considered and rejected:**

- *A shared UI module each world still mounts* (one constructor call per world): keeps three
  wirings, three `menu` fields and three key paths; what the owner asked to stop.
- *Event-level `stopPropagation` as the only key rule*: works only if the UI scene sees each key
  first, and silently breaks if the scene order changes; kept as a guard, not the rule (to be
  settled by the spike).
- *Moving every corner hotkey in phase 1*: T is bound by `PartyPanel`, M by the minimap
  controller, I/B/C by the gear's owners. Moving the keys before their windows would have the UI
  forward each press to the world and back again later. Open: move them with their windows?

**Edge cases raised:**

- A world switch while the menu is open (a match found in the hub): the menu must close as today.
- The disconnect notice while the UI scene is up: the UI scene must be held too, or Esc opens the
  menu under the notice.
- The run's menu yields when the player dies or escapes (FS-9K8EZ req 6).
- A press that starts on the UI and is let go beside it.
- Keys held across the menu opening (a stride): the world must still hear the key-up.
- A world still loading its art (FS-C4JWH) when the UI scene would show.

**Open questions (not settled here):**

- The exact key mechanism (binding vs `stopPropagation`): the spike decides.
- Whether the corner hotkeys move in phase 1 or with their windows.
- Whether the depth inversion above changes any screenshot in practice.
