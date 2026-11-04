---
id: I-1GZGD-3
status: done
implements: FS-1GZGD
blocked_by: [I-1GZGD-1]
labels: [ready-for-agent]
title: "FS-1GZGD slice 3: admins send letters; players read their mailbox, its summary, and mark letters read (notification-service + api-gateway)"
---
Implements FS-1GZGD §Requirements R1–R11, R30–R32, R45–R49, R51, §Amendment 2026-11-04 (A1, A2, A3), §Amendment 2026-11-04 (A6), §API surface (summary, letters, read, admin send), §Acceptance Criteria (Letters and entry points, Gateway contract, Sending to a member list), §Edge States

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

> **Amended 2026-11-04** (FS-1GZGD amendment A1–A3): the send accepts template, copy and gold
> enclosures, resolves the item ones through items `ResolveItemSnapshots` and **stores the
> snapshots** in the letter; the letters read returns them as stored, so the gateway composes
> nothing and calls no items RPC. `UNKNOWN_ITEM_INSTANCE` joins the codes. The `mail:arrived`
> publish is I-1GZGD-8, not this issue.

> **Amended again 2026-11-04** (FS-1GZGD amendment A6): the admin send also takes
> `recipient: { memberIds: [...] }`. It stores one one-member letter per distinct recipient in
> **one transaction**, resolves enclosures **once**, takes at most 1000 distinct ids
> (`LETTER_RECIPIENTS_INVALID` for an empty or oversized list), and answers
> `201 { letters: [{ letterId, memberId? }], expiresAt }` for **every** recipient form (was
> `{ letterId, expiresAt }`). Read, summary, mark read, letter state rows and the claim are
> unchanged. The per-recipient publish is I-1GZGD-8.

## What to Build

The Mailbox bounded context in notification-service and its HTTP surface, end to end, minus the
claim (I-1GZGD-4) and the broker entry point (I-1GZGD-5).

**notification-service** (new package, e.g. `internal/mailbox/`, following the domain package
pattern; ADR-0044; names per `CONTEXT.md` § Mailbox — no `Mail*` types):
- New migration pair(s): `letters` (id, title, body, sender kind, recipient member id or
  all-members, enclosures — gold amounts and item snapshots with quantities, sent_at, expires_at) and `letter_states` (letter id, member id,
  read_at, claim state; unique per (letter, member)). A broadcast is one `letters` row and no
  state rows (D3).
- `SendLetter`: checks the forwarded identity is `RoleAdmin` (R11), validates title/body lengths
  in runes (R3), enclosure bounds S1 (≤ 10, ≤ 1 gold, quantity 1–60, gold ≥ 1, slot count ≤ 60),
  expiry default +30 days or a future given one (R5). Item enclosures come as **template**
  (`templateId`, quantity, optional `itemLevel`) or **copy** (`copyOf` instance id, quantity)
  (A1); they are resolved once through items-service `ResolveItemSnapshots` and the returned
  **snapshots** are stored with their quantities (R4, A2). Unknown template →
  `UNKNOWN_ITEM_TEMPLATE`, unknown instance → `UNKNOWN_ITEM_INSTANCE`, unrepresentable →
  `ENCLOSURE_INVALID` (A3); items down → 503; a letter with no item enclosure calls no items RPC.
  No drop rule is checked here.
- `SendLetter` recipient (A6, R45–R51): one member, a **member list** or all members. For a list:
  de-duplicate, then refuse `LETTER_RECIPIENTS_INVALID` if no id or more than 1000 distinct ids
  remain (R47; ids not checked for existence, S7). Every other check runs once per request (R48).
  Resolve the item enclosures once (R49), then insert one ordinary one-member `letters` row per
  distinct recipient, all in **one transaction**, with identical title, body, enclosures, sent
  time and expiry (R45). No column marks a list send, and nothing in `letter_states`, the list
  query or the claim changes. Answer the stored letters as (letter id, member id?) in the order
  each id first appears, plus the expiry (R51); a one-member send answers one entry, a broadcast
  one entry with no member. Shape the store path so that it hands I-1GZGD-8 the stored letters
  after the commit.
