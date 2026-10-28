---
id: I-NSV3D-2
status: open
implements: FS-NSV3D
blocked_by: [I-G4VMQ-2]
labels: [blocked]
title: "FS-NSV3D slice 2: delve NPC with Descend alone, Wait for company, and the queued state"
---
Implements FS-NSV3D §Requirements 1–7

**Author: agent**

## What to Build

The delve NPC's dialogue in `HubScene` offers a solo start beside the queue, and says so when
the delver is already queued.

- **Dialogue shape.** `NPC_DIALOGUE` entries go from `{line, accepts, declines?, accept}` to a
  line plus a list of choices `{label, act}`; the storekeeper keeps two (open pack / later),
  the delve NPC gets three, in this order: *Descend alone*, *Wait for company*, *Not yet*.
  *Wait for company* calls today's `joinQueue()` (`find_game`); *Not yet* dismisses. One
  rendering path for any number of choices (the existing option layout, keyboard confirm /
  dismiss semantics kept: Enter confirms the first actionable choice, ESC dismisses).
- **Descend alone** sends `start_solo` (`ActionType.StartSolo`, no payload) once and disables
  that choice until the server answers; the dialogue stays open meanwhile. No confirmation
  step.
- **Queued state.** When `HubScene`'s `queued` flag (I-G4VMQ-2) is set, opening the delve NPC's
  dialogue shows one line ("The delve is gathering. Wait, or leave the queue.") and a single
  dismiss; no solo or queue choice. The queue count is not shown here.
- **Refusal.** An error reply on `start_solo` (`socketManager.onError("start_solo", …)`,
  top-level `error` + `payload.message`) re-enables the choice and shows the message as a
  passing notice in the hub, in the same place and register a refused `leave_queue` uses
  (I-G4VMQ-2). `offError` in `release()`.
- **Success** is the ordinary `world_entered(run)`; nothing to add.
- `ActionType.StartSolo = "start_solo"` and `ActionMap.start_solo: Record<string, never>` in
  `src/assets/types/client.ts`.
- Copy per `game-client/CONTEXT.md` (lore voice); chrome per
  `game-client/docs/design-guideline.md` (amber for actionable choices, dialogue in the popup
  band).

## Acceptance Criteria

- [ ] The delve NPC's dialogue shows *Descend alone*, *Wait for company*, *Not yet*; the
      storekeeper's shows its two as before.
- [ ] *Wait for company* sends `find_game` exactly as *Descend* did.
- [ ] *Descend alone* sends one `start_solo`; a second press before the reply sends nothing.
- [ ] With `queued` set, the delve NPC's dialogue shows the queued line and a dismiss only; no
      `start_solo` or `find_game` can be sent from it.
- [ ] An error reply on `start_solo` re-enables the choice and shows the message as a passing
      notice.
- [ ] `release()` removes the `start_solo` listeners; a restart rebuilds cleanly.
- [ ] Unit tests cover: choices by state (idle / queued) as a pure function, the single send,
      the refusal re-enable, teardown.
- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint` pass.

## Blocked By

I-G4VMQ-2 (the `queued` flag and the passing-notice placement). End-to-end against a live
server needs I-NSV3D-1 (human lane); the client's unit work does not wait for it.

## Spec Reference

FS-NSV3D §Requirements 1, 2, 3, 4, 5, 6, 7; §User Stories 1, 2, 4, 5, 6, 13; §Edge States
"Dialogue".

## TDD Approach

- RED: a pure `delveChoices(queued: boolean)` (or equivalent) returns three choices when not
  queued and the queued line with a dismiss when queued; the scene sends `start_solo` once on
  *Descend alone* and re-enables after `onError`.
- GREEN: the choice-list dialogue shape, the delve entry, the pending flag, the listeners.
