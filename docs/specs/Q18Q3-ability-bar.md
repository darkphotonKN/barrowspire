# FS-Q18Q3: Ability bar

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### HUD" (ability bar) → this FS · Supersedes: "Ability card on the HUD" → [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (struck, `superseded by FS-Q18Q3`; this FS is its removal work order too); [FS-P9G8R](P9G8R-drink-health-potions.md) R24's potion cell (its place and its look; the count rule R23, the 0 rule R25 and the key rules R26–R28 stand); [FS-77DVN](77DVN-xp-bar-along-the-bottom.md) §D.16's cue place while the bar is up · Siblings (same scoping session, 2026-11-21): [FS-04EEA](04EEA-class-tree-abilities.md) (the key-3 ability and its cast), [FS-8RZ51](8RZ51-passive-skill-tree.md) (the tier-3 node that grants it) · Interacts with: [FS-JTNPR](JTNPR-shadow-shot.md) (the hold), [FS-MAMHR](MAMHR-mercenary-class.md) (the parry stance and the whiff lockout), [FS-9K8EZ](9K8EZ-die-by-choice.md) (the run's ESC menu owns the keyboard), [FS-3EBCA](3EBCA-hud-corner-icons.md) (the corner row the card stood over), [FS-CH21F](CH21F-party-member-overhead-bars.md) (`resource` also rides a party member's entry) · Related ADRs: [ADR-0080](../adr/0080-canvas-hud-icons-are-embossed-bronze-knockouts-from-one-shared-renderer.md) (every canvas HUD icon is a bronze knockout from one renderer), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the canvas palette), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming is the client's; the server holds resolved casts), ADR-0004 (game-service owns the WebSocket contract), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md), [ADR-0085](../adr/0085-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md), [ADR-0086](../adr/0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (the bar is a UI-scene piece; the world hands it data through the UI bridge) · Interacts with (UI scene): [FS-TQZ5J](TQZ5J-ui-scene.md) § Change: Batch 5 (the HUD slot the card and the cell moved into), [FS-84N1G](84N1G-run-controls-badge-and-panel-rules.md) (the run's controls badge stood over the card), [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) § Change: The party death flow and the spectate switcher, R168 (the run's own HUD held at death) · Vocabulary: pending via `domain-model` (ability bar, ability square, tree ability); game-client `CONTEXT.md` "Ability card" retires with the card

## Summary

The bottom-right ability card goes. In its place, a short **ability bar** of three squares sits
at the bottom middle of the canvas, directly above the XP bar: **1** the health potion,
**right-click** the class ability, **3** the tree ability. Each square has its key set into its
top edge, a bronze knockout icon, its cost under it, a cooldown sweep while it recovers, and it
greys out when it cannot be used. The potion square takes over the potion cell's count. The 3
square stays locked, reading "Lv 10", until the character holds its tree's ability. Hovering a
square shows what the card used to say. The server tells the player how long each of their
abilities has left to recover, so the client never copies the cooldown tables.

