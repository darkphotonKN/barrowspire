---
id: I-CH21F-4
status: in-progress
implements: FS-CH21F
blocked_by: []
labels: [ready-for-agent]
title: "FS-CH21F slice 4: the player's own level in their own party frame (game-client)"
---
Implements FS-CH21F §Requirements R10 (amended 2026-11-02)

**Lane: agent (AFK).** Amendment slice. Nick (2026-11-02): "左側組隊ui沒顯示自己的等級". The
state already carries `current_player.level`; no server change.

## What to Build

- The player's own row in `partyFrameRows` carries `level` from `seen.current_player?.level` when
  the state carries it, in every world where the frames show (hub, field, run).
- `PartyFrames` draws the own row's "Lv N" exactly as it draws a teammate's (same text, same place
  after the name, same shortening of a long name short of the level and the Travel button).
- Teammates' rules unchanged: level only while their slot holds bars; none for a teammate
  elsewhere or on another pod (R11).
- Update the `PartyMemberFrameRow.level` doc comment, which today says "never on the player's own
  row".

## Acceptance Criteria

- [ ] With `current_player.level` set, the own row has `level`, in the hub, a field and a run.
- [ ] With no `current_player` (before the first state) or no level on it, the own row has no `level`.
- [ ] `PartyFrames` draws "Lv N" after the player's own name, as for a teammate.
- [ ] A teammate elsewhere still has no level; a same-world teammate still has theirs.
- [ ] `vitest` green; `tsc --noEmit` clean; lint fence passes.

## Blocked By

None

## Spec Reference

FS-CH21F §Requirements R10 (amended), R11 (unchanged); §User Stories 8a; §Acceptance Criteria
(client frames: the player's own row shows "Lv N").

## Files expected to touch (game-client/src)

- `ui/partyFramesLayout.ts` (+ `ui/partyFramesLayout.test.ts`): self row carries `level`; doc comment
- `ui/PartyFrames.ts` (+ `ui/PartyFrames.test.ts`): only if the own row's level is not already drawn by the teammate path

## TDD Approach

- RED: `partyFrameRows` with `current_player.level` set returns a self row with that `level`
  (today absent); `PartyFrames` draws "Lv N" for the own row.
- GREEN: pass `seen.current_player?.level` into the self row.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: the player's own row shows Lv N.
