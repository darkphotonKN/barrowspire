---
id: I-0035
status: done
implements: FS-0004
blocked_by: [I-0034]
labels: [blocked]
title: "FS-0004 slice 7: the token fence — reject raw hex, and prove it rejects"
---
Implements FS-0004 §Requirements 10, 39-41 · Realizes ADR-0013

The gate that makes the reskin survive. Lands **last**, once the tree can actually go green.

> Without this slice, FS-0004 is a one-time cleanup that decays exactly the way the last one did.
> `design-guideline.md` and `CLAUDE.md` already said "no neon", "dark never black", "one torch per
> view", and listed `operator` and `Sector` as **never use** — and every one of those rules was
> violated in shipped code, because nothing rejected the violation.

## What to Build

### The rule (§R10, §R39)

A lint check that rejects raw hex outside the two definition sites — `src/app/globals.css`'s
`:root` and `src/utils/theme.ts`'s `BARROW` / `BARROW_HEX`.

**Coverage must include all three shapes**, because the current residue lives in all three:
- `globals.css` — the main stylesheet
- `styled-jsx` blocks — `leaderboard/page.tsx`, `NotificationBell.tsx`
- inline `style={{}}` objects and JS colour config — the Stripe appearance object was the largest
  single pocket of off-palette values and no CSS-only rule would have caught it

`lint-fence.sh` wraps `next lint`, which is ESLint over TS/TSX. That reaches the TSX shapes but
**not `globals.css`** — the CSS half likely needs a second check (stylelint, or a grep assertion
in the same script). ADR-0013 anticipates this: correcting the mechanism while the decision stands
needs no ADR amendment.

### Prove it (§R40)

Extend `lint-fence.sh` following its existing pattern, and its stated reason for existing:

> *a gate nobody has watched fail emits a green check either way, which is worse than no gate
> because it is trusted*

- Run the rule against a fixture that violates it (a file with a raw hex) → **assert rejection**
- Run it against the real tree → **assert it passes**

Add the fixture under `lint-fixtures/`, alongside `hand-fetch.ts`. A gate that has only ever been
observed passing does not satisfy this requirement.

### No allowlist (§R41)

The tree must be genuinely clean when this lands. If the fence needs an exemption to go green,
**the exemption is the bug** — find the call site I-0030 through I-0033 missed and fix it. An
allowlist is how a fence becomes decoration.

If a third-party API genuinely requires a literal the fence forbids, define it as a token and
reference it. If that proves impossible, it is an ADR-0013 amendment — not a local override.

## Acceptance Criteria

- [ ] A lint rule rejects raw hex outside `globals.css` `:root` and `theme.ts`
- [ ] Coverage includes `globals.css`, `styled-jsx` blocks, and inline `style={{}}` / JS colour config
- [ ] A violating fixture exists under `lint-fixtures/`
- [ ] `lint-fence.sh` asserts the rule REJECTS that fixture
- [ ] `lint-fence.sh` asserts the rule ACCEPTS the real tree
- [ ] `./lint-fence.sh` exits 0
- [ ] No allowlist, exemption list, or inline disable comment anywhere in the rule's config
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Blocked By

I-0034 — and transitively every reskin slice. The fence cannot precede the work it protects; a
gate introduced against a red tree gets an allowlist.

## Spec Reference

FS-0004 §Requirements 10, 39-41; §User Stories 22, 24, 25; §Edge States (a raw hex is genuinely
required). Realizes [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md).

> **What this fence does not do.** It enforces vocabulary, not composition. A tree that passes can
> still be entirely amber — §R15's one-torch rule stays a human review judgment, and it is the
> requirement most likely to regress silently. Do not let a green fence read as "the palette is
> correct"; it means "every colour came from the palette".
