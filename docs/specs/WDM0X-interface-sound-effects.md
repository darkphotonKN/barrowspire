# FS-WDM0X: Interface sound effects

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Sound" → "Interface sound effects", "Set the sound effects' volume" → this FS · Owners carrying a stub: [FS-28DDG](28DDG-music-in-the-hub.md) (`## Change: Sound effects row in the OPTIONS panel → FS-WDM0X`; its § Change C4 laid the OPTIONS panel out for this row) · Related ADRs: none (none on audio; ADR-0013 and ADR-0025 hold for the row's colour, as FS-28DDG C16) · Builds on: `game-client/src/components/gameAudio.ts` (one page-wide `AudioContext`; its contract is unchanged here), [FS-28DDG](28DDG-music-in-the-hub.md) § Change: Music volume in an Options panel (`ui/optionsPanel.ts`, `audio/musicSetting.ts`), [FS-3EBCA](3EBCA-hud-corner-icons.md) (the corner row; R15–R19, which windows close which), [FS-1GZGD](1GZGD-in-game-mailbox.md) (the letter panel), [FS-P0HSP](P0HSP-town-and-field-minimap.md) and FS-56CKV § Change: Map mode icon (the minimap's modes), `ui/escapeOrder.ts` (one Esc closes the top thing) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new terms; "sound effect" is plain English, and the screen says **town**, code says **hub**) · Charter: approved by the owner 2026-11-13. Every decision below is **[charter default]**, owner-approved 2026-11-13, with its reason. A rule marked *Derived* applies a default to a case the charter did not name.

## Summary

The bottom-right corner windows and the minimap's mode switch make a sound when the player works
them. The Inventory panel, the Character panel, the Party panel, the letter panel and the ESC menu
each have an open sound and a close sound. Each step of the minimap's mode has one switch sound.
The owner supplied all 11 files. A window the game closes on its own stays silent. The OPTIONS
panel gains a **Sound effects** row, a 0–5 slider under Music, kept per browser.

## Facts (verified 2026-11-13 on feat/client-ui-sfx, cut from a22ce91b)

- **The files.** `game-client/public/audio/sfx/` holds the owner's 11 files: mono, 44.1 kHz Ogg
  Vorbis, 0.35–0.9 s, 136 KB in all. They are `character_open`, `character_close`,
  `inventory_open`, `inventory_close`, `mailbox_open`, `mailbox_close`, `party_open`,
  `party_close`, `settings_open`, `settings_close` and `map_mode_switch`.
- **afconvert reads them.** macOS's `/usr/bin/afconvert` reads these Ogg files (`afinfo`:
  `Oggf`, `vorb`). `afconvert -f m4af -d aac -b 96000 -q 127 <name>.ogg <name>.m4a` wrote all 11 in
  a trial: 118 KB in all, with durations within 3 ms of the source. AAC adds the usual 2112
  frames of encoder priming, which the m4a's packet table records. There is no ffmpeg on this
  machine.
- **Phaser picks one URL, once.** `load.audio(key, [a, b])` (`AudioFile.getAudioURL`, 4.2.1)
  takes the first URL whose extension `game.device.audio` says the browser can play. That answer
  comes from `HTMLAudioElement.canPlayType` (`ogg` = `audio/ogg; codecs="vorbis"`, `m4a` =
  `audio/x-m4a`). It never tries the second URL after the first fails to fetch or decode.
- **A sound can restart.** `WebAudioSound.play` on a sound that is already playing stops its
  buffer source and starts a new one from the top. `scene.sound` is the game's sound manager,
  shared by every scene. The audio cache is the game's too, and nothing clears it on a world
  switch. `HubMusic` frees only its own key.
- **Audible means running.** `sceneMusicStage(...).audible()` (`audio/hubMusic.ts`) reads
  `scene.sound.context.state === "running"`, or `!scene.sound.locked` without Web Audio. Phaser
  resumes the context on the first `mousedown` or `keydown` on the page, and that resume is
  async. Before it completes, a buffer started on the suspended context would sound once the
  context resumes.
- **One window state per scene, no choke point.** In all three scenes:
  - The gear overlay (`ui/GearOverlay.ts`) holds the Inventory (`inventoryOpen`) and the
    Character panel (`characterOpen`). They are independent, and both can be open. `toggle()` flips
    the inventory, `toggleCharacter()` the character panel, and `hide()` closes both (Esc, Q,
    `closeWindows`). The panels' × goes straight to the overlay's private `close(side)`, past the
    scene and past `HubGear`/`EquipmentHud`. `HubGear.toggle()`, `toggleCharacter()` and the
    `EquipmentHud` ones return "open now", not "changed".
  - The Party panel's open state is `usePartyStore.panelOpen`. T is heard inside `PartyPanel`
    itself (`onT`), and so is its ×. A scene teardown leaves `panelOpen` set, so an open panel
    reappears open in the next world.
  - The ESC menu, the OPTIONS panel and the run's Fall confirm share one slot, `this.menu`. Every
    swap between them is `closeMenu()` and then a new build. `closeMenu()` also runs when nothing
    is open, so it does not mean "the player closed the menu".
- **Town only.** In the town, the letter panel's state is `useMailboxStore.panelOpen`, set at once
  by `openPanel()` (the letters load after). The envelope's press (`MailboxEnvelope.press`) and
  the panel's × (`LetterPanel`) go straight to the store. The stash chest's E opens the overlay in
  stash mode (`openStash`), past `toggleGear`. *Leave the queue* and *Change character* only send.
  The menu closes later, from the server's reply (`queueGone`) or the scene's end.
- **Field and run.** They have no letter panel, and their envelope is greyed. Q hides the gear
  overlay. I, B, C and Esc are `keydown` listeners with no repeat guard.
- **Run only.** Its Fall confirm's *Not yet*, Esc and × close the whole menu. *Leave the barrow*
  closes it in the same press. Death, `endRun` and the settlement record close neither the overlay
  nor the party panel. After the end only the keyboard is off, so the corner icons still work.
