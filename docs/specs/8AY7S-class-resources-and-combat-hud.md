# FS-8AY7S: Class resources and combat HUD

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Classes" → "Per-class resources" (supersedes "Every class's ability spends a shared mana pool"); `game-client/SPECIFICATION.md` "### Escape run" → "Health and class resource bars on the HUD", "Ability card on the HUD" (supersedes "Overhead health bar over one's own delver") → this FS · Siblings (same scoping session, 2026-10-30): [FS-MAMHR](MAMHR-mercenary-class.md) (parry charges are its resource), [FS-JTNPR](JTNPR-shadow-shot.md) (the archer's new ability, priced in stamina) · Interacts with: [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (`max_mana` affix), [FS-BDA7X](BDA7X-character-leveling.md) (class growth `MaxMana`, §Requirements 19 amended here), [FS-77AB6](77AB6-monsters-and-combat.md) (attack table `manaCost`), [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (resolved and spectating delvers) · Related ADRs: [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming is client presentation; resolved casts are server state; costs are paid on the resolved cast) · Vocabulary: game-service `CONTEXT.md` "Classes and abilities" (class resource, mana, stamina, parry charge, ability); game-client `CONTEXT.md` (ability card, resource bars)

## Summary

Every class gets a class resource of its own instead of the shared mana pool: the mage keeps
**mana** (a big pool that refills slowly), the warrior and archer get **stamina** (a small pool
that refills fast), and the mercenary's resource is **parry charges** (three pips that never
refill on their own). Only the class's right-click ability spends it; left-click attacks stay
free. In a run, the delver sees their own Health bar with their class resource bar under it at
the bottom left, and a card at the bottom right naming their ability and saying how it works,
greyed out when they cannot use it right now. Teammates show an overhead health bar; the
delver's own overhead bar goes away.

## Requirements

### The class resource (game-service)

1. **One generic resource component replaces `ManaComponent`.** It carries a **kind**, a
   **current** amount, a **max** and a **regen per second**. Every delver has exactly one.
   Monsters and other entities have none. *Charter default — reason: one regen system and one
   wire shape for three classes.*
