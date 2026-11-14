# FS-28DDG: Music in the hub

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Sound" → "Music in the hub", "Turn the music on or off" → this FS · Owners carrying a stub: [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (R3, the town's ESC menu gains a row) · Related ADRs: [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (scene-scoped loading; its scope is atlas groups, followed here in spirit only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the ESC menu is canvas chrome on the game palette) · Builds on: `game-client/src/components/gameAudio.ts` (one page-wide `AudioContext` handed to every game; merged f5c2827f; its contract is unchanged here), [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R15, R36 (one place switches scenes), [FS-C4JWH](C4JWH-scene-scoped-art-loading.md) (a world's own `preload()` and torch bar) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new terms; the screen says **town**, code says **hub**) · Charter: approved by the owner 2026-11-13; every decision below is **[charter default]** with its reason, D2's mp3-only by owner override (「那只給mp3可以嗎」 → yes)

## Summary

The town has music. When a player is in the hub, the owner's village track (`/audio/music/village.mp3`)
loops quietly underneath, fading in on arrival and fading out when they leave for the Spire, a
field or the roster. The town's ESC menu gets one more row to silence or restore it, and this
browser remembers the choice. It is the game's first sound. No other world plays anything, and no
sound effects come with it.

## Requirements

### A. Where and when it plays

1. **Only in the hub.** The music plays while HubScene runs, town buildings included (they are
   inside HubScene). The main menu, the roster, character creation, a run and a field play none.
   **[charter default D1]** Reason: the smallest v1 that gives the town a voice.
2. **Fade in on entering the hub.** Every entry to the hub (from the main menu, back from a run or
   a field, a hub restart) brings the music up from silence to its volume over
   `MUSIC_FADE_IN_MS` (tunable, 2000 ms). The fade begins when the music can first be heard
   (R10), not when the scene starts, so a player who must click first still hears it rise.
3. **Fade out and stop on leaving the hub.** When HubScene stops for any other world scene or the
   main menu, the music falls to silence over `MUSIC_FADE_OUT_MS` (tunable, 1000 ms), then stops.
   The fade outlives the hub: `switchWorld` stops HubScene before the next world starts, and a
   scene's tweens and clock stop with it, so the fade is not driven by HubScene's tweens or timers.
   It runs on something the game keeps across scenes (the game's step, or the sound's own Web
   Audio gain).
4. **One track, one copy.** At most one instance of the music exists per game. A hub entered while
   the previous visit's fade-out is still running takes that same sound back up from its current
   volume to full, at its current place in the track. It never starts a second copy over it.
5. **From the top each new visit.** A hub entered after the music had stopped starts the track
   from its beginning.

### B. Format and loop

6. **mp3 only.** The track is loaded from `/audio/music/village.mp3` alone, with no ogg or other
   alternative. **[charter default D2, owner override]** Reason: every browser the game targets
   decodes mp3, and the owner supplied only the mp3.
7. **Seamless loop.** The sound loops with Phaser's own looping (`loop: true`; Phaser 4.2.1's
   `WebAudioSound` schedules a second buffer source at the end, which is gapless on the buffer
   decoded). v1 adds nothing more. **[charter default D2]** Reason: an mp3 carries encoder
   padding (this file: 576 priming + 576 remainder frames, `afinfo`), which some browsers keep in
   the decoded buffer; whether that is audible is the owner's listening check (Edge States), and
   its fix is known and small, so v1 does not pre-build it.

### C. Volume

8. **Fixed at 0.4.** The music's own volume is `MUSIC_VOLUME` (tunable, 0.4), set on the music's
   sound, never on the sound manager's master volume or mute, so sound added later is not turned
   down with it. No volume setting in v1. **[charter default D4]** Reason: quiet enough that later
   sound effects are never drowned.

### D. Autoplay and focus

9. **No prompt.** Nothing on screen asks the player to enable sound. **[charter default D3]**
   Reason: Phaser's Web Audio unlock (`WebAudioSoundManager#unlock`: the first `mousedown`,
   `mouseup`, `touchstart`, `touchend` or `keydown` on `document.body` resumes the context) already
   does it.
10. **It starts as soon as the browser lets it.** The music is started on entering the hub whether
    or not the context is running yet. A context still suspended (a page reloaded straight onto
    /game, no gesture since) holds it silent until the first click or key, and the fade-in (R2)
    starts from that moment. A page that already had a gesture (the player clicked through login
    and the roster) may hear it at once on entering the hub. Either way is correct.
11. **Focus is Phaser's default.** Losing the window's focus pauses all sound and regaining it
    resumes it (`pauseOnBlur`, default `true`; `onBlur` suspends the context, `onFocus` resumes
    it). No code is written for this. **[charter default D7]** Reason: the default is the
    behavior wanted.

### E. Loading and freeing

12. **Loaded by the hub, not at boot.** HubScene's `preload()` queues the track
    (`load.audio`), next to its art, so the hub's torch bar counts it. PreloadScene does not load
    it. **[charter default D6]** Reason: scene-scoped like the art (ADR-0059's spirit): the menus
    and other worlds never pay for it.
13. **Freed once the hub is left.** When the fade-out (R3) has ended and HubScene is neither
    running nor loading again, the music's sound is destroyed and its decoded buffer removed from
    the audio cache (about 39 MB decoded: 4,838,400 frames × 2 channels × 4 bytes). The next hub
    entry loads it again, from the browser's HTTP cache when it still has it. A hub re-entered
    before the fade-out ends keeps it (R4), and its `load.audio` is skipped because the key is
    still cached.
14. **A failed load costs only the music.** If the file is missing, cannot be decoded, or the
    browser cannot play mp3 (`AudioFile` warns "No audio URLs … can play on this device"), the hub
    enters and runs exactly as without music. The music is never added when its key is not in
    the audio cache (`WebAudioSound` throws "Audio key … not found in cache"), and nothing is
    shown to the player.

### F. On and off

15. **One row in the town's ESC menu.** The hub's ESC menu (FS-G4VMQ R3) gains an actionable row,
    after *Leave the queue* when present and before *Back*: **Silence the music** while the music
    is on, **Let the music play** while it is off. Amber like the other actionable rows, with its
    number key by the menu's existing rule (`[2]`, or `[3]` while queued). **[charter default
    D5]** Reason: music without a way to stop it is intrusive. Copy is a verb, as the menu's
    other rows are, in the lore voice's terse register (design-guideline "Copy voice").
16. **Pressing it switches the music and keeps the menu open.** *Silence the music* fades the music
    out (R3's fade) and leaves it stopped; *Let the music play* starts it and fades it in (R2).
    The menu is rebuilt in place with the other label, so the player sees the new state at once.
    A second press switches it back.
17. **Remembered in this browser.** The choice is kept in `localStorage` under
    `barrowspire_music` (`"on"` | `"off"`), read when the hub is entered and written on each
    press. Every read and write is wrapped in `try`/`catch`, as `ui/minimapMode.ts` does, and
    anything unreadable or absent is **on**. It is per browser, not per account or character, and
    nothing is sent to the server.
18. **Off means silent, not merely muted.** While the setting is off, entering the hub does not
    start the music. The file is still loaded (R12), so turning it on plays at once.
19. **The field's ESC menu is unchanged.** It shares `hubMenuChoices` (FS-G4VMQ § Change: The ESC
    menu in a field world) and keeps *Change character* and *Back* only. No music plays in a
    field, so it offers no music row. The run's ESC menu (FS-9K8EZ) is unchanged too.

