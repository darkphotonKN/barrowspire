# Issues (local tracker mode)

Task issues for this repo, one file per issue. Active only when `docs/agents/tracker.md` says
`mode: local`; `issues_dir` there points at this directory.

Written by `spec-to-issues`; read by `develop` and `code-review`. The **backend-neutral schema**
lives in `docs/agents/README.md` — this file is the authority for the **local** representation
of it.

## File format

`I-<anchor>-<n>-short-slug.md`, id `I-<anchor>-<n>`. `<anchor>` is the token of the FS the issue
implements (`I-K3F9M-2` is slice 2 of `FS-K3F9M`), or `ADR` plus the number for ADR-anchored
infrastructure (`I-ADR0014-1`). `<n>` counts up from 1 within that anchor — the next unused one if
the anchor was sliced before. An anchor is sliced by one person in one run, so ids are unique by
construction with no shared counter, and `ls docs/issues/I-K3F9M-*` lists one feature's issues.
Existing `I-NNNN` files remain legal. The one exception to the scheme: an issue implementing a
**legacy `FS-NNNN`** keeps the old sequential `I-NNNN` form, because `I-0003-1` would be matched
by the lookup `I-0003-*` for an existing `I-0003`. Migrate the repo's FS ids to end this. Frontmatter, then a body whose first
line is the anchor.

```markdown
---
id: I-K3F9M-1
status: open              # open | in-progress | done
implements: FS-K3F9M      # or ADR-NNNN for ADR-mandated infrastructure
blocked_by: []            # issue ids, [] if none
labels: [enhancement]     # only labels the repo actually uses — never invented
title: FS-K3F9M slice 1: <what this slice delivers>
migrated_from: github#46  # optional — origin if this came from another tracker
---
Implements FS-K3F9M §Requirements, §API surface

## What to Build
## Acceptance Criteria
## Blocked By
## Spec Reference
```

## Rules

- **Status lives in frontmatter and is edited in place.** Never move or rename an issue file —
  every reference to it would break. Done issues stay here; `status: done` **is** the archive.
  There is no `done/` directory.
- **`implements:` is the durable anchor.** The issue id is backend-local and may change in a
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

Cross-references *between issues* need rewriting (`I-…` → `#N`). **`Implements FS-NNNN`
anchors need none** — which is the entire point of anchoring to the spec rather than to the
tracker. Migrating in the other direction is the same procedure reversed; record the origin in
`migrated_from:`.