2. **Kinds** are `mana`, `stamina` and `parry_charges`. The wire carries the same strings.
   (`parry_charges`, not `parry`: in game-service *parry* alone could mean the stance, and
   *charge* alone already means the warrior's dash in flight; see `CONTEXT.md` "Parry charge".)
3. **Class pools** (starting values, to tune):

   | Class | Kind | Max | Regen per second |
   |---|---|---|---|
   | `warrior` | stamina | 100 | 20 |
   | `archer` | stamina | 100 | 20 |
   | `mage` | mana | 150 | 4 |
   | `mercenary` (FS-MAMHR) | parry_charges | 3 | 0 |

   *Charter default — reason: stamina is a rhythm resource, mana a reserve; starting values to
   tune.* The parry-charges row is the kind and its shape only; the `mercenary` class itself,
   and how parry charges are gained and spent, belong to FS-MAMHR. *Charter default — reason:
   FS-MAMHR is specced concurrently and owns the parry mechanics; this FS owns the resource kind
   and how the HUD draws it.*
4. **Seating.** A delver is seated with a full stamina or mana pool (current = max, gear
   included, as mana is seated today). A parry-charges pool is seated at 0 of 3.
5. **Regen.** Each tick, a delver in play gains `regen per second × tick seconds` of their
   resource, stopping at max. Regen accrues exactly over time: at 30 Hz, 20/s is 2/3 per tick
   and 4/s is 2/15 per tick, and no fraction is lost to rounding. A pool with regen 0 never
   changes on its own. A delver who is not in play (dead, escaped, left behind) does not regen.
   *Charter default — reason: no mana regen exists today (confirmed 2026-10-30: nothing in
   game-service ever raises `CurrentMana` after seating), so this FS adds it; it is the same
   system for every kind.*
6. **The pool never leaves 0..max.** Nothing pushes current below 0 or above max.
7. The pool carries across floor changes unchanged (same body, in place) and is rebuilt at full
   (or at 0 for parry charges) only when a delver is seated in a new world.

### What abilities cost (game-service)

8. **Only abilities cost.** Left-click attacks (`slash`, `arrow`, `fireball`) and monster
   strikes cost 0, as today.
9. **Ability costs** (starting values, to tune). The attack table's `manaCost` becomes a plain
   **cost**: an amount of the caster's own class resource, whatever its kind.

   | Ability (attack row) | Class | Cost |
   |---|---|---|
   | `dash` | warrior | 25 stamina |
   | `triple_fireball` | mage | 15 mana |
   | Shadow Shot (FS-JTNPR's row) | archer | 40 stamina |
   | `triple_arrow` (until FS-JTNPR replaces it) | archer | 10 stamina |

   *Charter default — reason: about 4 dashes back to back, about 10 volleys, 2 heavy shots.*
   Shadow Shot's row, damage and behaviour are FS-JTNPR's; only its cost is set here.
   `triple_arrow` keeps its current number (10) and is now paid in stamina, because this FS does
   not retune an ability that FS-JTNPR is removing. The parry stance's cost is FS-MAMHR's.
10. **A cast is affordable when current ≥ cost.** An unaffordable cast does nothing at all: no
    effect, no cost, no cooldown, no message back, exactly as an unaffordable mana cast today.
    An affordable cast that resolves subtracts its cost once. A cast that resolves to nothing
    (a targeted strike with nothing in reach, today's rule) costs nothing, as today.
11. Costs are paid on the **resolved cast** only (ADR-0030). Nothing about aiming or holding
    before a cast reaches game-service. For Shadow Shot, affordability is judged on the tick its
    release arrives.
12. **Each class names its ability** in its class config (the attack row its right-click
    resolves to: `warrior` → `dash`, `mage` → `triple_fireball`, `archer` → `triple_arrow`
    until FS-JTNPR switches it to Shadow Shot). The server uses this only to tell the delver
    what their own ability costs (Requirement 17); it does not refuse other skills by class
    (Out of Scope).

### Gear and level growth (game-service)

13. **The `max_mana` affix raises the max of whichever pool the class has, if that pool is mana
    or stamina.** The affix id and its item text stay `max_mana` / "+ maximum mana"; nothing
    changes in items-service. The existing rule holds: gaining max never raises current except
    on the seating gear pass, losing max lowers current to the new max, a pool at 0 is not
    raised. *Charter default — reason: no items-service change, and the gear the warrior and
    archer already have stays useful.*
14. **A parry-charges pool ignores `max_mana`.** Its max is always 3.
15. **Stamina does not grow with level.** `ClassGrowth.MaxMana` stays for the mage only (+10 per
    level) and is 0 for warrior and archer. Growth is applied to the pool only when its kind is
    mana, both when seating at a level and on a level-up during a run. This amends FS-BDA7X
    §Requirements 19's Max MP column for warrior (+2 → —) and archer (+5 → —). *Charter default
    — reason: level growth would wear away the cost tuning.*

### The wire (game-service → game-client)

16. **`current_mana` and `max_mana` leave the player state** for every player.
17. **`current_player` gains `resource`**: `{kind, current, max, ability_cost}`. `current` and
    `max` are whole numbers; `current` is the pool rounded **down**, so a client comparing
    `current ≥ ability_cost` reaches the same answer the server does. `ability_cost` is the cost
    of the delver's own ability (Requirement 12) in that pool, so the client never mirrors the
    server's tuning. *Charter default (resource on `current_player` only) — reason: the HUD
    needs nothing more.* `ability_cost` is this FS's addition to the charter's "resource fields":
    without it the client would have to copy the cost table and drift from it on every retune.
18. **`other_players` carry no resource**, only health (`current_health`, `max_health`, as today).
    *Charter default — reason: teammates send health only; the HUD needs nothing more.*
19. `resource` is sent on `current_player` in the hub too (the hub draws none of it; see 25).
    A resolved delver still receives `current_player` with `resource` (their HUD hides it; see 24).

### HUD: health and class resource bars (game-client)

20. **Bottom left, own delver only, in a run:** a Health bar, and the class resource bar
    directly below it.
21. Each bar is labelled in the HUD serif (EB Garamond, `var(--font-body)`'s canvas counterpart;
    never blackletter, per the guideline's blackletter bound) with the resource's **own name**:
    "Health:", then "Mana:", "Stamina:" or "Parry:". The label comes from `resource.kind`
    (`mana` → "Mana:", `stamina` → "Stamina:", `parry_charges` → "Parry:"), never from a class
    table.
22. Health and mana/stamina bars fill by `current / max`. A **`parry_charges`** resource is drawn
    as **3 pips** (one per charge, lit for each charge held), never as a continuous bar.
    *Charter default — reason: the mercenary's resource is discrete; FS-MAMHR fills it.*
23. Colours, sizes, panel chrome and exact placement are the client implementer's call under
    `game-client/docs/design-guideline.md` (game palette from `BARROW_HEX`, vellum labels,
    brass frame, health in its oxblood channel, the mana and stamina bars distinct from health
    and from each other). The implementer may move `ProgressHud` or adjust the party panel to
    avoid a collision. *Charter default — reason: art delegation.*
24. **Hidden while the delver is out of the delve** (dead, left behind, escaped), which includes
    every moment they spectate (FS-QPDKN). They return only in a new run. *Charter default
    (dead or spectating) — reason: a dead delver's bars are noise.* Escaped is folded in
    because an escaped delver is out of the delve the same way (`resolved()` in `ui/party.ts`).
25. **Not in the hub.** No bottom-left bars there.

### HUD: overhead bars (game-client)

26. **The delver's own overhead HP/MP bar is removed** in a run. The bottom-left bars replace it.
27. **Each teammate shows an overhead health bar** (health only, no resource) in a run, at the
    marker base as the own bar sits today, using the existing overhead-bar style and the
    readability floor. It is not drawn over a dead teammate's corpse (no marker base, as for
    the own bar today). Today teammates show no overhead bar at all.
28. **Not in the hub**: no overhead health bars over anyone there. Monsters' bars are unchanged.

### HUD: ability card (game-client)

29. **Bottom right, in a run:** a card naming the delver's class ability, showing the
    right-mouse glyph, and one line on how it works. Fired with right-click, as today.
30. **Starting copy** (grim, terse, the guideline's voice; the implementer may tune wording but
    not the facts):

    | Class | Name | How it works |
    |---|---|---|
    | `warrior` | Dash | Charge a short way toward the cursor. |
    | `mage` | Triple Fireball | Hurl three fireballs in a spread toward the cursor. |
    | `archer` | Triple Arrow | Loose three arrows in a spread toward the cursor. |

    FS-JTNPR replaces the archer row with Shadow Shot; FS-MAMHR adds the mercenary row. The card
    is keyed by `current_player.class`. A class with no row shows no card.
31. **Greyed out while the ability cannot fire:** when `resource.current < resource.ability_cost`,
    or while the client's own cast lockout after a right-click is running (the existing
    `canCastSkill` window). The cooldown state is client presentation only; no cooldown travels
    on the wire. **No cooldown sweep** in v1. *Charter default — reason: smaller v1.*
32. Hidden while the delver is out of the delve (as Requirement 24) and not shown in the hub.
    The dead spectator's leave button (FS-QPDKN) also sits bottom right; the card is hidden
    whenever that button is up, so they never overlap.
33. The client's "10 MP" comments in the right-click branch (`BarrowspireScene.ts`) go.

## User Stories

1. As a mage, I want my mana to refill slowly over the run, so that my volleys come back if I
   pace myself.
2. As a warrior, I want stamina that refills in seconds, so that dashing is a rhythm rather than
   a hoard.
3. As an archer, I want my ability priced in stamina, so that I play it like the warrior plays
   dash, in short bursts.
4. As a mercenary, I want my resource to be parry charges, so that my ability's fuel is earned
   by timing, not waiting.
5. As any delver, I want left-click to stay free, so that I can always fight back.
6. As a delver, I want an ability I cannot afford to do nothing, so that I never lose resource
   or cooldown on a failed press.
7. As a delver, I want my Health and class resource at the bottom left, so that I can read them
   without looking at my own head.
8. As a delver, I want the resource bar to say its own name ("Mana:", "Stamina:", "Parry:"), so
   that I know what I am spending.
9. As a mercenary, I want my parry charges drawn as three pips, so that I can count them at a
   glance and know when a riposte is ready.
10. As a delver, I want a card naming my ability and saying what it does, so that a new class is
    readable without a manual.
11. As a delver, I want the card to grey out when I cannot afford the ability, so that a refused
    press is never a surprise.
12. As a delver, I want the card to grey out for a moment after I fire, so that I can see the
    ability is not ready yet.
13. As a delver in a party, I want a health bar over each teammate, so that I can see who is in
    trouble.
14. As a delver, I want no bar over my own head, so that my own figure is not cluttered when the
    HUD already shows it.
15. As a delver who has died, I want the bars and the ability card gone while I spectate, so that
    the screen shows the teammate I am watching, not my empty pools.
16. As a delver in the hub, I want no combat HUD, so that the safe zone reads as safe.
17. As a warrior or archer wearing `max_mana` gear, I want it to raise my stamina, so that the
    gear I already own stays useful.
18. As a mage, I want my mana to keep growing with level, so that levelling still feeds my
    reserve.
19. As a warrior or archer, I want my stamina pool to stay the same size as I level, so that the
    ability costs keep their feel.
20. As a mage taking off `max_mana` gear, I want my mana capped to the new max, so that I never
    hold more than my pool.
21. As a delver climbing a floor, I want my resource to carry over as it was, so that a floor
    change is not a free refill.
22. As a delver who reconnects, I want my bars to show the server's numbers at once, so that I
    see the truth, not a default.
23. As an archer aiming Shadow Shot, I want the card to show if I can afford it while I hold, so
    that I do not release into nothing.
24. As a server, I want one regen system and one resource shape for every class, so that adding
    a class adds a row, not a system.
25. As a server, I want to send resource numbers only to their owner, so that each broadcast
    carries only what someone draws.
26. As a client, I want the ability's cost from the server, so that a retune never needs a
    client change to grey the card correctly.
27. As FS-MAMHR's implementer, I want a parry-charges kind with max 3 and no regen ready, so that
    I only add the mechanics that fill and spend it.
28. As FS-JTNPR's implementer, I want Shadow Shot's cost set and paid from stamina by the shared
    rule, so that I only add the attack row.

## Acceptance Criteria

### game-service

- [ ] `ManaComponent` and `ComponentTypeMana` are gone; every delver carries one resource
      component with kind, current, max and regen per second; monsters carry none.
- [ ] A seated warrior and archer have stamina 100/100, regen 20/s; a seated mage has mana
      150/150, regen 4/s (level 1, no gear).
- [ ] A parry-charges pool (max 3, regen 0) on a test delver is seated at 0 and never changes
      across ticks on its own.
- [ ] A warrior at 0 stamina reads 20 on the wire after exactly 30 ticks (1 s at 30 Hz) and 100
      after 150 ticks; a mage at 0 mana reads 4 after 30 ticks; neither passes max (float drift
      must never show 19 after a full second).
- [ ] A dead (or escaped, or left-behind) delver's pool does not regen.
- [ ] `dash` costs 25 stamina, `triple_fireball` 15 mana, `triple_arrow` 10 stamina; `slash`,
      `arrow`, `fireball` cost 0.
- [ ] A warrior with 24 stamina casts `dash`: nothing happens; stamina stays 24, no cooldown is
      set. With 25: the dash starts, exactly 25 is subtracted, the cooldown is set.
- [ ] A warrior at full stamina can dash 4 times back to back (cooldown permitting) and is
      refused the 5th until regen covers it.
- [ ] A worn `max_mana` +10 raises a warrior's and an archer's stamina max to 110 and a mage's
      mana max to 160; removing it brings them back, lowering current to the new max.
- [ ] A worn `max_mana` affix leaves a parry-charges pool at max 3.
- [ ] A mage seated at level 5 has mana max 150 + 4 × 10 = 190; a warrior seated at level 5 has
      stamina max 100; a mage levelling up in a run gains +10 mana max, a warrior gains none.
- [ ] Class growth for warrior and archer has `MaxMana` 0.
- [ ] The broadcast's `current_player` carries `resource {kind, current, max, ability_cost}`
      with whole numbers and `current` rounded down; a warrior's `ability_cost` is 25, a mage's
      15, an archer's 10 (until FS-JTNPR).
- [ ] No player in `other_players` carries `resource`, `current_mana` or `max_mana`;
      `current_player` carries neither `current_mana` nor `max_mana`; `current_health` and
      `max_health` are unchanged for everyone.
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.

### game-client

- [ ] In a run, the bottom left shows "Health:" with a bar and, below it, "Mana:" (mage) or
      "Stamina:" (warrior, archer), each filling by current / max from the broadcast.
- [ ] A state whose `resource.kind` is `parry_charges` draws 3 pips, lit per charge (0, 1, 2, 3
      all render correctly), labelled "Parry:".
- [ ] The own delver has no overhead bar in a run.
- [ ] Each living teammate has an overhead health-only bar in a run; a dead teammate has none.
- [ ] In the hub: no bottom-left bars, no ability card, no overhead health bars.
- [ ] The ability card at the bottom right shows the class's ability name, the right-mouse
      glyph and its line, keyed by class.
- [ ] The card greys when `resource.current < resource.ability_cost` and when the client's own
      post-cast lockout is running; it is lit otherwise. No cooldown sweep is drawn.
- [ ] Bars and card hide when the delver dies, escapes or is left behind, stay hidden while
      they spectate, and do not overlap the dead spectator's leave button.
- [ ] Nothing collides on the HUD with `ProgressHud`, the party panel, or the spectate HUD at
      the run's usual resolutions; the layout follows the design guideline.
- [ ] `PlayerState` types carry `resource` and no longer carry `current_mana` / `max_mana`; the
      "10 MP" comments are gone.
- [ ] `npm test` and the lint / token fence green.

## Edge States

- **Unaffordable press:** the server ignores the cast (no cost, no cooldown, no reply). The card
  was already grey, so the refusal is never a surprise. The client still plays nothing new beyond
  what it plays today on a refused cast.
- **Exactly enough:** current = cost is affordable and leaves 0.
- **Regen at max:** stays at max; no overshoot from fractional accrual.
- **Fractional pool on the wire:** `current` is rounded down, so a pool at 24.9 shows 24 and a
  25-cost dash greys; the server agrees it is unaffordable.
- **Gear swap mid-run:** gaining max does not raise current; losing max lowers current to the
  new max; a pool at 0 stays 0.
- **Level-up mid-run:** a mage's max rises by 10, current does not; a warrior's or archer's
  stamina does not change.
- **Floor change:** pool carried as it was, regen continues on the new floor.
- **Death:** pool stops regenerating; bars and card hide. Parry charges are lost on death by
  FS-MAMHR's rule, which this FS does not repeat.
- **Escape / left behind:** as death for the HUD; pool frozen.
- **Spectating (FS-QPDKN):** the dead delver sees no bars and no card of their own; the watched
  teammate's numbers are not shown (they are not on the wire).
- **Reconnect:** the client draws whatever `current_player.resource` the next broadcast carries;
  no default value is drawn before it arrives (the bars wait for the first state).
- **Missing `resource`** (an older server during rollout): the client draws no resource bar and
  the card is never greyed by cost; nothing crashes.
- **Unknown `resource.kind`:** the client draws a continuous bar with no label rather than
  failing.
- **Class with no card row** (a class added without copy): no card.
- **Modded client casting another class's skill:** paid from the caster's own pool at that row's
  cost (no class gating; Out of Scope).
- **Parry stance (FS-MAMHR):** its cost is FS-MAMHR's; if it is 0 the card never greys by cost.
  Greying during the whiff lockout, if wanted, is FS-MAMHR's.
- **Shadow Shot hold (FS-JTNPR):** the card reflects affordability during the hold; a release
  with too little stamina is refused on the server by Requirement 10.

## WebSocket message surface

No HTTP endpoints change. Game-service owns the WebSocket contract (ADR-0004). No inbound action
changes.

**Outbound (server → client), state broadcast**

| Field | Change |
|---|---|
| `current_player.current_mana`, `current_player.max_mana` | removed |
| `other_players[].current_mana`, `other_players[].max_mana` | removed |
| `current_player.resource` (new) | `{kind: "mana" \| "stamina" \| "parry_charges", current: int, max: int, ability_cost: int}`; `current` rounded down |
| `other_players[].resource` | never sent |
| `current_health`, `max_health` (all players) | unchanged |

## Out of Scope

- The mercenary class, the parry stance, gaining and spending parry charges, the riposte, and
  the whiff lockout (FS-MAMHR).
- Shadow Shot's attack row, projectile, hold-to-aim and card copy (FS-JTNPR).
- Refusing a skill because it is not the caster's class's (class gating of `cast_skill`).
- A cooldown sweep or any cooldown on the wire.
- Showing a teammate's resource anywhere.
- Mana potions or any consumable that restores a resource (`ManaAmount` is not applied by any
  system today and stays so).
- Renaming the `max_mana` affix or its item text; any items-service change.
- Retuning `triple_arrow` beyond moving its cost to stamina.
- Any HUD in the hub; the class-select screen.
- Resource numbers on the card (the cost or the pool is not printed on it).
