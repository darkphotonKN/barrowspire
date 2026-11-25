---
id: I-X2CMM-25
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-23", "I-X2CMM-24"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 25: the open tome, a two-page vellum spread replacing the book's grid and tip"
---
Implements FS-X2CMM §Change: Illuminated pages and the open tome (C3–C7, C9)

**Author: agent**

**Styling only: no `/code-review` gate** (the owner's standing art rule; FS §Change says so).

## What to Build

Replace the class book's dark window with a grid and a hover tip (`ClassBookPanel.ts`,
`classBookLayout.ts`, `classBookStyle.ts`) with the open tome. Casting, the bridge
(`uiSceneBook.ts` `pick`), the wire and the server stay untouched.

- **Spread:** a dark leather border round a two-page vellum spread with a gutter shadow at the
  spine (new tokens for leather, vellum edge, vellum middle, gutter, ink, muted brown,
  madder-brown title). At one side of the screen, clear of the ability bar, corner row and chat
  at 1080 logical wide.
- **Left page:** title in madder-brown over a hairline rule; one row per offered page in book
  order: 28 px `PageRoundel`, the name in dark ink, the cost right-aligned in muted brown; a locked
  row at about 55 % with "Lv N"; a spent row shows "spent"; the hovered row a soft `vellumDark`
  wash. The empty-book line when no page is offered.
- **Right page:** the hovered page in full (64 px roundel, name in madder-brown, its line and a
  Scar's earned-where line, "cost · cast time · cooldown" with the cooldown words from the wire's
  `cooldown_length`/`limit` (I-X2CMM-23), an italic hint by target kind or the reason it waits).
  No hover: the first ready page, else blank. The old hover tip goes.
- **Clicking a row** goes through the same `BookWiring.pick` as a roundel click did.
- **C7:** a state-only change redraws rows and the right page in place, never rebuilding the panel
  or its roundel textures (rebuild only when the title, the page ids or the empty state change).
  Test it.
- K, the corner icon, Esc, × and stepping aside are unchanged; keep their tests green.
- Take a screenshot of the panel in a run for the report: render it headless as slice 9 rendered
  the contact sheet (a dev gallery card of the open tome with a sample book is the easiest
  target), save it to `docs/art/class-book-open-tome.png`.

## Acceptance Criteria

- [ ] The open tome draws as described; rows arm or cast as before.
- [ ] Hover fills the right page; no hover shows the first ready page or blank.
- [ ] A state-only change does not rebuild the panel (test).
- [ ] `docs/art/class-book-open-tome.png` exists.
- [ ] Client suites green.

## Blocked By

I-X2CMM-23, I-X2CMM-24

## Spec Reference

FS-X2CMM §Change: Illuminated pages and the open tome, C3–C7, C9.
