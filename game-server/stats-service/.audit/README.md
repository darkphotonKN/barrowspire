# Audit state

Working state for the `spec-audit` skill — the periodic, git-anchored check that the code still
matches the thin `SPECIFICATION.md`.

**`spec-audit` is the only writer.** Everything here is its state, not hand-maintained
configuration. Read it freely; edit it only to correct a mapping it inferred wrongly.

```
.audit/
├── state.json        # per-module baseline SHA — the "last audited" point per module
├── spec-audit.map    # path globs → SPECIFICATION.md section, one per line
├── reports/          # spec-audit-YYYYMMDD-HHMM.md, one per run   (gitignored)
└── OPEN.md           # unresolved HIGH findings, carried forward until resolved
```

## What each piece is for

- **`state.json`** — the baseline each module was last audited at. A module whose files haven't
  changed since its baseline is skipped and its baseline advances for free; that is what keeps
  a repeat audit cheap.
- **`spec-audit.map`** — which code paths belong to which spec section. Created on the first
  run, which shows the inferred map **for approval before writing it**. Correct it here when a
  module moves.
- **`reports/`** — one ranked report per run, each opening with a machine-readable summary line
  for CI gating. **Gitignored**: they are a log, they regenerate, and they would otherwise churn
  every diff.
- **`OPEN.md`** — unresolved HIGH findings, carried forward across runs. **Tracked in git**,
  because an unresolved HIGH is shared state the whole team is accountable to, not one
  developer's local noise.

The gitignore split is deliberate and worth preserving: **reports are disposable, open findings
are not.**

## Placement

Single repo: `.audit/` at the repo root. Monorepo: one `.audit/` **per service**, beside that
service's `SPECIFICATION.md` — baselines are per-module, so a shared root directory would make
the skip-unchanged-modules optimization impossible.
