# ADR-0091 — The party cap and the random match size are separate settings

Status: accepted
Date: 2026-11-24
Scope: `game-server/game-service`
Amends: [ADR-0035](0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) —
the "The matchmaker's match size is the party size" consequence
Realized by: [FS-R82NV](../specs/R82NV-party-formation.md) § Change: Party cap 3, match size its own
setting
Builds on: [FS-BJNYC](../specs/BJNYC-party-instance-entry.md) R1 (party members do not queue),
[FS-988SM](../specs/988SM-matched-party.md) R10 (a matched roster larger than the party cap),
[FS-K2HKP](../specs/K2HKP-cross-replica-matchmaking-and-handoff.md) (the matchmaker and its match
size)

## Context

ADR-0035 tied the random queue's match size to the party cap: one config value, `PARTY_SIZE`
(FS-R82NV R8), fed both, so a random roster and a full party had the same shape, and changing one
changed the other.

On 2026-11-24 the user wanted parties of three while random matches stay at two: "increase the
scope of number of players for party size ... from 2 to 3, for party players. Nothing changed for
the random queue of 2 players (non party)". With one setting that cannot be had: raising the cap
raises the match size with it.

The tie was a convenience, not a constraint the rest of the design leans on. A party member
cannot queue (FS-BJNYC R1), so a party never enters through the matchmaker and never needs a
roster of its own shape. The one place the two numbers meet is a random match forming its party
(FS-988SM), and FS-988SM R10 already settles a match larger than the cap (the first ones up to
the cap are members, the rest play outside the party). A match smaller than the cap is a party
with room left, which the instance lock keeps closed until the run ends.

Approved by the user under the "Party of three" charter, 2026-11-24.

## Decision

The party cap and the random match size are two settings.

- `PARTY_SIZE` (env) is the party cap only: default **3**, a whole number from 2 to 4, anything
  else fails startup.
- `MATCH_SIZE` (env, new) is the matchmaker's match size: default **2**, a whole number from 2
  to 4, anything else fails startup. It is loaded the same way as `PARTY_SIZE`.

Every other clause of ADR-0035 stands.

## Consequences

- Parties of three form and enter the Spire together; random matches stay at two, as before.
- A matched party (FS-988SM) is smaller than the cap by default. It cannot take a third member
  inside its run (the instance lock, FS-NCC9J `in_run`), and its members leave it as they leave
  the run (ADR-0039), so the room never gets used. Accepted.
- An operator who sets `MATCH_SIZE` above `PARTY_SIZE` gets FS-988SM R10's split party; nothing
  stops that pairing at startup. Accepted: R10 is the specified behaviour for it.
- One more setting to know about, and the two can drift apart by accident. The old knob still
  works for the cap; anyone who used `PARTY_SIZE` to change the match size now needs `MATCH_SIZE`.