Charter run, 2026-11-21 (Kranti's approval covers this promotion; no interview). Each requirement
says **charter default — reason: …** (a locked decision from the scoping notes or the charter
list), or **derived here — …** (filled where neither covered the question, the smaller v1 where
there was a choice). Recorded without adversarial review: no `challenge-me` pass.

> **Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.** The
> branch moved onto origin/main, where the ability card, the potion cell, the resource bars and the
> level bar are no longer drawn by the world scenes: each world computes their views and hands them
> to the one **UI scene**'s HUD slot (`ui/uiSceneHud.ts`, built by `ui/hudPieces.ts`) as `hud`
> messages through the UI bridge (`ui/uiBridge.ts`). The bar follows that pattern: it is a UI-scene
> piece (ADR-0086 rules 1.1 and 1.2: fixed to the screen, shared by the run and a field), fed plain
> data by the world, which keeps the casts and the drink (ADR-0085 Decision 1). Requirements R10–R12,
> R22, R28–R30, R32–R35 and the new §L (R40–R44), two acceptance criteria and one edge state are
> corrected or added for it, each marked *(integrator correction 2026-11-21)*. Nothing the player
> sees changes. R30 then takes upstream's hold at death (FS-QPDKN R168): the bar is held greyed
> with the top-left bars, so the potion count stays on screen *(integrator correction 2026-11-21 —
> reason: keep FS-QPDKN R168's hold)*. The facts below were
> verified at 632e1875; the UI-scene facts at the end of the list were verified at 76e70896.

## Facts this spec rests on

Verified 2026-11-21 on `chore/observability-setup` at 632e1875. Client paths under
`game-client/src/`, server paths under `game-server/game-service/internal/`.

- **The ability card** (`ui/AbilityHud.ts`, rules in `ui/abilityCard.ts`, copy in
  `ui/abilityCopy.ts`): a 280 px HUD panel at `ABILITY_CARD_PLACE` (bottom right, 8 px over the
  corner row, `ui/hudCornerLayout.ts`), mounted by `BarrowspireScene.showAbilityCard` **and**
  `FieldScene.showAbilityCard`: it shows in **runs and fields**, never the hub. Greyed when
  `abilityAffordable(resource)` is false, while `combat.lockedOut` runs, or when
  `parryRefused(me)` (the merc's stance open or the whiff lockout running). Hidden when
  `resolved(me)` and, in a run, while the dead spectator's leave button is up. `parryRefused` is
  also read by `render/combat/playerCombat.ts`.
- **The potion cell** (`ui/PotionHud.ts`, rules in `ui/potions.ts`): run only, at
  `POTION_HUD_X` (`BarrowspireScene.ts`), right of the top-left resource bars; the baked
  `potion_health` item icon, the count (`healthPotionCount`, 0 to 3) and `[1]` from
  `RUN_ACTIONS.drinkPotion` (`scenes/runActions.ts`); dimmed at 0. Key 1 drinks by an event
  binding gated on `this.menu` (FS-P9G8R R28). The field binds ONE/TWO/THREE only to its menu's
  choices (`FieldScene.ts`, `menuChoices?.pick`).
- **The bottom middle:** the XP bar piece (`ui/xpBarLayout.ts`, `xpBarFrame(view)`) is centred
  on `W / 2`, its `piece` 16 px tall with its foot at y 704 (top y 688), 188 px wide at 1080 and
  388 at 1280, between the chat window (right edge x 430) and the corner row (left edge
  `W − 294`). The level-up cue's bottom stands 6 px over the piece's top (`ProgressHud.ts`).
  Nothing else stands in the bottom middle while the player is in play; the run's resolved row
  (y ≤ 504) only shows once they are out of the delve.
- **Cooldowns on the server** (`systems/combat.go`): `CooldownComponent.Remaining` maps an attack
  kind to the seconds left; a resolved cast sets `spec.cooldown / (1 + worn attack speed %/100)`;
  `tickCooldowns` counts it down and deletes it at 0. Only the remaining time is kept, not the
  length it started at. Right-click rows: `dash` 0.4 s, `triple_fireball` 0.4 s, `shadow_shot`
  1.2 s. The merc's `parry` has no row and no cooldown; its whiff lockout
  (`ParryComponent.LockoutRemaining`, from `parryLockout` = 1.0 s less the stance's overrun) is
  what refuses a parry. Each delver's right-click ability is `AbilityComponent.Kind`.
- **The wire** (`types/game.go`, `serializer/state_serializer.go`): `current_player.resource`
  is `{kind, current, max, ability_cost}` (`resourceState`); the same shape rides a party
  member's `other_players` entry (FS-CH21F). No cooldown is on the wire. The merc's
  `parry_open`, `parry_lockout` (raw float seconds) and `parries` ride `current_player`.
  `timed_open` carries `elapsed` and `duration` in float seconds.
- **The client's own lockout** (`render/combat/playerCombat.ts`): `SPECIAL_COOLDOWN_MS` 400
  after a right-click cast, and Shadow Shot's mirrored `SHADOW_SHOT_COOLDOWN_MS` after a release;
  `combat.aiming` is true while the Shadow Shot hold runs.
- **The knockout renderer** (`ui/knockout.ts`, ADR-0080): a `KnockoutPicture` (silhouette, cuts,
  holes) drawn as a bronze knockout with an emboss; `BRONZE` idle and hover inks; the unavailable
  ink is flat `hudFaint` at 0.6; each picture keeps a line-glyph fallback.
- **The UI scene** (at 76e70896; *integrator correction 2026-11-21*): `scenes/UIScene.ts` holds the
  in-world interface over every world (ADR-0084). The HUD slot (`UiHudSlot` in `ui/uiSceneHud.ts`)
  hears `HudMessage`s (`kind` `ability` | `potion` | `bars` | `progress`, each naming its world)
  and builds each piece at its world's place in `HUD_PLACES` (hub: the level bar only; field: level
  bar, bars, card; run: level bar, bars, potion cell, card); `hudPieces` builds the real
  `AbilityHud`, `PotionHud`, `ResourceHud` and `ProgressHud` on the UI scene. The worlds send them
  with `this.ui.hud({...})` (`BarrowspireScene.showAbilityCard`, `showResourceBars`;
  `FieldScene.showClassHud`, `showAbilityCard`), computing the views (`abilityCard(state,
  {lockedOut})`, `runOwnHud`) on their side. The card's `leaveUp` context is gone. The run's own
  bars and potion cell are **held as they were** once the player is out of the delve (`runOwnHud`,
  FS-QPDKN R168); the card still returns null then. The run also tells the bridge whether its card
  is up (`ui.abilityCard(up)`), and the **controls badge** (`ui/uiSceneControlsBadge.ts`,
  FS-84N1G R3–R4) stands 8 px over the card (`controlsBadgeFrame`, from `ABILITY_CARD_PLACE` and
  `ABILITY_CARD_H`) exactly while it is up. The UI scene takes its own presses (Phaser's
  `globalTopOnly`; a window's ground is `ui/uiGround.ts`), hands moves over nothing of its own to
  the world (`ui/uiScenePointer.ts`), and reports `ui.menuOpen`, which the worlds' key and click
  guards read (the run's key 1 binding: `if (this.menuOpen || event?.repeat) return`). Its depth
  bands are ADR-0086 Decision 4's. `ui/knockout.ts` now exports `GREYED`, `GREYED_ALPHA` and
  `stroke()`; `ui/abilityIcons.ts` (I-Q18Q3-3) and the client's `CooldownState` types (I-Q18Q3-1)
  are in.

## Requirements

### §A. The wire (game-service → game-client)

1. **`current_player` gains `ability_cooldown`: `{remaining, total}`**, in float seconds, for the
   delver's right-click ability (`AbilityComponent.Kind`). `remaining` is the seconds left before
   it can be cast again, as the server judges it; `total` is the length that cooldown started at
   (worn attack speed already applied). Both are 0 when nothing is running. Sent whenever the
   delver has an ability, in every world, as `resource` is. **charter default — reason: the
   client never mirrors the server's cooldown tables (FS-8AY7S R17's argument for
   `ability_cost`), so a retune or an attack-speed affix never needs a client change.**
2. **The merc's right-click cooldown is the whiff lockout.** For a delver whose ability is
   `parry`, `ability_cooldown.remaining` is the whiff lockout left
   (`ParryComponent.LockoutRemaining`) and `total` the length it started at. **derived here —
   the parry has no cooldown row; the lockout is the one thing that refuses it on time, and the
   client already greys by it (`parryRefused`), so the square sweeps over the same window.**
3. **The server keeps each running cooldown's starting length** beside its remaining time, so
   `total` never changes while a cooldown runs (a gear swap mid-cooldown does not re-scale the
   sweep). **derived here — `CooldownComponent` keeps only the remaining time today.**
4. **`current_player` gains `tree_ability_cooldown`: `{remaining, total}`**, the same shape and
   rules as R1, for the class's tree ability (FS-04EEA R2). **Sent only while the character in
   play holds its tree's ability** (the tier-3 node as FS-8RZ51 seats it on the delver, the same
   hold FS-04EEA R3 checks); absent otherwise. Settle the Debt has no cooldown of its own and
   shares the cut's slot (FS-04EEA R33), so a mercenary's `tree_ability_cooldown` is the cut's
   slot. **charter default — reason: as R1; this FS owns the field.** *Derived here:* absence is
   the bar's signal that the ability is not held (R25), so the bar needs no copy of the tree to
   lock the square.
5. **`resource` gains `tree_ability_cost`**: a whole number, the cost of one cast of the class's
   tree ability in the delver's own class resource, as `ability_cost` is the right-click's. Sent
   only while the tree ability is held (omitted otherwise). For an ability that spends a
   variable amount (Settle the Debt spends every parry charge held, at least 1, FS-04EEA R29–R30),
   it is the least the server requires to cast (1), so `current ≥ tree_ability_cost` agrees with
   the server. **charter
   default — reason: "the tree ability's cost alongside the existing `resource.ability_cost`".**
   *Derived here:* it rides wherever `resource` rides, a party member's entry included
   (FS-CH21F), because it is one struct; nothing draws a teammate's.
6. **`other_players` never carry `ability_cooldown` or `tree_ability_cooldown`.** **derived here
   — only the owner draws them (FS-8AY7S R18's rule).**
7. **No inbound action changes.** Nothing about the bar reaches the server. **derived here.**

### §B. The bar's place (game-client)

8. **Bottom middle, directly above the XP bar.** The three squares stand in one row, in the
   order **[1 potion] [right-click ability] [3 tree ability]**, the row centred on `W / 2`. The
   bar's lowest point (the cost slots, R14) stands 6 px above the XP piece's top
   (`xpBarFrame(view).piece.y`, read from `xpBarLayout`, never restated). **charter default —
   reason: Kranti, "put it in the middle above the XP bar"; derived here: the 6 px is the gap the
   level-up cue keeps over the piece.**
9. **Sizes:** each square 44 × 44 px, 10 px between squares (the row 152 px wide). Named
   constants in one pure layout module (`ui/abilityBarLayout.ts`) that returns every square's
   rect, its key plaque, its icon centre and its cost slot for a view. At 1080 the row spans
   x 464–616 and at 1280 x 564–716: clear of the chat window (x ≤ 430) and the corner row
   (x ≥ `W − 294`) at every width from 1080 to 1280. **derived here — the row is narrower than
   the XP piece's narrowest (188 px), so it never meets either neighbour.**
10. **It follows a resize** on the UI scene: the HUD slot's `relayout` (on the UI scene's
    `relayoutOn`) places it again by the same rule and re-crispens its text (FS-ZAJMH R5). A
    render-scale change rebuilds the knockouts through the renderer (ADR-0080). **derived here — it
    keeps to the centre, which a width change moves.** *(Integrator correction 2026-11-21 — reason:
    ADR-0084–0086 (UI scene) landed upstream. Was: from each world scene's `relayoutHud`.)*
11. **Depth 1000 on the UI scene**, the corner row's band (ADR-0086 Decision 4): under every
    window, the ESC menu and the notices, which then also take the presses over it. **derived
    here.** *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.
    Was: depth 1000 in the world scene.)*
12. **The level-up cue rises from above the bar while the bar is up:** its bottom 6 px over the
    bar's top (the key plaques' top), held bar included; when no bar is up (the hub, or a field
    while fallen) it keeps
    FS-77DVN §D.16's place. Its words, timing and rise are unchanged. Both pieces stand in the UI
    scene's HUD slot, so the slot tells the level bar the ability bar's top while the bar stands
    and nothing crosses the bridge for it. **derived here — the cue's old place now lies under the
    bar's cost slots.** *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene)
    landed upstream: the slot wiring added.)*

### §C. The squares' look (game-client)

13. **Each square** is a framed well: the HUD panel (`palette.hudPanel` at 0.85), a 1 px brass
    rim (`palette.frame` at 0.6), the icon centred in it at about 30 px. Serious, mature medieval:
    under `game-client/docs/design-guideline.md` ("UI Chrome", panels in the world: dark vellum
    and carved stone in brass), the canvas palette only, no raw colour. Fine detail inside these
    bounds (a carved inner line, studs) is the implementer's, through the art gate (§K).
    **charter default — reason: "serious, mature medieval look under the design guideline and the
    canvas palette".**
14. **The key binding is set into the square's top edge:** a small plaque centred on the top
    edge, straddling it, in the HUD panel with a brass rim, carrying the key in the 12 px body
    serif in `hudText`: "1" and "3", read from the run's action mapping (R30), never typed again;
    the right-click square's plaque carries the **right-mouse glyph** (today's card glyph, a mouse
    with its right button filled, drawn small enough to fit). **charter default — reason: Kranti,
    the key binding "written on top", right-click as a mouse glyph.**
