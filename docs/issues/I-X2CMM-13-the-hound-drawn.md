---
id: I-X2CMM-13
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-8", "I-X2CMM-12"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 13: the archer's hound is built in code and drawn running, biting and falling"
---
Implements FS-X2CMM §I

**Author: agent**

## What to Build

- **The hound (R47).** A lean grey hound built in code on the quadruped rig the boar uses
  (`tools/bake/page/characters/boar.js`), baked to sprites by `npm run bake` like every creature
  (ADR-0020, ADR-0021, Ultima Online fidelity), with run, bite and fall. Drawn from the hound
  entries of the run's world effects, with a small health bar, never mistaken for a monster (no
  monster nameplate; a faint verdigris ring under it).
- A contact sheet for the hound from the bake pipeline (`tools/bake/lib/contact.mjs`).

## Acceptance Criteria

- [ ] The hound is drawn at its state position with the right action and goes when it does.
- [ ] The hound's baked sheets and its contact sheet exist.
- [ ] Client suites green.

## Blocked By

I-X2CMM-8, I-X2CMM-12

## Spec Reference

FS-X2CMM §I R47

## TDD Approach

- RED: the hound renderer maps `bite` to its bite clip.
- GREEN: the model, the bake, the renderer.