- **The minimap.** The town and the field step the mode in `WorldMinimapController.cycle()`,
  reached from M (`bindMinimapKey`) and from the mode icon (`MinimapModeIcon`'s `press`). The run
  steps it in `BarrowspireScene.cycleMinimap()`, reached from M and the icon. It returns early on a
  floor with no minimap. The game never steps the mode itself; it only restores the kept mode as
  a minimap is built.

## Requirements

### A. What sounds, and when

S1. **The mapping.** **[charter default]**

| Effect | Plays when the player |
|---|---|
| `inventory_open` / `inventory_close` | opens / closes the Inventory panel (backpack icon, I or B, its ×, Esc, Q) |
| `character_open` / `character_close` | opens / closes the Character panel (character icon, C, its ×, Esc, Q) |
| `party_open` / `party_close` | opens / closes the Party panel (party icon, T, its ×, Esc) |
| `mailbox_open` / `mailbox_close` | opens / closes the letter panel (the town's envelope, its ×, Esc) |
| `settings_open` / `settings_close` | opens / closes the ESC menu (Menu icon, Esc, its ×, *Back*) |
| `map_mode_switch` | steps the minimap's mode (M, the map mode icon) |

The town plays all six rows. The field and the run play every row but the letter panel's, since
they have none.

S2. **Every open or close the player causes plays.** That covers an icon click, a hotkey, a
    frame's ×, Esc, Q and a menu row that closes the menu (*Back*, the run's *Not yet* and *Leave
    the barrow*). **[charter default]** Reason: the sound answers the player's hand.
    - *Derived:* the stash chest's E opens the Inventory panel in stash mode, so it plays
      `inventory_open`. Closing that view plays `inventory_close`, by any of the inventory's
      paths.
S3. **One press, at most one sound.** A single player action plays at most one effect. When an
    opening window pushes others closed, only the new window's open sound plays, never a close
    beside it. That covers the menu's `closeWindows`, the letter panel's `clearForLetter`, and the
    letter panel closing as the inventory, the character panel or the party panel opens.
    **[charter default]** Reason: no double sounds.
    - *Derived:* a press that only closes, and closes two windows at once, plays one close
      sound. Esc or Q hiding both gear panels is the case. The first closed window in the order
      ESC menu, letter panel, Party, Inventory, Character names the sound. So Esc with both gear
      panels open plays `inventory_close`.
S4. **What the game closes plays nothing.** **[charter default]** Reason: it is not the player's
    action. Silent cases:
    - the run's end;
    - the run's menu yielding to a death or a resolve (FS-9K8EZ req 6);
    - a world switch or a handoff;
    - the scene's end or the game's teardown;
    - the town's menu closing on the server's answer to *Leave the queue*, or on a called-off match
      (`queueGone`);
    - a party panel that comes back open in the next world.

    *Change character* and *Leave the queue* send and leave the menu open, so their press plays
    nothing.
S5. **OPTIONS is inside the menu.** Each of these plays nothing: opening OPTIONS from the ESC
    menu, *Back*/Esc/× from OPTIONS to the ESC menu, and opening or backing out of the run's Fall
    confirm. Closing the whole menu from any of them plays `settings_close`. That covers the Menu
    icon over OPTIONS or the Fall confirm, the menu's *Back*/Esc/×, and the Fall confirm's *Not yet*/Esc/×.
    **[charter default]** Reason: it is one settings space.
S6. **A refused press plays nothing.** A press a guard drops changes no window, so it plays
    nothing. Examples: I with the menu open, a dialogue holding the keys, the Party icon with a
    chest open in the run, C refused by the stash. *Derived* from S2: no open or close happened.
S7. **The mode switch plays on every player step.** M or a press on the map mode icon that steps
    the mode plays `map_mode_switch`, in the town, a field and the run. A press that steps nothing
    plays nothing: one refused while the keys are owned, or one made on a floor with no minimap. Restoring
    the kept mode as a minimap is built is the game's, and silent (S4). **[charter default]**
S8. **One rule decides.** Which effect a player action plays is one Phaser-free function of the
    scene's window state before and after that action. The state is which of ESC menu (the slot is
    occupied), letter panel, Party, Inventory and Character are open.
    - If a window opened, the first opened one in the S3 order plays its open sound.
    - Otherwise, if a window closed, the first closed one plays its close sound.
    - Otherwise nothing plays.

    S3, S5 and S6 fall out of this rule. A menu↔OPTIONS swap leaves the slot occupied, so it
    plays nothing. *Derived* (the charter names the outcomes, not the mechanism).
S9. **Every player path runs through the rule.** Each scene runs each player input that can open
    or close these windows through one wrapper, which reads the window state before and after.
    Those inputs are its corner icon presses, its I/B/C/Q/Esc handling, the menu's and OPTIONS'
    row and × callbacks, and the town's stash E. The module-owned inputs get the same wrapper from
    their scene:
    - the gear overlay's ×;
    - the Party panel's T and ×;
    - the town's envelope press;
    - the letter panel's ×.

    A wrapper called inside another one joins the outer one, so a corner icon press that reaches
    `PartyPanel.toggle` plays once. Nothing the game does runs through the wrapper. *Derived:*
    S2's paths bypass the scenes (Facts).

### B. How it sounds

S10. **Fixed sounds.** Every play uses the file as it is: no pitch or rate randomisation, no
     variants. **[charter default]**
S11. **A repeat restarts.** Each effect has one sound per game. A play while it is still sounding
     restarts it from the top; two of the same effect never overlap. Different effects may
     overlap, as when one window's close is still ringing when another opens.
     **[charter default]** Reason: repeat presses must not stack.
S12. **Nothing before the context runs.** While the audio context is not running (no gesture yet,
     or suspended), a press plays nothing, and nothing is queued for later. The check is the one
     `HubMusic` uses (Facts). **[charter default]**
