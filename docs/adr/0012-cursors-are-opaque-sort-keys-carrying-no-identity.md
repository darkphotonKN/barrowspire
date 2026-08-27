# ADR-0012 — A cursor is a position, not a request: opaque base64url sort keys, decoded at the adapter, carrying no identity

Status: accepted
Date: 2026-08-25
Scope: `game-server/ledger-service` — and, as the repo's first keyset pager, the shape every
subsequent one follows unless an ADR says otherwise
Realized by: FS-0003 §Requirements 23, §API surface (`listEntries`), §Edge States — implemented
by I-0023 (the encoding) and I-0026 (the pager)

## Context

FS-0003 §Requirement 23 settled that entry paging is keyset over `(created_at, id)` descending
and that the cursor is **opaque** to clients. Opaque is a promise about who may *read* a cursor.
It decides nothing about what a cursor *contains*, where it is decoded, or what happens when one
arrives that cannot be. Those three were left open, and two of them are one-way doors.

**A cursor's encoding is held by clients between requests.** It goes out in a response, sits in
the caller's hands for an unbounded interval, and comes back on the next request. There is no
version negotiation on a query parameter and no handshake to renegotiate one. Change the format
after the first cursor ships and every cursor in flight becomes undecodable — surfacing not as a
clean upgrade prompt but as a `422` on a request the client has every reason to believe is valid.
The decision is therefore made once, before anything issues a cursor, or it is made forever by
accident.

**The tempting content is `account_id`, and that is exactly the mistake.** `listEntries` scopes
to an account, so carrying the account in the cursor looks like free work avoided: page two would
already know whose rows to fetch without resolving the caller again. It inverts the trust
direction. A cursor is a client-held token that returns unvalidated, so if scoping reads the
account from the cursor, then *holding* a cursor **is** the authority to read that account's
history. Requirements 24–27 mask "not yours" as `404` precisely so transaction ids cannot be
probed; an account embedded in a cursor walks around that masking without attacking it — replay
a cursor obtained any other way and the scoping check never fires, because the cursor already
answered the question the check exists to ask. The check that holds on page one has to be the
same check, reading the same source, on page two.

**Third, decoding has to happen somewhere.** If the encoded string travels inward, every
repository method that pages grows its own base64 handling and re-derives the sort key's shape
at each call site — and the domain acquires a dependency on a transport encoding it has no
business knowing.

## Decision

**A cursor encodes the sort key of the last row on the page, and nothing else.**

- **Format:** base64url of `created_at|id` — the `(created_at, id)` pair that §Req 23's keyset
  orders by.
- **Contents:** no identity, no filter state, no limit, no direction. Anything that describes the
  *request* stays in the request, where it is re-authorized on every call. The cursor describes
  only a *position*.
- **Decoded at the adapter**, at the transport edge. Ports and repository signatures take the
  decoded sort key as typed values; an encoded cursor string never crosses into the port.
- **Undecodable cursor → `422 · VALIDATION_FAILED`** — never a silent reset to page one, which
  would return plausible wrong data to a client that thinks it is paging forward.
- **Past-the-end cursor → an empty page with `next_cursor` absent.** A valid position with no
  rows after it is a successful empty result, not an error.
- **Opaque stays a promise, not a mechanism.** The format is deliberately absent from §API
  surface; clients that decode and depend on it are unsupported.

## Consequences

- Scoping is enforced identically on every page, because every page resolves the caller from the
  same source — the JWT. There is no page at which authorization takes a different path.
- The cursor is safe to log, to put in a URL, and to hand to a support tool, because it carries
  no identity and grants no authority on its own.
- `(created_at, id)` is a total order, so no row is skipped or repeated across a page boundary
  even when appends land mid-page — which, on an append-only table, is the common case.
- Ports stay readable: a signature taking a decoded sort key states what it pages from, where one
  taking `cursor string` states only that something opaque happens inside.

- **Cost: the format is frozen for the life of every issued cursor.** base64url of `created_at|id`
  carries no version prefix, so adding a field later means a new query parameter or accepting
  that outstanding cursors break. If versioning is ever wanted, it has to be added before the
  first cursor ships — after that, the choice is gone.
- **Cost: "opaque" obscures nothing.** base64url is trivially reversible; a determined client
  will read `created_at|id` in seconds. The declaration signals *not yours to parse*, and nothing
  enforces it. A client that builds on the format will break, and we will not find out until it
  does.
- **Cost: resolving the caller on every page is work the embedded variant avoids.** That cost is
  accepted deliberately — it is the price of the authorization property above, and it is paid per
  page.
- **Cost: each transport that gains a pager repeats the decode step**, since decoding lives at the
  adapter rather than behind the port. Two transports over one pager means two decoders that must
  agree.
