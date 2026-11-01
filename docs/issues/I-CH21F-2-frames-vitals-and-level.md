---
id: I-CH21F-2
status: in-progress
implements: FS-CH21F
blocked_by: []
labels: [ready-for-agent]
title: "FS-CH21F slice 2: same-world teammates' health, resource and level in the party frames, hub included (game-client)"
---
Implements FS-CH21F §Requirements R8–R12

**Lane: agent (AFK).** Built against FS-CH21F's wire; teammates' resource bars fill once I-CH21F-1 lands (until then they stand empty, as today). Health in the hub already flows.

## What to Build

- Lift the hub refusal in `partyFramesLayout.ts` `slotOf` (`world !== "hub"`): a teammate listed in this world's `other_players` with health shows a health bar and a resource bar in every world.
- The resource bar uses the HUD's kind colours and parry pips via `ui/resources.ts` (`resourceBar`); absent `resource` → empty bar.
- "Lv N" after a same-world teammate's name, from the broadcast `level`. Not on the player's own row, not on teammates elsewhere. A long name is shortened short of the level and the Travel button.
- Teammates elsewhere: name and bust only (FS-NCC9J R25 unchanged); away stays greyed.
- Decided from this world's state alone, never from `where` / `pod_id`.
- Update the stale comments that say resource is `current_player`-only (`types/gameState.ts`) and that the hub has no bars.

## Acceptance Criteria

- [ ] A same-world teammate in the **hub** gets a bars slot with health, resource and level; likewise in a field and a run.
- [ ] A teammate not in `other_players` gets name and bust only, no level, no bars.
- [ ] Resource colours by kind; parry charges as pips; no `resource` → empty bar.
- [ ] The player's own row shows no level; a long name shortens short of the level and the Travel button.
- [ ] `vitest` green; lint fence passes.

## Blocked By

None (server: I-CH21F-1 for teammates' `resource`)

## Spec Reference

FS-CH21F §Requirements R8–R12; §User Stories 1–9, 22; §Acceptance Criteria (client frames rows); §Edge States (other pod/world, dead in a run, fallen in a field, away teammate).

## Files expected to touch (game-client/src)

- `ui/partyFramesLayout.ts` (+ `ui/partyFramesLayout.test.ts`): `slotOf`, `SeenPlayer` gains `level`, row level, name shortening
- `ui/PartyFrames.ts` (+ `ui/PartyFrames.test.ts`): draw "Lv N"
- `types/gameState.ts`: comments on `resource` / parry fields
- `ui/resources.ts` only if the frames need a helper it lacks

## TDD Approach

- RED: `partyFrameRows` in the hub with a listed teammate returns a bars slot (today `none`), with level.
- GREEN: drop the hub test from `slotOf`; carry `level` into the row; render it in `PartyFrames`.

## Charter run (2026-11-02)

Built by a /develop child, reviewed on two axes: ready to merge. Open LOWs: name-plus-level
fitting inline in `drawFrames`; with Travel and a level on the leader's row at once (only briefly,
after a handoff) a one-glyph name can push the level into the button; prettier rewrapped some
unrelated lines.

## Browser check (pending)

In the village with a teammate on the same pod: their frame shows health, resource (coloured by
kind) and "Lv N"; a teammate on another pod shows name and bust only; a long name is shortened.
