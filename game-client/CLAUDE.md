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
(Darkest Dungeon / old Ultima, pulled darker), not crisp arcade pixel art. The web UI
is the gate to that world rather than the world itself: bone on soot, grey stone and
iron, so stepping into a delve is a change of register. All UI must follow these rules:

### Color Palette

**Two palettes, on purpose** ([ADR-0025](../docs/adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)).
The **web UI** (DOM: landing, auth, profile, leaderboard, subscription, Bazaar, header, menus) uses
**Bone & Soot**, defined in `globals.css` `:root` and mirrored as JS strings by the UI table in
`src/utils/theme.ts`. The **game canvas** (Phaser) uses the barrow ramp in `BARROW` / `BARROW_HEX`.
DOM code never reads `BARROW`; Phaser code never reads the UI table. Values, contrast figures
and the rules behind them live in the guideline (Part II for the web UI, Part I for the game);
the table below is a quick reference and the guideline wins if they disagree.

Web UI (Bone & Soot):

| Role | Token | Value |
|------|-------|-------|
| **Torch** (bone) | `--color-primary` / `-bright` | `#e9dfc9` / `#f6efdf` |
| **Accent** (ash grey) | `--color-accent` | `#8c8c84` |
| **Structure** (iron; the name "brass" is a role, not a hue) | `--color-brass` / `-bright` | `#5c5a55` / `#8a8780` |
| **Border** | `--color-border` / `-strong` | derived from `--color-brass` |
| **Background** (soot) | `--color-bg-dark` / `--color-bg-darker` | `#121212` / `#0a0a0a` |
| **Card / raised** | `--color-bg-card` / `-2` | `rgba(28, 28, 27, 0.88)` / `rgba(38, 37, 35, 0.92)` |
| **Danger** (oxblood) | `--color-danger` / `--color-danger-text` | `#6e1f1f` fill / `#d07a6a` copy |
| **Text** (bone-grey, the default body colour) | `--color-text` | `#cfc9bb` |
| **Text dim** (labels) | `--color-text-dim` | `#9b968b` |
| **Text muted** (hints, footnotes) | `--color-text-muted` | `#85817a` |
| **Placeholder** | `--color-text-placeholder` | `#5e5b55` |

**Bone is not the accent system.** On the DOM it marks at most four things per view (primary
CTA, active nav, page `h1`, the focal number) plus the rarity-badge exemption. Text on a bone
fill is `--color-bg-dark`. Iron carries structure, bone-grey carries text, soot and stone carry
surfaces. See the guideline's "Accent vs structure".

**In the Phaser canvas the rule is different, deliberately.** Colour there is a readability
channel, not emphasis: amber means *interactable*, arcane green *safe*, oxblood *damage*, vellum
*neutral HUD*, brass *frame*. Amber repeats as often as there are interactables. The test is
semantic: an amber thing the player cannot act on is a defect. See "Gameplay accent".

**Tokens only, no raw hex** ([ADR-0013](../docs/adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md),
amended by ADR-0025). Colour is defined in `globals.css` `:root` and `theme.ts` (the UI table and
`BARROW` / `BARROW_HEX`), and referenced everywhere else. A lint fence rejects literals in CSS,
`styled-jsx`, and inline `style={{}}`.

DOM code uses the CSS variables in `globals.css` `:root`, always. Phaser scenes pull `0x` ints from
`BARROW_HEX` in `src/utils/theme.ts`. The main UI variables (values in the guideline):
```css
var(--color-primary)      /* bone, the torch: one per view */
var(--color-accent)       /* ash grey: secondary, cancel */
var(--color-danger)       /* oxblood fill */
var(--color-danger-text)  /* oxblood lifted, for error copy */
var(--color-bg-dark)      /* soot: page; text on a bone fill */
var(--color-bg-card)      /* surface */
var(--color-brass)        /* iron: structure (role name, not a hue) */
var(--color-border)       /* iron hairline */
var(--color-text)         /* bone-grey: default body colour */
var(--color-text-dim)     /* labels */
var(--color-text-muted)   /* hints, footnotes */
```

### Typography

- **Display**: Pirata One (`var(--font-heading)`, `.font-display`) — blackletter. Cinzel is
  dropped; a classical Roman serif reads modern