15. **Each ability's cost stands under its square:** a bare 12 px body-serif numeral centred
    under it, with a 2 px `markerStroke` stroke and no panel (the XP numerals' way of setting
    words over the world), in its resource bar's own colour (`palette.hudMana`, `hudStamina`,
    `hudParry` by `resource.kind`; `hudText` for an unknown kind). The right-click square reads
    `resource.ability_cost`, the 3 square `resource.tree_ability_cost`. A cost of 0 (the parry)
    draws nothing. No resource on the wire draws nothing. The potion square has no cost.
    **charter default — reason: "its cost under it"; derived here: the bar's colour ties the
    number to the pool it is paid from.**
16. **One icon per ability, each a bronze knockout from the ADR-0080 renderer:** the warrior's
    Dash, the mage's Triple Fireball, the archer's Shadow Shot, the mercenary's Parry; the four
    tree abilities (FS-04EEA: Earthbreaker, Blink, Arrow Rain, Settle the Debt); the health
    potion (a flask); and a padlock for the locked 3 square. Ten pictures in one module
    (`ui/abilityIcons.ts`), keyed by ability (and `potion`, `locked`), each with its line-glyph
    fallback. No baked art, no new drawing pipeline. **charter default — reason: "an icon per
    ability from the ADR-0080 renderer".** *Derived here:* the potion square takes a knockout
    flask, not the baked `potion_health` item icon, because ADR-0080 found one odd icon in a row
    over-weights it and the row reads right only as a family; the item icon stays in the gear
    overlay.