S13. **Not on the sound manager.** An effect's loudness is set on its own sound at each play. The
     sound manager's `volume` and `mute` are never written, so the music and the effects stay
     apart (FS-28DDG R8's rule). *Derived.*

### C. The level

S14. **Six levels, 0 to 5, at the file's own loudness at the top.** The gain is
     `SFX_MAX_GAIN × level / 5`, with `SFX_MAX_GAIN` = 1.0 (tunable), giving 0, 0.2, 0.4, 0.6,
     0.8 and 1.0. The default is `SFX_DEFAULT_LEVEL` = 3 (tunable; gain 0.6). Level 0 plays
     nothing. Both are named exports of the setting's module, with the gain per level derived
     from them. **[charter default]** Reason: the effects are not mastered loud, so unlike the
     music they are not halved.
S15. **Kept per browser.** The level is kept in `localStorage["barrowspire_sfx"]` as the digit
     `"0"` to `"5"`, apart from the music's key. `"0"`–`"5"` read as that level. An absent key,
     any other value or a throwing read reads as 3. Every read and write is wrapped in
     `try`/`catch`; a throwing write is swallowed and the change still holds for this visit. It is
     never sent to the server. **[charter default]**
S16. **Read at each play.** Each play reads the kept level, so a change made in OPTIONS holds from
     the next press, in every world and every tab. *Derived* from S15 and S5 (the effects play
     in every world). The music, which reads on hub entry, is unchanged.

### D. The OPTIONS row

S17. **A Sound effects row under Music.** The OPTIONS panel's list (FS-28DDG § Change C4) gains a
     second row, **Sound effects**, under **Music**, in every world. It is a 0–5 stepped slider
     with the Music row's pointer controls (C5): ◄ and ► by one, clamped, the arrow at its end
     dimmed and ignored, and step *k* sets *k*. It is drawn and coloured as C5 and C16 say. The
     panel grows by one row through its list, with no change to the layout code. **[charter
     default]**
S18. **←/→ stay on Music.** FS-28DDG § Change C6 sends ←/→ to the first row, which stays Music.
     The Sound effects row answers the pointer only. *Derived*, and noted to the owner: "the same
     controls" is honoured for the pointer, and a keyboard row focus would be a new interaction
     the charter did not name.
S19. **The panel makes its own control.** `openOptionsPanel` builds the row from the effects
     level control in the setting's module, made as the panel opens, unless a spec passes one (as
     tests do). The scenes pass nothing new for it. A change only stores the level (S16) and
     plays nothing. *Derived* from C13's shape (the music's control is passed because the town's
     applies a ramp; the effects have nothing to apply).

### E. Loading and format

S20. **All at boot, resident everywhere.** `PreloadScene` queues all 11 effects with the resident
     art, behind the same torch bar. They stay in the audio cache for the game's life: no world
     frees them, and no world loads them again. **[charter default]** Reason: tiny, and the first
     press must not be silent.
S21. **Ogg with an m4a fallback.** Each effect is committed twice in `public/audio/sfx/`: the
     owner's `.ogg` and an AAC `.m4a`. The m4a is made from the ogg by
     `afconvert -f m4af -d aac -b 96000 -q 127 <name>.ogg <name>.m4a`. Each loads as
     `[ogg, m4a]`, so Phaser takes the ogg where the browser says it plays Ogg Vorbis and the m4a
     elsewhere (Facts). **[charter default]** Reason: Safari players hear the effects too.
S22. **A missing effect is silent, never an error.** An effect that failed to load or decode is
     not in the cache. Its press plays nothing and throws nothing, and the boot goes on to the
     main menu as before. *Derived.*

### F. Ownership

S23. **One module.** The effects' keys and URLs, the S8 rule, the wrapper (S9) and the player
     (S10–S13) live in `game-client/src/audio/uiSounds.ts`. The rule and the player are
     Phaser-free behind a narrow stage, as `HubMusic` is behind `sceneMusicStage`. The level's
     storage lives in `game-client/src/audio/sfxSetting.ts`, shaped as `musicSetting.ts`. Each
     scene makes its player in `create` from its own `sound` and the shared store, passes the
     wrapper to the modules that hear their own inputs, and reports its window state.
     `gameAudio.ts`, `hubMusic.ts` and the game config are unchanged. *Derived* from the
     charter's bounds.

## User Stories

1. As a player, I want a sound when I open my inventory, so that the click feels answered.
2. As a player, I want a different sound when I close my inventory, so that I can hear which way
   it went.
3. As a player, I want the Character panel to have its own open and close sounds, so that I can
   tell it from the inventory by ear.
4. As a player, I want the Party panel to sound as it opens and closes, by T or its icon.
5. As a player in the town, I want the envelope to sound as the letter panel opens and closes.
6. As a player, I want the ESC menu to sound as it opens and as I leave it.
7. As a player, I want the same sound whether I opened a window by its icon or its key, so that
   the sound names the window, not the input.
8. As a player, I want a window's × and Esc to sound like its close, so that every way out is
   heard.
9. As a player, I want opening the menu over my open bag to play only the menu's sound, so that I
   never hear two at once.
10. As a player, I want opening my letters over my inventory to play only the letters' sound.
11. As a player, I want one Esc that shuts both gear panels to play one close, not two.
12. As a player, I want moving between the ESC menu and OPTIONS to stay quiet, so that it feels
    like one settings space.
13. As a player, I want leaving the menu from OPTIONS to sound like leaving the menu.
14. As a player in the run, I want the Fall confirm to count as part of the menu, so that backing
    out of it does not sound twice.
15. As a player, I want a window the game closes for me (I died, the run ended, the world changed)
    to close quietly, so that a sound always means I did something.
16. As a player, I want a refused press (the menu holds the keys) to stay silent, so that a sound
    never claims something happened when it didn't.
17. As a player, I want a sound each time I step the minimap's size, by M or its icon, in the
    town, the fields and the run.
18. As a player, I want pressing a key quickly twice to restart the sound, not pile up, so that
    fast play stays clean.
19. As a player, I want no sound burst out of the speakers when audio finally unlocks, so that
    presses before my first gesture are simply silent.
20. As a player, I want a Sound effects slider in OPTIONS, under Music, so that I can set them
    apart from the music.
21. As a player, I want level 0 to silence every effect, so that I can play without them.
22. As a player, I want my effects level remembered in this browser, so that I set it once.
23. As a player, I want a change in OPTIONS to hold from my very next press, in whatever world.
24. As a player, I want the first press in a world to sound, so that the effects never miss
    because they were still loading.
25. As a Safari player, I want to hear the effects too.
26. As a player whose browser blocks storage, I want the slider to work for this visit and the
    game never to fail.
27. As the owner, I want the effects at the files' own loudness at the top level, since they are
    not mastered loud.
28. As the owner, I want the effects' level apart from the music's, so that retuning one never
    moves the other.
29. As a developer, I want one Phaser-free rule to say which effect a change plays, so that the
    no-double and silent-when-the-game-closes rules are tested once rather than per scene.
