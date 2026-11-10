# ADR-0072 — Items are held per character and owned per account

Status: accepted
Date: 2026-11-10
Scope: `game-server/items-service` (the item and loadout model), the services that read or write a
member's gear (`game-service`, `api-gateway`, `game-client`). Specified by
[FS-50MTX](../specs/50MTX-per-character-gear.md).
Builds on: [ADR-0032](0032-run-gear-is-checked-out-synchronously-to-in-run-not-escrowed-by-a-saga.md)
(a member is in one world at a time, so the next checkout reclaims orphans),
[ADR-0065](0065-only-items-in-the-stash-can-be-listed.md) (only stash items can be listed)

## Context

Recorded without adversarial review. Decided by the owner on 2026-11-10.

Every character on an account wore the same gear and carried the same bag. `player_loadouts` was
unique on `member_id`, and `item_instances` knew only `owner_member_id`. The `character_id` columns
added by migration 019 were never read or written.

Account-wide gear was never decided. It fell out of a one-player-per-account schema that predates
multiple characters, and FS-BDA7X and FS-VPD8Y only recorded it as how things were ("per member,
not per character, today"; "charter default"). No ADR chose it.

Two forces pull apart. Characters must be distinct, so what one wears and carries cannot be what
another wears and carries. But several flows have an account in hand and no character: a purchase,
a mailbox grant, a marketplace listing.

## Decision

Holding and owning are separate relationships.

- **A character holds its loadout and its bag.**
- **The account owns every item.** Ownership is what auth, locks and the marketplace act on.
- **The stash belongs to the account, not to any character.**

Rejected:

1. **Gear stays account-wide.** Characters are then not distinct.
2. **Characters own their items.** Purchases, mailbox grants and listings have no character to
   attach to.

## Consequences

- Every item query must be clear about which relationship it means: owned by this account, or held
  by this character.
- Character-scoped calls must check that the character belongs to the caller. A character id now
  arrives from the client, and without the check one player could write to another's character.
- The stash is the path for moving items between an account's characters. There is no direct
  character-to-character transfer.
- The per-account lock stays. It is what serializes two characters of one account reaching for the
  same stash item.
- A held item whose character is deleted has no way back until something moves it. FS-50MTX leaves
  that open.