### G. Ownership

20. **One module owns the music.** A new client module under `game-client/src/audio/` holds the
    music's lifecycle (enter, leave, on, off; the fades; freeing) and the setting's storage. Its
    decisions (what plays, at what volume, when to free) are Phaser-free and tested without a
    browser; HubScene only tells it that the hub was entered or left and what the menu row
    pressed. HubScene adds no fade or sound logic of its own.
21. **Per game, never across games.** The module holds a sound of one `Phaser.Game`. Leaving /game
    destroys that game and its sound manager. On a scene end of `"destroy"` (`sceneEnd.ts`) the
    module asks the sound manager nothing and lets go of its reference. A later game (coming back
    to /game) starts clean and never touches the old game's sound.
22. **`gameAudio.ts` is unchanged.** The music plays through the page-wide context that module
    hands Phaser. No game config changes.

## User Stories

1. As a player entering the town, I want quiet music to rise under it, so that the town feels
   like a place and not a test map.
2. As a player, I want the music to fade rather than start or stop abruptly, so that arriving and
   leaving feel deliberate.
3. As a player stepping into the Spire, I want the town's music to fall away behind me, so that
   the delve starts in its own silence.
4. As a player heading out to a field, I want the town music gone there, so that the field
   doesn't sound like the town.
5. As a player coming back from a run or a field, I want the music to fade back in, so that
   returning feels like coming home.
6. As a player walking into the Inn or another town building, I want the music to carry on, so
   that the town stays one place.
7. As a player who stays in town a long time, I want the track to loop without a break, so that I
   don't notice where it ends.
8. As a player, I want the music quiet enough that it never fights what I'm doing, so that later
   sounds can be heard over it.
9. As a player who just reloaded the page, I want the music to start the moment I click or press
   a key, without a prompt in my way, so that sound never blocks play.
10. As a player who already clicked through login and the roster, I want the music in the town at
    once, so that I don't have to click again for it.
11. As a player who alt-tabs away, I want the music to pause and pick up when I come back, so
    that it doesn't play to an empty room.
12. As a player who doesn't want music, I want a choice in the ESC menu to silence it, so that I
    can play in quiet.
13. As a player who silenced it, I want the menu to say so and offer it back, so that I can tell
    which state it is in.
14. As a player, I want my choice remembered the next time I open the game in this browser, so
    that I don't silence it every visit.
15. As a player whose browser blocks storage (private window, blocked site data), I want the game
    to work anyway with the music on, so that a storage refusal never breaks the town.
16. As a player switching character, I want the music to fade as I go to the roster, so that the
    roster stays silent like the other menus.
17. As a player travelling to my leader's town, I want the music to carry on through the hub's
    restart rather than start again over itself, so that I never hear two copies.
18. As a player on a slow connection, I want the town's loading bar to include the music, so that
    the town doesn't start silent and then jump in later.
19. As a player whose browser can't load or decode the track, I want the town to work as before,
    silent, so that missing music costs nothing else.
20. As a player in a field or a run, I want the ESC menu as it was, so that there is no music
    choice where no music plays.
21. As a player who leaves /game for the marketplace and comes back, I want the music to work
    again with no error on the page, so that navigating the site is safe.
22. As the owner, I want the music loaded only when the town is entered, so that the menus and the
    other worlds don't pay for it.
23. As the owner, I want the music freed once the town is left, so that a run doesn't carry the
    town's decoded audio.
24. As the owner, I want the volume and fade lengths as named tunables, so that I can retune them
    without a spec change.
25. As the owner, I want to listen to the loop point myself, so that a gap or click is caught
    before players hear it.

## Acceptance Criteria

### A. Where and when

- [ ] Entering the hub (from the main menu, a run, a field, a hub restart) starts the music at
      volume 0 and ramps it to 0.4 over 2000 ms once the context runs. Tested on the module with
      a fake sound and a fake clock.
