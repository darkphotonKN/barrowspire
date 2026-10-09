---
id: I-BDA7X-3
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-2]
labels: [ready-for-agent]
title: "FS-BDA7X slice 3: Client characters are server records and enter the HUB by id"
---
Implements FS-BDA7X §Requirements (Client 39–41)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent lane (frontend).

## What to Build

The client stops minting characters in localStorage.

- Character select / create / delete (`MainMenuScene`, `CharacterCreationScene`, `gameStore.ts`)
  go through the generated client (`list-my-characters`, `create-character`,
  `delete-character`). localStorage keeps only the active character id. No `"Hero"` fallback
  name; a 409 shows "name taken".
- One-time import (R40): local-only characters (client-minted `char_…` ids) are created on the
  server in slot order and replaced by the server record; a taken name is dropped with a visible
  notice; a network failure keeps the entry and retries next load.
- `enter_hub` sends `characterId` alongside today's fields (harmless to the current server, so
  this can merge before slice 4). A refusal reason from the server shows on the main menu (the
  existing `showRefusal` path).

Wording per `game-client/CLAUDE.md` lore voice; appearance per
`game-client/docs/design-guideline.md`.

## Acceptance Criteria

- [ ] Fresh member: empty list → character creation; created character appears after reload in
      another browser.
- [ ] Delete removes it server-side; it does not reappear on reload.
- [ ] Import: two local characters become server records once; a taken name shows a notice.
- [ ] `enter_hub` payload includes the active `characterId`.
- [ ] Store/unit tests cover import and the active-id persistence; existing scene tests green.

## Blocked By

I-BDA7X-2 (generated client for the character ops)

## Spec Reference

FS-BDA7X §Requirements 39–41; §Acceptance Criteria "Client" rows 1–2; §Edge States "fresh
member", "Local-only characters with a taken name". User Stories 1–7.

## TDD Approach

- RED: import test — a store with one `char_…` slot calls create once and swaps in the server id.
- GREEN: store rewrite over the generated client.
