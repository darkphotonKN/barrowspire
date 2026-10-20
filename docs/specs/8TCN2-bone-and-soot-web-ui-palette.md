# FS-8TCN2: Bone & Soot web UI palette, with the Atmosphere layer

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Bone & Soot presentation on the web platform" → this FS · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part II · Related ADRs: [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (separate UI and game palettes; this FS is its first realization), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only styling, fence-enforced, amended by ADR-0025) · Builds on: [FS-SWMNW](SWMNW-web-platform-fantasy-reskin.md) (the token system, material layer and fence this FS recolours)

> Promoted `--from-thread`, 2026-10-21. Kranti compared 18 candidate palettes live on the home
> page (an injected preview switcher over the real `:root` tokens; no code changed) and chose
> **Bone & Soot**, scoped to the web UI only and with the **Atmosphere** layer on. No
> adversarial review **(not challenged)**. The cost of being wrong is small: presentation only,
> no contract or data change, and the palette lives in two files.
>
> **Styling-only FS.** Per the standing rule, the whole FS skips `/code-review` and test runs.
> Verification is the build plus in-browser measurement: contrast ratios, a token audit, and
> looking at the result.

## Summary

The web platform (landing, auth, profile, leaderboard, subscription, Bazaar, header and menus)
moves from torch amber on warm umber to **Bone & Soot**: bone-white as the torch, on near-black
soot, with grey stone and iron framing. A token-derived **Atmosphere** layer goes on top of it: a
gradient-filled hero title, a hero glow tinted by the torch colour, stronger section headings,
a glow on the primary CTA, and a deeper vignette. The game canvas keeps its torch-lit barrow
palette (ADR-0025), so going from the menus into a delve becomes a deliberate change of register.

## Requirements

### A. Amend the visual SSOT first

The design guideline wins on every visual decision, so it changes before the code.

1. `design-guideline.md` Part II states that the web UI has **its own palette**, separate from
   the Part I game palette, and cites ADR-0025. Its "Runtime source of truth" paragraph names
   the UI definition sites (`globals.css` `:root` and the UI table in `theme.ts`) and drops the
   claim that `BARROW` / `BARROW_HEX` are a web-UI source.
2. The Part II colour token table, the contrast floor table, and the "Accent vs structure" table
   carry the Bone & Soot values (§B) with ratios measured in the browser, not copied from this FS.
3. **Principle 1 changes deliberately.** "Dark, never black… not near-black" becomes: the base is
   a **neutral soot** (`#121212`, never `#000`), and the material layer (grain, surface
   gradients, carved edges, vignette) is what makes it read as a surface rather than an absence.
   The guideline records why: the choice was made visually, and the neutral ground is what lets
   bone carry the torch without reading as emission.
4. **Principle 2 and "Accent vs structure" keep "one torch per view", with bone as the torch.**
   The four permitted uses (primary CTA, active nav, page `h1`, single focal number) are
   unchanged. Text on a bone fill is always `--color-bg-dark`.
5. The structure role (`--color-brass` / `--color-border*`) is documented as **iron-grey**. The
   token names stay as they are (see Out of Scope), and the guideline says plainly that
   "brass" is now a role name, not a hue.
6. The Atmosphere layer (§D) is added under "Material & depth", with its bounds: where each
   piece may appear, and why it does not breach "no glow may read as emission".
7. `game-client/CLAUDE.md`'s colour table, CSS-variable snippet, and visual rules are updated to
   match, and they point at the guideline rather than restating values where they can.
   [`docs/theming_plan.md`](../theming_plan.md) records the change in its status.

### B. The palette (UI tokens)

8. `globals.css` `:root` carries these values. The DOM-side UI table in `src/utils/theme.ts`
   mirrors them as CSS strings.

   | Token | Value | Role |
   |---|---|---|
   | `--color-primary` | `#e9dfc9` | bone, the torch |
   | `--color-primary-bright` | `#f6efdf` | hover and emphasis on bone |
   | `--color-accent` | `#8c8c84` | ash grey: secondary, cancel, subtitle |
   | `--color-danger` | `#6e1f1f` | oxblood fill, unchanged |
   | `--color-danger-text` | `#d07a6a` | oxblood lifted for error copy |
   | `--color-bg-dark` | `#121212` | soot, the page |
   | `--color-bg-darker` | `#0a0a0a` | deepest: splash, wells, dropdown base |
   | `--color-bg-card` | `rgba(28, 28, 27, 0.88)` | surface |
   | `--color-bg-card-2` | `rgba(38, 37, 35, 0.92)` | raised surface |
   | `--color-bg-card-opaque` / `-2-opaque` | measured equivalents | `prefers-reduced-transparency` |
   | `--color-brass` | `#5c5a55` | iron: structure |
   | `--color-brass-bright` | `#8a8780` | iron, bright: hover/focus structure, section headings under Atmosphere |
   | `--color-text` | `#cfc9bb` | bone-grey body |
   | `--color-text-dim` | `#9b968b` | labels |
   | `--color-text-muted` | `#85817a` | hints, footnotes |
   | `--color-text-placeholder` | `#5e5b55` | input placeholder |

   The opaque surface equivalents, the border alphas, and the glow, focus-ring and carved-edge
   tokens are re-derived against the new base and measured, not carried over.
