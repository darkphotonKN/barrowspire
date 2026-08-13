# Pioneer log

Findings that surfaced while doing the work, which are **not** the work.

Two kinds live here:

- **Behavior-change candidates** — things the code does that look wrong, found while
  transcribing under ADR-0002 §2, which forbids fixing them inside a wrap. Each needs its own
  FS before anything changes.
- **Template findings** — gaps in the workflow templates this repo was scaffolded from. These
  belong upstream in the SSOT, not patched locally.

Nothing here is a bug report against work already merged. Everything here is *known and
deliberately left alone*, which is the only honest way to run a transcription.

---

## Behavior-change candidates (FS-0002 retrofit)

### 1. `complete-*` endpoints require three fields they discard

`POST /api/items/complete-weapon`, `/complete-armor` and `/complete-consumable` mark
`item_code`, `type_id` and `durability` as **required**, then never forward them. The items
proto has no such fields and the legacy handlers never sent them.

A caller must supply three values that reach nothing. Transcribed as-is: dropping a required
field is a behavior change, and a client that currently sends them would newly fail validation
if they were removed.

### 2. The stats routes are unauthenticated

`GET /api/stats/player/{playerId}` and `GET /api/stats/leaderboard` have no `AuthMiddleware`.
The gateway's own `SPECIFICATION.md` already asks whether that is intended.

Serialized as public, because documenting a route as unauthenticated records what it does
rather than blessing it. Adding auth would break `game-client`'s leaderboard silently.

### 3. `create-weapon` and `create-item-template` are superseded

Both are labelled "Legacy/Advanced" in the code and are replaced by the `complete-*` endpoints.
Transcribed anyway — removing an endpoint is a behavior change, and the breaking-change ratchet
now exists precisely to make that deliberate.

### 4. Timestamps are `{seconds, nanos}` objects, not RFC 3339

Every timestamp on the surface is protobuf's wire shape rather than a date string, so clients
convert by hand. `game-client` already carries the conversion in two places.

### 5. Every success response duplicates the HTTP status

`statusCode` and `message` wrap nearly every payload, restating information already in the
response line. Removing the envelope is the deliberate shape break ADR-0001 §11 assigns to a
client cutover — it was not taken here because FS-0002 promised byte-compatibility.

### 6. Inconsistent field-naming inside one message

`GetLoadoutResponse` mixes camelCase (`weaponId`, `headId`) with snake_case (`created_at`,
`updated_at`) in the same object. Both are transcribed exactly.

### 7. `POST /api/member/signup` is fire-and-forget with no completion signal

It answers 202 and publishes to AMQP; the client learns the account exists by polling
`check-email`. Works, but the pair has to be understood together or the 202 reads as a defect.

### 8. auth-service returns bare Go errors on paths other than login

Fixed for `LoginMember` during FS-0001. Other methods still return `fmt.Errorf` values that
cross gRPC as `codes.Unknown` and land on the gateway's 500 catch-all. The
`common/interceptor.Status` interceptor now maps sentinels, so the remaining work is returning
sentinels rather than bare errors.

---

## Template findings (route to the SSOT)

### A. `contract-ADR.md` has no retrofit-mode clause

Clause 9 states **serialize-on-touch, never big-bang**, absolutely. That is right while an edge
service has no error seam — wrapping an endpoint then means designing its error translation.
Once the seam exists, wrapping is transcription, and the rule's cost inverts: the three gates
cannot be proven until something serializes, so serialize-on-touch leaves them decorative for
an unbounded period.

Every repo adopting the contract layer after building its seam hits this. barrowspire needed
ADR-0002 to supersede §9. The template should carry the retrofit path itself.

### B. `contract-makefile-targets.mk` has no `gates-selftest`

Already noted in the template as a deliberate omission. Both repos that reached this point
wrote their own (`scripts/seam-gate-selftest.sh`, `game-client/lint-fence.sh`). It is no longer
speculative — it should ship.

### C. Nothing warns that Huma injects `$schema`

Huma's default config adds a `$schema` member to every serialized response body **and** to
every response schema, through two separate hooks (`Transformers` and
`OpenAPI.OnAddOperation`). Disabling one leaves the other. In a retrofit promising
byte-compatible responses this breaks every route at once, and in the document it declares a
member no response carries.

Belongs in `contract-patterns.md` as a named trap.

### D. Nothing warns that handler-returned errors bypass the seam

Huma decides a returned error's status from the VALUE. An error not implementing
`huma.StatusError` becomes a flat 500, so every mapping an error seam establishes silently
stops applying the moment a route is serialized. Nothing fails to compile and unit tests pass.

The fix is small (map the error to a status-carrying value, applied by a wrapper around every
handler so no return path can forget) but it has to be known in advance. Belongs in
`contract-patterns.md` next to the error-seam pattern.

### E. Huma keys schema components by type name

Declaring a `Timestamp` in two route-group packages panics the generator with
`duplicate name: Timestamp`. Any repo mirroring protobuf well-known types across groups hits
this on its second group. A shared `wire` package is the answer; the template should say so
before the panic.