- [ ] Leaving the hub (the scene's `"shutdown"`) ramps it from its current volume to 0 over
      1000 ms and then stops it, with the ramp still advancing after HubScene has stopped (it is
      not on HubScene's tweens or clock).
- [ ] A hub entered during that fade-out ramps the same sound back up from its current volume.
      No second sound is added, and the track does not restart.
- [ ] A hub entered after the music stopped starts the track from 0 s.
- [ ] No other scene (MainMenu, CharacterCreation, Barrowspire, Field) starts the music.

### B. Format, loop, volume

- [ ] HubScene's `preload()` queues `load.audio` for `/audio/music/village.mp3` only, under one
      key. PreloadScene queues no audio.
- [ ] The sound is added with `loop: true`, and its target volume is `MUSIC_VOLUME` = 0.4. The sound
      manager's `volume` and `mute` are never written.
- [ ] `MUSIC_VOLUME`, `MUSIC_FADE_IN_MS` and `MUSIC_FADE_OUT_MS` are named exports of the music
      module.

### C. Autoplay and focus

- [ ] Nothing on screen asks for sound. A suspended context leaves the music silent, and its
      fade-in begins when the context first runs (Phaser's unlock), not before.
- [ ] No blur or focus handling is added. The game config's sound settings are unchanged
      (`pauseOnBlur` default).

### D. Loading and freeing

- [ ] Once the fade-out has ended and HubScene is neither running nor loading, the sound is
      destroyed and the key removed from `cache.audio`. A hub entry while the key is still cached
      skips the download.
- [ ] A missing, undecodable or unplayable file leaves the hub entering and running normally. No
      sound is added for an uncached key, nothing throws, and nothing shows on screen.
- [ ] On a scene end of `"destroy"` the module calls nothing on the sound or the sound manager.
      Leaving /game and returning plays the music in the new game with no error on the page.

### E. On and off

- [ ] `hubMenuChoices` takes the music state. With it on, the hub's menu reads *Change character*,
      [*Leave the queue*], **Silence the music**, *Back*. With it off, the third row reads **Let
      the music play**. Called without it (the field), the choices are unchanged: `["change",
      "back"]`.
- [ ] Pressing the row (click or its number key) switches the music (fade out or fade in), writes
      the setting, and rebuilds the menu in place with the other label.
- [ ] The setting is read from and written to `localStorage["barrowspire_music"]` as `"on"` /
      `"off"`. A throwing or absent store, or any other value, reads as on, and a throwing write
      is swallowed.
- [ ] With the setting off, entering the hub plays nothing. Turning it on there fades it in.
- [ ] The field's and the run's ESC menus are unchanged.

### F. Housekeeping

- [ ] `game-client/src/components/gameAudio.ts` is unchanged. No server, proto or gateway file
      changes.
- [ ] `game-client/public/audio/music/village.mp3` is committed (the root `.gitignore` un-ignores
      `game-client/public/audio/`).
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass.
- [ ] The owner's listening check passes (the HITL slice).

## Edge States

- **Locked context.** A page reloaded straight onto /game has no gesture: the context is
  suspended and the music is silent until the first click or key on the page. Phaser resumes the
  context, and the fade-in starts then (R10). Before that the module must not treat the music
  as audible.
- **Context already running.** After client-side navigation (login → /game), the context may run
  as soon as it is built. The music is heard on entering the hub with no click. Phaser 4.2.1
  still counts itself `locked` until its own unlock handler sees a gesture inside this game
  (`createAudioContext` calls `resume()`, then reads `state === 'suspended'` before that resolves),
  and `onBlur` skips the suspend while `locked`. So in this window, before the player's first click
  or key in the game, a blur does not pause the music. The first click or key, which every player
  makes to move, ends it. Accepted. D7's "no extra code" stands.
- **Loop point.** If the owner's listening check hears a gap or click where the track wraps (the
  mp3's 576 priming / 576 remainder frames kept in the decoded buffer), the fix is a Phaser sound
  marker (`addMarker({ name, start, duration, config: { loop: true } })`, played by name) that
  starts past the leading padding and ends before the trailing padding. It is written back as a
  `## Change:` on this FS. v1 does not pre-build it. **[charter default D2]**
- **Hub restart.** A `world_entered` for the hub while in the hub (a hub handoff, a reconnect)
  stops and starts HubScene in one go. The stop begins the fade-out and the start takes it back up
  (R4). The listener hears the volume dip briefly, never a second copy and never a restart from 0 s.
- **Leaving while still loading.** HubScene stopped during its preload never started the music.
  The module has nothing to fade. A load that later completes leaves the key cached, and it is
  freed on the next leave or used on the next entry.
- **Freed while loading again.** If the fade-out ends while HubScene is loading for a new visit,
  the music is not freed (R13). The new visit uses it.
- **Two leaves in a row.** A leave while already fading out (or stopped) changes nothing.
- **Toggled during a fade.** *Silence* during a fade-in reverses it to a fade-out from the current
  volume. *Let the music play* during a fade-out (off pressed, then on) reverses it to a fade-in.
  Never two sounds.
- **Toggled off, then leave.** Nothing is playing. Leaving frees it as usual.
- **Setting changed in another tab.** Read on each hub entry. A tab already in the hub keeps its
  own state until its next entry or press. No `storage` event listener in v1.
- **Storage refused.** Private windows, blocked site data or a throwing `localStorage` accessor
  read as on, and writes are lost silently. The press still switches the music for this visit.
- **Window loses focus.** Phaser suspends the context and resumes it on focus (R11). A fade in
  progress keeps its own schedule against the game's step and may finish while unheard.
- **Disconnect notice over the town.** The music plays on under the notice (FS-R6EYZ) until the
  hub stops ("Return to menu"), then fades out.
- **Leaving /game.** The game is destroyed and its sound manager destroys every sound. The module
  touches nothing (R21), and `gameAudio.ts` suspends the shared context as before. A fade in
  flight is dropped with the game.
- **No Web Audio.** A browser without `AudioContext` gets Phaser's HTML5 audio fallback
  (`gameAudio()` returns `{}`). The module works through the same `scene.sound` surface, and if
  that fallback cannot play the file, R14 applies.
- **mp3 unsupported.** `load.audio` adds no file. R14 applies.
- **Decoded size.** About 39 MB of decoded audio is held while the hub runs and briefly after it,
  in main memory, not the GPU. It is not counted in FS-C4JWH's texture figures.

## Out of Scope

- Music anywhere but the hub: the main menu, the roster, runs, fields, a different track per
  town building.
- Sound effects of any kind (footsteps, combat, UI clicks, ambience).
- A volume setting or slider, a master volume, a sound settings screen, and a separate mute for
  all sound.
- An ogg (or any second) encoding, and format negotiation.
- Pre-building the loop marker (an Edge State fix if the listening check needs it).
- Crossfading between tracks, a playlist, or music that reacts to time of day, party or danger.
- A server-side or per-account setting. The choice is per browser.
- Skipping the download when the music is off.
- Changing `gameAudio.ts`, the game config, the ESC menu's chrome (`showMenuPanel`), the field's or
  the run's ESC menu.
- Any server, proto or gateway change.

## Change: Music volume in an Options panel
Status: shipped
Date: 2026-11-13

Asked by the owner on 2026-11-13, after the music was built on its branch: 「音樂的聲量可以在遊戲內調整嗎」
(can the music's volume be adjusted in the game?), then 「好 幫我做音量調整」 (yes, make the volume
control). Shaped by him the same day: 「音量放在控制選項裡 所以按了會切大比較大的面板 像一般遊戲一樣 可以再退回主選單這樣」
(the volume goes in the options, so a press switches to a larger panel, like a typical game, and
you can go back to the main menu), and 「每個地圖都可以 就是一個共用的模組」 (every map can do it: one
shared module), and 「村莊背景音樂似乎本身就蠻大聲的 暫時設定成最大聲時只有原本的一半音量」 (the village track
seems loud in itself; for now, the loudest setting should be only half the original volume). Each
decision below is marked **[charter default]**, owner-approved 2026-11-13, with its reason; V1′,
V2′, V3′ and V7″ are his redirections of the charter's first V1, V2, V3 and V7.

The text above is not edited. This section replaces R8 (a fixed volume, "no volume setting in
v1"), R15–R18 (the on/off row and its setting) and R19 (no music row in the field's or the run's
menu), with their acceptance criteria. It lifts "A volume setting or slider" and "the field's or
the run's ESC menu" out of Out of Scope. Every other requirement above stands, R1 (music only in
the hub) included. It touches the town's and the field's ESC menu (FS-G4VMQ) and the run's
(FS-9K8EZ), each of which carries a stub pointing here.

**Facts (verified 2026-11-13 on feat/client-village-music e4856e10).**

- `hubMusic.ts` ramps the sound's own volume on the game's `step` toward `MUSIC_VOLUME` (0.4).
  Each ramp starts from the volume it last gave the sound, so a fade cut short turns round where
  it stands.
- `musicSetting.ts` keeps `"on"` | `"off"` in `localStorage["barrowspire_music"]`, with every
  access guarded.
- All three ESC menus are drawn by `showMenuPanel` (`ui/menuPanel.ts`). Their rows come from each
  world's rule: `hubMenuChoices` (`scenes/hubMenu.ts`) for the town and the field, and
  `runMenuChoices` (`ui/party.ts`) for the run.
- Each scene keeps the open menu in its own `menu` / `menuChoices` slots. Every "the menu owns
  the keys" guard reads `this.menu`: walking, I/B/C/E/F/Q, the chat input and the corner icons.
- The town and the run read the menu's keys each frame (`offerMenu`, `JustDown`). The field
  listens for `keydown-*` instead. All three bind the arrow keys for walking (`createCursorKeys`),
  and walking reads them as released while `this.menu` is set.
- On Esc with the menu open, the town and the field call `closeMenu()` and the run calls
  `menuChoices.dismiss()`.
- The windows' frame and title are `drawPanelFrame` and `drawPanelTitle` (`ui/panelFrame.ts`,
  FS-3EBCA R20). `menuOption` explains why a row's hit area is a separate camera-fixed rectangle.
- The canvas body face is EB Garamond, loaded through `next/font` with the `latin` subset. Its
  `unicode-range` (U+0000–00FF, U+2000–206F, …) has none of U+25A0 ■, U+25A1 □, U+25BA ► or
  U+25C4 ◄.

### Requirements

**A. The Options row**

C1. **Every world's ESC menu gets an Options row.** The town's, the field's and the run's ESC
    menus each offer **Options**, an amber actionable row, placed just before their *Back* row.
    It has its number key by the menu's existing rule:
    - Town: *Change character* [1], *Leave the queue* [2] while queued, *Options* [2] (or [3]
      while queued), *Back*.
    - Field: *Change character* [1], *Options* [2], *Back*.
    - Run: *Fall where you stand* [1] (or *Leave the barrow* [1] once resolved), *Options* [2],
      *Back*.

    In the town it takes the music row's place, so it keeps that row's number key. The run's
    Fall confirm gets no Options row. **[charter default V1′, V7″]** Reason: the owner's
    request, a settings page like a typical game, from every map.
C2. **One row, one rule.** The row is the shared module's own choice (C13). `hubMenuChoices`
    always includes it, for the town and the field, and takes no music state any more.
    `runMenuChoices` includes it for both of its states. Nothing else in either rule changes.

**B. The OPTIONS panel**

C3. **Options opens a larger panel in the menu's place.** A press on *Options* (a click, its
    number key, or Enter when it is the first actionable row, which it never is) closes the ESC
    menu and opens the **OPTIONS** panel. The panel sits at the camera's centre in the popup band
    (`MENU_DEPTH`) and wears the windows' frame with its × (`drawPanelFrame`). Its centred title
    is `OPTIONS` (`drawPanelTitle`, FS-3EBCA R20). It is wider than the menu: `OPTIONS_WIDTH`,
    tunable, 480 px against the menu's 320. **[charter default V2′]** Reason: a settings page you
    can back out of, as the owner described.