17. **The states, by the renderer's inks:**
    - **lit:** `BRONZE` idle; under the pointer, `BRONZE` hover (the tooltip shows, §F).
    - **greyed:** the renderer's unavailable ink (flat `hudFaint` at 0.6), the key and the cost
      in `hudFaint`. A greyed square never brightens under the pointer (ADR-0080).
    - **active** (R23): the rim drawn 2 px in `palette.frameBright` at 1 and the icon in the
      hover ink, while the state lasts.
    **charter default — reason: "greys out when unaffordable or cooling down"; derived here: the
    inks are ADR-0080's own, so no new state look is invented.**

### §D. The cooldown sweep (game-client)

18. **While a cooldown runs, a sweep covers the square:** a dark wedge (`palette.ink` at about
    0.55) over the well, from 12 o'clock, covering the fraction `remaining / total`, receding
    clockwise until the square is clear. The square is greyed (R17) while it runs. **charter
    default — reason: "a cooldown sweep".**
19. **The sweep is the server's numbers, run on smoothly:** each state sets it from
    `ability_cooldown` / `tree_ability_cooldown`; between states it runs down with real time since
    that state arrived, never below 0, and the next state corrects it (the open bar's rule,
    FS-MQYEX R22). `remaining` 0 or `total` 0 draws no sweep. **derived here — states arrive
    slower than frames; the client never times a cooldown itself.**
20. **No seconds numeral and no "ready" flash** in v1. **derived here — smaller v1.**
21. **The potion square draws no sweep.** The drink's 1.0 s cooldown (FS-P9G8R R9) is not on the
    wire. **derived here — the charter put only the two abilities' cooldowns on the wire; smaller
    v1.**

### §E. The three squares (game-client)

22. **The right-click square** shows the delver's class ability (`current_player.class`). It is
    greyed when any of these holds: `resource.current < resource.ability_cost`
    (`abilityAffordable`); `ability_cooldown.remaining > 0`; the client's own post-cast lockout
    runs (`combat.lockedOut`, which covers the moment before the server's state shows the
    cooldown); `parryRefused(me)`. **charter default — reason: the card's greying (FS-8AY7S R31)
    plus "greys out when cooling down".** The world judges these (the lockout and the hold are
    its combat's) and hands the result as data (R40). *(Integrator correction 2026-11-21 — reason:
    ADR-0084–0086 (UI scene) landed upstream.)*
23. **Active on the right-click square:** while the archer holds Shadow Shot (`combat.aiming`,
    FS-JTNPR) and while the merc's stance is open (`parry_open`, FS-MAMHR). Active and greyed may
    hold at once (a hold with too little stamina: the rim lit, the icon grey, as FS-JTNPR R18
    reads affordability during the hold). **charter default — reason: "Shadow Shot's hold and the
    merc's open parry stance show as an active state on the right-click square".**
24. **The potion square** shows the flask, the **count** (FS-P9G8R R23, 0 to 3) as a 12 px body
    numeral with a 2 px `markerStroke` stroke in the square's bottom-right corner, and the key
    plaque "1". It is greyed when the count is 0, and always in a field (R29). **At 0 it stays:**
    the faint flask and a faint "0" (FS-P9G8R R25's rule, kept). No cost under it. **charter
    default — reason: "shows the count and the drink key"; "an empty state when no potion is
    equipped".** *Derived here:* the count in the corner is the stack count's usual place, so the
    slot under the square stays a cost slot.
25. **The 3 square, locked:** while `tree_ability_cooldown` is absent from `current_player`
    (R4), the square shows the padlock in the unavailable ink, the plaque "3" faint, and "Lv 10"
    in the cost slot in `hudFaint`. The 10 is one named client constant, the level at which
    FS-8RZ51's tier-3 node can first be taken. **charter default — reason: "shows locked with 'Lv
    10' until the character holds its tree's tier-3 node".**
26. **The 3 square, held:** once `tree_ability_cooldown` is present, it shows the class's tree
    ability icon, `resource.tree_ability_cost` under it (R15), the sweep (R18), and greys when
    `resource.current < resource.tree_ability_cost`, while the cooldown runs, or while FS-04EEA's
    own key-3 client lockout runs, if it has one. **charter default — reason: "then shows the
    class's tree ability (FS-04EEA)".** No active state on the 3 square in v1. **derived here —
    the charter names active states for the right-click square only; smaller v1.**
27. **A class with no row** (a class added without copy or icon): that square draws its empty
    well with its plaque, no icon and no tooltip; nothing fails. **derived here — FS-8AY7S R30's
    "a class with no row shows no card", kept as a stable layout.**

### §F. Tooltips (game-client)

28. **Hovering a square shows its tooltip** above it: the name in the 16 px body serif in
    `hudText` and how it works in 13 px `hudLabel` (the card's sizes), on the HUD panel at 0.85
    with a 1 px brass rim, at most 240 px wide and wrapping, centred over the square and kept
    inside the view. It shows at once, and goes when the pointer leaves, the bar comes down, or
    a menu or panel takes the point. A greyed square still shows its tooltip. **charter default —
    reason: "a tooltip carrying what the card said (ability name and how it works)".** It is the
    UI scene's, drawn in the item-tip band (2200, ADR-0086 Decision 4) and heard by the square's
    own pointer over and out, never by a world's `pointermove`; a window or the menu over the
    square takes the pointer first, so no tooltip shows under one. The copy and the icons are
    looked up on the UI side from the keys the view carries (R40), never sent as words.
    *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.)*
    The copy, by square (data, keyed by class; the facts are fixed, the wording may be tuned in
    the guideline's voice):
    - **right-click:** today's `ABILITY_COPY` rows unchanged (Dash, Triple Fireball, Shadow Shot,
      Parry).
    - **3, held and locked alike:** the class's tree ability's name and line from the client's
      ability data, which FS-04EEA R50 supplies (Earthbreaker, Blink, Arrow Rain, Settle the
      Debt); the bar never restates them. Locked, a third line in `hudFaint`: "Learned at the
      skill tree's third tier, from level 10."
    - **1:** *Health Potion*: "Drink to heal at once, from your first potion slot." With none
      worn, a third line: "No health potion worn." In a field: "Potions are drunk only in the
      Spire."
    **derived here — the locked tooltip names what is coming; the copy table is data, as
    `abilityCopy.ts` is.**

### §G. Where it is shown (game-client)

29. **In runs and fields, never the hub:** the worlds the ability card shows in today
    (`BarrowspireScene`, `FieldScene`), so `HUD_PLACES` gives the bar a place in `field` and
    `run` and none in `hub` *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene)
    landed upstream)*. In a field the potion square is always greyed (a drink is
    a no-op there, FS-P9G8R R3) and key 1 still drinks nothing (FS-P9G8R R31's binding rule
    stands). **charter default — reason: "in the worlds the ability card shows today (check
    which)": checked, runs and fields.** *Derived here:* one three-square layout in both worlds,
    with the potion square honest about where it works.
