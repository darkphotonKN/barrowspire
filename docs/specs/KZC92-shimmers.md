# FS-KZC92: Shimmers

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Shimmers: granted and invoked spell-landed glitter" → this FS · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (all art baked, 2D at runtime), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (textures authored in code), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours are palette tokens) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I (**amended by this FS, see §E: rule change**) · Builds on: [FS-P9G8R](P9G8R-drink-health-potions.md) (shipped; drinking lists "drink animation" out of scope, so this is new work, not an amendment), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) §B–§C (effect rules, short-lived light), [FS-1819Q](1819Q-dev-gallery.md) §A R2 (same-change gallery rule) · Vocabulary: new terms for `game-client/CONTEXT.md` in §F · Surface: game-client and docs only

## Summary

A **shimmer** is a one-shot glitter played over a character at the moment an effect lands on them. It marks the moment and nothing more. It doesn't show a lasting buff. There are two bases, picked by where the effect came from: a **granted** base (glints winking over the body) for effects from no player, and an **invoked** base (a spiral winding up the body) for effects a player casts. The first use is a red heal shimmer on the local player when they drink a health potion. The invoked base is built, tested and on the dev gallery, but nothing plays it in the game yet.

Scoped 2026-11-03 under a charter: every decision below marked *(charter default)* was locked with the user before writing, and the reason follows it.

## Requirements

### A. Terms and shape

1. A **shimmer** is a one-shot glitter on one character's body, played when an effect lands on them. It ends on its own and holds no state about the effect *(charter default: it marks the moment only; a lasting-buff display is a separate, later design)*.
2. A **granted shimmer** is played when the source is not a player: a potion, scroll, shrine, or a world or NPC buff. An **invoked shimmer** is played when the source is a player: an ally's buff on you, a self-buff, a charge-up, a spell cast on yourself *(charter default: the base tells the player who did it, and a player's own magic reads differently from what the world hands them)*.
3. A concrete shimmer is **a base plus a look**. A base is the motion (granted or invoked). A **look** is three colours: `glint` (the glint body), `centre` (its hot core), `light` (the glow it casts and pools at the feet). All three are `BARROW` tokens (ADR-0013). No other colour appears in a shimmer, so each one uses at most 3 colours (FS-KYPQ9 §B.7).
4. The **heal look** is `glint: oxbloodText`, `centre: vellum`, `light: oxblood` *(charter default: health is red. That matches the HP bar's `oxbloodText` and the oxblood potion bottle, so the shimmer says "health came back" in the health bar's own colour)*.

### B. The granted base

The reference look is the approved-by-eye throwaway prototype `sparkle` in `game-client/src/dev/shimmer/variants.ts` (untracked, and deleted by FS-1819Q slice 2, so its numbers are recorded here). Requirement 9 changes how a glint winks, and requirement 5 tightens one value.

