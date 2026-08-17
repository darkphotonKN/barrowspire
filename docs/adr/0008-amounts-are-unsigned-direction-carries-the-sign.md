# ADR-0008 — Amounts are unsigned; direction carries the sign

Status: accepted
Date: 2026-08-17
Scope: `game-server/ledger-service`
Realized by: FS-0003 §Requirements 6–7, the `amount_positive` and `direction_valid` CHECK
constraints on `ledger_entries` (not yet implemented)

## Context

A double-entry leg needs to express both a magnitude and which way the gold went. Two
representations were available.

**Signed amounts** — one `BIGINT` column, negative for a debit. Compact, one fewer column, and
sum-to-zero becomes a plain `SUM(amount) = 0` that the database could check directly.

**Unsigned amount plus an explicit direction** — `amount BIGINT CHECK (amount > 0)` alongside
`direction TEXT CHECK (direction IN ('DEBIT','CREDIT'))`.

The signed form is genuinely more convenient, and its convenience lands exactly on the invariant
this service cares most about. It was rejected anyway, for one reason that outweighs it:

**A missing negation is the most common way ledger code goes wrong, and under signed amounts it
produces a perfectly valid row.** Nothing in the schema, the types, or the database can tell a
debit that forgot its minus sign from a credit. The error is silent, it is permanent (ADR-0007:
no `UPDATE`), and it breaks conservation in a way that is only discoverable later by summing.
Under unsigned-plus-direction, the same mistake has nowhere to hide: a negative amount violates a
`CHECK`, and getting the direction wrong requires writing the wrong word rather than dropping a
character.

There is a smaller supporting argument. **Debit and credit are the domain's own vocabulary** —
they are what the accounting model actually says. A minus sign is an encoding of that vocabulary,
and storing the encoding instead of the term makes every reader translate.

> Recorded without adversarial review in this repo. The decision arrived pre-formed from an
> external design discussion and was locked directly during FS-0003 scoping.

## Decision

**`amount` is always strictly positive; `direction` carries the sign.**

- `CONSTRAINT amount_positive CHECK (amount > 0)`
- `CONSTRAINT direction_valid CHECK (direction IN ('DEBIT','CREDIT'))`
- Sum-to-zero is computed by mapping `direction` to a sign — `DEBIT` negative, `CREDIT`
  positive — in the service layer before the write.

## Consequences

- **A sign error is unrepresentable rather than merely unlikely.** The database rejects it at
  insert time, which matters more than usual here because entries are immutable once written.
- **Rows read the way the domain speaks.** `DEBIT 500` needs no translation; `-500` does.
- **Cost: sum-to-zero is no longer a plain `SUM()`.** It requires a `CASE` over `direction`, and
  FS-0003 places that check in the service layer, so **the database does not currently enforce
  the invariant at all**. FS-0003 open question 2 raises a `DEFERRABLE INITIALLY DEFERRED`
  constraint trigger as the way to get it back; that remains unsettled and this ADR does not
  settle it.
- **Cost: two columns instead of one**, and every query that reasons about net movement carries
  the `CASE`.
- **`direction` is a closed set enforced by a `CHECK`.** Whether `reason` and `reference_type`
  get the same treatment is open — see FS-0003 open question 3.
