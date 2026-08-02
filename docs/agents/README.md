# Agent config

Small, human-editable config files that skills load cheaply. **One writer per file.**

## `tracker.md` — issue tracker config

Read by `spec-to-issues` (publishing) and `code-review` (locating `Implements FS-NNNN`).
It is written **once**, by `setup` (which owns all structural config) from the tracker answer in
its interview; every other skill only reads it. If `setup` was never run and the file is missing,
`spec-to-issues`' first-time detection creates it as a fallback — see "First-time tracker
detection" in `spec-to-issues`. Either way: one writer, then read-only.

Format:

```markdown
# Tracker config (read by spec-to-issues, code-review; written once at setup)
# One tracker per repo. Changing modes later is a migration (see below), not an edit-and-hope.
# Skills READ this file; only the setup/detection step WRITES it.

mode: local            # github | gitlab | local
# --- tracker modes only ---
remote: origin         # git remote whose host/project the tracker lives on
labels: ready-for-agent, blocked   # labels the repo actually has; skills must not invent others
# --- local mode only ---
issues_dir: docs/issues
```

Rules:

- **One tracker per repo.** Changing modes later is a migration, not an edit-and-hope.
- **One writer.** Only the detection step writes this file; everything else reads it.
- **Labels are a closed set.** Skills use only the labels listed here; they never invent new ones.

## Local → tracker migration

`mode: local` stores issues as `{issues_dir}/I-NNNN-*.md` (frontmatter + body). Migrating to a real
tracker is intentionally trivial: iterate `{issues_dir}/I-*.md` with `status != done`, publish each via
the target backend's create call (carry over title / body / labels / blocked_by), write the new ref back
into the local file's frontmatter as `migrated_to: #N`, then flip `mode` in `tracker.md`.

`Implements FS-NNNN` anchors need **no** rewriting — issue IDs (`#N`, `I-NNNN`) are backend-local and may
change in a migration; the FS reference is the durable anchor. Anything that must survive a migration
references the FS, not the issue.
