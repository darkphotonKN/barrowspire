# FS-1819Q: Dev gallery

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Dev tooling" → "Dev gallery of reusable visual pieces" → this FS · Related ADRs: none (deliberately; the rule in §A lives here and in `game-client/CLAUDE.md`) · Surface: game-client and docs only

## Summary

A dev-only page, `/dev/gallery`, that shows which reusable visual pieces the client already has, so devs and agents reuse them instead of rebuilding. It is a shelf of named copies: each piece shows up with its name and a one-line demo. It tracks what exists. It is not a tuning tool, so it carries far fewer controls than a test harness.

Two families are tracked in v1: **effects** (`src/render/effects/`) and **item icons** (`ITEM_ICONS`). Effects are kept honest by a test that fails when an effect module has no gallery card.

Terms used below: a **tracked family** is a kind of visual piece the gallery must show in full. A **gallery card** is one entry in it: a name plus a one-line demo, or a one-line reason why it can't be demoed.

## Requirements

### A. The rule (holds for every later feature)

1. Tracked families are **code registries rendered by the gallery**, each with a test (or a direct read of the source list) that forces registration. **No inventory docs.** The registry is the inventory.
2. **Same-change rule.** Any FS that builds something in a tracked family adds that thing's gallery card as part of its own work, in the same change. A card is a name plus a one-line demo (or `demo: null` with a reason, per R10). Item icons appear on their own from `ITEM_ICONS`, so in practice the rule bites for effects, and R12 enforces it.
3. The tracked families are listed **once in code**, in `game-client/src/dev/gallery/families.ts`. v1 lists exactly two: `effects` and `item-icons`.
4. `game-client/CLAUDE.md` gets a short **"Dev gallery"** section that says where the page is (`/dev/gallery`), where the family list lives (`src/dev/gallery/families.ts`), and R1 and R2 in one or two sentences each, including "adding an effect? add a card in `src/dev/gallery/effects.ts`".

### B. The page

5. `/dev/gallery` is a Next App Router route under `game-client/src/app/dev/gallery/`. It renders in `next dev` and **returns 404 in a production build** (the route itself answers 404; hiding a link is not enough). Phaser loads through a dynamic import with SSR off, like the rest of the client.
6. Named "gallery" everywhere (route, folder, copy), never "catalog", so it doesn't collide with the bake tool's `tools/bake/page/catalogue.js`.
7. The throwaway shimmer preview is deleted: `game-client/src/app/dev/shimmer/` and `game-client/src/dev/shimmer/`.
8. The page's DOM styling stays inside the token fence (ADR-0013 / ADR-0025): Bone & Soot CSS variables, no raw hex. No polish requirement beyond that. It is a dev tool.

### C. Item icons

9. The item-icon section reads `ITEM_ICONS` (`src/render/art/itemIcons.ts`) directly and renders a DOM grid: one cell per icon, the icon drawn with `iconCrop` and the art manifest (loaded the way `components/ItemIcon.tsx` loads it), with the icon's name under it. Adding a name to `ITEM_ICONS` makes it appear with **no gallery edit**.

### D. Effects

10. `src/dev/gallery/effects.ts` holds one card per effect module in `src/render/effects/`: `{ module, name, demo }`, where `module` is the file's basename (e.g. `"slash"`) and `demo` is a one-line call that plays the effect, or **`demo: null` plus a one-line `reason`** when the effect can't be played outside a run (it needs live game state). A `demo: null` card still shows, named, with its reason. It is tracked, never skipped.
11. Every demo plays on **one** Phaser canvas: **one figure (the mage)** standing on **one flagstone floor** under the **run ambient light** (`LightMap` with `AMBIENT.run`). Clicking a card plays that effect on the figure; a **"play all in turn"** button plays every playable card one after another. There are no other controls: no class switch, no zoom, no stacking, no autoplay toggle.
12. **Enforcement test** (vitest, next to `effects.ts`): it lists the non-test `.ts` files in `src/render/effects/` and fails for any whose basename has no card. Helper files are on an allow-list in the test: `runtime`, `table`, `fakeScene`, `star`, `flights`, `projectile`, `sourceScan`. The failure message names the module and the fix: `add a card in src/dev/gallery/effects.ts`. The same test fails if a card names a module that no longer exists, or a `demo: null` card has an empty reason.
13. Demos call the effect modules as the game does. **No change to how any existing effect looks or times.** If an effect can't be called from the gallery without changing its module, it gets `demo: null` with a reason, not a refactor.

