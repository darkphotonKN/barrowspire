# Issues (local tracker mode)

Task issues for this repo, one file per issue. Active only when `docs/agents/tracker.md` says
`mode: local`; `issues_dir` there points at this directory.

Written by `spec-to-issues`; read by `develop` and `code-review`. The **backend-neutral schema**
lives in `docs/agents/README.md` — this file is the authority for the **local** representation
of it.

## File format

`I-NNNN-short-slug.md` — zero-padded, sequential, the same numbering style as `docs/adr/` and
`docs/specs/`. Frontmatter, then a body whose first line is the anchor.

```markdown
---
id: I-0001
status: open              # open | in-progress | done
implements: FS-0002       # or ADR-NNNN for ADR-mandated infrastructure
blocked_by: [I-0000]      # issue ids, [] if none
labels: [enhancement]     # only labels the repo actually uses — never invented
title: FS-0002 slice 1: <what this slice delivers>
migrated_from: github#46  # optional — origin if this came from another tracker
---
Implements FS-0002 §Requirements, §API surface

## What to Build
## Acceptance Criteria
## Blocked By
## Spec Reference
```

## Rules

- **Status lives in frontmatter and is edited in place.** Never move or rename an issue file —
  every reference to it would break. Done issues stay here; `status: done` **is** the archive.
  There is no `done/` directory.
- **`implements:` is the durable anchor.** `I-NNNN` is backend-local and may change in a
  migration; `FS-NNNN` (or `ADR-NNNN`) does not. Anything that must survive a tracker migration
  references the anchor, not the issue id.
- **`blocked_by:` lists issue ids**, and the same dependency is restated in the body's
  `## Blocked By` section for human readers. Frontmatter is for tools; the body is for people.
- **Labels are a closed set** — whatever `docs/agents/tracker.md` lists. Skills never invent new
  ones.

## Migrating to a real tracker (local → github/gitlab)

Intentionally trivial, and the reason the local mode is safe to start with:

1. Iterate `I-*.md` with `status != done`.
2. Publish each via the target backend's create call, carrying over title, body, labels, and
   `blocked_by`.
3. Write the new reference back into the local file's frontmatter as `migrated_to: #N`.
4. Flip `mode` in `docs/agents/tracker.md`.

Cross-references *between issues* need rewriting (`I-NNNN` → `#N`). **`Implements FS-NNNN`
anchors need none** — which is the entire point of anchoring to the spec rather than to the
tracker. Migrating in the other direction is the same procedure reversed; record the origin in
`migrated_from:`.
