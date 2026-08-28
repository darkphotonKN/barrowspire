# The Age of Barrowspire - Game Client

## Visual & Art Direction

**`docs/design-guideline.md` is the single source of truth for all visual and art decisions.**

ANY task that changes appearance — in-game canvas rendering, sprites, tiles, environment
art, animation, fonts, colors, lighting, UI chrome, or layout — MUST read
[`docs/design-guideline.md`](docs/design-guideline.md) first and conform to it. When the design
guideline and any section below disagree on a visual decision, the design guideline wins.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Game Engine**: Phaser 3.80
- **State**: Zustand (authStore, gameStore)
- **Styling**: Tailwind CSS + globals.css
- **Networking**: Native WebSocket, REST via apiClient

## Project Structure

```
src/
├── app/              # Next.js pages (home, login, register, game, profile, leaderboard, subscription, portal)
├── components/       # React components (PhaserGame, Header, UserMenu, AuthGuard)
├── scenes/           # Phaser scenes (Boot, Preload, MainMenu, BarrowspireScene, GameOver)
├── stores/           # Zustand stores (auth, game)
├── types/            # TypeScript types (gameState)
├── assets/types/     # Client/server message types
└── utils/            # API client, SocketManager, constants
```

## Theming & Visual Identity

The game has a **dark, gothic barrow-dungeon** aesthetic — torch-lit, barrow-deep,
grim. Cold ambient darkness with warm torch pools as the only real light. The
rendering technique references hand-drawn, inked, paper-textured illustration
(Darkest Dungeon / old Ultima, pulled darker), not crisp arcade pixel art. All UI
must follow these rules:

### Color Palette

| Role | Value | Usage |
|------|-------|-------|
| **Primary** | `#e8a14d` (torch amber) | **One per view only** — primary CTA, active nav, page `h1`, the focal number |
| **Accent** | `#6f8f4a` (arcane/lich green) | Secondary highlights, subtitles, corruption, cancel actions |
| **Brass** | `#9c7b3f` / `#c9a14e` | **Structure** — borders, dividers, focus rings, hover glow |
| **Background** | `#1c1613` (warm umber) / `#100c0a` (deepest) | Page backgrounds, body, wells |
| **Card/Panel** | `rgba(42, 33, 26, 0.88)` (stone) | Card backgrounds, popups, modals |
| **Card raised** | `rgba(54, 43, 34, 0.92)` | Hovered/elevated card, nested panel |
| **Border** | `rgba(156, 123, 63, 0.15)` (brass) | Default border color for cards, inputs, panels |
| **Border strong** | `rgba(156, 123, 63, 0.35)` | Hover/focus/active border |
| **Danger** | `#6e1f1f` (oxblood) | Errors, destructive actions, death |
| **Text Primary** | `#cdbf9a` (vellum) | Body text, names, values — **the default body colour** |
| **Text Muted** | `#9b8e6a` | Labels, secondary info, descriptions |
| **Text Dim** | `#7d7355` | Footer text, hints, disabled states |

**Amber is not the accent system.** It marks at most four things per view (CTA, active nav, `h1`,
the focal number) plus the rarity-badge exemption. Brass carries structure, vellum carries text,
stone carries surfaces. See the guideline's "Accent vs structure" section.

**Tokens only — no raw hex** ([ADR-0013](../docs/adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)).
Colour is defined in exactly two places, `globals.css` `:root` and `theme.ts`, and referenced
everywhere else. A lint fence rejects literals in CSS, `styled-jsx`, and inline `style={{}}`.

CSS variables are defined in `globals.css` under `:root` — always use them.
Phaser scenes should pull `0x` ints from `src/utils/theme.ts` (`BARROW_HEX`):
```css
var(--color-primary)    /* #e8a14d torch amber */
var(--color-accent)     /* #6f8f4a arcane green */
var(--color-danger)     /* #6e1f1f oxblood */
var(--color-bg-dark)    /* #1c1613 warm umber */
var(--color-bg-card)    /* rgba(42, 33, 26, 0.88) */
var(--color-border)     /* rgba(156, 123, 63, 0.15) */
var(--color-text)       /* #cdbf9a vellum — default body colour */
var(--color-text-dim)   /* #9b8e6a */
var(--color-text-muted) /* #7d7355 */
```

