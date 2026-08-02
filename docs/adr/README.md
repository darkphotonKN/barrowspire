# Architecture Decision Records (ADR)

Immutable, append-only records of non-obvious decisions — tradeoffs, tech choices, boundaries —
in **Nygard format**. Written by `/record-decision`. This README is the **schema authority** for
what an ADR is; skills point here rather than embedding a copy.

## Rule

- **Before any architectural change, check existing ADRs** for a constraint that already governs it.
- **Never edit a shipped ADR.** Supersede it with a new one, noting the superseded/superseding
  numbers in both.

## Numbering & format

- Files: `NNNN-short-slug.md` — zero-padded, sequential, allocated the same way as `docs/specs/`.
- Reference as `ADR-NNNN`.
- Sections: **Title**, **Status** (Proposed | Accepted | Superseded by ADR-N), **Context**,
  **Decision**, **Consequences**.
