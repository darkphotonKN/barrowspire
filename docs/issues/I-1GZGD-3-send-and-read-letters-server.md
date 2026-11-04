---
id: I-1GZGD-3
status: open
implements: FS-1GZGD
blocked_by: [I-1GZGD-1]
labels: [ready-for-agent]
title: "FS-1GZGD slice 3: admins send letters; players read their mailbox, its summary, and mark letters read (notification-service + api-gateway)"
---
Implements FS-1GZGD §Requirements R1–R11, R30–R32, §Amendment 2026-11-04 (A1, A2, A3), §API surface (summary, letters, read, admin send), §Acceptance Criteria (Letters and entry points, Gateway contract), §Edge States

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

> **Amended 2026-11-04** (FS-1GZGD amendment A1–A3): the send accepts template, copy and gold
> enclosures, resolves the item ones through items `ResolveItemSnapshots` and **stores the
> snapshots** in the letter; the letters read returns them as stored, so the gateway composes
> nothing and calls no items RPC. `UNKNOWN_ITEM_INSTANCE` joins the codes. The `mail:arrived`
> publish is I-1GZGD-8, not this issue.

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
`403 · FORBIDDEN` before forwarding; `EnclosureRequest` of kinds `template` / `copy` / `gold`).
The letters read returns each item enclosure as `{kind: "item", quantity, item: ItemSnapshot}`
straight from notification's stored snapshot (R31, A2) — no items call at read. Then `make openapi && make client` and commit the
regenerated `openapi.yaml` and `game-client/src/api/generated/` with the handlers.

**common/errcode:** add every mailbox code once, here, including the ones only I-1GZGD-4 uses,
so that file is touched once: `LETTER_TITLE_INVALID`, `LETTER_BODY_INVALID`,
`LETTER_EXPIRY_INVALID`, `ENCLOSURE_INVALID`, `UNKNOWN_ITEM_TEMPLATE`, `UNKNOWN_ITEM_INSTANCE`,
`LETTER_EXPIRED`,
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

- [ ] An admin send to one member stores one `official` letter visible to that member only.
- [ ] A broadcast stores one letter row and no state rows; every member, including one whose first
      read is after the send, sees it.
- [ ] A non-admin gets `403 · FORBIDDEN` at the gateway, and a player token calling
      `SendLetter` directly is refused.
- [ ] Each bound violation (title 61, body 2001, empty title, 11 enclosures, two gold
      enclosures, slot count 61, quantity 0, gold 0, past expiry, item level 0) is refused with
      its code and stores nothing; an unknown template is `UNKNOWN_ITEM_TEMPLATE`, an unknown
      instance `UNKNOWN_ITEM_INSTANCE`.
- [ ] A template enclosure is stored as a snapshot at the given item level, or at the template's
      `min_item_level` without one; a copy enclosure of a unique with affixes is stored with its
      template, item level, rarity and affixes, and changing or deleting the source afterwards
      changes nothing the letter returns. No drop rule refuses either.
- [ ] Default expiry is sent + 30 days; an expired letter is absent from the list and every count,
      and mark read on it is `LETTER_EXPIRED`.
- [ ] The list is ≤ 50, newest first; each item enclosure returns its stored snapshot unchanged,
      and the read makes no items-service call.
- [ ] Mark read creates the state row once and is a no-op success on repeat; summary counts follow
      R9 for direct and broadcast letters.
- [ ] A letter not addressed to the caller is `404 · NOT_FOUND` on mark read.
- [ ] `openapi.yaml` and the generated client are regenerated, not hand-edited, and committed with
      the handlers; the contract checks pass.
- [ ] Tests pass in notification-service and api-gateway; lint clean.

## Blocked By

I-1GZGD-1 (`ResolveItemSnapshots` for resolving enclosures at send)

## Spec Reference

FS-1GZGD §Requirements R1–R11, R30–R32; §Amendment 2026-11-04 A1–A3; §API surface rows 1–3 and
5; §Decisions D1, D2(a), D3, D8, D9, D10, D14 (list bounds); spec defaults S1, S2, S6, S7. User
stories 4–7, 17, 20–26, 29, 31, 34–38.

## TDD Approach

- RED: a repository test that a broadcast is visible to a member with no state row and that
  `MarkLetterRead` creates exactly one row for (letter, member).
- GREEN: the `letters` / `letter_states` tables and a list query that left-joins the member's
  state row.