9. **Contrast floor holds:** every text token ≥ 4.5:1 against `--color-bg-dark`, and bone on
   soot and soot on bone ≥ 4.5:1. The preview measured text 11.4, dim 6.4, muted 4.8, torch 14.2.
   The guideline records the browser-measured figures.
10. **Rarity is untouched.** The `--rarity-*` values are data, not theme. Each is re-measured at
    badge size against the new base. Any that drops under 4.5:1 is lifted within its own hue
    and the change is recorded in the guideline's rarity table.
11. Every raw rgba of the old palette outside `:root` is retired: brass `156,123,63`, arcane
    `111,143,74`, oxblood `110,31,31`, amber `232,161,77`, the umber surfaces, warm highlights
    `255,245,225` / `255,240,214`, and the warm darks `7,6,5`, `13,11,10`, `20,16,12`, plus the
    leftover cold blues `10,10,20`, `6,6,14`, `85,102,119`. They live in `globals.css`,
    `src/app/page.tsx`, `src/app/leaderboard/page.tsx`, and `src/components/NotificationBell.tsx`.
    Each becomes a token, or is derived from one (`color-mix(in srgb, var(--color-brass) 15%,
    transparent)` or an equivalent), so changing a palette value changes it everywhere.
    Neutral black and white shadows and highlights (`0,0,0` / `255,255,255`) may stay literal.
12. The CSS fence (`scripts-check-css-tokens.sh`) is extended to reject **non-neutral `rgb()` /
    `rgba()` literals** outside `:root`, which is the gap that let the triples in §11 survive
    ADR-0013. As ADR-0013 requires, the extension is watched to reject a fixture that violates
    it and to accept the real tree.

### C. The palette split (ADR-0025)

13. `src/utils/theme.ts` gains a **UI table**, separate from `BARROW` / `BARROW_HEX`, holding the
    UI palette as CSS strings, and it states that it must agree with `globals.css` `:root`.
14. DOM code reads the UI table and never `BARROW`. The subscription page's Stripe Elements
    theming (card element styles and the Payment Element `appearance`) is the known consumer and
    migrates. Any other DOM import of `BARROW` found at implementation time migrates too.
15. **`BARROW` / `BARROW_HEX` and every Phaser consumer are unchanged.** No canvas pixel changes.

### D. The Atmosphere layer

16. **Hero title:** the landing hero `h1`, and any other page `h1` set in blackletter, gets a
    vertical gradient fill from `--color-primary-bright` through `--color-primary` to a darkened
    primary, with a soft torch-tinted drop shadow plus a hard 2px dark shadow. Non-blackletter
    headings never get the gradient.
17. **Hero glow:** the landing hero section gets a radial glow from the torch colour at low
    opacity, and a faint structure-tinted glow rising from the bottom edge. Hero sections only.
18. **Section headings:** `h2` section titles take `--color-brass-bright`. This is structure, not
    a second torch.
19. **Primary CTA glow:** the primary CTA (one per view, per §A.4) gets an inset bright-bone
    hairline and a soft outer torch-tinted glow. Secondary buttons get nothing.
20. **Vignette:** the existing page vignette deepens to the preview strength (edges to about 60%
    black), and is still a fixed, pointer-events-none overlay below the header and popups.
21. **Everything is derived from tokens.** No piece of the Atmosphere introduces a raw colour.
    A palette change carries it along with no edits to the Atmosphere rules.
22. **It is finish, never structure.** With the whole layer removed, every view stays legible
    and laid out the same. It honours `prefers-reduced-transparency`, where the gradient text
    falls back to a solid `--color-primary`, and `forced-colors`, where it is suppressed entirely.

## User Stories