5. **16 glints** over the body. Glint `i` starts at `(i / 16) × 760 ms`, plus a jitter of ±30 ms (never below 0), so the glints spread evenly through the window and never clump or leave a gap.
6. Each glint's point is random over the body: height `h` from 0.05 to 1.05 × the figure's **crown** (the art sheet's `crown`, falling back to 76 px as the prototype does), and x within `±18 × (1 − |h/crown − 0.55| × 0.6)` px of the feet, so the scatter is widest at mid-body and narrows at the feet and head. 70% of glints sort in front of the figure and 30% behind it.
7. Each glint lives 260–360 ms, drifts up 4–10 px (`Linear`), turns up to ±0.5 rad, and has a size from 0.45 to 0.85.
8. A **soft glow at the feet**, tinted `light`, rises to alpha 0.7 and falls back over 840 ms in total (`Sine.easeInOut`). It lies on the ground and sorts under the figure.
9. **How a glint winks** (FS-KYPQ9 §B.4): its alpha rises from 0 to 1 over the first half of its life and falls back to 0 over the second half. Its scale only grows, from 0.6× to 1× its size, and never shrinks. No scale tween yoyos *(charter default: the prototype grew and shrank scale with a yoyo, which FS-KYPQ9 §B.4 bans. Fading alpha keeps the wink and stays inside the effect rules)*.
10. The granted base **never tints the body** *(charter default: the hit's flash tints the figure oxblood; a heal that tinted it red too would read as damage)*.
11. **Light.** One short-lived light-map source (FS-KYPQ9 §C) at mid-body (feet − crown/2), radius 110, intensity 0.7, fading to 0 over 900 ms (`Sine.easeIn`), colour `light`.
12. **Duration.** All of a granted shimmer's objects and its light are gone by **1150 ms** (`SHIMMER_GRANTED_MS`), within FS-KYPQ9 §B.2's 1200 ms one-shot cap. The per-glint randomness falls inside that fixed window.

### C. The invoked base

Reference: the prototype `spiral` in the same file. Requirement 16 tightens its timings.

13. **2 strands × 7 motes** wind up the body from the feet to the head over a **820 ms** climb (`Sine.easeInOut`). Mote `k` of a strand lags the strand's lead by `k × 45 ms`. Strands start half a turn apart. A mote at progress `t` sits at angle `phase + t × 3.2π` and radius `20 × (1 − 0.45 t)` px, at height `t × (crown + 4)` px, with its y offset by `sin(angle) × radius × 0.5`, which gives the ellipse of a circle seen in isometric view.
14. A mote **passes in front of the figure** while `sin(angle) > 0`, at full alpha, and **behind it** otherwise, at alpha 0.55. It fades in over the first tenth of its climb and out over its last fifth. Its scale stays fixed (mote 0 at 0.75, then `0.6 − 0.06 k`), so it never shrinks (FS-KYPQ9 §B.4).
15. A **ground ring opens at the feet**: a soft ring texture tinted `glint`, laid on the ground, growing from 0.35× to 0.75× over 700 ms (`Sine.easeOut`), with alpha fading from 0.8 to 0 (`Quad.easeIn`).
16. **Head glints.** As the strands arrive, 6 glints break at the head (within ±14 px of the feet in x, and from 6 px under to 10 px over the crown), winking as in requirement 9. Glint `i` starts at `740 + i × 35 ms` and lives 220–280 ms *(charter default: the prototype's 260–340 ms ran its last glint to about 1255 ms, past FS-KYPQ9 §B.2's 1200 ms cap)*.
17. **Light.** One short-lived source at mid-body, radius 120, intensity 0.7, fading to 0 over 1120 ms (`Sine.easeIn`), colour `light`.
18. **Duration.** All of an invoked shimmer's objects and its light are gone by **1200 ms** (`SHIMMER_INVOKED_MS`).
19. **No consumer yet** *(charter default: the base is built now so the family stays one design. Nothing in the game plays it until a later feature gives it a source)*.

### D. Drawing and teardown

20. Shimmers are drawn and tracked in **`game-client/src/render/effects/shimmer.ts`** on the `ParryFx` pattern (`parry.ts`): every object it makes is tracked, and a `forget()` takes them all down. They are **not** effects-table entries *(charter default: the table can't scatter staggered glints over a body. FS-KYPQ9 §B.6's 12-particle cap is a table rule and doesn't apply here: a granted shimmer draws 16 glints)*. FS-KYPQ9 §B.2–§B.5 and §B.7–§B.10 still apply, as written in §B and §C above and in 21–26 below.
21. **Textures are baked** into the fx sheet by `game-client/tools/bake/page/models/fx.js` (ADR-0020). There are three, all tint-taking (neutral luminance, no hue), like `fx_glow`:
    - `fx_glint`: a four-armed glint, its vertical arms longer than its horizontal ones, so it reads as a glint and not a plus sign, around a small soft core;
    - `fx_mote`: a soft round dot (the glint's hot core and the spiral's motes);
    - `fx_ring`: a soft ground ring, falling off on both sides with no hard edge (the invoked base only).

    The feet glow (requirement 8) reuses the existing `fx_glow` *(charter default: H7 named the glint and the soft dot. The spiral's ground ring needs a third texture, and it is kept soft because fx.js's look rule says "no hard rings". The feet glow is the soft ground decal `fx_glow` already is)*. **No texture is drawn at runtime.** The prototype's canvas textures are not carried over.
22. Glints and motes are drawn with **additive blending**, so overlapping glints burn brighter, as in the prototype.
23. **A shimmer follows its figure.** Every object's position is an offset from the figure's feet, reapplied each frame from the drawn position, as `ParryFx.follow` does. The light source moves with it. A player who drinks while running carries the shimmer with them.
24. **Sorting.** In-front objects sort just over the figure's own depth and behind objects just under it (the figure's `worldDepth`), so walls and props still sort against the figure as before. The feet glow and the ring sort under the figure. Nothing draws above the HUD (FS-KYPQ9 §B.8).
25. **Stacking.** Each shimmer plays on its own. Two shimmers started close together both play in full, overlapping. A new one never cuts short or restarts an earlier one *(charter default: an effect that lands twice landed twice)*.
26. **Teardown.** A shimmer's objects and light are destroyed when its duration ends. `forget()` destroys every live shimmer's objects and light at once. It runs on `resetRun` in `BarrowspireScene`, which already runs on scene SHUTDOWN and DESTROY (and a reconnect restarts the run). The light-map's own `clearTransient()` on `resetRun` is harmless to repeat.
27. **No manifest, no shimmer.** If the fx sheet or one of the three textures is missing, a shimmer plays nothing and logs once (FS-KYPQ9 §B.10).
28. The randomness (glint points, jitter, lives) comes from an **injectable random source**, defaulting to `Math.random`, so tests can pin it.

### E. The design guideline (rule change, flagged)

29. **Rule change.** In `game-client/docs/design-guideline.md` Part I, the "Gameplay accent" channel table stops saying healing is arcane green. The **Safe / friendly / restorative** row becomes **Safe / friendly** (arcane green: pickups, allies). A new row is added: **Restoring a resource** takes that resource's own colour: health is red, matching the HP bar's `oxbloodText` and the oxblood potion bottle. Arcane green stays safe and friendly. The amendment is marked *(Amended at the owner's approval of FS-KZC92, 2026-11-03.)*, as earlier amendments are *(charter default: the HP bar, the potion and the heal now share one colour, so a player reads "health" from one hue)*.
30. Part I gets a new **"Shimmers"** section, stating as rules:
    - which base: decided by the source. Granted when no player is the source, invoked when a player is;
    - one-shot, about 1 s or less (never past 1200 ms), and it marks the moment, not a lasting buff;
    - its colour comes from what it restores (the heal look is `oxbloodText` / `vellum` / `oxblood`);
    - stacked shimmers each play on their own;
    - the granted base never tints the body, so it stays apart from the hit's oxblood flash.
31. `game-client/src/utils/canvasPalette.ts`'s `heal` key, today `BARROW_HEX.arcane` and read by nothing, moves out of the safe group and becomes `BARROW_HEX.oxbloodText`, with a comment pointing at the amended row *(charter default: otherwise the code keeps a token that contradicts the guideline. Nothing reads it, so no look changes)*.

### F. Vocabulary

32. `game-client/CONTEXT.md` gains **shimmer**, **granted shimmer**, **invoked shimmer** and **look** (requirements 1–3), under its rendering terms.

### G. The heal trigger

33. **Local player only**, from `current_player`, never `other_players`: a teammate's drink draws nothing on them.
34. A heal shimmer (granted base, heal look) plays on the local player's figure when **one** game state shows both:
    - **fewer health potions worn** than the previous state (`healthPotionCount` in `game-client/src/ui/potions.ts`, over `current_player.equipment`), and
    - **higher `current_health`** than the previous state.

    *(charter default: the server empties the slot and heals in the same tick and sends both in the next broadcast (FS-P9G8R R7–R8), so the two signals together mean "a potion was drunk" without any new message. Either alone misfires: unequipping drops the count, and regeneration or other healing raises health.)*
35. **Baseline.** The first state after joining, reconnecting or a run reset sets the baseline and plays nothing. A state with no `current_player` (resolved or escaped) clears the baseline, so the next state with one is a fresh baseline.
36. **No false shimmer.** Unequipping a potion plays nothing (count down, health not up). A drink at full health plays nothing, since the server refuses it and nothing changes (FS-P9G8R R6). Health rising with the count unchanged (or rising) plays nothing.
37. The trigger is a **pure, tested watcher**: it takes each `current_player` and answers whether to play. `BarrowspireScene` feeds it every state, plays the heal shimmer when it answers yes, and forgets it on `resetRun`.
38. **BarrowspireScene only.** The hub and field worlds play no heal shimmer (nothing can be drunk in a field visit, FS-P9G8R R16).

### H. Dev gallery (FS-1819Q R2)

39. In the same change that builds each base, `game-client/src/dev/gallery/effects.ts` gets its card, with `module: "shimmer"`:
    - **heal shimmer**: the granted base with the heal look, played on the gallery figure;
    - **invoked base**: the invoked base, played with the heal look as a stand-in, since it has no look of its own yet. The card's name says so.

### I. Bounds

40. game-client and docs only. No server, WebSocket or API change. No new npm dependencies. **No change to how any existing effect looks or times**: no file under `src/render/effects/` other than `shimmer.ts` (and its test) changes behaviour, and existing effect tests pass unchanged.
41. Tests and `/code-review` stay on for every slice *(charter default: the trigger is logic, so this isn't a styling-only FS)*.

## User Stories

1. As a player, I want a red glitter on my character when I drink a health potion, so that I see the drink landed.
2. As a player in a fight, I want the heal shimmer to be quick, so that it never hides what is attacking me.
3. As a player, I want the heal shimmer in the same red as my health bar, so that I read "health came back" without thinking.
4. As a player, I want the heal shimmer never to tint my figure, so that I never mistake a heal for being hit.
5. As a player who drinks while running, I want the shimmer to move with me, so that it doesn't hang where I used to stand.
6. As a player who drinks twice in a row, I want two shimmers, so that each drink shows.
7. As a player who unequips a potion, I want no shimmer, so that the glitter means a drink and nothing else.
8. As a player at full health pressing the drink key, I want no shimmer, so that a refused drink doesn't pretend to have worked.
9. As a player who reconnects into a run, I want no shimmer on my first state, so that a reconnect doesn't fake a drink.
10. As a player in a party, I want no shimmer on me when a teammate drinks, so that I only see what landed on me.
11. As a player, I want the glints to sort in front of and behind my figure, so that they look like they're around my body, not stuck on the screen.
12. As a player on a modest machine, I want a shimmer to clean up after itself within about a second, so that drinking never piles up objects.
13. As a player whose run restarts, I want every shimmer gone at once, so that nothing from the old run lingers.
14. As a future feature author adding a scroll or shrine buff, I want a granted base I can give a new look, so that I don't build a new effect.
15. As a future feature author adding an ally's buff or a charge-up, I want the invoked base ready, so that player magic reads apart from what the world hands you.
16. As a future feature author, I want a look to be three palette tokens, so that a new shimmer is a colour choice, not new code.
17. As a dev, I want the heal shimmer and the invoked base on the dev gallery, so that I see them before I build something similar.
18. As a dev, I want the shimmer textures baked like every other effect texture, so that the art rules hold (ADR-0020).
19. As a dev, I want the trigger as a pure watcher with tests, so that "drink means shimmer" is proven without a canvas.
20. As a dev, I want the random scatter injectable, so that a shimmer's bounds and timings are testable.
21. As the art owner, I want the guideline to say healing takes health's colour, so that the rule and the game agree.
22. As the art owner, I want the guideline to say which base goes with which source, so that later shimmers stay one family.
23. As the art owner, I want the rule change flagged, so that I can see the canon changed and why.
24. As a dev reading the palette, I want the unused `heal` token to match the guideline, so that no one copies the old arcane-green heal.
25. As a dev, I want the shimmer to obey the effect rules (no scale bounce, the 1200 ms cap, tokens only), so that it fits "no silly animations".
26. As a dev, I want a missing fx sheet to play nothing, logged once, so that a broken bake never brings back hand-drawn circles.

## Acceptance Criteria

- [ ] Drinking a health potion in a run plays one heal shimmer on the local player: 16 glints in `oxbloodText` with `vellum` cores, a soft `oxblood` glow at the feet, a short `oxblood` light, no tint on the figure, all gone by 1150 ms.
- [ ] The shimmer follows the player when they move during it; its glints sort in front of and behind the figure.
- [ ] Two drinks in a row play two overlapping shimmers, each in full.
- [ ] Unequipping a potion, pressing the drink key at full health, the first state after joining or reconnecting, and a teammate's drink each play nothing (watcher tests, one case per row).
- [ ] A state with no `current_player` clears the baseline (watcher test).
- [ ] `resetRun` (and so SHUTDOWN, DESTROY and a reconnect) destroys every live shimmer's objects and light (test against a fake scene, as the parry tests do).
- [ ] With a pinned random source, the granted base makes exactly 16 glints, all inside the body bounds of requirement 6, with every object gone by 1150 ms; the invoked base makes 14 motes and 6 head glints, a ring and one light, all gone by 1200 ms.
- [ ] No shimmer object's scale ever shrinks; no scale tween yoyos; no easing outside `Linear`/`Sine`/`Quad`/`Cubic` (the existing source scan passes over `shimmer.ts`).
- [ ] Every colour a shimmer uses is a `BARROW` key from its look; the heal look is exactly `oxbloodText` / `vellum` / `oxblood`.
- [ ] `fx_glint`, `fx_mote` and `fx_ring` are in `public/art/manifest.json`, authored by `tools/bake/page/models/fx.js`, and covered by the manifest test; a re-bake is byte-identical; no texture is created at runtime.
- [ ] With the fx sheet missing, a shimmer plays nothing and logs once.
- [ ] The dev gallery shows a heal shimmer card and an invoked base card, both playable on the figure; the FS-1819Q enforcement test passes with `shimmer` registered.
- [ ] `design-guideline.md` Part I has the amended accent table (with the amendment note) and a "Shimmers" section stating the rules of requirement 30.
- [ ] `canvasPalette.ts`'s `heal` is `BARROW_HEX.oxbloodText`, outside the safe group.
- [ ] `game-client/CONTEXT.md` defines shimmer, granted shimmer, invoked shimmer and look.
- [ ] No diff under `game-server/`; no new dependencies; no existing effect's behaviour changes and existing effect tests pass unchanged; the token-fence lint passes.

## Edge States

- **Heal and damage in the same tick:** if the net `current_health` doesn't rise, no shimmer plays. Accepted: the drink happened, but the player saw no health come back.
- **A drink and a potion equipped in the same state:** the count doesn't drop, so no shimmer plays. Accepted as rare (equipping takes its own action).
- **A heal capped at max health** (drinking at 99/100): health still rises, so the shimmer plays.
- **Drinking twice inside one second:** the server's 1.0 s cooldown (FS-P9G8R R9) refuses the second, so at most about one shimmer a second comes from potions. Overlaps are still allowed (requirement 25).
- **The player dies or escapes mid-shimmer:** the shimmer finishes where the figure was last drawn and is destroyed on time. The next state without `current_player` clears the baseline.
- **The figure isn't drawn yet** (the first follow hasn't come): the shimmer's objects stay unplaced until it does, as `ParryFx.place` does.
- **The run resets mid-shimmer** (a restart or reconnect): everything goes at once, and the next first state is a baseline.
- **More than 16 short-lived lights at once:** the light-map drops the oldest (FS-KYPQ9 §C.3). A shimmer's glints still play without its light.
- **Art manifest missing or a texture missing:** nothing plays; one log line.
- **Indoors under a roof:** the shimmer's light follows the existing short-lived rule (lights the floor, no halo; FS-KYPQ9 §C.5).

## Out of Scope

- Showing a lasting buff (an aura, a status icon, a timer). It's a separate, later design.
- Any consumer of the invoked base, and any look but the heal look.
- Shimmers for other players' drinks or on monsters.
- Shimmers in the hub or field worlds.
- A drink animation on the figure itself (a clip, a pose).
- A server, WebSocket or API change, such as a "drank" event. The trigger reads the existing state.
- Any change to how an existing effect looks or times, and any change to the effects table.
- New npm dependencies.