30. **Up from the player's first state, and up exactly as long as the world's top-left Health and
    resource bars are.** No default is drawn before the first state. In play it is live (§D, §E).
    **Out of the delve it is held, as the bars are** (FS-QPDKN § Change: The party death flow and
    the spectate switcher, R168; `runOwnHud`): from the first state that shows the player dead,
    escaped or left behind, spectating included, the bar stays up with **every square greyed**
    (nothing can be cast or drunk), no sweep and no active state, the potion count and the costs
    as that state showed them, unchanged by later states. It comes down when the bars do: in a
    field while the player lies fallen (a field holds no bars), as the world leaves, and never in
    the hub. The world sends the held view with the held bars and a null view to take it down; the
    HUD slot also takes it down as the world leaves. The leave-button rule goes.
    *(Integrator correction 2026-11-21 — reason: keep FS-QPDKN R168's hold.)* *(Was: down once out of the delve, the card's rule, FS-8AY7S R32, with the potion
    count leaving the screen at death.)*

### §H. Keys and the pointer (game-client)

31. **The keys the plaques show come from the run's one action mapping**
    (`scenes/runActions.ts`): `drinkPotion` (ONE, "1") as today, and the tree-ability action
    (THREE, "3") that FS-04EEA R35 adds. **derived here — FS-P9G8R R26's single mapping.**
32. **While a menu is open the keys are the menu's.** In a run, while the ESC menu or its confirm
    is open (FS-9K8EZ R5), 1, 2 and 3 cast and drink nothing and the bar shows no change from the
    press; in a field, ONE/TWO/THREE stay the open menu's choices. Key 3 follows key 1's rule: an
    event binding gated on the open menu, never a second `JustDown` poll of a key the menu polls
    (FS-04EEA R36 sends nothing while such a menu or panel is open). The bar draws no press
    feedback of its own. **derived here — the caller's watch item, decided consistently with
    FS-P9G8R R28 and FS-04EEA R36.** *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI
    scene) landed upstream.)* The keys stay the **world's** bindings: a drink and a cast are
    world-play messages (ADR-0085 Decision 1), so the world binds 1 and 3 and sends them, and the
    bar binds no key. "The menu is open" is the UI's reported `ui.menuOpen` (ADR-0084 Decision 4:
    1–3 are the UI scene's only while its menu is open), which the world's guards read, as the
    run's key 1 does today; no `JustDown` poll and no `stopPropagation`.
33. **No click-to-cast.** A press (left or right) on a square is the bar's: no attack, no cast,
    no Shadow Shot hold starts. *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI
    scene) landed upstream. Was: taken through the world's `panelTakes`, hover fed from the world's
    `pointermove`.)* The bar lays an interactive ground over each square on the UI scene
    (`uiGround`, at its own depth), so the UI scene takes the press (ADR-0084 Decision 3) and the
    world never tests the bar's rect; a move over the bar reaches the world only as a move "on UI"
    (`uiScenePointer`), so no world hover lights under it. **derived here — smaller v1; the bar is
    a readout and a hover target.**

### §I. The card and the potion cell go (game-client)

34. **No ability card renders** in a run or a field: `AbilityHud.ts` and the card-only parts of
    `abilityCard.ts` are deleted (`abilityGreyed`, `parryRefused` and the copy move to the bar's
    modules, `parryRefused` still read by `playerCombat.ts`), and `ABILITY_CARD_PLACE` is deleted
    once nothing places by it. **charter default — reason: "the ability card is removed: its line
    is already struck `superseded by FS-Q18Q3`".** *(Integrator correction 2026-11-21 — reason:
    ADR-0084–0086 (UI scene) landed upstream.)* The HUD slot's `ability` and `potion` message kinds,
    their `HUD_PLACES` entries and their `hudPieces` builders go with them; `ABILITY_CARD_PLACE`
    stays only as far as R42 needs it.