- `ListLetters` (≤ 50, newest first, non-expired, addressed to the member or to all),
  `GetMailboxSummary` (`unreadCount`, `unclaimedCount`, `waitingCount`, `newestLetterAt`; R9, S6),
  `MarkLetterRead` (lazy state row, idempotent; expired → `LETTER_EXPIRED`; not addressed →
  `NOT_FOUND`). Member from the token (R10).
- Declare `ClaimLetter` in the proto now (request/response messages per FS §RPC surface) and
  leave it on the generated `Unimplemented` stub, so I-1GZGD-4 does not need to touch
  `notification.proto` again.
- An items-service gRPC client (env-configured `ITEMS_ADDR`, ADR-0022) wired in `config/routes.go`.

**api-gateway** (typed handlers, FS-NTPW2 style; a new `internal/gateway/mailbox/` or the
existing `notification` package): `GET /api/mail/summary`, `GET /api/mail/letters`,
`POST /api/mail/letters/{letterId}/read`, `POST /api/admin/mail` (rejects non-`RoleAdmin` with
`403 · FORBIDDEN` before forwarding; `EnclosureRequest` of kinds `template` / `copy` / `gold`;
recipient `{ memberId }` | `{ memberIds: uuid[] }` | `{ allMembers: true }`, exactly one, else
`422 · VALIDATION_FAILED`, and a non-uuid list entry is 422 too. The list's bounds are **not**
restated at the gateway; notification owns them (R46–R47). The answer is
`201 { letters: { letterId, memberId? }[], expiresAt }`).
The letters read returns each item enclosure as `{kind: "item", quantity, item: ItemSnapshot}`
straight from notification's stored snapshot (R31, A2) — no items call at read. Then `make openapi && make client` and commit the
regenerated `openapi.yaml` and `game-client/src/api/generated/` with the handlers.

**common/errcode:** add every mailbox code once, here, including the ones only I-1GZGD-4 uses,
so that file is touched once: `LETTER_TITLE_INVALID`, `LETTER_BODY_INVALID`,
`LETTER_EXPIRY_INVALID`, `ENCLOSURE_INVALID`, `UNKNOWN_ITEM_TEMPLATE`, `UNKNOWN_ITEM_INSTANCE`,
`LETTER_RECIPIENTS_INVALID` (A6), `LETTER_EXPIRED`,
`NOTHING_TO_CLAIM`, `LETTER_ALREADY_CLAIMED`, `LETTER_CLAIM_IN_PROGRESS` (and list them in
`domainCodes`).

**Files it expects to touch:** `game-server/common/api/proto/notification/notification.proto` +
regenerated Go (the **only** issue that edits it); `game-server/common/errcode/errcode.go`;
`game-server/notification-service/migrations/000005_*.{up,down}.sql` (next free numbers; never
edit existing ones); `game-server/notification-service/internal/mailbox/*` (new);
`game-server/notification-service/config/routes.go`, `cmd/server/main.go`, `.env`;
`game-server/api-gateway/internal/gateway/mailbox/*` (new) or `.../notification/*`;
`game-server/api-gateway/config/routes.go`; `game-server/api-gateway/openapi.yaml` and
`game-client/src/api/generated/schema.d.ts` (regenerated only); deploy env for notification's
`ITEMS_ADDR` (`game-server/docker-compose.yml`, `game-server/deploy/**` ConfigMaps as they exist;
local `.env` uses `127.0.0.1:<port>`).

## Acceptance Criteria

- [x] An admin send to one member stores one `official` letter visible to that member only.
- [x] A broadcast stores one letter row and no state rows; every member, including one whose first
      read is after the send, sees it.
- [x] A non-admin gets `403 · FORBIDDEN` at the gateway, and a player token calling
      `SendLetter` directly is refused.
- [x] Each bound violation (title 61, body 2001, empty title, 11 enclosures, two gold
      enclosures, slot count 61, quantity 0, gold 0, past expiry, item level 0) is refused with
      its code and stores nothing; an unknown template is `UNKNOWN_ITEM_TEMPLATE`, an unknown
      instance `UNKNOWN_ITEM_INSTANCE`.
