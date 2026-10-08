---
id: I-77AB6-7
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-2]
labels: [ready-for-agent]
title: "FS-77AB6 slice 7: Monsters render, animate and wear level nameplates"
---
Implements FS-77AB6 §Requirements (Client presentation 34–37; State protocol 32)

**Domain:** game-client · **Touches `internal/game/session.go`:** no (client only). Appearance work: read `game-client/docs/design-guideline.md` ("Enemy design language", "Gameplay accent", "The readability floor") first; tokens only (ADR-0013).

## What to Build

The ghoul and troll that are already baked finally walk the barrow.

- `ClientGameState` gains `monsters?: MonsterState[]` matching FS §Requirements 32.
- `BarrowspireScene` creates/updates/removes monster sprites from state, keyed by `entity_id`:
  `ghoul` → `creature_ghoul_base`, `troll` → `creature_troll_base` (atlases `creatures-{0,1}`),
  8 directions from `facing`, idle/walk/attack/death from `action`, same projection, depth
  sorting and lighting as delvers (FS-2325V). Size tiers: fodder 0.85–1.0×, brute 1.3–1.5×.
- `action: dead` plays the death clip once and holds the last frame until the entity disappears
  from state.
- Nameplate `Name · Lv N` + HP bar as **hostile markers** (oxblood channel) through
  `src/render/markers/`, above light-map and vignette, below HUD, passing the 3:1 marker test;
  hidden once dead.
- Unknown archetype (e.g. `demon` before slice 8) falls back to a sensible sheet rather than
  crashing.

Can be built against a state fixture before I-77AB6-2 merges; integration needs it.

## Acceptance Criteria

- [ ] Ghouls and trolls render from their baked sheets in 8 directions, with idle/walk/attack/death driven by `facing` and `action`, at their size tier.
- [ ] Dead monsters play death once and stay until removed from state.
- [ ] Every living monster shows `Name · Lv N` and an HP bar meeting the marker-contrast test.
- [ ] Monsters absent from state are destroyed; reconnect renders all live monsters and corpses.
- [ ] Token fence passes; client tests pass.

## Blocked By

I-77AB6-2 (state shape)

## Spec Reference

FS-77AB6 §Requirements 32, 34–37; §Acceptance Criteria "Client" rows 1–2; §Edge States (reconnect); User Stories 8, 13, 22, 30.

## TDD Approach

- RED: scene test — a state with one `troll` (`facing` west, `action: move`) yields a sprite on the troll sheet playing walk-west, with a nameplate reading `Troll · Lv 3`.
- GREEN: monster view sync in the scene.
