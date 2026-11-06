---
id: I-TVCZQ-1
status: done
implements: FS-TVCZQ
blocked_by: []
labels: [ready-for-agent]
title: "FS-TVCZQ slice 1: the client stops offering profile photos"
---
Implements FS-TVCZQ §Requirements 1–10, 29

## What to Build
Remove the avatar circle, Change Photo picker, file input, upload handler, and the `error` and
`success` state with their message block from `/profile`. Keep the name, email, details and email
verification panel. `UserMenu` always renders the silhouette. Remove `requestAvatarUpload`,
`confirmAvatarUpload` and `uploadToS3` from `apiClient`. Rename `.user-avatar` to `.user-badge` and
`.default-avatar` to `.user-silhouette`, and delete the styles nothing renders any more. Remove
avatar code from the commented-out leaderboard page. Reword the `.eslintrc.json` message that names
the S3 upload, and keep the `api.ts` exemption because `fetchArtManifest` uses it. Drop
`.profile-error` from the design guideline's feedback rule.

No server, contract or generated-client change in this slice.

## Files expected to change
- `game-client/src/app/profile/page.tsx`
- `game-client/src/components/UserMenu.tsx`
- `game-client/src/utils/api.ts`
- `game-client/src/utils/api.test.ts`
- `game-client/src/app/globals.css`
- `game-client/src/app/leaderboard/page.tsx`
- `game-client/.eslintrc.json`
- `game-client/docs/design-guideline.md`

Not touched: `game-client/src/ui/**` and `game-client/src/scenes/**`, including `MainMenuScene.ts`.
Those trees carry someone else's uncommitted HUD work.

## Acceptance Criteria
- [ ] `/profile` renders name, email, details and the verification panel, with no file input and
      no photo.
- [ ] `UserMenu.tsx` reads no photo URL and always renders the silhouette.
- [ ] `apiClient` has no `requestAvatarUpload`, `confirmAvatarUpload` or `uploadToS3`, and
      `UPLOAD_FAILED` is gone.
- [ ] `globals.css` has no rule from FS-TVCZQ requirement 7's delete list, and has `.user-badge`
      and `.user-silhouette`.
- [ ] `leaderboard/page.tsx` still answers not-found and has no avatar text.
- [ ] Client typecheck, tests and lint fence pass, including the CSS token fence.

## Blocked By
None

## Spec Reference
FS-TVCZQ §Requirements 1–10, 29; §User Stories 1–7, 21; §Edge States (old tab, persisted session,
verified player).

## TDD Approach
- RED: a test that `apiClient` has no `requestAvatarUpload`, `confirmAvatarUpload` or `uploadToS3`.
- GREEN: delete the three methods, and fix what typecheck then reports on the profile page.
