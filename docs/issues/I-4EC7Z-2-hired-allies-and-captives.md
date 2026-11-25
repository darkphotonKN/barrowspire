---
id: I-4EC7Z-2
status: done
implements: FS-4EC7Z
blocked_by: [I-4EC7Z-1]
labels: [ready-for-agent]
title: "FS-4EC7Z slice 2: hired allies (follow, fight, plates, traps, cap, credit) and the Captives with their cage and key"
---
Implements FS-4EC7Z §C R9–R12, §D R13, §F R23, R27

**Hotspot:** game-service AI and combat systems, `session.go`, the serializer. One writer at a time.

## What to Build

- Ally behaviour (R9): follow the hirer 2–4 cells on the grid, engage monsters within 6 cells or
  attacking the hirer, melee through the hit path with its sheet; hold plates and fire traps via the
  body-kind hooks FS-5FZ4J left; take poison; never climb. Cap 3 (R10). Kill credit to the hirer for
  loot, no experience (R11). Floor-scoped (R12).
- Captives (R13): the cage fixture, the cage key (50% in a room, 50% on an elite that drops it),
  key taking as party floor state, the cage interact with the key, the **open-cage entry point**
  for FS-X2CMM, freed captives become the opener's allies; `cage_locked`.
- `cages`, `encounter_keys`, `cage_key_carried` on the wire (R23), `hirer_id` on allies.

## Acceptance Criteria

- [ ] FS-4EC7Z server criteria for §C and §D R13.
- [ ] `make test` and `make check` green.

## Blocked By

I-4EC7Z-1.

## Spec Reference

FS-4EC7Z §C, §D R13, §F R23, R27.

## TDD Approach

- RED: a freed captive standing on a pressure plate holds it.
- GREEN: the ally's body kind in the plate check.
