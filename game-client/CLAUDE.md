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
| **Primary** | `#e8a14d` (torch amber) | Titles, buttons, active states, borders, glows |
| **Accent** | `#6f8f4a` (arcane/lich green) | Secondary highlights, subtitles, corruption, cancel actions |
| **Brass** | `#9c7b3f` / `#c9a14e` | UI accents, borders, hover glow |
| **Background** | `#0d0b0a` (charcoal) / `#1a1410` (umber) | Page backgrounds, body |
| **Card/Panel** | `rgba(20, 16, 12, 0.85)` (aged vellum, darkened) | Card backgrounds, popups, modals |
| **Border** | `rgba(156, 123, 63, 0.15)` (brass) | Default border color for cards, inputs, panels |
| **Danger** | `#6e1f1f` (oxblood) | Errors, destructive actions, death |
| **Text Primary** | `#cdbf9a` (vellum) | Body text, names, values |
| **Text Muted** | `#8a7d5c` (darkened vellum) | Labels, secondary info, descriptions |
| **Text Dim** | `#6f6647` | Footer text, hints, disabled states |

CSS variables are defined in `globals.css` under `:root` — always use them.
Phaser scenes should pull `0x` ints from `src/utils/theme.ts` (`BARROW_HEX`):
```css
var(--color-primary)    /* #e8a14d torch amber */
var(--color-accent)     /* #6f8f4a arcane green */
var(--color-danger)     /* #6e1f1f oxblood */
var(--color-bg-dark)    /* #0d0b0a charcoal */
var(--color-bg-card)    /* rgba(20, 16, 12, 0.85) */
var(--color-border)     /* rgba(156, 123, 63, 0.15) */
var(--color-text-muted) /* #6f6647 */
var(--color-text-dim)   /* #8a7d5c */
```

### Typography

- **Headings/Display**: Cinzel (`var(--font-heading)`, `.font-display`), weathered serif, wide letter-spacing, often uppercase
- **Body**: EB Garamond (`var(--font-body)`), old-style serif, kept legible
- **Labels**: Uppercase, letter-spacing 0.1em+, muted vellum
- No emojis in UI — use clean text or minimal carved/wax-seal badges

### Visual Rules

- **Borders**: 1px, low-opacity brass. Weathered, irregular over crisp/bright
- **Border radius**: 6px (small), 8-12px (cards/panels). No large modern rounded corners
- **Glows**: Subtle warm `box-shadow` with brass/amber at 0.1–0.3 opacity. Never garish neon
- **Backgrounds**: Charcoal/umber with very subtle warm radial gradients (amber/arcane at 0.03–0.06 opacity)
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