C4. **It is laid out for more rows.** Under the title's band the panel stacks a list of setting
    rows, each a label on the left and its control on the right, `OPTIONS_ROW` high (tunable).
    *Back* sits at the foot, and the panel's height follows the number of rows. A later setting
    (sound effects and so on) is one more entry in that list, with no change to the layout code.
    v1 has one row, **Music**. **[charter default V2′]**
C5. **The Music row is a stepped slider.** It shows the label **Music**, then a ◄ arrow, a bar
    of five steps, and a ► arrow. The level is 0 to 5: steps 1 to *level* are filled and the rest
    are empty, so level 0 shows an empty bar and level 5 a full one.
    - A click on ◄ lowers the level by one and a click on ► raises it by one, clamped at 0 and 5.
      An arrow at its end (◄ at 0, ► at 5) is dimmed and does not answer.
    - A click on step *k* sets the level to *k* (1 to 5). Level 0 is reached with ◄ or ←.
    - Each part brightens under the pointer, as a menu row does, and its hit area is a separate
      camera-fixed rectangle, as `menuOption`'s is.

    **[charter default V2′]**
C6. **←/→ move the slider while the panel is open.** ← does what ◄ does and → what ► does,
    clamped, one level per press. Holding a key does not repeat. In the town and the run they are
    read with the menu's keys in `offerMenu`; in the field they are read through its key
    listeners. A and D do not do this. Enter and the number keys do nothing while the panel is
    open. **[charter default V2′]**
C7. **Back, Esc and × return to that world's ESC menu.** The panel's foot row reads
    **Back  [Esc]** in the cancel register. *Back*, Esc and the frame's × each close the panel and
    reopen the ESC menu of the world it was opened from, rebuilt from the scene's state as it
    opens. They never close everything. The corner row's Menu icon is the exception: as it closes
    the menu (FS-3EBCA R18), it closes the panel and reopens nothing. **[charter default V2′]**
    Reason: as C3. The Menu icon's rule is derived here from R18.
C8. **While open it owns the keys and the screen, as the menu does.** The panel keeps the scene's
    menu slot, so every guard that holds while the ESC menu is open holds for it:
    - movement is not sent;
    - I, B, C, E, F, Q, T and M, a press in the world, the chat input and the corner icons open
      or do nothing (the Menu icon as C7 says);
    - a blocker over the whole view under the panel takes every press and hover (FS-G4VMQ
      § Change C4, FS-3EBCA R18).

    The world runs on behind it. When the view's size changes the panel is centred again, as the
    menu is (FS-ZAJMH R13).

**C. The music level**

C9. **Six levels, 0 to 5, with 0 as silence, capped at half the file's loudness.** The levels map
    linearly onto the gain `MUSIC_MAX_GAIN × level / 5`, giving 0, 0.1, 0.2, 0.3, 0.4 and 0.5.
    `MUSIC_MAX_GAIN` is one named constant (tunable, 0.5), **temporary**: the cap stands until
    the track is remastered or the owner retunes it. The default is `MUSIC_DEFAULT_LEVEL`
    (tunable, 3: gain 0.3). Both are named exports of the setting's module, with the gain per
    level derived from them, not listed separately. They replace `MUSIC_VOLUME`, which was 0.4:
    by default the town now plays at 0.3, a little quieter than R8's fixed volume. The music's
    target volume is always the gain of its level, set on the music's own sound and never on the
    sound manager's `volume` or `mute` (R8's rule). **[charter default V3′, owner override]**
    Reason: the track is mastered loud.
C10. **A change in the town applies at once, over a short ramp.** A change between two levels
    above 0 ramps the volume from where it stands to the new gain over `MUSIC_LEVEL_RAMP_MS`
    (tunable, 200 ms). The ramp runs on the same game-step clock as the fades (R3), never on a
    scene's tweens or clock. A change during that ramp starts a new ramp from where the volume
    stands. **[charter default V4]** Reason: no jump in loudness.
C11. **A change during a fade-in retargets it.** While the music fades in (R2), a change to
    another level above 0 neither restarts nor cuts the fade. The fade heads for the new gain from
    the volume it has reached, over the time it has left. A fade-in still waiting for the context
    to run (R10) only takes the new target. **[charter default V4]**
C12. **Level 0 is "off".** A change to 0 (◄ or ← from 1) does exactly what *Silence the music*
    did (R16, R18): the music fades out over `MUSIC_FADE_OUT_MS` from where it stands, then
    stops.
    - Entering the hub at level 0 starts nothing. The track is still loaded (R12), and leaving
      frees it as usual (R13).
    - A change from 0 to a level above it does what *Let the music play* did: the music starts,
      or a fade-out in flight is turned round, and it fades in over `MUSIC_FADE_IN_MS` from where
      it stands to the new gain.
    - So a change to or from 0 takes R2's and R3's fade lengths, and C10's 200 ms ramp applies
      only between audible levels.

    Every hub entry (R2) reads the level and, above 0, fades in to its gain. A hub re-entered
    during a fade-out (R4) takes the same sound back up to that gain. **[charter default V6]**
    Reason: reuses the tested off path.