35. **No potion cell renders** at the top left: `PotionHud.ts`, `POTION_CELL_W` and
    `POTION_CELL_GAP` are deleted once unread, with the cell's place in `HUD_PLACES.run`;
    `healthPotionCount` stays. `runOwnHud` keeps holding the bars and holds no cell.
    **charter default — reason: "FS-P9G8R's separate potion count moves into it".**
    *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream. Was:
    `POTION_HUD_X` in `BarrowspireScene.ts`, now the slot's place.)*
36. **Every top-left clearance still holds** with the cell gone (`partyFramesLayout.test.ts`,
    the run's stack test). **derived here.**

### §J. Docs

37. **The design guideline's "UI Chrome" gains an "Ability bar" bullet** (the three squares, the
    plaques, the cost slots, the knockout icons, the sweep, the greyed and active states, above
    the XP bar in runs and fields), marked "*(Added by FS-Q18Q3, 2026-11-21.)*"; the Experience
    bar bullet says the cue rises over the ability bar where one is up; the corner-row paragraph's
    "The ability card stands directly above the row, 8 px over it." is replaced by a dated note
    that the card was removed by FS-Q18Q3. **derived here — the guideline is the single source of
    truth for appearance; ADR-0080 asks for its HUD-icon rule there.**
38. **No dev-gallery card.** HUD chrome is not a tracked family (`dev/gallery/families.ts`).
    **derived here, as FS-77DVN §F.23.**

### §K. The art gate

39. **The ten pictures and the bar are checked by the owner on a contact sheet** before the
    icons are final: each icon lit, greyed and active, at render scale 1, 1.5 and 2 (ADR-0080's
    check), and headless captures of the bar in a run and a field at 1080 and 1280. Tweak rounds
    land in the icon module only. **derived here — build art in code, gate on the contact sheet.**

### §L. In the UI scene (game-client)

*(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream. This
section is new; it says how the bar of §B–§H is wired, and changes nothing the player sees.)*

