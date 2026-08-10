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

## `contract.md` — contract toolchain binding (only if the repo has a contract layer)

Read by `develop` (its pre-flight contract check) and `code-review` (its spec axis, when the
change touches an `§API surface`). Written **once**, by `setup`, when the repo opts into the
contract layer. Absent means the repo has no governed contract surface — that is a legal state,
not a missing file, and skills must degrade quietly rather than flag it.

It exists because **the skills are generic and must not hardcode a toolchain.** `develop` says
"regenerate the contract document and the client" without naming a command; this file is where
a repo answers that. Exactly the role `tracker.md` plays for issue backends.

It carries three kinds of value:

| Kind | Examples | Why a skill needs it |
|---|---|---|
| **paths** | spec, generated-client dir, allowlist, lint ruleset, fixtures | to find and diff the artifacts |
| **commands** | regen, client regen, lint, breaking, gates | to run the pre-flight without guessing |
| **policy** | request strictness per plane, request-type rules | to judge a new operation without assuming a house style |

Rules:

- **One contract config per repo**, even in a monorepo — the contract layer governs one edge
  surface plus, optionally, one service-to-service plane.
- **Skills READ it; they never write it.** A skill that finds a stale value reports it.
- **Pin tool versions here as well as in the build file.** A gate running `@latest` can turn red
  on a day nobody touched the contract.
- **State an unwired plane explicitly** rather than omitting it. An explicit gap is auditable; a
  silent one reads as "governed".
- **Policy carries its revisit trigger.** Strictness follows the deployment model — correct only
  while the consumer ships in the same release. A rule recorded without its precondition gets
  cargo-culted into a repo where it is wrong.

## Local → tracker migration

`mode: local` stores issues as `{issues_dir}/I-NNNN-*.md` (frontmatter + body). Migrating to a real
tracker is intentionally trivial: iterate `{issues_dir}/I-*.md` with `status != done`, publish each via
the target backend's create call (carry over title / body / labels / blocked_by), write the new ref back
into the local file's frontmatter as `migrated_to: #N`, then flip `mode` in `tracker.md`.

`Implements FS-NNNN` anchors need **no** rewriting — issue IDs (`#N`, `I-NNNN`) are backend-local and may
change in a migration; the FS reference is the durable anchor. Anything that must survive a migration
references the FS, not the issue.
