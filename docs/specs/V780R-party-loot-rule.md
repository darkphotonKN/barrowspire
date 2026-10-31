# FS-V780R: Party loot rule

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Party loot rule", "### Gameplay actions" → "Pickup allocated by the party's loot rule"; `game-client/SPECIFICATION.md` "### Party" → "Party loot rule setting", "### Escape run" → "Allocated pickup notices" → this FS · Depends on: [FS-R82NV](R82NV-party-formation.md) (party, panel, leader), [FS-BJNYC](BJNYC-party-instance-entry.md) (the in-instance lock), [FS-XGW7H](XGW7H-party-chat.md) (system lines in the party channel) · Related: [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (drops stay single-copy ground piles and coffers; this FS changes who receives a pickup, not what drops), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) R33 (killer-first `reserved_for` window in fields — the rejected shape for instances), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (bag capacity) · Vocabulary: *loot rule* pending via `domain-model`

## Scoping notes (raw)

Scoped 2026-11-01 with Nick.

### The rule is a party setting

- Chosen on the **party panel**, **leader only**, locked while the party is in an instance.
- Options now: **random allocation** (default) and **picker keeps**. Designed to take more later
  (round-robin, need/greed…) — a closed enum, one more value per rule. Nick: "做成是一個選擇 ...
  可以隨機分 可以撿的人全拿 或是其他方式".
- Random-matchmaking auto-parties use the default. Default = random was the agent's pick (fairer
  among strangers); flipping it is one constant.
- No party (solo) → the rule is moot, the picker keeps.

### Random allocation, how it works

- Drops and coffers stay exactly as today: single copy, anyone may click. **Allocation happens at
  pickup**: the item lands in the bag of a random member, not necessarily the picker.
- Candidates: members **alive and un-escaped at that moment** (the same set FS-BDA7X pays XP to).
- Chosen member's bag full → draw again among the others; everyone full → the item stays on the
  ground, picker told.
- Notices as system lines in the party channel (FS-XGW7H): "Z 拾得 鐵劍，歸於 X"; to the receiver
  "鐵劍 歸於你".
- Items cannot be dropped or handed over inside a run (`drop_item` is unhandled), which is exactly
  why allocation must happen at pickup rather than after.

### Alternatives considered

- **Keep free-for-all** (status quo). Rejected as the only option; kept as the "picker keeps" rule.
- **Reserve at drop time** (`reserved_for` + unlock window, the field's killer-first shape).
  Rejected for instances: with coffers, the reserved member has to walk over to the coffer the
  opener is standing at ("那個人還要自己走過來寶箱撿"). Fine for killer-first in fields, wrong here.
- **Instanced loot per member** (each sees their own copy). Rejected: N rolls per monster and
  coffer, client filtering, and it dilutes opening a coffer together.
- **Round-robin**. Not now; needs state per party. Parked as a later rule value.

### Open questions

- Does the rule apply in fields too (members in the same field on the party pod), or only in
  instances? Fields have killer-first; proposed: instances only for v1.
- Whether the picker may hold a key to opt out ("keep for me") — likely no, the rule is the rule.

### Parking lot

- Round-robin and other rules.
- Trading / dropping items inside a run (would reopen the design).
