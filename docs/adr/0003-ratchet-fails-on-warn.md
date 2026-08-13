# ADR-0003 — The breaking-change ratchet fails on WARN, not only ERR

Status: accepted
Date: 2026-08-13
Scope: `game-server/api-gateway` — amends [ADR-0001](0001-contract-layer.md) §3
Realized by: a one-flag change to `make openapi-breaking`

## Context

ADR-0001 §3 set the ratchet to block on `ERR`. That is the right default for an API whose
consumers are strangers: oasdiff reserves `ERR` for changes that break a conforming client
outright, and grades the rest as `WARN`.

It is the wrong default **here**, and a test showed why rather than an argument.

Renaming a single response field — `name` → `display_name` in the member schema, exactly the
kind of drift a later feature spec introduces when it restates a shape it should have referenced
— produced this:

```
oasdiff --fail-on ERR   → exit 0    (3 warnings, merge allowed)
oasdiff --fail-on WARN  → exit 1    (blocked)
```

Every response field on this surface is optional, because the gateway mirrors protobuf
`omitempty` semantics. So oasdiff classifies **every** field removal as
`response-optional-property-removed`, a WARN. Under `--fail-on ERR` the ratchet cannot fail on a
field rename **anywhere on the surface**, which is most of what it was adopted to catch.

The generated TypeScript client did catch it — three compile errors. But only in files that
happen to read that field. A field no consumer reads yet can be renamed with nothing objecting,
and it is precisely the not-yet-consumed fields whose names nobody remembers.

### Alternatives considered and rejected

- **Leave it at ERR and rely on the client build.** Covers only consumed fields, and only for
  the one consumer that compiles against the contract. It is a real net, but it has holes
  exactly where human memory does.
- **Make fields required so removals grade as ERR.** Changes the wire contract to satisfy a
  linter, and would be false: the fields genuinely are optional.
- **Review harder.** The failure mode is a plausible-sounding rename passing a review by someone
  who never memorized the original. That is not a discipline problem.

## Decision

**`make openapi-breaking` runs with `--fail-on WARN`.**

1. Any change oasdiff grades WARN or above blocks merge — including the removal or rename of an
   optional response property.
2. A deliberate change still ships: it goes through `.oasdiff-ignore` with a stated reason,
   which is the mechanism ADR-0001 §3 already established for making a break explicit rather
   than accidental.
3. This follows the same reasoning as ADR-0001 §8, which sets plane 1 to **strict** because the
   consumer ships with the server. Strictness is affordable here for the same reason: there is
   one first-party consumer, released together, and a break it must adapt to is a break we can
   coordinate in the same commit.

**Verified before adopting:** `--fail-on WARN` against the clean tree exits 0 — the tightening
costs nothing in false positives today.

## Consequences

**Accepted / positive:**

- Field renames and removals are now caught at the contract, not at whichever consumer happened
  to read the field.
- The ratchet finally covers the drift class this repo is most exposed to: a later feature spec
  restating an existing shape slightly differently.

**Costs / follow-ups:**

- More changes require an allowlist entry. That is the intent — the entry is where the reasoning
  gets written down.
- `WARN` is a broader net than `ERR` and will eventually flag something benign. When it does,
  allowlist it with a reason rather than widening the flag back.
- **This does not make a spec self-checking.** The ratchet compares the contract against its own
  previous revision. A feature spec that invents a *new* field duplicating an existing one
  semantically — `header` alongside `title` — adds rather than removes, and nothing here objects.
  That remains a review question, and it is code-review's `§API surface` check, not this gate's.
