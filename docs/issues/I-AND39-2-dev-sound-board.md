---
id: I-AND39-2
status: done
implements: FS-AND39
blocked_by: [I-AND39-1]
labels: [ready-for-agent]
title: "FS-AND39 slice 2: the dev-only sound board at /dev/sounds (game-client)"
---
Implements FS-AND39 §Requirements E

**Lane: agent.** Touches no scene file.

## What to Build

- `/dev/sounds` (`src/app/dev/sounds/page.tsx`): `notFound()` in a production build, as
  `/dev/gallery`'s page does. It renders the board.
- The board (`src/dev/sounds/`): a client component that lists the 11 effects from
  `gameplaySounds.ts`, each with a play button. On the first press it makes a Web Audio context.
  Each press renders that effect from `gameplaySfx.ts` at the context's rate and plays it at
  `SFX_MAX_GAIN`. A repeat press restarts that effect (R15). DOM styling uses Bone & Soot tokens
  only (ADR-0013, ADR-0025). The wording is plain and dev-facing.
- No Phaser, no gallery family, and no link from `/dev/gallery` (R15). `families.ts` and
  `Gallery.tsx` are unchanged.

## Acceptance Criteria

- [ ] Every criterion under *The dev sound board* in FS-AND39.
- [ ] A component test: 11 buttons, named by effect. A press renders that effect and starts it on
      a stand-in context at `SFX_MAX_GAIN`. A second press stops the first source.
- [ ] Tests pass: full vitest, tsc, lint, lint:fence.

## Blocked By

I-AND39-1 (the generators and the effect list)

## Spec Reference

FS-AND39 §Requirements R15; user story 27.

## Files it expects to touch

- `game-client/src/app/dev/sounds/page.tsx` (+ `page.test.ts`), new
- `game-client/src/dev/sounds/SoundBoard.tsx` (+ test), new, plus any small player helper beside it