### Typography

- **Display**: Pirata One (`var(--font-heading)`, `.font-display`) — blackletter. Cinzel is
  dropped; a classical Roman serif reads modern
- **Blackletter bound — both conditions:** only at **≥28px** *and* only on the logo, the hero,
  and the page `h1`. Everything else — `h2` and below, nav, labels, buttons, inputs, table
  cells, badges, footnotes — uses `var(--font-body)`
- **Body**: EB Garamond (`var(--font-body)`), old-style serif, kept legible
- **Labels**: Uppercase, letter-spacing 0.1em+, muted vellum
- **Never name a face in component code** — use `var(--font-heading)` / `var(--font-body)`
- No emojis in UI — use clean text or minimal carved/wax-seal badges

### Visual Rules

- **Borders**: 1px, low-opacity brass. Weathered, irregular over crisp/bright
- **Border radius**: 6px (small), 8-12px (cards/panels). No large modern rounded corners
- **Glows**: Subtle warm `box-shadow` with brass/amber at 0.1–0.3 opacity. Never garish neon —
  a glow bright enough to look like a light source is neon by another name
- **Backgrounds**: Warm umber/stone with layered gradients that read as carved stone or
  parchment. **Dark, never black** — a base with no value above the floor makes every accent
  read as emission
- **Material layer (CSS only, no image assets)**: page grain via inline SVG `data:` URI, surface
  gradients, inset shadows for carved/beveled edges, page vignette, CSS-drawn ornament. Material
  is finish, never structure — every view must stay legible with it suppressed
- **Hover states**: Brass/bronze glow, slight brightness. No dramatic transforms
- **Lighting**: Heavy vignette (darkness pressing at edges) + a warm torch pool. Presentation-only overlays — never coupled to game state or the render pipeline
- **Success states**: Use amber/brass (primary), not bright green
- **Buttons**: Amber/brass fill with dark text, or transparent with brass border. Wax-seal/carved-stone feel; arcane green for cancel/secondary

### Wording & Tone (lore voice — dread and rumor, terse, grim)

The game is a **medieval barrow-dungeon delve / extraction**, not a space shooter. All copy should reflect:

- Players are **delvers** (not operators/users). The realm/enemy is the **Spire** and its **Lich Lord**
- **Lore swaps**: Play/Start → "Delve"; queue → "Gather the delve"; loot/container → "plunder"/"coffer"; extract/escape → "escape the barrow"; death → grim ("Few return whole", "The barrow keeps its dead")
- **Never use**: "operator", "uplink", "deploy", "the void", "Sector", "extraction" (sci-fi register)
- Login = "Speak Your Name" / "Enter", Register = "Take the Oath" (delver name, not callsign)
- Version footer: `v0.1 // The Barrow-Deep`
- MAIN MENU label stays "MAIN MENU" (a named hub is future game-logic work — do not rename it)

### Phaser Scenes (In-Game)

The same palette applies to Phaser scenes (MainMenuScene, BarrowspireScene):
- Background: `#0d0b0a` charcoal with drifting dust/ember motes (not stars)
- Atmosphere: torch-pool glow + vignette + dust as camera-fixed decorative overlays (`createAtmosphere`), depth ~900, below HUD (1000) and popups (2000)
- Player = hooded delver, rivals = pale wights (procedural, `spriteGenerator.ts`)
- UI popups: Dark vellum panels with brass borders, same font sizing
- Buttons: Amber fill or brass-outlined; arcane green for cancel
- Status text: Vellum/brass with letter-spacing

## Key Conventions

- WebSocket: `SocketManager` singleton, auto-injects `session_id` and `player_id`
- Auth: Zustand persisted to localStorage, JWT tokens
- API: `apiClient` at `http://localhost:7114`
- Game state: Server-authoritative, client does optimistic updates with `lootedAt` pending pattern
- Phaser is loaded via dynamic import (SSR disabled)
