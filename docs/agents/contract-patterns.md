# Contract layer — recurring patterns

Copied to `docs/agents/contract-patterns.md` when a repo opts into the contract layer.

**These are PATTERNS, not code to paste.** Every snippet below is written against one
specific stack (Go + gin + huma v2 + gRPC). Yours will differ. What generalises is the
*shape* — the seam each pattern names, and the trap each one avoids. Re-derive the code;
reuse the reasoning.

Each pattern below cost real debugging time to find. That is the only reason it is here.

---

## 1. The error-mapping seam must already exist

**Shape.** Translating downstream failures into problem+json is a two-line adapter **if the
service already has a single place that decides (status, client-safe message) for every
error.** If that place does not exist, building it is the real cost — and it must happen
*before* the contract layer, not during.

```go
func problemFor(op string, err error) huma.StatusError {
    code, msg := apierr.StatusFor(err)   // the pre-existing, service-wide decision
    return huma.NewError(code, op+": "+msg)
}
```

The adapter **re-serializes an existing decision**; it must not make a new one. If you find
yourself writing a per-handler status switch, the seam is missing.

> **Adoption precondition.** Before committing to the contract ADR, answer: *does this
> service have one `StatusFor`-shaped boundary?* If no, that refactor is slice ⓪, and the
> contract layer waits.

**The trap.** Once the error model carries a domain `code`, the stock error model no longer
fits — it has no extension field. The adapter becomes a custom type plus an override of the
library's error constructor. Still **one seam**, but no longer two lines.

## 2. The custom error type MUST declare its own content type

**Shape.** A custom problem type has to implement whatever method the library uses to pick
the media type — in huma, `ContentType(string) string` alongside `Error()` and `GetStatus()`.

```go
func (p *Problem) ContentType(ct string) string {
    if ct == "application/json" {
        return "application/problem+json"
    }
    return ct
}
```

**The trap, and it is the worst one here.** Omitting it degrades **silently** to
`application/json`. Every test asserting only on status and body still passes. The contract
says `problem+json`, the wire says `application/json`, and nothing tells you.

→ **Assert the `Content-Type` header explicitly** in at least one error test per status class.
A body-only assertion cannot catch this.

## 3. The identity bridge

**Shape.** Framework-adapter mounts (huma-on-gin, huma-on-chi, any typed layer over an
existing router) all hit the same question: **how does middleware-set identity reach the typed
handler?** The adapter usually hands the handler a `context.Context`, while the router's
middleware published identity into the *router's own* per-request store. Those are different
places.

```go
// Mounted AFTER the auth middleware, BEFORE any typed route. Written ONCE per service.
func BridgeIdentity() gin.HandlerFunc {
    return func(c *gin.Context) {
        if userID, err := GetUserID(c); err == nil {
            c.Request = c.Request.WithContext(
                context.WithValue(c.Request.Context(), ctxKey{}, userID))
        }
        c.Next()
    }
}
```

**Rules that make this safe:**
- Write it **once**, as the single identity seam for serialized routes. If a second identity
  path appears later (e.g. identity moving to transport metadata), it converges *here*.
  Two identity seams is the failure mode.
- Identity is **never** a body field. Its absence from every request type is a security
  property, not an omission.

## 4. The problem-emitting auth variant (fork, don't replace)

**Shape.** Auth middleware rejects *before* any typed handler runs. If it aborts with the
old error shape, the contract has a hole on its single most common error — 401 — while
claiming full coverage.

The fix is a **fork**, not a replacement: a variant of the middleware that emits problem+json,
mounted on the serialized group only. Legacy middleware and every legacy route stay
byte-identical. Under serialize-on-touch, a shared rewrite would change untouched endpoints.

**The trap.** Use the raw-bytes response writer, not the JSON helper:

```go
// c.Data, NOT c.JSON — c.JSON forces application/json and silently drops the RFC 9457 type.
c.Data(http.StatusUnauthorized, "application/problem+json", body)
```

Same failure as pattern 2, reached by a different route. Log server-side with the real reason;
tell the client only "unauthorized".

## 5. Optionality is load-bearing in a generated schema

**Shape.** A schema generator reads the language's own optionality markers. In Go + huma, a
field is **REQUIRED unless its json tag carries `omitempty`**.

Ship a PATCH request type without `omitempty` and the generated schema declares every field
required — which rejects the empty `{}` body the spec calls a valid no-op. Invisible until
something rejects a legal request.

**The inverse is also deliberate and worth a comment.** If the contract promises a field is
always *present* (e.g. `errors[]` present-and-empty so clients never null-check), you must
**omit** `omitempty` on purpose. These two look identical in a diff and mean opposite things —
comment which one you meant.

## 6. Check the dependency floor before adopting

**Shape.** A contract library imposes a version floor on the language and often on the router
it wraps. Answer this *before* slice ⓪, not during:

```bash
go mod graph | grep <contract-lib>      # what does it drag in, and at what version?
```

Expect the floor to move things you did not choose. The reference adoption forced a router
minor bump and a language-directive bump, which pulled a QUIC stack into the build graph via
**the router**, not the contract library — worth attributing correctly so the cost is not
blamed on the wrong dependency.

Belongs in the first slice's risk note, not discovered mid-feature.

## 7. Gate tooling has its own toolchain floor — decouple it

**Shape.** Contract tools (breaking-change diffing, linting) move faster than your service.
Running one via the language's `run`-from-source path silently drags in a *second* toolchain
when its floor exceeds yours, making the gate depend on a network fetch.

**Install pinned prebuilt binaries** for gate tooling. This keeps the *gate's* toolchain
independent of the *service's*, which is also what lets repos on different language versions
share the same gate config.

## 8. `make` runs each recipe line in its own shell

**Shape.** This guard does **not** work:

```make
target:
	@if [ ! -f spec ]; then echo "SKIPPED"; exit 0; fi
	@real-work-here                      # <- runs anyway
```

`exit 0` ends only *that line's* shell. Make proceeds to the next line.

In the reference adoption this produced two silent-success gates within an hour: a redirect
created an empty spec file that then satisfied every downstream `[ -f ]` guard, and the
breaking-change gate happily diffed two empty specs and reported "no changes".

→ Write each recipe as a **single `if/else` shell block**, and verify targets **by exit code**,
never by reading their output.
