---
id: I-0032
status: done
implements: FS-0004
blocked_by: [I-0030]
labels: [blocked]
title: "FS-0004 slice 4: reskin the remaining views — auth, profile, leaderboard"
---
Implements FS-0004 §Requirements 15, 20, 24, 35-36

The three views with no judgment calls left in them. One slice because it is the same mechanical
pass three times: apply I-0030's vocabulary, purge the enumerated hexes, fix the copy.

The `globals.css` class families are cleanly separated by prefix, so these do not collide with
each other or with I-0031.

## What to Build

### Auth — `login/page.tsx`, `register/page.tsx` (`login-*`, 30 classes)

- One-torch: the submit button only. Everything else brass/vellum.
- `#ff6688` pink error text (`globals.css:718`) → oxblood family.
- `SECTOR` at `login/page.tsx:189` and `register/page.tsx:232` — on `CLAUDE.md`'s **never use**
  list. `Transmitting` at `register/page.tsx:207` is the same sci-fi register.
- Version footers → `v0.1 // The Barrow-Deep`.
- `CLAUDE.md` already specifies the lore swaps for these screens: login = "Speak Your Name" /
  "Enter", register = "Take the Oath". Use its list rather than inventing phrasing.
- **Error copy stays plain.** A delver who cannot log in needs to know why; atmosphere must not
  cost them the ability to recover (§User Story 15).

### Profile — `profile/page.tsx` (`profile-*`, 32 classes)

- One-torch: the page `h1`.
- `#e0e8f0` cold blue-white (`globals.css:659`, `:1250`) → vellum.
- `#ff6688` (`globals.css:1360`) → oxblood family.
- Empty states — no avatar set — must look composed, not broken.

### Leaderboard — `leaderboard/page.tsx`

- One-torch: the page `h1`.
- `#889aaa` in **two places**: `globals.css:1288` and a `styled-jsx` block at
  `leaderboard/page.tsx:332`. The `styled-jsx` one lives outside the main stylesheet and is the
  likeliest place for drift to survive a sweep (§R24).
- `operator` at `leaderboard/page.tsx:85` → delver.
- Long names must stay readable — the body serif carries this view, never blackletter
  (§User Story 7).
- Empty state — no entries — must look composed.

## Acceptance Criteria

- [ ] Amber appears only on the permitted surface in each of the three views
- [ ] `#ff6688`, `#e0e8f0` and `#889aaa` are gone from `globals.css`
- [ ] The `styled-jsx` block in `leaderboard/page.tsx` contains no raw hex
- [ ] No `SECTOR`, `Transmitting` or `operator` in user-facing strings
- [ ] Login and register copy follows `CLAUDE.md`'s lore swaps
- [ ] Auth error messages state plainly what went wrong
- [ ] Version footers read `v0.1 // The Barrow-Deep`
- [ ] Leaderboard body and labels use the body serif, not blackletter
- [ ] Empty leaderboard and avatar-less profile both render as composed surfaces
- [ ] All three views render correctly at 640px and below
- [ ] `npm run build` and `npm run lint` pass

## Blocked By

I-0030 — consumes its tokens, fonts and material primitives.

Independent of I-0031 and I-0033: separate class prefixes, separate files. The three may run
concurrently with those slices.

## Spec Reference

FS-0004 §Requirements 15, 20, 24 (leaderboard `styled-jsx`), 35-36; §User Stories 7, 15, 16;
§Edge States (empty states).