C13. **One shared module, and every scene uses it.** The panel, its rows and its keys are one
    module, `game-client/src/ui/optionsPanel.ts`. It exports the Options choice (C2) and a
    function that opens the panel. Each scene passes it:
    - its menu tones (`MenuTones`; the panel takes no colour of its own, ADR-0013);
    - the origin, the hit size and the Menu icon's `through`;
    - what *Back* does (reopen that scene's ESC menu);
    - a **music level control**: read the level, set the level.

    The level's storage and its migration live in `game-client/src/audio/musicSetting.ts`, and
    so does a control that only reads and writes the stored level. In the town the control is
    the hub's music (`HubMusic`), which stores the level and applies C10–C12. In the field and the
    run it is the stored-only control. Each scene only adds the row (through its rule, C2), opens
    the panel, and routes its keys. No scene draws a panel of its own. `ui/menuPanel.ts` changes
    only if the panel reuses a piece of it that is not exported yet. **[charter default V7″]**
    Reason: the owner asked for one shared module, available on every map.
C14. **Field and run: the setting, not the sound.** No music plays outside the hub (R1). A change
    made in a field or a run only stores the level, and the next hub entry reads it (C12).
C15. **The level is remembered in this browser.** It is kept in `localStorage` under the same key,
    `barrowspire_music`, as the digit `"0"` to `"5"`. It is written on every change and read on
    every hub entry and every time the panel opens. The on/off row's stored values migrate on
    read:
    - `"off"` reads as 0;
    - `"on"`, an absent key, any other value or a throwing read reads as `MUSIC_DEFAULT_LEVEL` (3).

    Every read and write stays wrapped in `try`/`catch`. A throwing write is swallowed and the
    change still applies for this visit. Per browser, never sent to the server (R17).
    **[charter default V5]** Reason: existing players keep their choice.
C16. **Copy and drawing follow the design guideline.** The copy is terse nouns in the lore
    voice's register, in the canvas body face: **Options**, **OPTIONS**, **Music**, **Back  [Esc]**.
    Colour comes from the scene's `MenuTones` only (the game palette, ADR-0025):
    - the arrows and the filled steps take `actionable` (amber, a thing to act on), brightening to
      `text` under the pointer;
    - an empty step and a dimmed arrow take `dim`;
    - *Back* takes `cancel`.

    The arrows and the steps are drawn in code (filled triangles and rectangles on whole px), not
    as the text glyphs ◄ ► ■ □. The canvas face has none of those glyphs (Facts), and the
    guideline draws such marks in code from tokens. No emoji. **[charter default V8]** Reason:
    lore voice, game palette, no emoji.

**D. The run**

C17. **The run's panel yields as the run's menu does.** A state that would take the run's menu
    down (FS-9K8EZ req 6: newly dead or newly out) takes the panel down too, and so does the
    run's end. Once the run has ended, Esc opens nothing (as now), and *Back* has no menu to
    return to. **[charter default V7″]** Derived: the panel stands in the menu's slot (C8).

### Acceptance Criteria

**The Options row**

- [ ] `hubMenuChoices({ queued })` returns `change`, [`leave`], `options`, `back`, the `options`
      row reading **Options** in the actionable register. The field's menu is `change`,
      `options`, `back`.
- [ ] `runMenuChoices` returns `fall` or `leave`, then `options`, then `back`. `FALL_CONFIRM` is
      unchanged.

**The panel**

- [ ] Pressing *Options* (a click or its number key) in the town, a field or the run closes the
      ESC menu and opens the panel. The panel is titled `OPTIONS` by `drawPanelTitle`, framed by
      `drawPanelFrame`, `OPTIONS_WIDTH` wide, at the camera's centre in the popup band, with one
      setting row, **Music**, and **Back  [Esc]** at its foot.
- [ ] The panel's rows come from a list. A test that adds a second row entry gets a taller panel
      with both rows laid out, without changing the layout code.
- [ ] The Music row shows ◄, five steps with *level* filled, and ►. A click on ◄ or ► changes the
      level by one, clamped, and the arrow at its end is dimmed and ignored. A click on step *k*
      sets level *k*.
- [ ] With the panel open, → and ← change the level by one, clamped; A, D, Enter and the number
      keys do nothing.
- [ ] *Back*, Esc and the × close the panel and reopen that world's ESC menu, rebuilt from the
      scene's state. The corner Menu icon closes the panel and opens nothing.
- [ ] While the panel is open no `move` is sent, the guarded keys and icons do nothing, a press in
      the world sends nothing, and the blocker takes every press and hover except the Menu icon's.
- [ ] The panel is centred again when the view's size changes.
- [ ] The town, the field and the run each open the same module's panel. None draws one of its
      own.

**The level**

- [ ] `MUSIC_MAX_GAIN` = 0.5, `MUSIC_DEFAULT_LEVEL` = 3, `MUSIC_LEVEL_RAMP_MS` = 200,
      `OPTIONS_WIDTH` and `OPTIONS_ROW` are named exports. The gains for levels 0–5 are 0, 0.1,
      0.2, 0.3, 0.4 and 0.5, derived from `MUSIC_MAX_GAIN`, so a test that changes the cap changes
      every level's gain. The default level plays at 0.3. The sound manager's `volume` and `mute`
      are never written.
- [ ] Entering the hub at level n > 0 fades in from silence to n's gain over 2000 ms
      once the context runs, tested with a fake sound and a fake clock. At level 0 nothing plays.
- [ ] In the town, a change between two levels above 0 ramps from where the volume stands to the
      new gain over 200 ms on the game's step. A second change mid-ramp ramps from where it
      stands.
- [ ] A change to a level above 0 during a fade-in keeps the fade's remaining time and ends at
      the new gain. During an unheard fade-in only the target changes.
- [ ] A change to 0 fades out over 1000 ms and stops the sound. A change from 0 starts it (or
      turns a fade-out round) and fades in over 2000 ms to the new gain. There is never a second
      sound.
- [ ] A change in a field or the run writes the level and plays nothing. The next hub entry fades
      in to it.
- [ ] `localStorage["barrowspire_music"]` is written as `"0"`–`"5"`. Reading `"0"`–`"5"` gives
      that level, `"off"` gives 0, and `"on"`, absent, any other value or a throwing store gives
      3. A throwing write is swallowed and the change still applies.

**The run**

- [ ] In the run, a state that closes the menu (newly resolved), or the run's end, closes the
      panel.

**Housekeeping**

- [ ] The arrows and steps are drawn in code from `MenuTones`, with no ◄ ► ■ □ text glyph and no
      emoji.
- [ ] Nothing changes in `BarrowspireScene.ts` beyond its menu wiring (the row's action, opening
      the panel, routing ←/→ and Esc to it, the yield). No server, proto or gateway file changes,
      and `gameAudio.ts` and the game config are unchanged.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass.
- [ ] The owner's listening and look check passes (the HITL slice).

### Edge States

- **Old setting.** A browser that pressed *Silence the music* opens the town silent, with an empty
  bar. One that never pressed it, or pressed it twice, opens at level 3: gain 0.3, a little
  quieter than the 0.4 it played at before (C9). The key is not rewritten until the level
  changes.
- **Downgrade.** A client from before this change reads every value except `"off"` as on, so a
  stored `"0"` plays there. FS-28DDG has not reached main, so only the owner's browser can meet
  this. Accepted.
- **Changed in a field or a run, then back to town.** The town fades in to the new level, or
  stays silent at 0. A tab in the town meanwhile keeps its own level until its next entry or
  change (R17; no `storage` listener).
- **Change during the fade-out of a change to 0.** → turns it round to a fade-in from where it
  stands (C12). Never two sounds.
- **Track failed to load** (R14). The slider still shows and changes the level, and the level is
  kept. Nothing plays.
- **Context suspended by a blur.** A ramp or fade keeps its own schedule on the game's step and
  may finish unheard (*Window loses focus*). The new level holds when sound resumes.
- **Panel closed mid-ramp.** The ramp runs on, and closing changes nothing.
- **Leaving the hub with the panel open.** A `world_entered` or a hub handoff takes the panel down
  with the menu slot, and the music fades out from where it stands (R3).
- **Queue or pending state changes while the panel is open.** *Back* rebuilds the menu from the
  state as it is then: *Leave the queue* appears or goes, and *Change character* stays dimmed
  while a `leave_hub` is pending.
- **Fallen in a field.** The panel opens and works as anywhere in the field.
- **The run's end, or a death, with the panel open.** It closes (C17), and the card or result
  that follows is never covered.
- **Arrow keys and walking.** The arrows walk the player when nothing is open. While the panel is
  open, walking reads them as released (C8), so a press only changes the level.
- **Disconnect notice.** The notice over the town or a field covers the panel as it covers the
  menu (FS-R6EYZ). *Return to menu* leaves the world and the panel goes with it.

### Out of Scope

- Rows other than Music: sound effects (there are none yet), a master volume, key bindings,
  graphics settings.
- Dragging the slider, a level number beside it, or hinting ←/→ on the panel.
- Options in the main menu, the roster or character creation.
- Music anywhere but the hub (R1 stands).
- A per-account or server-side setting.
- Rewriting the stored value on read (the migration takes effect on the next change).
- Any change to `BarrowspireScene.ts` beyond its menu wiring, or to the run's Fall confirm.

## Change: Sound effects row in the OPTIONS panel → FS-WDM0X

## Change: The music's cap tuned to 0.3
Status: shipped
Date: 2026-11-13

A tune of § Change C9's values only (`Tunes FS-28DDG`; C9 names `MUSIC_MAX_GAIN` as tunable and
temporary). At the listening check (I-28DDG-6) the owner said:

> 「感覺音量還是太大 滿格設定成0.3」

It still sounds too loud; set the full bar to 0.3.

`MUSIC_MAX_GAIN` goes from 0.5 to 0.3 and stays **temporary**, on the same terms as C9: it
stands until the track is remastered or the owner retunes it. The rule is unchanged, gain =
`MUSIC_MAX_GAIN` × level / 5, and `MUSIC_DEFAULT_LEVEL` stays 3. Levels, ramps, fades, the
stored setting, its migration and the panel are unchanged. These values replace C9's where it
stated them ("half the file's loudness", 0.5, the default's 0.3), and the criterion under
*The level* that lists them follows. Built in 200918df (`game-client/src/audio/musicSetting.ts`).

| Value | Was | Now |
|---|---|---|
| `MUSIC_MAX_GAIN` (level 5) | 0.5 | 0.3 |
| gains for levels 0–5 | 0, 0.1, 0.2, 0.3, 0.4, 0.5 | 0, 0.06, 0.12, 0.18, 0.24, 0.3 |
| the default level 3 plays at | 0.3 | 0.18 |

## Change: Fullscreen in the OPTIONS panel → FS-T3DWX

## Change: The tower's music on every floor of a run
Status: shipped
Date: 2026-11-14

Asked by the owner on 2026-11-14: 「把塔的背景音套用到目前塔內所有樓層的地圖中」 (apply the tower's
background track to every floor map currently inside the tower). He supplied
`game-client/public/audio/music/tower.ogg`. Charter run approved the same day. Each decision
below is a **[charter default]** (T1–T9), owner-approved 2026-11-14, with its reason.

The text above is not edited. This section replaces R1 (music only in the hub) and, for the run,
§ Change C14 (the run stores the level and plays nothing). It lifts "runs" out of the first Out of
Scope line and "An ogg (or any second) encoding" out of the Out of Scope list, for the tower track
only. R6 (mp3 alone) stands for the village track. Every other requirement above holds for both
tracks: the fades (R2, R3), one sound per track (R4), from the top each new visit (R5), the loop
(R7), autoplay and focus (R9–R11), loading and freeing (R12–R14), the game's end (R21), and the
level and its ramps (C9–C12, C15). The thin line "Music in the hub" no longer holds and is
reworded in place, pointer unchanged: "Background music".

**Facts (verified 2026-11-14 on feat/client-tower-music, cut from main 95f58efa).**

- A climb is a game-state broadcast. `handleGameStateUpdate` calls `leaveFloor()` when
  `climbed(lastFloor, floor)`, and the floor is rebuilt inside the running BarrowspireScene. No
  `world_entered` comes and the scene does not stop.
- BarrowspireScene keeps running through a death, spectating, `end_game` and the settlement
  record. It stops only when `switchWorld` applies another `world_entered`. The hub's waits
  behind an open record (`resultHold`, FS-GV8WN R23).
- A reconnect mid-run restarts BarrowspireScene (`switchWorld` → `start` on a running scene): a
  shutdown, then a start. That is the same shape as the hub restart (Edge States).
- BarrowspireScene's `init` registers `onSceneEnd(this, resetRun)` once per start, so a stop during
  preload already reaches `resetRun`. HubScene registers its release in create, which is why it
  needs `cancelLoadingEnd`. The run does not.
- `HubMusic` lives on HubScene's instance, which Phaser keeps across stops. The village's fade-out
  runs on the game's `step` after the hub stops. An instance on BarrowspireScene behaves the same
  way.
- The run's Options panel passes `storedMusicLevel` (C14). With music in the run, a change there
  has to reach the playing music. Otherwise it plays at the old level until the next entry.
- `tower.ogg`: Ogg Vorbis, 2 ch, 44.1 kHz, ~138 kbps, 5,292,000 valid frames (120.000 s) + 128
  priming + 352 remainder (`afinfo`). `tower.m4a` (`afconvert -f m4af -d aac -b 96000 -q 127`):
  AAC, 2 ch, 44.1 kHz, ~88 kbps, 1.34 MB, 5,292,000 valid + 2112 priming + 992 remainder.
  Decoded, 5,292,000 × 2 × 4 B ≈ 42.3 MB.
- Loudness, whole file decoded to 16-bit PCM: tower −27.3 dBFS RMS / −3.0 dBFS peak; village
  −12.9 dBFS RMS / −1.3 dBFS peak. The tower is about 14 dB quieter than the village.
- Phaser 4.2.1: `AudioFile.getAudioURL` takes the first URL whose extension the device can play
  and never falls back on a decode failure (as FS-WDM0X S21). `WebAudioSound#volume` writes its
  gain node unclamped.

### Requirements

**A. One module, a track per world**

W1. **One world-music module.** `game-client/src/audio/hubMusic.ts` becomes
    `game-client/src/audio/worldMusic.ts`, and `HubMusic` becomes `WorldMusic`. It is the same
    class: enter, leave, the level, the fades and ramps, one sound, freeing. Nothing of it is
    copied. A **track** is its cache key, its URLs in load order, and its trim (W5). The module
    names which track each world plays: the hub plays the village track, the run plays the tower
    track, and a field plays none. **[charter default T7]** Reason: one owner of the fades (R20).
W2. **Each world scene holds its own music.** HubScene and BarrowspireScene each make one
    `WorldMusic` for their world's track, on their first visit, and keep it on the scene instance
    across stops, as HubScene does now (R20). The stage (`sceneMusicStage`) takes the track. Its
    "kept for the next visit" check asks whether that world's scene runs or is loading again
    (R13), so each track is freed by its own world. FieldScene is unchanged and plays nothing.
    **[charter default T7]** Reason: the two fades of a switch (W4) run side by side with no
    state shared between worlds.

**B. The tower track in the run**

W3. **Every floor plays the same track, uninterrupted.** The tower track plays from the run's
    entry until the run is left. A climb to another floor neither restarts it, nor dips it, nor
    stops it: the floor is rebuilt inside the running scene (Facts), and nothing in the floor
    change touches the music. **[charter default T1]** Reason: the owner asked for every floor,
    and one track is the smallest v1.
W4. **Into the run and back.** Leaving the town for the run fades the village track out over
    `MUSIC_FADE_OUT_MS` (R3, unchanged), and entering the run fades the tower track in over
    `MUSIC_FADE_IN_MS` from the moment it can be heard (R2, R10, now for the run). Leaving the run
    for the town does the reverse. The next world loads between the two fades, so the fade-in
    starts at that world's create. That is usually after the other track has fallen silent, and
    on a fast load the two overlap. Never two copies of one track (R4). **[charter default T2]**
    Reason: R2's and R3's fades, reused.
W5. **One shared level, a trim per track.** The music's target is the level's gain (C9) times the
    track's trim: `musicGain(level) × trim`. The village's trim and the tower's are named
    tunables, both 1.0. The Music level, its storage, its 0.3 cap and its ramps are shared and
    unchanged. **[charter default T4]** Reason: one setting for the player, and one constant per
    file to balance loudness.
W6. **The run's Options panel drives the run's music.** In the run, the Music row's level control
    is the run's `WorldMusic`, so C10–C12 apply there as they do in the town: a change ramps at
    once, 0 fades out, and a change from 0 fades in. C14 now holds only for the field, which keeps
    `storedMusicLevel`. The panel and its UI are unchanged. Derived from T4 and T7: without it, a
    change in the run would only take effect at the next entry.
W7. **It plays until the run is left.** Being dead, spectating, the run's end and an open
    settlement record do not stop or dip it. Only BarrowspireScene's end does (R3's fade-out):
    the hub's `world_entered` applied, once the record lets it in, a field, the roster, or a
    restart. **[charter default T3]** Reason: the run is still the world on screen.