30. As a developer, I want module-owned inputs (the ×s, T, the envelope) to go through the same
    wrapper, so that no player path is missed.

## Acceptance Criteria

### The rule

- [ ] The rule, given before/after window states, returns: the open sound of the first opened
      window in the order ESC menu, letter panel, Party, Inventory, Character; else the close
      sound of the first closed one; else none. A table-driven test covers at least:
      - the menu opening over the gear and the party panel → `settings_open`;
      - the letter panel opening over the gear → `mailbox_open`;
      - the inventory opening over the letter panel → `inventory_open`;
      - the party panel opening over the letter panel → `party_open`;
      - both gear panels closing → `inventory_close`;
      - the character panel alone closing → `character_close`;
      - the menu slot occupied before and after (an OPTIONS swap) → none;
      - nothing changing → none.
- [ ] A wrapper called inside another plays once, for the outer action's change.
- [ ] Nothing plays for a change made outside the wrapper.

### The player

- [ ] At level *n* > 0 with the context running and the effect cached, a play starts that
      effect's one sound at `SFX_MAX_GAIN × n / 5`, set on the sound. Tested with a fake sound.
- [ ] A second play of a sounding effect restarts the same sound; no second sound of that key is
      added.
- [ ] At level 0, with the context not running, or with the effect not cached, a play does
      nothing, adds no sound and throws nothing. Once the context runs, nothing plays late.
- [ ] No play sets the pitch, rate or detune, and none writes the sound manager's `volume` or
      `mute`.

### The level

- [ ] `SFX_MAX_GAIN` = 1.0 and `SFX_DEFAULT_LEVEL` = 3 are named exports. The gains for 0–5 are
      0, 0.2, 0.4, 0.6, 0.8 and 1.0, derived from `SFX_MAX_GAIN`, so a test that changes the cap
      changes every level.
- [ ] `localStorage["barrowspire_sfx"]` is written as `"0"`–`"5"`. Reading `"0"`–`"5"` gives that
      level. An absent key, any other value or a throwing store gives 3. A throwing write is
      swallowed and the change still holds. The music's key is never read or written by it.
- [ ] Each play reads the kept level: a change written between two plays is heard on the second.

### OPTIONS

- [ ] In the town, a field and the run, OPTIONS shows **Music** then **Sound effects**, each with
      ◄, five steps and ►. The panel is one row taller, and its layout code is unchanged.
- [ ] On the Sound effects row, ◄/► change the level by one, clamped, the arrow at its end dimmed
      and ignored; a click on step *k* sets *k*; each change is written to `barrowspire_sfx`.
- [ ] ←/→ still change the Music row only.
- [ ] A change on the Sound effects row plays no effect.

### Loading

- [ ] `PreloadScene` queues all 11 effects, each as `[/audio/sfx/<name>.ogg, /audio/sfx/<name>.m4a]`
      under its own key, and still goes on to the main menu (stand-in loader test).
- [ ] `public/audio/sfx/` holds the 11 `.ogg` and 11 `.m4a` files. Each m4a is AAC in an MPEG-4
      container (`afinfo`: `m4af`, `aac`), mono, 44.1 kHz, within 10 ms of its ogg's duration.
- [ ] No world loads or frees an effect. A test that leaves the hub finds every effect still
      cached.

### The town (HubScene)

- [ ] I or B, the Inventory icon, and the inventory's × each open or close the inventory with its
      sound. The same holds for C, the Character icon and its ×, with the character's sound.
- [ ] T, the Party icon and the party panel's × each open or close it with its sound.
- [ ] The envelope and the letter panel's × each open or close the letter panel with its sound.
- [ ] Esc closes the top window with its sound. With nothing open it opens the menu with
      `settings_open`. With both gear panels open it plays `inventory_close` once.
- [ ] The Menu icon over open windows plays `settings_open` only.
- [ ] The envelope over the open gear and party panel plays `mailbox_open` only. The inventory,
      the character panel or the party panel over the letter panel plays its own open only.
- [ ] *Options* plays nothing. OPTIONS' *Back*, Esc and × play nothing. The Menu icon over
      OPTIONS plays `settings_close`. The menu's *Back*, Esc and × play `settings_close`.
- [ ] *Change character* and *Leave the queue* play nothing. The menu's later close, on the reply
      or the scene's end, plays nothing.
- [ ] The stash chest's E plays `inventory_open`, and closing the stash view plays
      `inventory_close`.
- [ ] M and the map mode icon each play `map_mode_switch` as they step the mode. A refused M (the
      menu, a dialogue, the letter panel, chat) plays nothing.
- [ ] A refused press (I with the menu open, the Party icon in a dialogue) plays nothing.
- [ ] Leaving the town with windows open plays nothing.

### The field (FieldScene)

- [ ] As the town, for the Inventory, Character, Party, ESC menu, OPTIONS and minimap rows, with
      Q closing the gear overlay as Esc does. There is no letter panel, and the greyed envelope
      plays nothing.

### The run (BarrowspireScene)

- [ ] As the field, with these additions:
      - the Fall confirm opening, and its back out, play nothing;
      - its *Not yet*, Esc and × play `settings_close`;
      - *Leave the barrow* plays `settings_close`.
- [ ] The menu yielding to a death or a resolve, the run's end, a floor change and the scene's
      end play nothing.
- [ ] After the run's end, a corner icon press that opens or closes a window still plays its
      sound (the icons still work then).
- [ ] M and the mode icon play `map_mode_switch` as they step the mode, and nothing on a floor with
      no minimap.

### Housekeeping

- [ ] No server, proto or gateway file changes. `gameAudio.ts`, `hubMusic.ts` and the game config
      are unchanged.
- [ ] `BarrowspireScene.ts` changes only in its window wiring: the wrapper round its player
      inputs, its window state, its minimap step, and passing the wrapper to its modules.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass.
- [ ] The owner's listening check passes (the HITL slice), in Chrome and in Safari.

## Edge States

- **Before the first gesture.** Reloading straight onto /game, the first press may be silent,
  even the press that unlocks the context, since its resume is async (S12). Nothing plays late.
  Coming in from the menus, the context already runs.
- **Window loses focus.** Phaser suspends the context on blur. A press while it is suspended, such
  as the click that brings focus back, may be silent. Nothing queues.
