# ADR-0013 — Client styling is token-only: no raw hex outside the token definitions, enforced by a fence that has been watched to reject

Status: accepted
Date: 2026-08-28
Scope: `game-client` — both the DOM styling layer (`src/app/globals.css`, components) and the
Phaser layer (`src/scenes/**`), which are two forms of one palette
Realized by: FS-0004 (web platform reskin), FS-0005 (game canvas reskin)

## Context

`game-client/docs/design-guideline.md` is the declared single source of truth for every visual
decision in the client. `CLAUDE.md` says so in its first paragraph. The guideline already
prescribed, in writing, before any of the work described below:

- "**No bright saturated primaries.** No neon, no cyan, no electric glows."
- "Dark, never black."
- "One torch per view" — amber marks *the single most important thing*; "overuse dilutes it."
- A "Known drift" section explicitly naming `body { color: #fff }`, the cold blues `#e0e8f0` /
  `#889aaa`, and the pink `#ff6688` as leftovers to migrate.

Every one of those rules is currently violated in the shipped client. `globals.css` carries 49
occurrences of the amber `#e8a14d` against 4 of brass and 1 of oxblood — amber is not the torch,
it is the entire accent system. The base is `#0d0b0a`, which is black in everything but name.
And the pre-barrow sci-fi palette is still resident: `#4ecca3` mint, `#00d4e6` cyan, `#bf5fff`
purple, `#ff6688` pink, `#0f0f23`. The Phaser scenes are worse — 36 inline `0x` literals
including a full cold blue-grey ramp (`0x4a5568`, `0x3a4556`, `0x2a3040`) that has never had a
place in the barrow palette, sitting one import away from a `BARROW_HEX` table that already
exports every colour they should be using.

**The rules were not ignored. They were unenforceable.** A guideline that says "no neon" cannot
tell you that the hex you just typed is neon. Nothing in the toolchain reads it, so every one of
those literals passed lint, passed review, and shipped. The drift did not enter despite the
rules; it entered because the rules had no mechanism, and a rule with no mechanism is a
suggestion that decays at exactly the rate that people forget it.

This repo has already worked out the answer and written it down elsewhere. `lint-fence.sh`
exists to prove the "no hand-written fetch" rule can still reject, and its header states the
principle plainly: *a gate nobody has watched fail emits a green check either way, which is worse
than no gate because it is trusted.* That script runs the rule against a fixture that violates
it, asserts a rejection, then runs it against the real tree and asserts a pass. The styling layer
has no such gate, which is the whole difference between the contract layer (where hand-written
fetches do not survive) and the styling layer (where a purple hex from a previous game does).

The alternative on the table was to record the token-only constraint and skip the gate. It was
rejected on the evidence above: the constraint has effectively existed in prose since the
guideline was written, and prose is what produced the current state.

> Recorded without adversarial review. This decision was reached during the FS-0004/FS-0005
> scoping session, where it converged on the first recommendation with no pushback.

## Decision

**Colour in the client is referenced through semantic tokens. Raw hex appears only where tokens
are defined.**

- **Two definition sites, and only two:** the CSS custom properties in `src/app/globals.css`
  `:root`, and the `BARROW` / `BARROW_HEX` tables in `src/utils/theme.ts`. These are the same
  palette in two forms (CSS strings for the DOM, `0x` ints for Phaser) and must agree.
- **Everywhere else refers, never restates.** DOM styling uses `var(--color-*)` and the Tailwind
  utilities that resolve from them; Phaser code reads `BARROW_HEX.*`. A literal `#rrggbb` or
  `0xrrggbb` outside the two definition sites is a defect, not a shortcut.
- **A new colour is a token first.** Needing a value the palette does not have means adding it to
  both definition sites and to the guideline's token table — in that order, deliberately, as a
  visible change to the palette — not inlining it at the call site where nobody will find it
  again.
- **The rule is enforced by a lint check, and the check is proven with the existing
  `lint-fence.sh` pattern** — asserted to reject a fixture that violates it *and* to accept the
  real tree. An unproven gate does not count as enforcement under this ADR.
- **The fence lands with FS-0004/FS-0005, not before.** The tree currently violates the rule in
  ~85 places. Enforcement is the closing act of the reskin, when the tree can actually go green;
  a gate introduced against a red tree gets an allowlist, and an allowlist is how a fence becomes
  decoration.

## Consequences

- Off-palette colour becomes **hard to introduce rather than easy to miss**. The failure mode
  shifts from "a reviewer must recognise that `#bf5fff` is not in the barrow ramp" to "the build
  rejects a literal", which is the difference between a rule that depends on attention and one
  that does not.
- A palette change becomes a change to two files instead of a search-and-replace across a 4.4k-
  line scene and a 1.4k-line stylesheet. The base-surface lift decided in FS-0004 is the
  immediate beneficiary; every future one is too.
- The DOM and Phaser palettes are structurally forced to stay in sync, because both sides are
  reduced to lookups against tables that a human maintains side by side.
- The guideline stops being purely aspirational. Its token table and the runtime acquire a
  mechanical relationship, so "the guideline says X" becomes checkable at least at the token
  layer.

- **Cost: the fence enforces vocabulary, not composition.** It can prove every colour came from
  the palette. It cannot prove amber was used once per view. The *"one torch"* rule — the actual
  root cause of the neon read — remains a human judgment enforced only in review, and a tree
  that is 100% tokens can still be 100% amber. This ADR fixes the smaller half of the problem
  and should not be mistaken for fixing the larger one.
- **Cost: the mechanism is a guess.** `lint-fence.sh` wraps `next lint`, which is ESLint over
  TS/TSX — it reaches the Phaser literals and inline component styles, but not `globals.css`.
  The CSS half likely needs a second check (stylelint, or a grep assertion in the same fence
  script). Per `docs/adr/README.md`, correcting that mechanism while this decision stands needs
  no amendment.
- **Cost: ~85 call sites must migrate before the gate can go green** — 49 in `globals.css`, 36
  across the scenes. That migration is the reskin itself, so the cost is absorbed rather than
  additional, but it does mean the fence cannot precede the work it is meant to protect.
- **Cost: raw `0x` lookups are token-compliant and still unreadable.** `BARROW_HEX.slate` passes
  the fence whether or not slate is the right colour for a door. FS-0005 raises, without
  settling, whether a semantic layer (`palette.wall`, `palette.door`) should sit over the ramp.
  The fence does not answer that question and may create false confidence that it has.
- **Cost: one more gate to keep honest.** A fence that is itself never exercised regresses to the
  thing this ADR exists to prevent, so it inherits the obligation `lint-fence.sh` already
  carries — it must be run, and watched to fail, not merely present.
