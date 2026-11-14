---
id: I-TQZ5J-40
status: done
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J batch 4, slice 1: the town's mailbox (the envelope and the letter panel) moves into the UI scene"
---
Implements FS-TQZ5J §Change: Batch 4: the mailbox (R101–R110)

**Lane: AFK (agent).** game-client only.

## What to Build

- A mailbox slot on the UI scene (`uiSceneMailbox.ts`, its own file, as `uiSceneParty.ts` and
  `uiSceneGear.ts`): `MailboxHud` built for the town as it is reported, on the UI scene and its resident
  art, taken down as the town leaves and with the game (R101, R102, R110).
- Its wiring: refused under the town's `blockers().dialogue` and the menu slot; its opening closing the
  UI scene's gear overlay and party panel; the gear's last level; the UI scene's act and player
  (R102, R104, R109).
- The town builds no mailbox. Its `windows().letter`, `close: letter` and guards read the mailbox store
  (R103); the chat's `coveredAt` for the letter panel goes (R106).

## Acceptance Criteria

- [x] No world scene imports or builds `MailboxHud` (`mountMailbox`), `MailboxEnvelope` or `LetterPanel`,
      or tests the letter panel's rect.
- [x] The UI scene builds the mailbox for the town only, on itself, and takes it down as the town leaves
      and with the game; a town report standing keeps it.
- [x] The envelope's refusal (dialogue, menu) and opening (gear and party panel closed first,
      `mailbox_open` alone) as before.
- [x] Esc's order and every give-way rule (FS-3EBCA R15–R18) stand; the town's tests of them pass,
      moved onto the UI scene's mailbox wiring where they read the town's.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None.

## Spec Reference

FS-TQZ5J §Change: Batch 4: the mailbox (R101–R110); FS-1GZGD R33–R40, § Change; FS-J1672; FS-3EBCA
R9, R15–R18; FS-WDM0X S1–S9, M5, M10, O1.

## TDD Approach

- RED: the UI scene builds the mailbox for the town only and takes it down as the town leaves; its
  wiring refuses under a dialogue and the menu and closes the gear and the party panel on opening; the
  town's source mounts no mailbox.
- GREEN: `UiMailboxSlot`, the UI scene's `mountMailboxSlot`, `mountMailbox` taking the wiring whole, the
  town's store reader.