- **Blackletter bound — both conditions:** only at **≥28px** *and* only on the logo, the hero,
  and the page `h1`. Everything else — `h2` and below, nav, labels, buttons, inputs, table
  cells, badges, footnotes — uses `var(--font-body)`
- **Body**: EB Garamond (`var(--font-body)`), old-style serif, kept legible
- **Labels**: Uppercase, letter-spacing 0.1em+, `--color-text-dim`
- **Never name a face in component code** — use `var(--font-heading)` / `var(--font-body)`
- No emojis in UI — use clean text or minimal carved/wax-seal badges

### Visual Rules

- **Borders**: 1px, low-opacity iron (`--color-border`). Weathered, irregular over crisp/bright
- **Border radius**: 6px (small), 8-12px (cards/panels). No large modern rounded corners
- **Glows**: Subtle structure-tinted `box-shadow` at 0.1–0.4 opacity, derived from tokens. Never
  garish neon: a glow bright enough to look like a light source is neon by another name. Only the
  Atmosphere's hero glow and primary-CTA glow take the torch colour (see the guideline)
- **Backgrounds**: Neutral soot (`#121212`) and stone with layered gradients that read as carved
  stone. **Soot, never black**: never `#000`, and the material layer is what makes the base read
  as a surface rather than an absence
- **Material layer (CSS only, no image assets)**: page grain via inline SVG `data:` URI, surface
  gradients, inset shadows for carved/beveled edges, page vignette, CSS-drawn ornament. Material
  is finish, never structure: every view must stay legible with it suppressed
- **Atmosphere layer** (part of the material layer): gradient bone fill on the blackletter
  hero/page `h1`, a torch-tinted hero glow, `h2` section titles in `--color-brass-bright`, a glow
  on the one primary CTA, and a deeper vignette. All derived from tokens; it falls back to solid
  `--color-primary` text under `prefers-reduced-transparency` and is suppressed under
  `forced-colors`. Bounds are in the guideline's "Material & depth"
- **Hover states**: Iron glow, slight brightness. No dramatic transforms
- **Lighting**: Heavy vignette (darkness pressing at edges) + a warm torch pool. Presentation-only overlays — never coupled to game state or the render pipeline
- **Success states**: Use bone/iron (the torch), not bright green
- **Buttons**: Primary is a bone fill with `--color-bg-dark` text; secondary is transparent with an iron border. Wax-seal/carved-stone feel; ash grey (`--color-accent`) for cancel/secondary

### Wording & Tone (lore voice — dread and rumor, terse, grim)

The game is a **medieval barrow-dungeon delve / extraction**, not a space shooter. All copy should reflect:

- Players are **delvers** (not operators/users). The realm/enemy is the **Spire** and its **Lich Lord**
- **Lore swaps**: Play/Start → "Delve"; queue → "Gather the delve"; loot/container → "plunder"/"coffer"; extract/escape → "escape the barrow"; death → grim ("Few return whole", "The barrow keeps its dead")
- **Never use**: "operator", "uplink", "deploy", "the void", "Sector", "extraction" (sci-fi register)
- Login = "Speak Your Name" / "Enter", Register = "Take the Oath" (delver name, not callsign)
- Version footer: `v0.1 // The Barrow-Deep`
- MAIN MENU label stays "MAIN MENU" (a named hub is future game-logic work — do not rename it)

### Phaser Scenes (In-Game)

**The canvas menus are the exception:** MainMenuScene, CharacterCreationScene, LoadoutScene and
`src/ui/menuChrome.ts` wear the site's Bone & Soot (soot ground, stone panels, iron hairlines, a
bone primary button, the title "THE AGE OF BARROWSPIRE" as the site's hero h1). They read it from
`palette.menu`, whose `menu*` tokens in `BARROW` / `BARROW_HEX` mirror `globals.css` `:root`, never
from the UI table. The loadout passes `MENU_EQUIPMENT_THEME` to `EquipmentPanel`, whose default
stays the game look for the run. The baked figures and the HUD pieces a menu reuses (XP bar, HP/MP
stat colours, item tip) stay on the game palette.
See the guideline's "UI Chrome".

Every other Phaser scene (HubScene, BarrowspireScene, the HUD) uses the **game palette**
(`BARROW_HEX`), not the web UI's Bone & Soot (ADR-0025):
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