- [x] A template enclosure is stored as a snapshot at the given item level, or at the template's
      `min_item_level` without one; a copy enclosure of a unique with affixes is stored with its
      template, item level, rarity and affixes, and changing or deleting the source afterwards
      changes nothing the letter returns. No drop rule refuses either.
- [x] Default expiry is sent + 30 days; an expired letter is absent from the list and every count,
      and mark read on it is `LETTER_EXPIRED`.
- [x] The list is ≤ 50, newest first; each item enclosure returns its stored snapshot unchanged,
      and the read makes no items-service call.
- [x] Mark read creates the state row once and is a no-op success on repeat; summary counts follow
      R9 for direct and broadcast letters.
- [x] A letter not addressed to the caller is `404 · NOT_FOUND` on mark read.
- [x] *(A6)* `memberIds: [A, B, C]` stores three one-member letters with identical content, each
      visible only to its member; `[A, B, A]` stores two and answers them in the order A, B.
- [x] *(A6)* The `201` is `{ letters: [{ letterId, memberId? }], expiresAt }` for all three
      recipient forms: one entry with the member for `memberId`, one without for `allMembers`.
- [x] *(A6)* An empty list and 1001 distinct ids are each `400 · LETTER_RECIPIENTS_INVALID` and
      store nothing; 1000 distinct ids plus duplicates are accepted. Two recipient forms, none,
      or a non-uuid entry are `422 · VALIDATION_FAILED`.
- [x] *(A6)* A list send with item enclosures calls `ResolveItemSnapshots` exactly once; a bound
      violation in title, body, enclosures or expiry stores no letter for any recipient.
- [x] *(A6)* All or none: a storage failure forced part-way through a list (repository test)
      leaves no letter of the request stored.
- [x] *(A6)* Two recipients of one list send read and mark read independently. One marking read
      leaves the other unread.
- [x] `openapi.yaml` and the generated client are regenerated, not hand-edited, and committed with
      the handlers; the contract checks pass.
- [x] Tests pass in notification-service and api-gateway; lint clean.

## Blocked By

I-1GZGD-1 (`ResolveItemSnapshots` for resolving enclosures at send)

## Spec Reference

FS-1GZGD §Requirements R1–R11, R30–R32; §Amendment 2026-11-04 A1–A3; §API surface rows 1–3 and
5; §Amendment 2026-11-04 (A6), R45–R49, R51; §Decisions D1, D2(a), D3, D8, D9, D10, D14
(list bounds); spec defaults S1, S2, S6, S7. User stories 4–7, 17, 20–26, 29, 31, 34–38, 40–44, 46.

## TDD Approach

- RED: a repository test that a broadcast is visible to a member with no state row and that
  `MarkLetterRead` creates exactly one row for (letter, member).
- GREEN: the `letters` / `letter_states` tables and a list query that left-joins the member's
  state row.
- RED (A6): a repository test that storing a three-member list send whose third insert fails
  stores none, and a service test that `[A, B, A]` stores two letters and resolves enclosures
  once.

## Charter run (2026-11-04)

Merged on `feat/notification-mailbox` (not on main, not pushed); the code-review fix round was merged at `fb1abf5c` and is recorded as FS-1GZGD amendment A9. Done: every criterion has a test. A9.4 and A9.5 changed this issue's surface: a non-admin send is `PermissionDenied` before its draft is parsed; mark read never waits on a claim (`FOR UPDATE SKIP LOCKED`; on an unread letter the first mark read holds the row for one statement, so a claim in that instant may answer `LETTER_CLAIM_IN_PROGRESS`, benign and retryable, A9.5 as corrected after the round-2 review); notification refuses to boot without `JWT_SECRET` (R65); the gateway reads run under a 5 s deadline (R64). Wrap-up run: `go test ./...` passes in notification-service (including the repository tests against a throwaway schema with `NOTIFICATION_TEST_DB_DSN`) and api-gateway; lint has no new findings since main.
