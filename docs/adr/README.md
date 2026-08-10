# Architecture Decision Records (ADR)

Immutable, append-only records of **constraints and non-obvious decisions** — the reasoning
behind a tradeoff, a technology choice, or a boundary, captured so it isn't relitigated later.
Written by the `record-decision` skill (or by hand in the same format).

**This README is the schema authority for what an ADR is.** Skills point here rather than
embedding a copy.

## Capability or decision?

The tiebreaker, because the two get confused constantly:

- *Can it be **done**?* → a capability → a thin line in `SPECIFICATION.md`, pointing at an FS.
- *Does it **hold**?* → a decision → an ADR here.

A compound statement — "does X, via Y" — splits: **X** to the spec, **Y** to an ADR.

## Numbering & format

- Files are `NNNN-short-slug.md` — zero-padded, sequential, allocated the same way as
  `docs/specs/`. **ADR and FS numbers are independent sequences**; ADR-0004 has nothing to do
  with FS-0004.
- Reference them as `ADR-NNNN` — from feature specs (`Related ADRs:` in the FS header), from
  issue bodies (`Implements ADR-NNNN` for ADR-mandated infrastructure), and from code comments
  where a non-obvious constraint is being honored.
- Sections: **Title**, **Status** (`proposed` | `accepted` | `superseded by ADR-N`),
  **Context**, **Decision**, **Consequences**, and a date.

## Rules

- **Check before architectural changes.** An architectural change should be consistent with the
  accepted ADRs, or explicitly supersede the one it contradicts.
- **Never retro-edit an accepted ADR.** To change a decision, write a new ADR that supersedes
  it, noting the superseding and superseded numbers in **both**. The old text stays wrong on
  purpose — it is the record of what was decided then, not a claim about now.
- **An ADR may be amended by a later ADR without being superseded.** When a follow-up decision
  replaces one clause and leaves the rest standing, say so in the original's header
  (`Amended by: ADR-NNNN — <which clause>`) and leave the body untouched.
- **Expect an ADR's tool interfaces to be guesses.** An ADR written before its toolchain is
  exercised will often name a filename, flag, or config format that turns out not to exist.
  Correcting the *mechanism* while preserving the *decision* is expected and needs no
  amendment — only a changed decision does.