- **Level 0.** Every effect is silent, and the slider still works.
- **Held keys.** In the field and the run, I, B, C and Esc have no repeat guard, so a held key
  re-toggles its window on each auto-repeat, and each toggle sounds (restarting, S11). That is the
  existing toggle behaviour, made audible, not changed here. M ignores repeat.
- **Rapid different presses.** Different effects may overlap (S11), such as I then C in quick
  succession.
- **Storage blocked or full.** The level reads as 3, a change holds for the visit, and nothing
  throws (S15).
- **Changed in another tab.** The next press in this tab reads the new level (S16).
- **Safari and Ogg.** The fallback works only where Safari's `canPlayType` says it cannot play Ogg
  Vorbis (Facts). If it says it can but `decodeAudioData` then fails, the ogg fails to decode,
  the m4a is never tried, and that effect is silent there (S22). The HITL check listens in
  Safari. If it is silent, write it back as a `## Change:` here. The likely remedy is the order
  `[m4a, ogg]` or m4a alone, which is the owner's call.
- **An effect failed to load.** That press is silent, and the boot and the game go on (S22).
- **Disconnect notice.** The worlds are paused and their windows stay open. Nothing plays.
  *Return to menu* ends the scene silently.
- **Party panel carried open into the next world.** It appears open there with no sound (S4).
  Closing it there plays `party_close`.
- **After the run's end.** The keyboard is off, but the icons work, so an icon press sounds.
- **The letter panel's letters still loading.** The panel's open state is set at once, so
  `mailbox_open` plays on the press, not on the letters' arrival.
- **A sound still ringing as the scene ends.** It plays out (0.35–0.9 s) on the game's sound
  manager; nothing stops it.

## Out of Scope

- Sounds for any other window or event: the run's chest view, controls panel (H), settlement
  record, the party invite prompt and ready check, dialogues, the chat window, the main menu, the
  roster, character creation. Also item pickup, drop, equip or use, combat and footsteps.
- A sound for a slider change in OPTIONS, a preview, or a hover or click sound on menu rows.
- Pitch or volume randomisation, variants, or spatial (positional) sound.
- A master volume, or a keyboard row focus in OPTIONS (↑/↓). ←/→ stay on Music.
- Adding repeat guards to I, B, C or Esc.
- Re-encoding or remastering the owner's ogg files. Only the m4a copies are generated.
- A per-account or server-side setting.
- Any change to `gameAudio.ts`, `hubMusic.ts`, the music's behaviour, or the server.

## Change: Effects load as [m4a, ogg]
Status: shipped
Date: 2026-11-13

S21, the first criterion under *Loading* and the Edge State *Safari and Ogg* load each effect as
`[ogg, m4a]`. The integrator set the order to `[m4a, ogg]` before the listening check, taking up
the remedy that Edge State named, because the fallback it relied on does not exist:

- Phaser 4.2.1's `AudioFile.getAudioURL` takes the first URL whose type `canPlayType` accepts and
  never falls back on a decode failure (Facts).
- Safari's `decodeAudioData` on Ogg Vorbis is unreliable, so under `[ogg, m4a]` a Safari that
  says it plays Ogg could decode nothing and stay silent (S22).

The owner was told of the trade-off below on 2026-11-13 and asked for the work to be fixed and
merged to main (「修好後並回main」).

### Requirements

W1. **m4a first.** Each effect loads as `[/audio/sfx/<name>.m4a, /audio/sfx/<name>.ogg]` under
    its own key (`uiSoundUrls`). This replaces S21's order. S21's files, its `afconvert` command
    and S22 are unchanged.
W2. **Who hears which file.** Chrome, Safari and most Firefox builds say they play `audio/x-m4a`,
    so they play the AAC transcode, not the owner's ogg originals. A Firefox without AAC falls
    back to the ogg. The ogg files stay committed as the sources and that fallback.
W3. **The owner's new inventory sounds.** The owner replaced `inventory_open` and
    `inventory_close` (95565e70). Both oggs are the owner's new files, and both m4a copies were
    re-encoded from them with S21's command. Keys, triggers and every other effect are unchanged.
W4. **Replacing an effect means re-encoding its m4a.** Most players hear the m4a (W2), so a new
    or edited `<name>.ogg` is not heard until `<name>.m4a` is re-encoded from it with S21's
    command and committed beside it. This is the only re-encoding the Out of Scope line about
    "the owner's ogg files" allows: the oggs themselves are still never re-encoded.

### Acceptance Criteria

- [x] `PreloadScene` queues all 11 effects, each as
      `[/audio/sfx/<name>.m4a, /audio/sfx/<name>.ogg]` under its own key, and still goes on to the
      main menu. This replaces the first criterion under *Loading*.
