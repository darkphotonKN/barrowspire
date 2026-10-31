---
id: I-WJGFJ-2
status: done
implements: FS-WJGFJ
blocked_by: [I-WJGFJ-1]
labels: [ready-for-agent]
title: "FS-WJGFJ slice 2: text rules and flood control on the chat relay (game-service)"
---
Implements FS-WJGFJ §Requirements A5–A7

**Author: agent, with the user's explicit authorisation on 2026-10-31, each choice discussed
first. Branch `feat/in-game-chat`.** Decisions with the user: the flood record is forgotten once
a speaker's 2 s window has passed (swept on each relayed line), rather than on disconnect, so it
holds only who spoke in the last 2 s and a quick reconnect cannot dodge the window; a run of
control characters becomes one space; notice copy "Too many words. Keep it under 200." / "Catch
your breath before you speak again."; invisible format characters (zero-width, bidi override)
are not filtered here, noted in FS-4HEG7 instead. A missing or non-string `text` is dropped like
an empty line (the gap code review noted on I-WJGFJ-1).

## What to Build

Between resolving the sender and stamping (slice 1), the relay normalises and limits the text.

- **Normalise** (R5): trim leading and trailing whitespace; replace every line break and other
  control character (`unicode.IsControl`) with a single space. Empty after trimming: drop with
  no notice and no delivery.
- **Length** (R5): more than **200 Unicode code points** (`utf8.RuneCountInString`, not bytes)
  after normalising → `chat_notice {code:"too_long"}` to the sender; no delivery.
- **Flood control** (R6): at most one message per player per **2 seconds**, across all
  channels, measured on this pod from the last *accepted* message (a refused message does not
  reset the window). Inside the window → `chat_notice {code:"too_fast"}`; no delivery, no
  queueing. State is per connected player on the hub (a map keyed by player id, cleared when
  the player's record goes); a clock seam so tests do not sleep.
- Notice copy (`text`) is lore-voiced and short; the client keys on `code`, so wording is free
  to change later.
- The order of checks: in-world → channel → normalise → empty → length → flood. A message that
  fails an earlier check never consumes the flood window.

## Acceptance Criteria

- [ ] `"  hello  "` is delivered as `"hello"`; `"a\nb\tc"` as `"a b c"`.
- [ ] `"   \n  "` is dropped: no notice, no delivery.
- [ ] 200 code points delivered; 201 refused with `too_long`, delivered to nobody. A 100-code-
      point, 300-byte CJK text is delivered.
- [ ] Two messages 1.9 s apart from one player: second refused with `too_fast`, first stands;
      2.1 s apart: both delivered. Two different players at the same instant: both delivered.
- [ ] A `too_long` refusal does not start the 2 s window: a valid message 0.1 s later is
      delivered.
- [ ] A `too_fast` refusal does not extend the window: the next message 2.1 s after the last
      accepted one is delivered.
- [ ] Flood state for a player is gone once their 2 s window has passed (amended with the user
      2026-10-31: swept on the next relayed line, not on disconnect).
- [ ] Tests pass.

## Blocked By

I-WJGFJ-1

## Spec Reference

FS-WJGFJ §Requirements A5 (text rules), A6 (flood control), A7 (notices: `too_long`,
`too_fast`); §User Stories 13, 20; §Edge States (empty / whitespace, 200 vs 201, emoji and CJK,
two messages inside 2 s).

## TDD Approach

- RED: a table of `(text, expect)` rows through the relay with an injected clock: trimmed,
  control characters, empty, 200, 201, CJK.
- GREEN: the normalise and length checks ahead of stamping.
- RED: a flood table advancing the fake clock 0.1 s, 1.9 s, 2.1 s; refusals not resetting it.
- GREEN: the per-player last-accepted map.
