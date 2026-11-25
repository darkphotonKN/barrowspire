---
id: I-5FZ4J-6
status: done
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-5]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 6: the Chasm and Braziers seals, the seal draw per floor band and chained seals on floors 8-10"
---
Implements FS-5FZ4J §B R9–R10, §E R33–R34, §I R46 (`pit` barriers, braziers, bridge lever, `window_ends_in`)

**Hotspot:** `session.go`, the seal code, the floor build. One writer at a time.

## What to Build

- **The Chasm** (R33): only on a Chasm-capable stairs room (slice 1's flag; otherwise the draw
  redraws); the pit band as `pit` barriers (blocking bodies and monster paths); the ledge with
  spike plates on every other cell (slice 5's traps, extra to the count); the bridge lever on the
  stairs side; lowering the bridge opens a two-cell lane and breaks the seal. A floor whose only
  seal is a Chasm has no gate.
- **Braziers** (R34): three in three rooms, the window (60 s; 90 s with one delver in play at the
  first lighting), all lit breaks the seal, expiry puts all out, an ambush per brazier's first
  lighting, `window_ends_in`.
- **The draw** (R9): the bands' kind sets, uniform from the spawn source; floors 8–10 chain two
  kinds (first from the four, second from the five minus the first), the second's pieces created
  only on the first's break; the gate holds for every non-Chasm seal (R13).
- **Solvable by one** (R10): a test that, for every kind, a solo build passes the kind's one-body
  path (scripted: walk the ledge, push blocks, light braziers inside 90 s), and a guard that a kind
  marked two-body never rolls with one delver alive.
- Extend the 1 000-seed property test: every floor band's draw yields a placeable seal.

## Acceptance Criteria

- [ ] Chasm: pits block a delver and a monster path; the ledge is walkable; the bridge lever opens the lane and breaks the seal; no gate on a Chasm-only floor.
- [ ] Braziers: three lit in 60 s break it; 90 s with one delver; an expired window resets every brazier.
- [ ] Floors 1–3 draw from three kinds, 4–7 from five, 8–10 chain two different kinds; the second's pieces appear on the first's break.
- [ ] The solo test passes for all five kinds.
- [ ] `make test` and `make check` green.

## Blocked By

I-5FZ4J-5 (the ledge's spike plates).

## Spec Reference

FS-5FZ4J §B R9–R10, R13, §E R33–R34, §I R46.

## TDD Approach

- RED: with Braziers forced and one delver, lighting all three 80 s apart from the first breaks the seal.
- GREEN: the window sized by the living count.