- [x] `inventory_open.ogg` and `inventory_close.ogg` are the owner's replacements, and their m4a
      copies meet the second criterion under *Loading* (AAC, `m4af`, mono, 44.1 kHz, within 10 ms
      of the ogg's duration).

### Edge States

- **Safari and Ogg.** Replaced: Safari takes the m4a, so an ogg it cannot decode is never
  fetched. The HITL check still listens in Safari.
- **A Firefox without AAC.** It plays the ogg. If that ogg fails to decode, the effect is silent
  (S22).
- **An ogg changed without its m4a.** Players on the m4a hear the old sound; only a Firefox
  without AAC hears the new one (W4).

### Out of Scope

- Loading m4a alone, or dropping the ogg files.
- A fallback on a decode failure (a change to Phaser's loader).

## Change: Menu, dialog and notice sounds (pass 1)
Status: work-order
Date: 2026-11-14

The owner supplied 16 more effects and their usage (charter 「核准」, 2026-11-14): a hover and a
click for every pressable option, a back step, a toggle, a slider tick and an error for the menus,
an open, a confirm, a heavy confirm and a cancel for the dialogs, and two notice chimes. Pass 1 wires
every one whose place exists in the UI scene today, plus the main menu's delete confirm. The chat's
and the party's wait for the phases that move them into the UI scene (FS-TQZ5J § Phases 3 and 7);
they are recorded below as pass 2. Every decision is **[charter default]** unless marked *Derived*
(a default applied to a case the charter did not name) or **[code]** (what the code forces). The
charter's defaults that did not fit the code are listed under *Defaults that met the code*.

Scoped and promoted in one run under the approved charter: no interview; the owner's usage notes
were the scoping input. Supersedes, for what it names: S6 (refused presses, for presses on options
only), S19's "a change plays nothing", this FS's Out of Scope lines on dialogues, slider changes,
hover and click sounds and the main menu, and FS-TQZ5J A2 R33's "it plays no sound" (stub there).

### Facts (verified 2026-11-14 on feat/client-ui-scene, c638a9fd)

- **The files.** The owner's 16 new effects in `game-client/public/audio/sfx/`: mono 44.1 kHz Ogg
  Vorbis, 0.05–1.3 s, 116 KB in all: `menu_hover` (0.08 s), `menu_click`, `menu_back`, `menu_tab`,
  `menu_toggle_on`, `menu_toggle_off`, `menu_slider_tick` (0.05 s), `menu_error`,
  `menu_dropdown_open`, `menu_dropdown_close`, `dialog_open`, `dialog_confirm`,
  `dialog_confirm_heavy` (1.1 s), `dialog_cancel`, `notify` (1.0 s), `notify_important` (1.3 s).
  S21's `afconvert` command wrote all 16 m4a copies within 3 ms of their ogg.
- **Where the pieces live.** The ESC menu, OPTIONS and the run's Fall confirm are the UI scene's
  menu slot (`ui/uiSceneMenu.ts`, drawn by `menuPanel.ts`, `optionsPanel.ts`); the corner row is
  `ui/uiSceneCorner.ts` over `HudCorner`; the town's NPC dialogue card is `ui/uiSceneDialogue.ts`
  over `npcDialogue.ts`, its options plain data from the town (`ShownDialogue`); the notices are
  `ui/uiSceneNotices.ts`, plain data from the worlds (`Notice`). The town's envelope
  (`MailboxEnvelope`) is still the town's, in the corner row's Mailbox slot. Every one of their
  player presses already runs through the UI scene's `act` or the bridge's `act`.
- **The main menu has no UI scene.** The UI scene launches on the first world entry and sleeps
  outside the worlds (FS-TQZ5J R2–R4), so on a fresh load the main menu runs with no `UiSounds`
  lent. The game's sound manager and audio cache are still the one game's.
- **The delete confirm is the browser's.** The main menu's character card × asks with
  `window.confirm("Delete character …?")`, which blocks the page until answered: OK, or Cancel
  (and the browser's own Esc), nothing else.
- **What the dialogue card offers.** The Spire's door: *Descend alone*, *Wait for company*,
  *Enter as a party* (each stays up awaiting its reply, dimmed meanwhile), *Not yet*; queued, only
  *I'll wait*. The Elder and the town folk: *Go on* (turns the page) and *Farewell*. The
  storekeeper: *Farewell*. A resident: one actionable *Leave*, which only closes. The town opens a
  card on E by a figure, on E in the Spire's gate and on stepping into it; it draws the door's card
  again on a refusal and on a change of party standing, by closing and showing it.
- **What the notices say.** No notice says "picked up". The worlds' notices are: the client's own
  (a full bag, a locked or busy item, a full stash), the run's news (the switch thrown, the escape
  door open, someone escaped, the server's `exit_door_unlocked`, an interact success's words), and
  the server's refusals and errors (the queue's, the Spire's, the fields', a gear change, an equip,
  an interact, a fall, a pile held for its killer).
- **A new letter.** The envelope glows when the summary's newest letter is newer than the player
  last saw (`mailboxStore.pulses`, FS-1GZGD R35): on a `mail_arrived` in the town, or on entering
  the town with one waiting.

### Requirements

M1. **Sixteen more effects, loaded as the eleven are.** `UI_EFFECTS` names all 27. `PreloadScene`
    queues every one at boot as `[m4a, ogg]` (W1), each m4a made by S21's command and committed
    beside its ogg. The four pass-2 effects (`menu_tab`, `menu_dropdown_open`,
    `menu_dropdown_close`, and none other) load now and play nowhere yet.
M2. **One action, one sound.** Inside an action run through `act`, the first effect the action
    asks for is its one sound, in place of the window rule's (S8); with none asked for, the rule's
    plays, as before. Outside an action an effect plays at once. So a dialog pick plays its
    `dialog_*` and never `menu_click` too, and *Not yet* closing the whole menu plays
    `dialog_cancel`, not `settings_close` as well (S3's "at most one"). *Derived* (the charter's
    "never double a sound", made the player's rule).
M3. **Every play goes through the player.** Each effect plays through `UiSounds.play`: the kept
    SFX level read at the play (S14–S16), nothing before the context runs and nothing queued (S12),
    one sound per effect restarted on a repeat (S11), a missing file silent (S22). In the worlds
    that is the UI scene's one player (FS-TQZ5J R22); the main menu makes its own on the same
    game's sound manager (M14). **[code]**
M4. **Hover has a 50 ms cooldown.** `menu_hover` does not play again within
    `MENU_HOVER_COOLDOWN_MS` = 50 (tunable, a named export) of its last play, so a quick sweep
    over the rows does not stack. Other effects have none.

#### The mapping (pass 1)

M5. **`menu_hover`**: the pointer comes onto a pressable option. Pressable means it would answer a
    press now: a dimmed row, a dimmed arrow and the greyed Mailbox are not, so they play none.
    - the ESC menu's rows and its × (town, field, run);
    - OPTIONS: each slider's ◄ and ► while it can move, each step, the Fullscreen row, *Back*, the
      × (town, field, run);
    - the Fall confirm's rows and its × (run);
    - the NPC dialogue card's rows (town);
    - the corner row's Menu, Inventory, Character and Party (town, field, run), and the town's
      envelope in its Mailbox slot (town).
M6. **`menu_click`**: an ordinary option pressed: the ESC menu's *Options* (every world),
    *Change character* (town, field) and *Leave the queue* (town, while queued); the dialogue
    card's *Go on* (the Elder and the town folk). The menu's *Back* and the run's *Leave the
    barrow* close the whole menu, so they keep `settings_close` (M7). Corner icon presses keep
    their window's sound (S1).
M7. **`menu_back`**: OPTIONS' *Back*, its × and Esc, each returning to the ESC menu (every
    world). Closing the whole menu keeps `settings_close` (S5), by the Menu icon, the menu's
    *Back*, × or Esc, or *Leave the barrow*.
M8. **`menu_toggle_on` / `menu_toggle_off`**: the OPTIONS Fullscreen row pressed, by the way it
    asks to go: from Off `menu_toggle_on`, from On `menu_toggle_off` (every world, where the frame
    lends a fullscreen, FS-T3DWX R7). *Derived:* it plays on the press that asks, as the sound
    answers the hand; the row's words still follow the state (FS-T3DWX R6).
M9. **`menu_slider_tick`**: each press that moves the Music or Sound effects level: ◄, ►, a step
    other than the level now, and ←/→ on the Music row (every world). One press plays one tick,
    however far a step click moves it. It plays after the level is kept, so a Sound effects tick
    is heard at the new level (level 0: silent). A step click on the level already set moves
    nothing and plays nothing.
M10. **`menu_error`**: a press on a dimmed or greyed option, or on an option that turns it away:
    - a dimmed ESC menu or Fall confirm row, pressed or picked by its key: *Change character* while
      it is asked (town, field), *Leave the barrow* while asked (run), *Fall* while asked (run);
    - OPTIONS' ◄ at 0 and ► at 5, and ←/→ that cannot move the Music row (every world);
    - a dimmed dialogue row (a door way awaiting its reply), pressed or picked by its key (town);
    - the greyed Mailbox (field, run);
    - a corner icon press that changes nothing: Party or Menu while the town's dialogue is open,
      a window icon the world turns away (as the run's Party with a chest open), the Menu icon
      once the run has ended with no window open (town, field, run as they arise);
    - the town's envelope pressed while a dialogue holds the screen (town).

    It replaces S6's "a refused press plays nothing" for these presses only. Hovers never play it,
    and S6's refused hotkeys (I, B, C, T, M) stay silent: a key is not an option, and those keys
    move to the UI scene in later phases. A number key with no row under it is no option either,
    and plays nothing.
M11. **`dialog_open`**: a confirm or a dialogue appears at the player's hand:
    - the NPC dialogue card opened by the player: E by a figure, E in the Spire's gate, stepping
      into the gate (town). The town says so (`play("dialog_open")` on the bridge), since only it
      knows whose hand opened it; a card drawn again by the game (a refusal said by the door, a
      party standing changed) and a page turned play nothing more. **[code]**
    - the run's Fall confirm, opened by *Fall where you stand* (pointer or 1) (run);
    - the main menu's delete confirm, played just before the browser asks (main menu).
M12. **`dialog_confirm`**: an ordinary yes that sends the player on: the door's *Descend alone*,
    *Wait for company* and *Enter as a party* (town). The town marks each option's sound in the
    dialogue's data (M15).
M13. **`dialog_cancel`** and **`dialog_confirm_heavy`**:
    - `dialog_cancel`: a dialog cancelled or closed by the player: the card's *Farewell*, *Not
      yet*, *I'll wait*, a resident's *Leave*, Esc on a card, and E or Enter on a card with nothing
      to confirm (town); the Fall confirm's *Not yet*, its × and Esc (run); the delete confirm
      answered Cancel (main menu).
    - `dialog_confirm_heavy`: the irreversible: the Fall confirm's *Fall* (run); the delete
      confirm answered OK (main menu).
    - A card the game closes (the door's on stepping out of the gate or the queue's answer, a
      world leaving) plays nothing (S4).
M14. **The main menu wires its own.** `MainMenuScene` makes a `UiSounds` in `create` from its own
     `sound` and the shared SFX store, with no windows, and its delete press plays `dialog_open`,
     asks, then `dialog_confirm_heavy` or `dialog_cancel` by the answer. The ask itself is a
     Phaser-free function taking the asking and the playing, so it is tested on its own. One
     scene: nothing is duplicated into the UI scene. **[charter default; code]**
M15. **A dialogue option says its sound.** `DialogueOption` gains an optional `sound`:
     `"click" | "confirm" | "heavy" | "cancel"`, plain data like the rest (ADR-0081). Without one,
     a `cancel` row is `"cancel"` and an actionable row `"click"`. The UI scene plays `menu_click`,
     `dialog_confirm`, `dialog_confirm_heavy` or `dialog_cancel` for it as its pick is sent, by
     the pointer or its key. The town marks the door's three ways `"confirm"` and a resident's
     *Leave* `"cancel"` (it only closes). *Derived.*
M16. **`notify`** and **`notify_important`**, as a notice is drawn:
     - `notify_important`: a notice relaying the server turning down a move between worlds or out
       of the session: the Spire's and the queue's refusals said in passing (*Descend alone*,
       *Wait for company*, a match called off), *Leave the queue*'s error, a field gate refused
       (town); *Change character*'s error (town, field); leaving the field refused ("You have
       fallen…") (field); a fall refused (run).
     - `notify`: every other notice: the item-level ones, whoever says them (a full bag on a
       pickup or an unequip, a locked or busy item, a full stash, a gear change or an equip
       refused, a pile held for its killer, an interact refused or waiting: "It will not open.",
       "The stair waits…", "too far away"), and the run's news (the switch thrown, the escape door
       open, someone escaped, `exit_door_unlocked`, an interact success's words).
     - `notify` also plays as the town's envelope glows for a newer letter (town).

     `Notice` gains an optional `important` (plain data), said by the world at each M16 call site.
     A notice said while no world is reported is not drawn and plays nothing.
     *Derived* from the charter's "server-sent warning notices" (see *Defaults that met the code*).

### Pass 2 (recorded, not built)

- **The chat (FS-TQZ5J phase 7):** `menu_tab` for the chat window's channel tabs;
  `menu_dropdown_open` / `menu_dropdown_close` for the canvas channel picker (FS-J267Q) opening and
  closing; `menu_hover` on its options; `menu_error` for invalid chat input.
- **The party (FS-TQZ5J phase 3):** the party invite prompt appearing (`notify_important`, the
  owner's "the party invite is PASS 2"); the ready check (its sounds to be mapped then); the party
  panel's buttons and invite field.
- **Later:** dismantle and discard (`dialog_confirm_heavy`, when they exist).

### Defaults that met the code (reported to the owner)

1. *"Gather the delve"* is no label in the code. The door's ways are *Descend alone*, *Wait for
   company* (the queue) and *Enter as a party*; all three play `dialog_confirm` (M12).
2. *"Fall now"* is labelled *Fall*. It plays `dialog_confirm_heavy` (M13).
3. *Not yet* on the Fall confirm closes the whole menu, which S5 gave `settings_close`; the charter
   names it `dialog_cancel`. It plays `dialog_cancel` only (M2), as do its × and Esc.
4. *Leave the barrow* is an ESC menu row (`menu_click`) that closes the whole menu
   (`settings_close`). It keeps `settings_close`, the charter's rule for closing the whole menu.
5. No "pickup" notice exists: the pickup notices are refusals. A full bag and a pile held for its
   killer play `notify` whoever says them (M16), so the same words never chime two ways.
6. No server "system warning" exists as a screen notice. `notify_important` goes to the server's
   refusals of a move between worlds or out of the session (M16), the nearest reading of
   "server-sent warning notices": rare and weighty. The item-level refusals (an equip, an
   interact, "too far away") come often and play `notify`. The chat's server notices
   (`chat_notice`) are chat's, pass 2.
7. The main menu's delete confirm is the browser's own `confirm()`, so its look and its × are the
   browser's; Cancel and the browser's Esc both answer Cancel.
8. The main menu has no UI scene, so it plays through a player of its own on the game's one sound
   manager and the same SFX level (M14), not the UI scene's.
9. The main menu's other confirm (entering as another character than the party's, FS-G4VMQ C11)
   was not named; it plays nothing in pass 1.

### Acceptance Criteria

- [x] `UI_EFFECTS` names 27 effects; `PreloadScene` queues each as
      `[/audio/sfx/<name>.m4a, /audio/sfx/<name>.ogg]` under `sfx:<name>` and still reaches the
      main menu; `public/audio/sfx/` holds the 16 new ogg and m4a files, each m4a AAC in `m4af`,
      mono, 44.1 kHz, within 10 ms of its ogg.
- [x] Inside `act`, the first effect asked for plays in place of the rule's, once; with none
      asked for the rule's plays; outside `act` an effect plays at once (table-driven).
- [x] `menu_hover` played twice within 50 ms plays once; again after 50 ms plays again; the
      cooldown is a named export; other effects have none.
- [x] The ESC menu, OPTIONS and the Fall confirm, in each world: M5's hovers on enabled options
      only; *Options*, *Change character*, *Leave the queue* play `menu_click`; OPTIONS' *Back*,
      × and Esc play `menu_back`; the menu's *Back*, ×, Esc, the Menu icon and *Leave the barrow*
      play `settings_close` only; *Fall where you stand* plays `dialog_open`; *Fall* plays
      `dialog_confirm_heavy`; *Not yet*, its × and Esc play `dialog_cancel` only.
- [x] OPTIONS: each level move by ◄, ►, a step or ←/→ plays one `menu_slider_tick`, a Sound effects
      tick at the new level; a step on the current level plays nothing; ◄ at 0, ► at 5 and ←/→ at
      the end play `menu_error`; Fullscreen plays `menu_toggle_on` from Off and `menu_toggle_off`
      from On.
- [x] A dimmed row pressed or picked by its key, in the menu, the Fall confirm or the dialogue
      card, plays `menu_error` and sends nothing; a hover on it plays nothing.
- [x] The corner row: a hover on Menu, Inventory, Character or Party plays `menu_hover`; on the
      greyed Mailbox nothing, its press `menu_error`; a press that changes no window plays
      `menu_error`; a press that does keeps its window's one sound.
- [x] The dialogue card: its picks play `dialog_confirm` (the door's ways), `menu_click` (*Go
      on*), `dialog_cancel` (*Farewell*, *Not yet*, *I'll wait*, a resident's *Leave*, Esc, E or
      Enter with nothing to confirm), each once, by the pointer or its key; the town plays
      `dialog_open` on E by a figure, E in the gate and stepping into it, and nothing on a card
      drawn again or a page turned.
- [x] The town's envelope: hover `menu_hover`; a press under a dialogue `menu_error`; a newer
      letter's glow `notify`.
- [x] A notice drawn plays `notify`, or `notify_important` when it carries `important`; each
      M16 call site says it as listed; nothing plays for a notice with no world reported.
- [x] The main menu: the delete press plays `dialog_open` then `dialog_confirm_heavy` on OK or
      `dialog_cancel` on Cancel, and deletes only on OK.
- [x] Nothing plays before the context runs, and nothing late (S12, unchanged).
- [x] No server, proto or gateway change. Full client vitest, `tsc --noEmit`, `npm run lint` and
      `npm run lint:fence` pass.
- [ ] The owner's listening check (HITL) passes, with the table of where each sound plays.

### Edge States

- **A quick sweep.** Rows passed over within 50 ms of the last hover play no hover; the next row
  after the gap does.
- **A hover just after a press.** The press's sound and a hover may overlap (different effects).
- **Fullscreen refused.** A press held too long is refused by the browser (FS-T3DWX R6): its
  `menu_toggle_on` has played, and the row stays Off.
- **Sound effects at 0.** Every effect is silent, its ticks too; the slider still moves.
- **A run notice under the menu.** It plays as it is drawn, whatever stands over it.
- **Several notices at once.** Each plays; one of the same effect restarts the other (S11).
- **The delete confirm's modal.** The browser's `confirm()` blocks the page: `dialog_open` is
  started on the audio thread just before it, and the answer's sound after it. If a browser
  holds the audio while its modal is up, `dialog_open` may be cut; the listening check listens.
- **The main menu before the first gesture.** A delete press is a gesture, but its resume is
  async (S12): its `dialog_open` may be silent on the very first press of the page.
- **A door way awaiting its reply.** Its row is dimmed: a second press plays `menu_error`; the
  reply that redraws the card plays nothing.

### Out of Scope

- Pass 2 (above): the chat's and the party's sounds.
- Hover or error sounds on the map mode icon, the gear overlay, the party panel, the letter
  panel, the minimap or any world piece not named in M5–M10.
- Sounds on the world's own hotkeys refused by a guard (S6 stands for keys).
- The main menu's other buttons and the switch confirm; character creation; the roster.
- Re-mastering or trimming the owner's files; per-effect volumes.
