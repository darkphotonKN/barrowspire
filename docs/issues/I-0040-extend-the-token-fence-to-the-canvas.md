---
id: I-0040
status: open
implements: FS-0005
blocked_by: [I-0039]
labels: [blocked]
title: "FS-0005 slice 5: extend the token fence to the canvas, and keep its exclusions visible"
---
Implements FS-0005 §Requirements 25-28 · Realizes ADR-0013

Closes the gap FS-0004 opened deliberately and printed on every run. Lands **last**, once the
canvas can actually go green.

## What to Build

### Widen the fence (§R25)

FS-0004 scoped the ADR-0013 hex rule to the DOM surface and excluded the canvas layer in
`.eslintrc.json`, because every violation lived there. `lint-fence.sh` has been printing those ten
files by name on every run. This slice removes them from the exclusion list.

### Two exclusions survive — named, justified, and neither a colour exemption (§R26)

- **Dead code** — `src/scenes/GameScene.ts` (5), `src/scenes/GameOverScene.ts` (8), `src/game/`.
  Unregistered in the scene list, no importers, renders nothing. Restyling code nothing draws is
  waste; **deleting it is a separate decision and explicitly out of scope for FS-0005.**
- **Devtools console styling** — `src/utils/gameStateLogger.ts` (13) and the one
  `console.log('%c…')` in `SocketManager.ts`. Browser-console colour is not presentation and is
  not governed by the art direction.

Write the justification into the config, not just the commit message. An exclusion whose reason
lives only in git history reads as an exemption to the next person.

### Keep the gap visible (§R27)

`lint-fence.sh` already prints what it does not cover. Update it to name these two exclusions
instead of the canvas layer. **A green check must never read as "the tree is clean" when it means
"the tree minus a named list is clean"** — that distinction is the entire point of ADR-0013, and
it is what "the fence must be watched to fail" means in its title.

### Close the Tailwind-class hole (found during I-0039)

**The fence has a gap neither FS-0004 nor FS-0005 anticipated.** ADR-0013 bans raw *hex*, and
both halves of the fence look for hex — so a Tailwind palette class sails straight through:

```
bg-purple-500   text-gray-300   bg-black   text-blue-400
```

No hex, no rejection. This was not theoretical: `/game`'s signed-out screen shipped a **bright
purple `bg-purple-500` "Create Account" button** through a green fence, and was only caught by
looking at the page. `bg-black` had survived in two more places.

Add a rule rejecting Tailwind's built-in colour palettes in `className` strings. The repo's own
tokens (`bg-primary`, `text-vellum`, `border-brass`) are the allowed vocabulary; `slate|gray|
zinc|neutral|stone|red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|
fuchsia|pink|rose` and bare `black`/`white` are not.

The lesson generalises: **the fence enforces the shape it was written to look for, and colour has
more than one shape.** Raw `rgba()` triplets in canvas gradients were a second instance — also
hex-free, also invisible, also only found by reading the code.

### Prove it (§R28)

The existing fixtures cover TS/TSX and CSS. Extend the fence to assert the widened rule rejects a
raw `0x` literal in a scene-shaped file, and still accepts the tree.

> Worth remembering why this step is not ceremony: FS-0004's CSS check was first written with `\b`
> and `{n,m}`, which BSD awk supports neither of. It matched nothing, passed its fixture, and would
> have reported green over every violation in `globals.css`. The reject test is what caught it.

## Acceptance Criteria

- [ ] The hex rule covers `src/scenes/**`, `src/ui/**`, `spriteGenerator.ts` and `SocketManager.ts`
- [ ] Only the two §R26 exclusions remain
- [ ] Each exclusion carries its justification in the config itself
- [ ] `lint-fence.sh` prints the remaining exclusions by name on every run
- [ ] A fixture with a raw `0x` literal in a scene-shaped file is asserted to be REJECTED
- [ ] A rule rejects Tailwind built-in colour classes (`bg-purple-500`, `text-gray-300`, `bg-black`)
- [ ] A fixture using such a class is asserted to be REJECTED
- [ ] Raw `rgba()`/`rgb()` triplets outside the definition sites are considered — hex-free colour
      is still colour
- [ ] The real tree is asserted to be ACCEPTED
- [ ] No allowlist or inline disable comment beyond the two named exclusions
- [ ] `./lint-fence.sh` exits 0
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Blocked By

I-0039 — and transitively every recolour slice. The fence cannot precede the work it protects; a
gate introduced against a red tree acquires an allowlist, and an allowlist is how a fence becomes
decoration.

## Spec Reference

FS-0005 §Requirements 25-28 (§G. Extend the fence); §User Stories 19, 20; §Edge States (the dead
scenes come back — if either is ever registered it enters scope and the exclusion no longer
applies). Realizes [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md).

> **What this fence still does not do.** It enforces vocabulary, not composition. A canvas that
> passes can still use amber for something the player cannot act on — FS-0005 §R16 stays a human
> review judgment, exactly as §R15's one-torch rule did on the DOM side.
