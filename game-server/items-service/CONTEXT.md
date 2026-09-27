# CONTEXT — items-service

Ubiquitous language for the **items-service** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## Terms

<!-- **Term** — one-line definition -->
**Base item** — a rarity-neutral item template (seeded at `normal`) whose stats are the centre of every roll made from it. (FS-F8T3H)
**Rolled rarity** — the tier picked for one dropped item at drop time, weighted by `drop_rate_multiplier`; stored on the item instance, not the template. (FS-F8T3H)
**Rarity tier** — one of Normal, Uncommon, Rare, Runed, Fabled (ascending); scales an item's stats and decides its name affixes. (FS-F8T3H)
