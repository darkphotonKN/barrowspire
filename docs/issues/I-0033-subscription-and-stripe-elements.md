---
id: I-0033
status: done
implements: FS-0004
blocked_by: [I-0030]
labels: [blocked]
title: "FS-0004 slice 5: subscription — re-theme Stripe Elements, keep money copy plain"
---
Implements FS-0004 §Requirements 15, 22, 37

**Author: human** — do NOT hand this to `/develop`. This is the paid surface. Two things need
judgment: what Stripe's appearance API will actually accept, and where lore must yield to
money-clarity.

## What to Build

### The Stripe Elements appearance object (§R22)

`subscription/page.tsx` declares a **wholly separate sci-fi theme** that no CSS change reaches,
because Stripe Elements renders in a cross-origin iframe styled through its own appearance API:

```
:107-111   color: "#e2e8f0", ::placeholder "#64748b", iconColor: "#4ecca3",
           invalid: { color: "#ef4444", iconColor: "#ef4444" }
:262-279   colorPrimary: "#4ecca3", colorBackground: "#0f0f23",
           colorText: "#e2e8f0", colorDanger: "#ef4444", "#94a3b8"
```

Mint, dark blue-purple, cold blue-white, and a stock red — none of it in any palette this repo
owns. Derive every value from the tokens (I-0030).

**Stripe's appearance API accepts a constrained set.** If it rejects a token value, fall back to a
legible default for that property — never let a rejection silently revert the whole form to
Stripe's stock theme, which is a worse outcome than the current state because it looks
intentional. Verify against a real render, not by reading the types.

### The rest of the page (`sub-*`, 29 classes)

- One-torch: the price, or the subscribe button — **one of them**, not both. This view is the
  clearest case in the app where two things compete for the torch; pick deliberately.
- `#889aaa` in `.sub-feature-item` and the cold blue in `.sub-plan-name` → vellum family.
- `#ff6688` in `.sub-error` → oxblood family.

### Money clarity (§R37)

**Lore does not apply to real-money flows.** "Subscribe", "Pay", and the actual price stay
unambiguous — the guideline's own money-clarity exception, and the one place where the delver
voice is explicitly wrong. Reserve "Acquire" / "Claim" for in-game-gold purchases, which this
page has none of.

A delver about to be charged $10/mo must be able to tell that is what is happening
(§User Story 14). If a phrase reads as flavour when spoken aloud, it does not belong on this page.

## Acceptance Criteria

- [ ] Every value in the Stripe appearance object derives from tokens; no raw hex remains
- [ ] The form renders correctly against a real Stripe render, not just a type-check
- [ ] A value Stripe rejects degrades to a legible default without reverting the whole theme
- [ ] Exactly one element on the page carries amber
- [ ] `#889aaa`, the cold blue plan name, and `#ff6688` are gone from the `sub-*` families
- [ ] "Subscribe", "Pay" and the price are stated plainly, with no lore substitution
- [ ] Card-input error states remain clearly legible as errors
- [ ] The page renders correctly at 640px and below
- [ ] `npm run build` and `npm run lint` pass

## Blocked By

I-0030 — consumes its tokens and material primitives.

Independent of I-0031 and I-0032; may run concurrently with both.

## Spec Reference

FS-0004 §Requirements 15, 22, 37; §User Stories 13, 14; §Edge States (Stripe Elements refuses a
value).