40. **The world hands the bar one plain view through the UI bridge.** A new `HudMessage` kind,
    `bar`, naming its world, carries the bar's view or null (R30): for each square its ability key
    (an `AbilityIconKey`, or none for a class with no row, R27), whether it is greyed, active or
    locked, its cost and resource kind, the potion count, and the two `CooldownState`s as the
    state carried them. No function and no Phaser object crosses (ADR-0086 Decision 3). The world
    computes it from its latest state and what only it knows (its combat's lockout and hold,
    FS-04EEA's key-3 lockout, which world it is), on every state and as a lockout or a hold starts
    or ends, as it sends the card today. **derived here — ADR-0086 rules 1.1 and 1.2 place the bar
    in the UI scene; its data is the world's (ADR-0086 Decision 3).**
41. **The UI scene draws it** as a HUD-slot piece built by `hudPieces` at the bar's place in
    `HUD_PLACES` (R29), shown with each `bar` message, redrawn only on a change (as the card), and
    taken down as the world leaves. The sweep (§D) runs on the UI scene's own clock from the moment
    a `bar` message with a changed cooldown is heard: the bridge is synchronous, so that is the
    state's arrival. **derived here.**
42. **The run's controls badge keeps its place and follows the bar.** FS-84N1G R3–R4 stand the
    badge over the ability card exactly while the card is up. With the card gone, the badge keeps
    the same rect (its anchor constants, `ABILITY_CARD_PLACE` and `ABILITY_CARD_H`, kept and renamed
    for the badge alone if they lose their card meaning) and stands exactly while the run's bar is
    up **and live (not held, R30)** and the run has not ended, so it still goes at a death or an
    escape as FS-84N1G R4 has it; the run's `abilityCard(up)` report says "the bar is up and live"
    (renamed if the implementer wishes, one meaning). *(Integrator correction 2026-11-21 — reason: keep FS-QPDKN R168's hold.)* No badge in a field, as today. **derived here —
    smaller v1: no move of a piece FS-84N1G's owner placed by eye; whether it should now drop to
    the corner row is a question for the owner.**
43. **The bar and the HUD pieces it meets stay in one scene:** the level bar, the resource bars and
    the bar are all the HUD slot's, so their order is set inside the UI scene (ADR-0086 rule 1.3).
    **derived here.**
44. **Tests stand a fake bridge, not a world,** for the bar's piece (as `uiSceneHud.test.ts`
    does), and each world's test checks the `bar` message it sends. **derived here — ADR-0085's
    consequence for moved pieces.**

## User Stories

1. As a delver, I want my potion, my class ability and my tree ability in one short row at the
   bottom middle, so that everything I press in a fight is in one glance.
2. As a delver, I want each square to show its key on its top edge, so that I learn the keys
   without opening the controls panel.
3. As a delver, I want the right-click square to show a mouse, not a letter, so that I know it is
   the mouse button.
4. As a delver, I want each ability to have its own drawn icon, so that I read the square, not a
   word.
5. As a delver, I want the cost under each ability, in the colour of my resource bar, so that I
   know what a cast will take from which pool.
6. As a delver, I want a square to grey out when I cannot afford it, so that a refused press is
   never a surprise.
7. As a delver, I want a sweep over a square while it recovers, so that I can time my next cast.
8. As a delver with attack speed gear, I want the sweep to match my shorter cooldown, so that the
   HUD tells the truth about my gear.
9. As an archer, I want the right-click square lit while I hold Shadow Shot, so that I see the
   hold is live.
10. As an archer holding Shadow Shot without enough stamina, I want the square both lit and grey,
    so that I know the release will do nothing yet.
11. As a mercenary, I want the right-click square lit while my parry stance is open, and swept
    while the whiff lockout runs, so that I can read my timing.
12. As a delver, I want the potion square to show how many health potions I carry, so that I know
    whether I can drink.
13. As a delver with no potion worn, I want the potion square faint at 0 rather than gone, so that
    the bar never shifts and I still learn key 1.
14. As a delver in a field, I want the potion square greyed and its tooltip to say potions are
    drunk only in the Spire, so that I am not puzzled when 1 does nothing.
15. As a delver under level 10, I want the 3 square locked and reading "Lv 10", so that I know a
    third ability is coming and when.
16. As a delver who has taken the tree's ability, I want the 3 square to show it with its cost
    and cooldown, so that it reads like my other ability.
17. As a delver, I want to hover a square and read its name and how it works, so that the card's
    words are still there when I want them.
18. As a delver, I want to hover the locked square and read what it will be, so that I can plan my
    points.
19. As a delver, I want clicking a square to do nothing in the world, so that a misclick on the HUD
    never casts or swings.
20. As a delver with the ESC menu open, I want 1, 2 and 3 to pick nothing but the menu, so that
    opening the menu never drinks or casts.
21. As a delver who dies, escapes or is left behind, I want the bar held greyed beside my held
    bars, so that I see what I carried and that nothing can be used now. *(Integrator correction 2026-11-21 — reason: keep FS-QPDKN R168's hold.)*
22. As a delver in the town, I want no ability bar, so that the safe zone reads as safe.
23. As a delver, I want the level-up cue to rise over the bar, not under it, so that I read both.
24. As a delver who resizes the window, I want the bar to stay centred over the XP bar, so that it
    never drifts into the chat window or the corner row.
25. As a delver who reconnects, I want the bar to show the server's cooldowns at once, so that I
    see the truth, not a fresh square.
26. As the game designer, I want cooldowns read from the server, so that a retune never needs a
    client change to sweep correctly.
27. As FS-04EEA's implementer, I want the 3 square and its cost and cooldown fields ready, so that
    I only add the ability and its cast.
28. As the owner, I want the icons on a contact sheet before they are final, so that the bar fits
    the game's look.

## Acceptance Criteria

### game-service

- [ ] `current_player.ability_cooldown` is `{remaining, total}` for every delver with an ability,
      in every world: `{0, 0}` when ready; a warrior who dashes reads `total` 0.4 and `remaining`
      falling from 0.4 tick by tick to `{0, 0}`; an archer's Shadow Shot reads 1.2.
- [ ] With worn attack speed +50 % a dash's `total` is 0.4 / 1.5; removing the gear while it runs
      leaves `total` unchanged until it ends.
- [ ] A merc whose stance closes on nothing reads `remaining` equal to `parry_lockout` and `total`
      the lockout's starting length; `{0, 0}` once it ends.
- [ ] A delver who does not hold their tree ability has no `tree_ability_cooldown` and no
      `resource.tree_ability_cost`; one who holds it has both, with `tree_ability_cost` equal to
      the cost FS-04EEA's row is paid at (1 for Settle the Debt, the least it needs) and the
      cooldown as the first criterion's (Earthbreaker's `total` 10, Blink's 8, Arrow Rain's 12 at
      FS-04EEA's starting values; a mercenary's is the cut's slot, 0.25).
- [ ] No `other_players` entry carries `ability_cooldown` or `tree_ability_cooldown`.
- [ ] An unaffordable or refused cast starts no cooldown on the wire (FS-8AY7S R10 unchanged).
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.

### game-client

- [ ] The bar's layout module places three 44 × 44 squares, 10 apart, the row centred on `W / 2`,
      its lowest point 6 px above `xpBarFrame(view).piece.y`, at every width 1080 to 1280, clear
      of the chat window and the corner row (read from their layouts).
- [ ] The order is 1, right-click, 3; the plaques read "1", the right-mouse glyph, "3", taken from
      `RUN_ACTIONS`; no key text is typed in the bar's code.
- [ ] Each ability square shows its knockout icon; the cost numeral reads `ability_cost` /
      `tree_ability_cost` in the resource's channel colour; a 0 cost or no `resource` draws none.
- [ ] Right-click square greys exactly when unaffordable, `ability_cooldown.remaining > 0`, the
      client lockout runs, or `parryRefused`; lit otherwise.
- [ ] The sweep covers `remaining / total` from 12 o'clock, runs down between states, is corrected
      by the next state, never goes below 0, and is absent at `{0, 0}`; no seconds numeral.
- [ ] Active: the rim lit while `combat.aiming` (archer) or `parry_open` (merc); active and greyed
      together when the hold is unaffordable.
- [ ] Potion square: count 0 to 3 from `healthPotionCount`; greyed with a faint "0" at 0; always
      greyed in a field; no sweep, no cost.
- [ ] 3 square: padlock and a faint "Lv 10" while `tree_ability_cooldown` is absent; the class's
      tree icon, cost and sweep once it is present; greys by cost and cooldown.
- [ ] Hovering each square shows its tooltip copy (name, line; the locked and potion third lines);
      it hides on leave, on takedown and under a menu or panel; a greyed square still shows it and
      its icon does not brighten.
- [ ] A press on any square starts no attack, cast or hold.
- [ ] With the run's ESC menu or its confirm open, 1, 2 and 3 send no `drink_potion` and no cast;
      in a field, they pick the open menu's choices only.
- [ ] Shown in a run and a field from the first state; in a run, held from the first state that
      shows the player dead, escaped or left behind (spectating included) with every square
      greyed, no sweep, no active state, and the potion count and costs that state showed,
      unchanged by later states; down in a field while fallen, as the world leaves, and never in
      the hub; up exactly while the top-left bars are. *(Integrator correction 2026-11-21 — reason: keep FS-QPDKN R168's hold.)*
- [ ] The level-up cue's bottom stands 6 px over the bar's top while the bar is up, and at
      FS-77DVN's place when it is not.
- [ ] No ability card renders anywhere; `AbilityHud.ts` is gone, and `ABILITY_CARD_PLACE` is gone
      or kept only as the controls badge's anchor (R42). *(Integrator correction 2026-11-21 —
      reason: ADR-0084–0086 (UI scene) landed upstream.)*
- [ ] No potion cell renders at the top left; `PotionHud.ts`, `POTION_CELL_W` and
      `POTION_CELL_GAP` are gone, with the cell's place in `HUD_PLACES.run`; the top-left clearance
      tests still pass. *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene)
      landed upstream. Was: `POTION_HUD_X` too, which upstream already replaced by the slot's
      place.)*