### E. Bounds

14. game-client and docs only. No server change. No new npm dependencies.

## User Stories

1. As a dev about to add a visual effect, I want to see every effect the client already has, so that I reuse one instead of rebuilding it.
2. As an agent working a presentation FS, I want one page and one code list that say what exists, so that I don't grep the render tree to find out.
3. As a dev, I want to click an effect's card and watch it play on a figure under the run light, so that I see it as players do.
4. As a dev, I want a "play all in turn" button, so that I can scan the whole effect set in one go.
5. As a dev, I want every item icon shown with its name, so that I pick an existing icon for a new item.
6. As a dev adding an item icon, I want it to show up in the gallery without editing the gallery, so that the shelf stays complete for free.
7. As a dev adding an effect module, I want a failing test that tells me to add a card, so that I can't forget.
8. As a dev, I want effects that need live game state still listed, with a reason, so that the shelf never silently drops one.
9. As a feature author, I want the same-change rule written in the FS and CLAUDE.md, so that every FS that builds an effect carries its card.
10. As the project owner, I want the gallery absent from production builds, so that dev tooling never ships to players.
11. As a dev, I want the throwaway shimmer preview gone, so that there's one dev page, not a pile of harnesses.

## Acceptance Criteria

- [ ] `next dev`: `/dev/gallery` shows an effects section with one card per effect module and an item-icons grid with one named cell per `ITEM_ICONS` entry.
- [ ] Production build: `/dev/gallery` answers 404.
- [ ] Clicking a playable card plays it on the mage figure on a flagstone floor under the run ambient; "play all in turn" plays every playable card in sequence.
- [ ] A `demo: null` card shows its name and its one-line reason.
- [ ] Adding a temporary name to `ITEM_ICONS` makes a new cell appear (the generic fallback icon if unbaked) with no gallery edit.
- [ ] The enforcement test passes today, fails with `add a card in src/dev/gallery/effects.ts` when a new non-test, non-allow-listed file is added to `src/render/effects/`, and fails when a card names a missing module.
- [ ] `src/dev/gallery/families.ts` lists exactly `effects` and `item-icons`.
- [ ] `game-client/CLAUDE.md` has a "Dev gallery" section stating the page, the family list's location, R1 and the same-change rule R2.
- [ ] `src/app/dev/shimmer/` and `src/dev/shimmer/` are gone.
- [ ] No existing effect module's behavior changed; existing effect tests pass unchanged. No new dependencies; no `game-server/` change; token-fence lint passes.

## Edge States

- **Art manifest fails to load:** icon cells show an empty well with their names still visible (as `ItemIcon` does); effect cards still list, and a demo that finds no sheet draws nothing (the runtime already logs once and returns null).
- **Icon in `ITEM_ICONS` but not baked:** `iconCrop` falls back to the generic icon; the cell shows the real name.
- **Card clicked while another demo plays:** the new one plays; no queueing or stacking control is added.
- **"Play all in turn" clicked twice:** the second click restarts the sequence rather than running two at once.
- **Effect module renamed:** the test fails twice (missing card for the new name, stale card for the old), naming both.
- **A helper file is later added to `effects/`:** it fails the test until it gets a card or is added to the allow-list in the test, a deliberate one-line decision.

## Out of Scope

- Any tuning controls: class switch, zoom, stacking, autoplay, parameter sliders.
- Tracked families beyond effects and item icons (sprites, props, cursors, HUD pieces). A later FS adds a family by adding it to `families.ts`.
- An inventory markdown doc, and an ADR for the rule (the user chose this FS plus the CLAUDE.md pointer instead).
- The heal "shimmer" effect itself. Its sibling FS adds its own gallery card under R2.
- Any change to effect visuals, timings, or the server.
