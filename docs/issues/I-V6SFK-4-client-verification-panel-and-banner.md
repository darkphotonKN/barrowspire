---
id: I-V6SFK-4
status: done
implements: FS-V6SFK
blocked_by: [I-V6SFK-3]
labels: [ready-for-agent]
title: "FS-V6SFK slice 4: client verification panel, unverified banner, token swap on verify"
---
Implements FS-V6SFK §Requirements H35–H37, H39

## What to Build

An unverified player sees a banner across the signed-in app. They can enter their code, resend
it (with a cooldown countdown) or change their email. Verifying swaps in the fresh tokens and
the banner disappears without a reload. The profile page hosts the same panel and shows
"Verified" afterwards.

- A verification panel component using the generated client's verify, resend and change-email
  ops, mapping the codes listed in R35.
- An app-wide banner shown while the stored member has `email_verified === false`, collapsible
  for the current page session, opening the panel.
- On verify success, replace the stored tokens and member in the auth store (R37).
- Token-only styling per ADR-0013 and `game-client/docs/design-guideline.md`; the lint fence passes.

## Acceptance Criteria

- [ ] The banner renders only for unverified members and returns after a reload when collapsed.
- [ ] Verify success updates the store's tokens and member, and the banner unmounts.
- [ ] Resend is disabled with a countdown for 60s, and `VERIFICATION_RESEND_TOO_SOON` is handled.
- [ ] Change email shows the updated address; 409 and `EMAIL_INVALID` show messages.
- [ ] The profile page shows the panel when unverified and "Verified" when verified.
- [ ] Component/store tests pass, along with the client lint and style fence.

## Blocked By

I-V6SFK-3 (generated client ops and the `email_verified` field)

## Expected files

- `game-client/src/components/` (a new verification panel and banner)
- `game-client/src/app/layout.tsx` or the signed-in shell that mounts the banner
- `game-client/src/app/profile/page.tsx`
- the auth Zustand store under `game-client/src/` (token/member replace)
- Reads, never writes: ★ `game-client/src/api/generated/`

## Spec Reference

FS-V6SFK §H35–37, §H39. User stories 1, 3–6, 19–20.

## TDD Approach

- RED: a store test: applying a verify response replaces the tokens and member, and `email_verified` becomes true.
- GREEN: the store action plus the panel wiring.
