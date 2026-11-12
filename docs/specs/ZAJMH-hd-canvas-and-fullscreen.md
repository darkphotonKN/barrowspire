# FS-ZAJMH: HD canvas and fullscreen

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "High-density canvas rendering", "Canvas that resizes with the window", "Fullscreen and windowed play" → this FS · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (2x baked art), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (DOM over the canvas wears the UI palette) · Surface: game-client only

## Summary

The game canvas is a fixed 1080×720 with a backing store of the same size, so on any screen whose device pixel ratio is above 1 (a Retina Mac, a Windows laptop at 125–150 %, a 4K monitor) the browser stretches it and the whole world looks soft. This feature draws the canvas at the screen's real pixel density (up to 2× the logical size, which is where the 2x-baked art runs out of detail), lets the canvas fill the space it is given and follow the window as it changes, and gives the `/game` page two states: **windowed** (the site header stays, the game fills the rest with no page scroll) and **fullscreen** (only the game), switched by a button in the game frame's corner. What a player can see of the world, and every game rule, stay the same.

Scoped and approved in the 2026-11-05 charter run "高解析度畫布 + 全螢幕"; every decision below marked *(charter default)* is one Nick approved, with its reason.

> **Amended 2026-11-06** by Nick, while the FS is still a work-order (slice 4 awaiting its browser
> check): one owner decision, with a code change (I-ZAJMH-5). Numbered A16, after charter
> defaults 1–15. **(A16) In fullscreen, Esc is the game's where the browser allows it.** Charter default
> 11 rested on "a page cannot intercept Esc". It can, in Chrome and Edge: the Keyboard Lock API
> (`navigator.keyboard.lock(['Escape'])`) gives Esc to the page while JS-initiated fullscreen is
> active, in a secure context (localhost counts), and the player leaves by holding Esc about 2 s,
> with Chrome's own hint on screen. Safari and Firefox have no Keyboard Lock and keep the first-Esc
> exit. Sources: [MDN `Keyboard.lock()`](https://developer.mozilla.org/docs/Web/API/Keyboard/lock),
> [Chrome: Keyboard Lock API](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock),
> [W3C/WICG Keyboard Lock §3.2, §4.1, §4.2](https://wicg.github.io/keyboard-lock/). The Chrome 131
> keyboard-lock permission prompt was not launched
> ([Chrome blog](https://developer.chrome.com/blog/keyboard-lock-pointer-lock-permission)). The
> Facts line on Esc, R20, R21, User Story 22, the Esc acceptance criterion and the Edge States are
> corrected in place; each says *(Amended 2026-11-06, A16 …)*.

## Terms

Engineering words for this feature. They extend `game-client/CONTEXT.md` § *Rendering terms* and, like those, stop at the pixel: none of them reaches the wire or a game rule. (*Screen position* there keeps its meaning: the projection's output.)

- **Logical view**: the coordinate space cameras and the HUD work in. Always **720 units tall**; **1080 to 1280 units wide** depending on the shape of the space the game is given. At render scale 1 one logical unit is one CSS pixel of today's canvas.
- **Render scale**: backing-store pixels per logical unit. Displayed CSS size × `devicePixelRatio` ÷ logical size, capped at 2.
- **Game frame**: the DOM element that holds the canvas and Phaser's DOM container. It is what goes fullscreen.
- **Windowed** / **fullscreen**: the game frame's two states on the `/game` page.

## Facts this spec rests on

- `src/components/PhaserGame.tsx` creates the game at 1080×720 with no `scale` config. Phaser `^3.80.1` has **no game-wide resolution option**: the backing store is the game size. That, not "1080", is the softness.
- Baked art is **2x** (`docs/design-guideline.md` "Linear filtering", FS-2325V): drawn at 1x from a 2x render. A 2x backing store shows detail that already exists; no re-bake.
- `src/render/crispText.ts` (`installCrispText`) rasterises every `add.text` at `devicePixelRatio`.
- ~25 readers of `cameras.main.width/height/centerX/centerY` across MainMenu, CharacterCreation, Barrowspire, Hub, Field, Preload, Game, GameOver scenes, `utils/Background`, `ui/ChatWindow`, `ui/PartyReadyCheck`, `ui/PartyInvitePrompt`. HUD widgets are `setScrollFactor(0)` with hard-coded px, placed once at construction (e.g. `ResourceHud` at `cameras.main.height - margin`, `AbilityHud` at `width - margin`), never re-laid out.
- HUD hit tests read `pointer.x/y` (ChatWindow, GearOverlay, gearOverlayLayout, LetterPanel, PartyPanel, ContainerView, MainMenuScene, BarrowspireScene). World aim reads `pointer.worldX/worldY` (BarrowspireScene, fieldCombat).
- `LightMap` (`src/render/lighting/LightMap.ts`) refits on `Phaser.Scale.Events.RESIZE`; `blackoutMask` (`src/render/world/blackoutMask.ts`) sizes its render texture to the camera, "the mask's px are the screen's". Both grow with the backing store (4× memory and fill at render scale 2).
- World sizes: run 1440×960, hub 2000×1000 server px. Through the projection (`WORLD_PX_PER_TILE` 40, 64×32 tiles) the run projects to ≈1920×960 screen px and the hub to ≈2400×1200, so a 1920×1080 view at 1x would show the whole run at once. Cameras are bounded to the world in BarrowspireScene, HubScene, FieldScene.
- The server has no interest management (no view radius): what the view shows is purely a client matter. Distances, ranges, collisions and interact reach are world positions (server-authoritative; client checks such as `interactDistance` and `fieldPiles` `PILE_REACH` are world-space).
- `/game` (`src/app/game/page.tsx`) sits under the root layout's `Header` and `VerifyEmailBanner`; the page wraps `PhaserGame` in a `min-h-screen` flex, so it is taller than the viewport and scrolls.
- `dom: { createContainer: true }` carries the chat input's real `<input>` (FS-WJGFJ R26, the IME path for Chinese).
- Keys bound in game: W A S D, 1 2 3, F (interact), Esc (close panels), Enter, Tab, T, Q, I, E, B, H, Shift. A browser exits fullscreen on Esc, and only the Keyboard Lock API (Chrome and Edge, JS-initiated fullscreen, secure context) lets a page have it. *(Amended 2026-11-06, A16; was: "and a page cannot intercept it".)*

## Requirements

### A. Mechanism (settled first)

1. Before any other slice, a spike settles **how the render scale is applied** *(charter default 15: left to the FS, settled first by a spike)*. Candidates include camera zoom with origin handling, a separate HUD camera, or another approach. The chosen mechanism must, at render scale 2 and a logical view of 1280×720:
   - keep camera follow centred on the player and world bounds respected (BarrowspireScene, HubScene, FieldScene);
   - keep the light-map and the indoor blackout aligned with the world they cover;
   - give `pointer.worldX/worldY` the same world point under the cursor as today;
   - give HUD code a pointer position in logical-view units.
   The spike is throwaway; its answer is written into the issue that implements A2, and if it turns out to be an architectural constraint it is escalated for an ADR rather than decided in code.
2. One module owns the logical view and render scale: it computes them from the available CSS size and `devicePixelRatio`, exposes the current logical width/height and render scale, and emits a change when any of them changes. Scenes and HUD read the logical size from it, never `cameras.main.width/height` and never the backing-store size.

### B. High-density rendering

3. The backing store is drawn at **render scale = displayed CSS size × `devicePixelRatio` ÷ logical size, capped at 2** *(charter default 3: art is baked at 2x, so above 2 there is no new detail, only fill-rate cost; 3 can be tried after measuring, a one-number change)*. The cap is one named constant.
4. Fractional render scales (Windows 125 % / 150 %) are valid. `roundPixels` stays on.
5. Text rasterises at the render scale, not at bare `devicePixelRatio` *(charter default 6: otherwise text goes soft once the canvas is enlarged)*. Text created before a render-scale change is not required to re-rasterise until it is next recreated; HUD text that is re-laid out (D) is recreated or updated so it stays crisp.
6. The light-map and blackout render textures follow the backing store, so they stay sharp and aligned (A1).

### C. Logical view and resizing

7. The logical view is **720 units tall**, and its width follows the shape of the available space between **1080 and 1280** (3:2 to 16:9) *(charter default 1: the run projects to ≈1920×960, so a bigger view would show the whole dungeon; capping at 16:9 means a wider screen can't see more, keeping it fair)*. What the player sees of the world at a given width is exactly that logical view; zoom does not change it.
8. Outside the 3:2–16:9 range the canvas keeps the nearest bound and the remainder is bars in the frame's background *(charter default 2)*.
9. The canvas fills the available space, scaling up or down proportionally; below 1080×720 of available space it shrinks *(charter default 7: small laptops must still be playable)*.
10. The fit is recomputed on window resize, on a `devicePixelRatio` change (moving the window to another monitor) and on entering or leaving fullscreen *(charter default 4: otherwise switching screens goes soft again)*. Recomputation is debounced so a drag-resize does not rebuild textures every frame.
11. Every scene re-fits, the canvas menus included (Boot, Preload, MainMenu, CharacterCreation) as well as the hub, the run and the fields. Camera bounds and follow stay correct after a re-fit.

### D. HUD

12. Every `setScrollFactor(0)` HUD widget is placed by an **anchor** to an edge of the logical view: top-left, top-right, bottom-left, bottom-right or bottom-centre *(charter default 5: the width varies, so hard-coded positions can't hold)*. Each widget keeps the corner it sits in today at 1080×720 and the same offset from it; at a logical width of 1080 the HUD looks exactly as it does now.
13. When the logical view changes, every anchored widget re-lays out to its anchor, including widgets that are open at the time (gear overlay, letter panel, settlement record, party panel, ready check, invite prompt, container view, NPC dialogue).
14. HUD sizes stay in logical units: the HUD scales with the canvas, it is not held at a fixed physical size.
15. Every HUD hit test that reads `pointer.x/y` maps through the mechanism (A1) to logical-view units, so a click lands on the control under the cursor at any render scale and logical width. World aim keeps reading `pointer.worldX/worldY`.
16. The DOM chat input (Phaser DOM container) stays positioned over the chat window at every fit and in fullscreen.

### E. `/game` page: windowed and fullscreen

17. **Windowed** (the default on load): `Header` and `VerifyEmailBanner` stay; the game frame fills the viewport below them with **no page scroll** *(charter default 8)*.
18. A **fullscreen button** sits in the game frame's top-right corner. In windowed it enters fullscreen; in fullscreen the same control reads as **縮小 / exit fullscreen** and returns to windowed. It is faded until hovered or focused, and is styled with the **web UI palette** (Bone & Soot, ADR-0025) *(charter default 9)*. It has an accessible name for each state and is keyboard-focusable.
19. Fullscreen targets the **whole game frame** (canvas plus Phaser's DOM container), not the canvas element alone *(charter default 10: fullscreening only the canvas would lose the chat input and its IME)*. In fullscreen only the game is on screen.
20. Leaving fullscreen by any route (the button, Esc or held Esc (R21), the browser's own UI, `F11`-style exits) returns the page to windowed and re-fits (C10). The button's state follows the document's real fullscreen state, not a local toggle. *(Amended 2026-11-06, A16; was: "the button, Esc, the browser's own UI".)*
21. In fullscreen entered by the button, Esc is the game's where the browser offers the Keyboard Lock API: the page locks `Escape` on entering and unlocks it on leaving by any route, so Esc does in fullscreen exactly what it does windowed (the hub's and the run's Esc menu, closing an open panel, cancelling the chat input), and the player leaves fullscreen by holding Esc, the browser's own exit and hint, which the page does not reimplement. Where there is no Keyboard Lock (Safari, Firefox) or the lock is refused, Esc is the browser's: the first Esc exits fullscreen. A refused lock shows nothing to the player and changes nothing else. The game's own Esc handling is unchanged. *(Amended 2026-11-06, A16; was: "Esc in fullscreen is the browser's: the first Esc exits fullscreen *(charter default 11: pages can't intercept it)*. The game's own Esc handling is unchanged otherwise.")*
22. No keyboard shortcut for fullscreen in v1 *(charter default 12: F is interact; pick a key later)*. Clicking the button must not trigger any in-game action.
23. Where the Fullscreen API is unavailable (e.g. iPhone Safari), the button is not rendered *(charter default 13)*. A refused `requestFullscreen` leaves the page windowed with no error shown to the player beyond the button staying in its windowed state.

### F. Docs

24. `game-client/SPECIFICATION.md` "Reference — Phaser integration": the bridge line stops saying "1080×720, pixelArt" and describes the fitted, render-scaled canvas.
25. The terms in § *Terms* are added to `game-client/CONTEXT.md` § *Rendering terms*.

## User Stories

1. As a player on a Retina Mac, I want the world drawn at my screen's pixel density, so that sprites and terrain stop looking smeared.
2. As a player on a Windows laptop at 125 % or 150 % scaling, I want the canvas drawn at that density, so that the game is as sharp as other apps.
3. As a player on a 100 % 1080p monitor, I want the windowed game to look exactly as sharp as it does today, so that the change costs me nothing.
4. As a player on a 1080p monitor, I want fullscreen to fill my screen without going blurry, so that I can play big.
5. As a player on a 4K monitor, I want the canvas as sharp as the art allows, so that the high-resolution screen isn't wasted.
6. As a player, I want the canvas to fill the browser space below the site header, so that the game isn't a small box in the middle of the page.
7. As a player, I want no page scrollbar on `/game`, so that the page doesn't shift when I scroll by accident.
8. As a player, I want the canvas to follow my window as I resize it, so that I can arrange my desktop freely.
9. As a player, I want the canvas to stay sharp after I drag the window to another monitor, so that it doesn't go soft until I reload.
10. As a player on a small laptop, I want the canvas to shrink to fit, so that I can still see all of it.
11. As a player on a 16:9 screen, I want the game to use the full width without side bars, so that fullscreen is really fullscreen.
12. As a player on an ultrawide screen, I accept side bars beyond 16:9, so that nobody sees more of the world than anyone else.
13. As a player, I want to see the same amount of the world as everyone else of the same window shape, so that a bigger monitor isn't an advantage.
14. As a player, I want every distance, range and interact reach to behave as before, so that the change is purely visual.
15. As a player, I want my mouse aim to hit the world point under the cursor at any size, so that combat isn't thrown off.
16. As a player, I want every HUD element in the corner it's always been in, so that I don't have to relearn the layout.
17. As a player, I want HUD panels that are open while I resize to move with their corner, so that nothing ends up off-screen.
18. As a player, I want buttons in the gear, letter, party and chat panels to respond where I click at any size, so that the UI never misses.
19. As a player, I want the chat input box to stay over the chat window, including in fullscreen, so that I can type (including in Chinese).
20. As a player, I want a fullscreen button on the game frame, so that I can play with nothing else on screen.
21. As a player in fullscreen, I want the same button to take me back to windowed, so that I can get to the site header.
22. As a player, I want Esc to work in fullscreen as it does windowed, and a held Esc (or, where the browser has no keyboard lock, a single Esc) to get me out of fullscreen, so that the Esc menu is one key away and I'm never stuck. *(Amended 2026-11-06, A16; was: "As a player, I want Esc to get me out of fullscreen, so that I'm never stuck in it.")*
23. As a player, I want the button out of the way until I reach for it, so that it doesn't cover the game.
24. As a player on a browser without fullscreen, I don't want a button that does nothing.
25. As a keyboard player, I want the fullscreen button focusable and named, so that I can use it without a mouse.
26. As a player, I want text on the canvas crisp at any size, so that chat, names and numbers stay readable.
27. As a player, I want the main menu and character creation to fit and stay sharp too, so that the whole client feels the same.
28. As a developer, I want one module to own logical size and render scale, so that no scene reaches for `cameras.main.width` and gets the wrong unit.
29. As a developer, I want the render-scale cap as one named constant, so that trying 3× after measuring is a one-line change.

## Acceptance Criteria

- [ ] The spike's answer (mechanism for A1) is recorded in its issue, and every A1 bullet holds at render scale 2 and logical 1280×720.
- [ ] On a DPR-2 screen at an available space of 1080×720 CSS px, the backing store is 2160×1440.
- [ ] On a DPR-1 screen at 1080×720 CSS px, the backing store is 1080×720 and the picture matches today's.
- [ ] Render scale never exceeds 2; the cap is one named constant.
- [ ] The logical view is 720 units tall at every fit; its width is 1080 at 3:2 or narrower, 1280 at 16:9 or wider, and in between follows the available space.
- [ ] Bars appear only outside 3:2–16:9.
- [ ] Resizing the window, changing DPR, and entering/leaving fullscreen each re-fit within one debounce interval.
- [ ] Below 1080×720 of available space the canvas shrinks proportionally and stays fully visible.
- [ ] Camera follow stays centred and world bounds hold after a re-fit in the hub, a run and a field.
- [ ] The light-map and indoor blackout line up with the world at render scale 2 and after a re-fit.
- [ ] `pointer.worldX/worldY` resolves the same world point under the cursor before and after the change.
- [ ] No scene or HUD code reads `cameras.main.width/height/centerX/centerY` for layout; they read the logical-view module.
- [ ] At logical width 1080 every HUD widget is where it is today; at 1280 each sits at the same offset from its anchor.
- [ ] An open panel re-lays out to its anchor on re-fit.
- [ ] Every HUD hit test lands on the control under the cursor at render scale 1, 1.5 and 2 and at logical widths 1080 and 1280.
- [ ] The DOM chat input stays over the chat window at every fit and in fullscreen; IME input works in fullscreen.
- [ ] Canvas text rasterises at the render scale.
- [ ] `/game` windowed: header and banner visible, game frame fills the rest, no page scroll.
- [ ] The fullscreen button enters fullscreen on the game frame (canvas + DOM container) and, in fullscreen, returns to windowed.
- [ ] Esc (held, in Chrome and Edge; a single press elsewhere), the browser UI, or the button each leave fullscreen, and the button's state follows. *(Amended 2026-11-06, A16.)*
- [ ] In Chrome fullscreen a single Esc opens the hub's and the run's Esc menu (closes an open panel first, cancels the chat input) and does not leave fullscreen; the lock is released on leaving by any route; no lock is asked where the API is missing, and a refused lock leaves today's behaviour. *(Amended 2026-11-06, A16.)*
- [ ] Clicking the button triggers no in-game action; no keyboard shortcut is bound.
- [ ] Where the Fullscreen API is unavailable, the button is not rendered.
- [ ] The button wears the UI palette, is faded until hover/focus, and has an accessible name per state.
- [ ] Holding 60 fps on Nick's machine at render scale 2 in the hub and a run (below that: escalate, charter default 14).
- [ ] `game-client/SPECIFICATION.md` Phaser-integration reference line updated; terms added to `game-client/CONTEXT.md`.

## Edge States

- **DPR change without a resize** (window dragged to another monitor of the same CSS size): detected and re-fitted (C10).
- **Fractional DPR** (1.25, 1.5): fractional render scale; `roundPixels` on; no shimmer on a still frame.
- **Above the cap** (4K at 150 % fullscreen, 14" MacBook fullscreen): render scale stops at 2 and the browser stretches the rest (≈1.5× and ≈1.36×). Accepted.
- **Very small window**: canvas shrinks; the HUD shrinks with it (logical units); no minimum besides what the browser gives.
- **Ultrawide / very tall windows**: logical width clamps to 1280 / 1080; bars fill the rest.
- **Resize mid-run with a panel open**: the panel re-lays out to its anchor; its contents and state are untouched.
- **Resize during a scene transition** (world_entered switching scenes): the incoming scene reads the current logical view on create.
- **Fullscreen refused** (no user gesture, permission policy): stays windowed; button stays in its windowed state.
- **Fullscreen exited by Esc or the browser**: `fullscreenchange` drives the state; page returns to windowed and re-fits. The Escape lock is released on that change, whatever the route. *(Amended 2026-11-06, A16.)*
- **Held Esc in Chrome fullscreen**: the first keydown reaches the game (the Esc menu opens), then the browser leaves fullscreen after about 2 s; the menu stays open in windowed. Accepted: the browser owns the hold. *(Amended 2026-11-06, A16.)*
- **Keyboard lock missing or refused** (Safari, Firefox, an insecure origin, not the top-level page): fullscreen works as before and the first Esc leaves it; nothing is shown or logged as an error. *(Amended 2026-11-06, A16.)*
- **Fullscreen not entered by the button** (F11, the browser menu): no lock; the browser's Esc as before (Keyboard Lock §4.2). *(Amended 2026-11-06, A16.)*
- **Fullscreen while the chat input is focused**: the input stays in the DOM container and keeps focus or regains it on click; IME composition works.
- **Fullscreen button vs top-right HUD**: if the button covers an anchored top-right widget at any logical width, escalate (charter escalation trigger).
- **Frame-rate drop at render scale 2**: escalate (charter default 14); no quality setting is added in v1.
- **Scenes not yet created** (Boot / Preload) when the first fit happens: they read the logical view on create.

## Out of Scope

- A bigger view of the world (more than 1280×720 logical units), and any view wider than 16:9 *(charter Out)*.
- Re-baking art or any art change.
- A graphics-quality setting or a selectable render-scale cap.
- A keyboard shortcut for fullscreen.
- Mobile / touch layout.
- The dev gallery's `EffectsPanel` (its own fixed 720×360 Phaser game).
- Any change to game-server, map constants, the wire, or game rules.
- Any change to the `Header`'s own design (it only hides in fullscreen because only the game frame is fullscreen).

## Change: Minimap at the top, fullscreen button beside it → FS-56CKV
