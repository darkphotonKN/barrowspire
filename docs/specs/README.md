# Feature Specs (FS-NNNN)

Tier-2 detailed specs for our **two-tier spec system**.

## The two tiers

- **Tier 1 — `SPECIFICATION.md`** (thin, living, always-loaded): the current truth of what the system does. One line per capability, grouped by bounded context, each with a status checkbox and a pointer to its feature spec, e.g.
  `- [x] Drag-reorder in tree view → FS-0042`
  Hard budget ~200–300 lines. When a section bloats past budget, that signals a bounded context wants its own file — the spec does not grow. (In a multi-service repo, specs are per-service under `<service>/SPECIFICATION.md`; the feature specs in this folder are the shared, globally-numbered work orders.)
- **Tier 2 — feature specs (this folder)** (deep, write-once, loaded only when working that feature).

## Thin line format (tier-1 authority)

A thin line is a **capability name and an address — nothing more.**

- No UI detail, no defaults, no interaction rules, no visual description, no field lists.
- **The survival test:** the line must survive unchanged even if every design detail of the
  feature changes. If a redesign would force editing the line, the line is fat.
- **Trust the hop.** Detail is not lost by compressing the line — it lives in the FS one
  pointer away. The line moves detail to where readers pay for it on demand instead of on
  every load of the index.
- Sections are **bounded contexts** (`## Boards`, `## Tools`, `## Onboarding`), NEVER status
  headers (`### Planned`, `### Implemented`). Status lives in the checkbox only: `[x]`
  shipped, `[ ]` not.
- Length guide: if the line wraps, it's carrying FS content.

```
GOOD  - [ ] Welcome splash for logged-out users → FS-0001
GOOD  - [ ] Rebindable tool keybinds → FS-0002
FAT   - [ ] Welcome splash (logged-out only): light white / dark-purple landing
        with a hero (logo + tagline), a feature-highlights row, and Sign up /
        Start creating / Log in CTAs; logged-in users skip it → FS-0001
        (every detail here belongs in FS-0001's scoping notes)
```

**Every writer of thin lines obeys this:** `scope-it` (at lock), `write-a-spec` (the stub line
it creates when none exists), `spec-bootstrap` (reverse-engineered lines).

## Numbering & references

- Files live here as `NNNN-short-slug.md` — zero-padded, sequential, allocated the same way as `docs/adr/`.
- Reference them everywhere as `FS-NNNN` (in `SPECIFICATION.md` lines, issue bodies, PRs, commits).
- A feature spec contains: **Summary, Requirements, User Stories, Acceptance Criteria, Edge States, Out of Scope**, plus a header linking back to its `SPECIFICATION.md` entry and any related ADRs — plus, for contract-touching features, an **API surface** section (endpoint table; field-level for new resources, endpoint-level shorthand for established patterns).
- The thin line points; the FS elaborates. Never copy content between them.

## Lifecycle (`draft` → `work-order` → `shipped`)

Every FS file carries a status in its header: `Status: draft | work-order | shipped`.

- **`draft`** — created by `scope-it` at lock time. Contains ONLY the header (number, name, thin-line backlink) and one section, `## Scoping notes (raw)`: the session residue (decisions + rationale, rejected alternatives, edge cases raised, constraints referenced, open questions). Not a template, not polished. Valid input for `write-a-spec` and humans; **not** a valid anchor for implementation.
- **`work-order`** — produced by `write-a-spec`'s promotion: the full template (Summary / Requirements / User Stories / Acceptance Criteria / Edge States / Out of Scope), with the raw notes folded in or deleted. The only status `develop` and `spec-to-issues` accept.
- **`shipped`** — frozen on merge (`spec-update` flips it alongside the checkbox). Supersede, never edit (see below).

**One writer per document state:** `scope-it` creates drafts and writes only the notes section; `write-a-spec` owns promotion and all content thereafter; `spec-update` flips `shipped`. No other skill writes FS files.

## Write-once rule

Feature specs are **work orders, not living documents**. Once the feature ships, the durable truth is the one line in `SPECIFICATION.md`; the FS file becomes a historical record, exactly like an ADR. **Never retro-edit a shipped FS** — write a new one that supersedes it, noting the superseding/superseded FS numbers in both.

## Division of checking labor

- `code-review` (per-PR, deep) reads only the FS file(s) a change references.
- `spec-audit` (periodic, thin) reads only `SPECIFICATION.md`.
