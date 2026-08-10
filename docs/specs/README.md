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

### Brownfield: the two-line retrofit rule

The format above assumes greenfield — one capability, one work order, one checkbox. A
**retrofit** breaks that assumption. Adding a contract, types, or governance to a capability
that **already ships** produces two independent states, and one checkbox cannot carry both:

- *does the capability exist for users?* — yes, already
- *is the retrofit's work order done?* — no, not yet

Write them as **two lines**:

```
- [x] Profile view and edit → FS-none                  (pre-existing behavior)
- [ ] Typed (serialized) profile surface → FS-0002     (the retrofit's work)
```

The capability line being `[x]` does **not** check the retrofit line. The retrofit's checkbox
flips only when its own acceptance criteria ship.

**`FS-none` is a legal pointer.** It means *this behavior predates the spec system and has no
work order* — not a gap to backfill, and **`spec-audit` must not flag it**. It is also what
`spec-bootstrap` writes for capabilities it reverse-engineers from existing code.

Keep both lines as long as they name genuinely different things (the capability vs. the
property the retrofit added). Collapse to one only when the retrofit line would merely restate
the capability.

> This is the **common** case, not an edge case. Every repo adopting this system on an existing
> codebase hits it immediately — via `spec-bootstrap` if not via a deliberate retrofit.

## Numbering & references

- Files live here as `NNNN-short-slug.md` — zero-padded, sequential, allocated the same way as `docs/adr/`.
- Reference them everywhere as `FS-NNNN` (in `SPECIFICATION.md` lines, issue bodies, PRs, commits).
- A feature spec contains: **Summary, Requirements, User Stories, Acceptance Criteria, Edge States, Out of Scope**, plus a header linking back to its `SPECIFICATION.md` entry and any related ADRs — plus, for contract-touching features, an **API surface** section (endpoint table; field-level for new resources, endpoint-level shorthand for established patterns).
- The thin line points; the FS elaborates. Never copy content between them.

## The `API surface` section (tier-2, contract-touching features only)

An FS that changes an HTTP or RPC surface carries an **API surface** section: the endpoint
table that states the contract **at design time**, before any code generates it. Field-level
for new resources; endpoint-level shorthand once the pattern is established.

If the repo generates its contract from code (see `docs/agents/contract.md`), this section is
what the generated document is checked *against* — it is the intent, not the output.

### Error rows carry `status · code`

An error row states **both** the HTTP status and the stable domain error code:

| Case | Response |
|---|---|
| resource not found | `404 · NOT_FOUND` |
| a domain rule refused it | `400 · <DOMAIN_SPECIFIC_CODE>` |
| unknown body member | `422 · VALIDATION_FAILED` |

Status is the **coarse routing signal** and keeps its RFC-defined meaning; the code is the
**precise, client-switchable** one. Two failures that are both "the request was invalid" share
a status and differ only by code — so a table listing status alone under-specifies the
contract, and the client is left string-matching prose.

### Request rows list WRITABLE fields only

A request body is **not a resource**. Read-only fields (`id`, `createdAt`, `updatedAt`) never
appear in a request row, and **identity never appears at all** — it comes from the verified
token or transport metadata, never the body.

Leaving them out is a **security property, not an omission**: it makes a class of
mass-assignment bug unrepresentable rather than defended against.

### 422 vs 400 is a split, not a preference

| Layer | Question | Decided by | Status |
|---|---|---|---|
| **shape** | is this a well-formed request for this operation? | the boundary, from the type | **422** |
| **domain** | is it allowed by the domain's rules? | the **owning** service | **400** + domain code |

The edge never restates a downstream rule — one place per rule, so the two cannot drift. A
client can then tell *"you sent garbage"* from *"you sent something valid that we refused"*,
which a single 400 for everything cannot express. Choose by layer, never per endpoint.

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
