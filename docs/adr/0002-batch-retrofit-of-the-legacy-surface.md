# ADR-0002 — Batch retrofit of the legacy HTTP surface, superseding serialize-on-touch

Status: accepted
Date: 2026-08-13
Scope: `game-server/api-gateway` — amends [ADR-0001](0001-contract-layer.md) §9 for the
migration period only
Realized by: FS-0002 (gateway surface serialized)

## Context

ADR-0001 §9 fixed adoption as **serialize-on-touch, never big-bang**: an endpoint is wrapped as
slice ⓪ of the first feature that touches its surface. That was the right rule when it was
written, and the reasoning still holds in the general case — migration cost is paid only where
work is actually happening, and endpoints that never change never cost anything.

Two things have changed since.

**The precondition it was hedging against is now met.** ADR-0001 named one hard prerequisite:
a single error-mapping seam. Without it, each wrapped endpoint had to invent its own error
translation, so wrapping was genuinely per-endpoint design work — exactly the kind of cost
worth deferring. FS-0001 built that seam and migrated all 90 error writes to it. With the seam
shipped, wrapping an endpoint is no longer design; it is **transcription** of behavior that is
already uniform at its only interesting boundary.

**The gates are vacuous until the first endpoint serializes.** ADR-0001 says so itself: the
regenerate-and-diff gate, the breaking-change ratchet, and the client-staleness check "cannot
be *proven* until the repo's first serialized endpoint exists." Under serialize-on-touch, that
moment arrives whenever some future feature happens to touch some endpoint — an unbounded wait
during which CI reports SKIPPED and the contract layer protects nothing. barrowspire has 29
in-scope routes and no scheduled work against most of them.

The combination is the problem: the cheap-per-endpoint argument for deferring has evaporated,
while the cost of deferring — an unenforced contract layer — accrues every day.

### Alternatives considered and rejected

- **Keep serialize-on-touch unchanged.** Honest to the existing ADR, but leaves the gates
  unproven indefinitely and leaves the repo with two live documentation surfaces for an
  unbounded period. The rule was written to avoid wasted effort, not to prevent enforcement.
- **Serialize only the endpoints the client actually calls.** Smaller, but produces a spec that
  silently under-describes the surface, and the ratchet cannot protect what is not in the
  document. A partial spec invites the belief that it is complete.
- **Amend ADR-0001 in place.** Rejected on principle: ADRs are immutable. A changed decision
  gets a new ADR that names what it supersedes.
- **Fold the decision into FS-0002 as a note.** Rejected: this is a constraint, not a
  capability. Burying it in a feature spec means the next reader of ADR-0001 §9 finds a rule
  the repo no longer follows and no record of why.

## Decision

**For the remaining unserialized surface of `game-server/api-gateway`, adoption is a single
batch retrofit under one FS, sliced by route group.** ADR-0001 §9 is superseded for this
migration and for this service only.

1. **Retrofit is transcription, not design.** Each endpoint's contract is its **current
   observed behavior, verbatim**. Constraints are transcribed from existing validation, never
   invented. A field that is optional today stays optional even where required would be
   better. No behavior change rides this migration.

2. **A "this looks wrong" finding is logged, never fixed here.** Missing validation, a
   questionable status, an unauthenticated route that looks like it should not be — each goes
   to the pioneer log as a candidate behavior change with its own future FS. Silently
   correcting behavior inside a wrap makes the wrap unverifiable, because before/after
   comparison is the only check that a transcription was faithful.

3. **Slicing is by route group, not by endpoint.** A group shares middleware, a downstream
   client, and a response idiom, so it is the unit where a transcription error is visible.

4. **Verification is per-group before/after, recorded.** The oasdiff ratchet cannot see a
   first serialization (ADR-0001's stated blind spot), so each group ships with a recorded
   request/response comparison. Responses must be byte-compatible. Error bodies are the sole
   exception — they changed deliberately in FS-0001, which has already shipped.

5. **§9 returns to force once the retrofit merges.** After FS-0002, every new or changed
   endpoint follows the normal chain: FS §API surface → typed handler → derived spec →
   generated client → gates. There is no second batch; anything left unserialized after this
   feature is unserialized on purpose and named in FS-0002's Out of Scope.

6. **The interactive docs UI is served on a public route.** Chosen deliberately: the surface it
   documents is a game client's API, the value of a browsable contract is highest when it needs
   no credentials, and every operation it lists is already reachable by an unauthenticated
   caller who reads the client bundle. **Revisit trigger:** the first endpoint whose *existence*
   is sensitive, or the first non-first-party consumer, reopens this clause.

## Consequences

**Accepted / positive:**

- The gates stop being decoration. From the first merge, regenerate-and-diff, Spectral, and the
  breaking-change ratchet all have a document to act on.
- One documentation surface instead of two, and no unbounded transitional period.
- The next feature to touch the gateway pays no serialization tax — condition 2 of the retrofit
  brief becomes true.

**Costs / follow-ups:**

- A large, low-intellectual-content diff across five slices. That is the shape of transcription
  work and should not be mistaken for risk.
- The pioneer log will accumulate behavior-change candidates that are *known wrong and left
  wrong* until someone specs them. This is deliberate, and the log is what keeps it honest
  rather than forgotten.
- **The template this repo was scaffolded from has no retrofit-mode clause.** `setup`'s
  `contract-ADR.md` states serialize-on-touch absolutely. Every repo adopting the contract
  layer after its error seam exists will hit exactly this conflict. Recorded here as a finding
  against the SSOT, not as a local workaround.
