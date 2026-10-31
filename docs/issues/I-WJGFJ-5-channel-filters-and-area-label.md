---
id: I-WJGFJ-5
status: open
implements: FS-WJGFJ
blocked_by: [I-WJGFJ-3]
labels: [blocked]
title: "FS-WJGFJ slice 5: channel filter row, area label and the guideline's umbra line (game-client)"
---
Implements FS-WJGFJ §Requirements C24–C25, C30

## What to Build

The row above the message area of the chat window (I-WJGFJ-3): five channel toggles and the
area label. Plus the one-line guideline amendment the whisper colour needs.

- **Filter row** (R24): toggles `Area · World · Party · Whisper · Trade`, each in its channel's
  colour, all on by default. A toggled-off channel is **hidden, not muted**: its lines keep
  entering the store and count toward the 100; toggling it back on shows them all again.
  Channels no server relays yet still appear, so the row's shape never changes later.
  Notices (system lines) are never hidden, even with every toggle off.
- **Persistence** (R24): the toggle state is written to `localStorage` on change and read back
  on load; every read and write is wrapped so a throwing or empty storage falls back to all-on
  and the toggles keep working for the session.
- **Area label** (R25): the row ends with where the player is, from the state broadcast's
  world identity, in the client's lore words: `Area: Town` (hub), `Area: Gentle Meadows` and
  `Area: Forlorn Forest` (those fields), `Area: the Spire` (a run). It names the player's place
  and does not narrow who hears them (ADR-0032).
- **Guideline** (R30): `game-client/docs/design-guideline.md` says umbra is narrow on purpose
  (Shadow Shot only). Add **one line** admitting whisper chat text in `umbraLight`, next to that
  rule, the way I-X2F2H-7 amended the guideline for field wildlife. No other guideline change.
- The row is canvas chrome: tokens only; the toggles are drawn, not DOM.

## Acceptance Criteria

- [ ] Five toggles render in the row, in order, each in its channel colour, all on at first
      load.
- [ ] Toggling Area off hides existing and new area lines; toggling it on shows them all; the
      store still holds them meanwhile and the 100 cap counts them.
- [ ] The toggle state survives a reload (read from localStorage); with storage throwing on
      read and write, all toggles are on and toggling still works for the session.
- [ ] With every toggle off, a `chat_notice` system line still shows.
- [ ] The label reads `Area: Town` in the hub, `Area: Gentle Meadows` / `Area: Forlorn Forest`
      in those fields, `Area: the Spire` in a run, and updates on a world switch.
- [ ] `design-guideline.md` carries one added line admitting whisper text in `umbraLight`; the
      diff touches nothing else in the guideline.
- [ ] The lint fence passes.
- [ ] Unit tests cover the filter logic (hide vs store), persistence fallback and the label
      mapping; tests pass.

## Blocked By

I-WJGFJ-3

## Spec Reference

FS-WJGFJ §Requirements C24 (channel filter), C25 (area label), C30 (colours, umbra widening);
§User Stories 10–12, 15; §Edge States (localStorage unavailable, world switch, handoff).

## TDD Approach

- RED: filter test: with `area` off, `visibleLines()` omits area lines while `lines` keeps
  them; notices always visible.
- GREEN: the filter state in the store and the visible selector.
- RED: persistence test with a storage stub that throws: state is all-on, toggling works.
- GREEN: the guarded read/write.
- RED: label test: world identity → label string for hub, each field, run.
- GREEN: the mapping and the row.