**C. Format, loading and the loop**

W8. **m4a first, ogg second.** The tower track loads as `["/audio/music/tower.m4a",
    "/audio/music/tower.ogg"]`. `tower.ogg` is the owner's file. `tower.m4a` is made from it with
    `afconvert -f m4af -d aac -b 96000 -q 127 tower.ogg tower.m4a`. Both are committed. The village
    track stays `village.mp3` alone (R6). **[charter default T5]** Reason: as the effects
    (FS-WDM0X S21). Safari's Ogg decode is unreliable, and Phaser never falls back on a decode
    failure.
W9. **Loaded by the run, freed after it.** BarrowspireScene's `preload()` queues the tower track
    beside its art, so the run's torch bar counts it, and skips it while the key is still cached.
    PreloadScene does not load it. Once the run's fade-out has ended and BarrowspireScene is
    neither running nor loading, the sound is destroyed and the key removed from the audio cache
    (R13). A stop during the run's preload reaches the music through the run's existing scene-end
    listener. A failed load costs only the music (R14). **[charter default T6]** Reason:
    scene-scoped, as R12 and R13 are.
W10. **A seamless loop.** The tower track loops with Phaser's `loop: true`, as R7, and v1 adds no
    marker. **[charter default T8]** Reason: a marker (Edge States: Loop point) is the fix only
    if the owner hears a seam.

**D. Wiring**

W11. **The scenes only say entered, left, and pass the music.** BarrowspireScene changes only its
    music wiring: `preload` (queue), `create` (enter), `resetRun` (leave), and `openOptions` (the
    level control, W6). HubScene changes only what the module's new names require. No fade,
    ramp or sound logic in either scene. **[Bounds]**

### Acceptance Criteria

**The module**

- [ ] `game-client/src/audio/worldMusic.ts` exports `WorldMusic` and the village and tower
      tracks. `hubMusic.ts` and `HubMusic` are gone, and nothing imports them. Asked for its
      world's track, the module gives the village track for the hub, the tower track for the run,
      and none for a field.
- [ ] The tower track is keyed apart from the village's, with URLs `["/audio/music/tower.m4a",
      "/audio/music/tower.ogg"]`. The village's URLs are `["/audio/music/village.mp3"]`. Both
      trims are 1.0 and are named.
- [ ] With a trim t, entering at level n fades in to `musicGain(n) × t`, and a level change ramps
      to the new gain × t. Tested with a fake sound and a fake clock. Every test from
      `hubMusic.test.ts` still passes against `WorldMusic`.
- [ ] `sceneMusicStage(scene, track)` adds, finds and frees the given track's key. Its
      kept-for-the-next-visit check reads the given scene's status.

**The run**

- [ ] BarrowspireScene's `preload()` queues the tower track's key with its two URLs, beside the
      creatures and the boss, and queues nothing when the key is cached.
- [ ] The run's create makes the run's music once and enters it. A second visit enters the same
      instance.
- [ ] The run's scene end (`resetRun`) leaves the music: `"shutdown"` fades it out on the game's
      step past the stop, and `"destroy"` asks the sound and the sound manager nothing.
- [ ] A climb (`leaveFloor`) neither stops nor restarts the sound, and changes nothing in its fade.
- [ ] `endRun()` (the run's end) and a death leave the music playing at its level.
- [ ] The run's Options panel gets the run's music as its level control. A change there writes the
      setting and ramps the playing music. The field still gets `storedMusicLevel`.

**The town**

- [ ] HubScene's `preload()` queues the village track under its key with `["/audio/music/village.mp3"]`,
      and its music behaves as before (the existing HubScene music tests pass on the new names).

**Housekeeping**

- [ ] `game-client/public/audio/music/tower.ogg` (the owner's) and `tower.m4a` (afconvert, as W8)
      are committed.
- [ ] FieldScene, PreloadScene, `gameAudio.ts`, the game config, the OPTIONS panel's UI, and every
      server, proto and gateway file are unchanged.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .`, `npm run lint` and
      `npm run lint:fence` pass.
