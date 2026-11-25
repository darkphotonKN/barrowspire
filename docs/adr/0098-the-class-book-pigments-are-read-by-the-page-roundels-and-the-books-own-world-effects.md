# ADR-0098 — The class book pigments are read by the page roundels and the book's own world effects

Status: accepted
Date: 2026-11-25
Scope: `game-client`, the five book pigment tokens (`palette.bookPigment`, FS-X2CMM R45) and who
may read them.
Amends: [ADR-0094](0094-class-book-page-icons-are-muted-pigment-glyphs-in-bronze-rimmed-roundels.md) —
the Consequences clause "read only by the page-icon renderer"; its pigments, its
pigment-by-what-it-does rule and everything else stand (as amended by ADR-0095)
Realized by: [FS-X2CMM](../specs/X2CMM-class-books.md) §I, §J R49

## Context

ADR-0094 gave the class book five pigments (verdigris, ochre, madder, lapis, bone) and said the
page-icon renderer alone reads them, to keep the book the one coloured family on the canvas HUD.

The book does not stop at its roundels. A page's effect is drawn in the world, and the wave-1 build
drew it in the page's own pigment: the witchlight's ochre globe and pool, the rune's madder ring and
flash, tracker's eye's ochre ring, the hound's verdigris ring. Wave 2 added two more: the ochre wash
on a trap a page revealed, and the verdigris rings of the hound's bay. They are read through one
table, `palette.bookEffect`, never from the tokens. So the code has broken ADR-0094's
"read only by the page-icon renderer" since wave 1, and the design guideline now says both "nothing
else reads them" and names the wave-2 readers. The wave-2 code review found the contradiction.

The choice is between the rule and the build. Drawing a page's world effect in its own pigment ties
the cast to its icon: the player who pressed the ochre Witchlight sees ochre light land. Taking the
pigments off the world effects would cut that tie and leave those effects in borrowed hues that
mean something else (amber is "interactable", oxblood is health and danger).

## Decision

The book pigments are read by two things, and nothing else:

1. the page-icon renderer (the roundels in the book and on the cast bar), and
2. the class book's own world effects, through `palette.bookEffect` only: what a page leaves on the
   floor or on a body (the witchlight, the rune, tracker's eye, the hound and its bay, a revealed
   trap's wash). Each reads the pigment of the page that made it.

No other HUD element, creature, fixture or effect reads them. A world effect of the book that does
not come from a page's own colour (the draught, afloat, hardened, the Long Night) keeps the barrow
ramp, as built.

## Consequences

- **The book's colour follows its casts into the world,** and only its casts. The canvas HUD stays
  bronze apart from the roundels (ADR-0080, ADR-0094 unchanged there).
- **`palette.bookEffect` is the one door to the pigments outside the renderer.** A new world effect of
  a page adds its row there; a reader elsewhere is still wrong.
- **The design guideline's pigment paragraph says this**, replacing "Nothing else reads them".
- **A trap tinted ochre is the one place a book pigment touches a Spire fixture,** and only while a
  page's reveal holds. If revealed traps come to be revealed by something other than a page (the
  Cutthroats' tip reveals secret doors, not traps, FS-4EC7Z), that reveal's look is decided then.
