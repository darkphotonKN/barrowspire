---
id: I-5SH4G-3
status: open
implements: FS-5SH4G
blocked_by: []
labels: [ready-for-agent]
title: "FS-5SH4G slice 3: World is selectable in the chat picker (game-client)"
---
Implements FS-5SH4G §Requirements C14–C16

## What to Build

Open the `world` channel on the client. FS-WJGFJ already drew the World tab, the colour, the
`#` prefix handling and the picker; only the gate moves.

- `CHAT_OPEN_CHANNELS` (`src/ui/chatInput.ts`) gains `world`, so the picker's `World` option is
  enabled, picking it writes `#`, typing `#` first picks it, and deleting the prefix returns to
  Area (C14). A sent line carries `channel: "world"` and the text without the prefix.
- A received world line draws in `palette.chatWorld`, hides with the World tab, and keeps its
  own 100-line buffer, as built (C15). `scope: "world"` is carried and unused (C16).
- No new screen, no new copy.

## Acceptance Criteria

- [ ] `World` is pickable; `pick("world")` writes `#` at the start of the draft; typing `#hi`
      picks World; deleting the `#` returns to Area.
- [ ] Enter on `#hello everyone` sends `{ channel: "world", text: "hello everyone" }`.
- [ ] A received world line renders in `palette.chatWorld` and is hidden when the World tab is
      off (existing tests still hold with `world` open).
- [ ] Party, whisper and trade stay disabled in the picker and their prefixes stay plain text.
- [ ] Tests pass; typecheck and lint clean.

## Blocked By

None. End-to-end needs I-5SH4G-2; the unit tests drive `ChatInput` with `world` open.

## Spec Reference

FS-5SH4G §Requirements C14 (picker and prefix), C15 (colour, tab, buffer), C16 (scope unused);
§User Stories 3, 4, 7; §Acceptance Criteria client.

## TDD Approach

- RED: `chatInput.test.ts`: with the real `CHAT_OPEN_CHANNELS`, `pick("world")` writes `#` and
  Enter sends on world; `pick("whisper")` still falls back to Area.
- GREEN: add `world` to the set.