- [ ] The owner's listening check passes (the HITL slice): entering the run, a climb, a death and
      spectating, the settlement record, and back to the town.

### Edge States

- **Loudness.** The tower track is about 14 dB quieter than the village's (Facts). At trim 1.0 it
  plays much softer than the town at the same level. The owner's listening check sets the tower's
  trim, as a `Tunes FS-28DDG` of W5's named value. A trim above 1 / `MUSIC_MAX_GAIN` (3.33) can
  push the gain past 1 at level 5, and Phaser does not clamp it.
- **Reload straight into a run.** No gesture yet: the context is suspended and the tower stays
  silent until the first click or key. The fade-in starts then (R10).
- **Reconnect mid-run.** BarrowspireScene stops and starts in one go. The stop begins the fade-out
  and the start's create takes the same sound back up (R4). The volume dips briefly. It never
  restarts from 0 s and there are never two copies.
- **Stopped during the run's preload.** The run never entered the music, so there is nothing to
  fade. A load that completes later leaves the key cached for the next entry (R13's "Leaving while
  still loading").
- **Both tracks held at once.** For about a second around a switch, the falling track and the
  rising one are both decoded in memory: about 39 MB (village) + 42 MB (tower). The falling one is
  freed when its fade ends.
- **A fast load.** If the run's assets are all cached, its create can come before the village has
  fallen silent. The two fades then overlap briefly. Accepted (W4).
- **Loop point.** If the owner hears a gap or click where the tower track wraps, the fix is R7's
  marker (Edge States: Loop point above), sized to the file the browser picked. The m4a carries
  2112 priming and 992 remainder frames; the ogg 128 and 352. It is written back as a `## Change:`.
  v1 does not pre-build it.
- **Firefox without AAC.** It takes the ogg (W8).
- **Level 0 in the run.** Entering the run plays nothing, the track is still loaded, and leaving
  frees it. → in the Options panel starts it with R2's fade-in (C12).
- **Settlement record open, then Leave.** The tower plays on under the record. The hub's
  `world_entered` applies when the record is closed or Leave is pressed, and the tower falls then.
- **The field.** Still silent. Its Options panel only stores the level (C14).

### Out of Scope

- Music in a field, the main menu, the roster or character creation.
- A track per floor, a boss track, or music that reacts to danger, a death or the run's end.
- Overlapping the two fades on purpose, or timing one fade against the other's end.
- Changing the files' own loudness (the trim does that), or retuning `MUSIC_MAX_GAIN`.
- The loop marker, unless the listening check needs it.
- The OPTIONS panel's UI, the ESC menus' rows, `gameAudio.ts`, the game config, PreloadScene.
- Any server, proto or gateway change.

### Tunes: the tower's ceiling at 1.0 (2026-11-14)

A tune of W5's named value (`Tunes FS-28DDG`), from the owner's listening check (I-28DDG-8). He
could not hear the tower track at the shared cap: trim 1.0 under `MUSIC_MAX_GAIN` 0.3 played it at
0.18 by default, about 14 dB under the village's file (−27.3 vs −12.9 dBFS RMS). He chose:

> 「塔預設上限是1 也就是100%」

The tower's ceiling is 1, that is 100% of the file.

W5's per-track constant is carried as each track's **ceiling** (`maxGain`, its level 5's gain)
rather than a factor on the shared cap's gain; the two are the same number seen from either
side (ceiling = `MUSIC_MAX_GAIN` × trim), so the rule reads gain = ceiling × level / 5. The trim
is removed. The one shared Music level still drives both tracks, and the fades, ramps, stored
setting and panel are unchanged. The village keeps 0.3, still temporary on C9's terms. With the
tower's ceiling at 1.0 no level's gain passes 1, so the Edge States' unclamped-gain caveat does
not arise. W5's "both 1.0" and the criteria under *The module* that state trims read with these
values.

| Value | Was | Now |
|---|---|---|
| tower ceiling (level 5) | 0.3 (trim 1.0 × 0.3) | 1.0 |
| tower gains for levels 0–5 | 0, 0.06, 0.12, 0.18, 0.24, 0.3 | 0, 0.2, 0.4, 0.6, 0.8, 1.0 |
| tower at the default level 3 | 0.18 | 0.6 |
| village ceiling | 0.3 (trim 1.0 × 0.3) | 0.3 (`MUSIC_MAX_GAIN`), unchanged |

### Facts: the owner's newest tower mix (2026-11-14)

A record of what changed after the Tunes above. No requirement and no value of this section
changes. The owner replaced `tower.ogg` twice after the tune, in 6ca4ed0d and then 84d52624, and
each time the m4a fallback was re-encoded from it. These facts supersede the Facts list's `tower.ogg`,
`tower.m4a` and loudness lines and the Edge States' *Loudness* entry, where they state the old
file. The text above is not edited.

- Loudness, the newest `tower.ogg` decoded whole to 16-bit PCM: −16.0 dBFS RMS / −0.9 dBFS peak
  (the first file: −27.3 / −3.0). The village is unchanged at −12.9 / −1.3.
- `tower.m4a` is now encoded at 160 kbps (`afconvert -f m4af -d aac -b 160000 -q 127`), not 96:
  AAC, 2 ch, 44.1 kHz, ~157 kbps, 2.38 MB, still 5,292,000 valid + 2112 priming + 992 remainder
  frames.
- At the default level the tower now plays roughly 7 dB louder than the village: about
  −20.4 dBFS RMS (gain 0.6) against about −27.8 (gain 0.18). The old file played about 14 dB
  under the village's file. Every gain stays at or under 1, so nothing plays past a file's own
  loudness.
- The owner heard the newest mix at the ceiling of 1.0 and approved it:

  > 「沒問題可以合併回main跟push」

  No problem: merge it back into main and push.

The tower's ceiling stays 1.0 and the village's 0.3. A retune for the louder mix, if the owner
wants one, is a new `Tunes FS-28DDG`.

### Amendment 2026-11-14: the village's file

The owner replaced the village track with an ogg (2026-11-14: 「村莊的音檔我更新了幫我換一下」).
R6's "the owner's mp3 alone" is superseded. The village now loads `village.m4a` first and then
`village.ogg`, the same way as the tower and the effects (FS-WDM0X S21). The m4a is encoded from
the ogg with afconvert (AAC, stereo, about 190 kbps). The new file is as loud as the mp3 it
replaces (RMS -13.3 against -12.8 dBFS, peak -1.4 against -1.3), so the 0.3 cap (C9) stands.