- [ ] *(Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.)* The
      bar is a UI-scene HUD-slot piece: the run and the field send `hud` messages of kind `bar`
      (plain data, naming the world, null to take it down); the slot builds it at
      `HUD_PLACES.run` / `.field` and never in the hub; a `bar` message from a world that has left
      draws nothing; no world scene draws it, tests its rect or binds a key for it; the slot has no
      `ability` or `potion` kind left; a press on a square reaches no world; the tooltip draws at
      2200; the controls badge keeps its rect and stands exactly while the run's bar is up and live (not held) and the
      run has not ended.
- [ ] Re-placed and re-crispened on resize; knockouts rebuilt on a render-scale change.
- [ ] `PlayerState` types carry `ability_cooldown`, `tree_ability_cooldown` and
      `resource.tree_ability_cost`, all optional; an older server's state (none of them) draws the
      bar with no sweep and the 3 square locked, and nothing fails.
- [ ] The design guideline carries the "Ability bar" bullet, the cue note and the corner-row note;
      no dev-gallery card.
- [ ] The owner has approved the contact sheet (§K).
- [ ] No raw colour literal added; typecheck, lint, the token fence and
      `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Edge States

- **Before the first state:** no bar (no default squares).
- **World switch** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed
  upstream)*: the HUD slot takes the bar down as the world leaves; a `bar` message heard late from
  the world that left draws nothing (FS-TQZ5J § Change: Batch 6, R137); the next world's first
  state builds it fresh, its sweep included.
- **Missing `resource`:** no cost numerals, never greyed by cost; cooldowns and the lockout still
  grey.
- **Missing cooldown fields (older server):** no sweep; the right-click square greys by the
  client lockout; the 3 square stays locked.
- **`tree_ability_cost` present, `tree_ability_cooldown` absent:** locked (the cooldown's presence
  is the held signal); nothing fails.
- **Unknown `resource.kind`:** cost numerals in `hudText`.
- **A class with no copy or icon row:** an empty well with its plaque, no tooltip (R27).
- **Cooldown longer than the gap between states:** the sweep runs on with real time and the next
  state corrects it; it never jumps back up unless the server says so.
- **`total` 0 with `remaining` > 0** (should not happen): no sweep, greyed by `remaining`.
- **Gear swap mid-cooldown:** the sweep keeps its `total` (R3); the next cooldown takes the new
  length.
- **Floor change:** cooldowns carry with the body (server); the bar stays up.
- **Death, escape, left behind mid-cooldown:** the bar is held greyed with the held bars; the
  running cooldown's sweep is not drawn. **Fallen in a field:** the bar comes down with the bars.
  *(Integrator correction 2026-11-21 — reason: keep FS-QPDKN R168's hold.)*
- **Reconnect:** the next state's cooldowns are drawn at once.
- **Full health:** the potion square is not greyed; a drink at full health is refused silently
  as today (FS-P9G8R R5–R7), the Health bar explains it.
- **Potion drink cooldown:** not shown (R21); a press inside it is refused as today.
- **Exactly enough resource:** `current = cost` is lit.
- **Hold and cooldown together:** a Shadow Shot hold may begin while the cooldown runs (FS-JTNPR);
  the square is active, greyed and swept at once.
- **The ESC menu open:** the bar stays drawn under the menu; no tooltip; keys are the menu's.
- **The gear overlay open:** the bar lies under it; no tooltip where a panel covers the point.
- **Tooltip near the view's edge:** kept inside the view; never off-canvas.
- **Chat window unfolded:** the row stays clear of its right edge at every width.
- **Render scale 1:** icons pass ADR-0080's small-feature check on the contact sheet.
- **Specialization renames** (FS-E1ZDG, e.g. a plain name for a non-Shadow-Ranger archer): out of
  this FS; the copy table changes, the bar does not.

## WebSocket message surface

No HTTP endpoints change. Game-service owns the WebSocket contract (ADR-0004). No inbound action
changes.

**Outbound (server → client), state broadcast**

| Field | Change |
|---|---|
| `current_player.ability_cooldown` (new) | `{remaining: number, total: number}`, float seconds; `{0, 0}` when ready; the merc's is the whiff lockout |
| `current_player.tree_ability_cooldown` (new, optional) | same shape; present only while the tree ability is held |
| `current_player.resource.tree_ability_cost` (new, optional) | `int`; present only while the tree ability is held; rides wherever `resource` rides |
| `other_players[].ability_cooldown`, `other_players[].tree_ability_cooldown` | never sent |
| `resource.kind`, `current`, `max`, `ability_cost` | unchanged |

## Out of Scope

- The tree abilities themselves, their rows, numbers, effects and the key-3 cast (FS-04EEA).
- The skill tree, its nodes and how the tier-3 node is taken (FS-8RZ51).
- A potion cooldown on the wire or on the square.
- Click-to-cast, drag-to-rebind, or rebinding any key.
- A seconds numeral, a ready flash or sound on the squares.
- An active state on the 3 square (any FS-04EEA aim).
- More than three squares; a mana potion square.
- Drinking in a field or the hub (FS-P9G8R R3 stands).
- Any HUD in the hub.
- Specialization names or icons on the bar (FS-E1ZDG, FS-1J1CB).
- Teammates' cooldowns anywhere.