1. As a visitor on the landing page, I want the title to read as carved bone lit from within, so that the first screen sets the tone before I read a word.
2. As a visitor, I want one unmistakable bright thing per view, so that I know where to click without hunting.
3. As a visitor, I want a quiet, near-colourless frame around the content, so that the blackletter and the copy carry the mood rather than an accent colour.
4. As a delver moving from the menus into a delve, I want the torch-lit barrow to feel like stepping somewhere else, so that the game world reads as the place and the menus as the gate.
5. As a delver reading long pages (lore, leaderboard, Bazaar), I want body text that is comfortable for long stretches on a dark ground, so that it doesn't tire my eyes.
6. As a delver with low vision, I want every text colour to clear 4.5:1, so that the darker palette costs me nothing.
7. As a delver who turned on reduced transparency, I want solid surfaces and a solid-colour title, so that the Atmosphere never blurs content for me.
8. As a delver in forced-colours mode, I want the gradients and glows gone and the text on a readable ground, so that the page still works.
9. As a Bazaar buyer, I want rarity colours that still stand out on soot, so that a Fabled relic still reads as Fabled.
10. As a Bazaar buyer, I want the rarity label always next to its colour, so that colour is never the only signal.
11. As a subscriber at checkout, I want the Stripe card field to match the page, so that the payment step doesn't look like a different site.
12. As a delver hitting an error, I want error copy that is readable and clearly dangerous without being garish, so that I notice it without the page shouting.
13. As a delver navigating by keyboard, I want focus rings visible on soot, so that I always know where I am.
14. As a delver hovering cards and rows, I want a subtle structure-coloured response, so that hover reads as interaction rather than decoration.
15. As a returning player, I want the header, menus and notification panel to share the new palette, so that no corner of the site still looks amber.
16. As a client developer, I want one place to change each UI colour, so that a future palette tweak is a two-file change.
17. As a client developer, I want the build to reject a raw palette rgba outside `:root`, so that the old brass triples can't creep back in.
18. As a client developer, I want DOM code and Phaser code to read different tables, so that a UI tweak can never recolour the game by accident.
19. As a client developer, I want the guideline to tell me that `--color-brass` is the structure role and not a hue, so that I'm not confused by grey "brass".
20. As a client developer, I want the Atmosphere built from tokens, so that if we change the torch colour again the glow and gradient follow automatically.
21. As an artist working on the canvas, I want `BARROW` untouched by this work, so that my lighting and baked art keep their palette.
22. As the owner, I want the guideline to record that this palette was picked from a live comparison, and why "near-black" is now allowed, so that the next reskin doesn't relitigate it blind.

## Acceptance Criteria

- [ ] `design-guideline.md` Part II documents the separate UI palette (citing ADR-0025), the Bone & Soot token table, browser-measured contrast figures, the amended "Dark, never black" principle, bone as the torch, and the Atmosphere layer with its bounds
- [ ] `game-client/CLAUDE.md` and `docs/theming_plan.md` agree with the amended guideline
- [ ] `globals.css` `:root` carries the §B values, and the `theme.ts` UI table mirrors them
- [ ] Every text token measures ≥ 4.5:1 against `--color-bg-dark` in the browser, as does each rarity colour at badge size
- [ ] No non-neutral raw `rgb()`/`rgba()` remains outside `:root` across `globals.css`, `page.tsx`, `leaderboard/page.tsx` and `NotificationBell.tsx`
- [ ] The extended CSS fence rejects a fixture with a non-neutral rgba outside `:root`, and passes on the real tree; `lint-fence.sh` stays green
- [ ] The subscription page's Stripe theming reads the UI table, and no DOM file imports `BARROW`
- [ ] `BARROW` / `BARROW_HEX` and every Phaser file are byte-identical to `main`
- [ ] The landing page with Atmosphere matches the approved preview: gradient bone title, torch glow in the hero, iron-bright `h2`s, glowing primary CTA, deepened vignette
- [ ] With the Atmosphere and material layer suppressed, every page stays legible and laid out the same
- [ ] Under `prefers-reduced-transparency` the title is solid `--color-primary`; under `forced-colors` the Atmosphere is gone
- [ ] Each route (`/`, `/login`, `/register`, `/portal`, `/profile`, `/leaderboard`, `/subscription`, `/marketplace`, plus header, user menu and notification panel) has been looked at in the browser with no amber or warm-umber leftovers
- [ ] `next build` passes

## Edge States

- **A rarity colour fails on soot:** lift it within its hue, re-measure, and record it in the guideline. Never fix it by changing the background behind the badge.
- **A browser without `color-mix()`:** the derived borders and glows must degrade to the plain token, or to transparent. Decide per site, and never fall back to an old raw triple.
- **A browser without `background-clip: text`:** the title must fall back to solid `--color-primary`, never transparent text.
- **The Stripe iframe can't read CSS variables:** this is why the UI table exists. Stripe gets literal strings from it, not `var()`.
- **UI drawn over the canvas (the `/game` page's DOM chrome, the header):** it belongs to the UI palette. The Phaser HUD inside the canvas belongs to `BARROW`. Any DOM overlay that currently borrows a game colour is listed at implementation time and assigned a side.
- **Light-coloured torch on a fill:** text on a bone CTA is `--color-bg-dark`. Anywhere that currently assumes a dark-on-amber or light-on-amber pairing is checked.
- **Grain on a neutral ground:** grain shows more on neutral soot than on warm umber. If it reads as noise, lower its opacity and record the new value.

## Out of Scope

- **The game canvas.** `BARROW`, `BARROW_HEX`, Phaser scenes, the lighting, effects and baked art are untouched (ADR-0025). The in-canvas HUD stays on the game palette.
- **Renaming tokens.** `--color-brass` and `border-brass` keep their names even though the value is iron-grey. A semantic rename (`--color-frame` or similar) is a separate, mechanical follow-up.
- **Typography, layout, spacing, radius and motion.** Unchanged.
- **A runtime theme switcher or user-selectable themes.** The preview switcher was a throwaway comparison tool and does not ship.
- **Light mode.**
- **Copy and voice changes.**
