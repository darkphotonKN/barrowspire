---
id: I-1GZGD-1
status: open
implements: FS-1GZGD
blocked_by: []
labels: [ready-for-agent]
title: "FS-1GZGD slice 1: idempotent item grants into the stash and template summaries (items-service)"
---
Implements FS-1GZGD §Requirements R18–R22, R26, §Acceptance Criteria (Claim; Guard 2), §Edge States (stash full, template retired)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

## What to Build

Two new items-service RPCs, end to end (proto → handler → service → repository → DB), with no
gateway route — notification-service is the only caller (I-1GZGD-3, I-1GZGD-4).

- `GrantItems(grant_id, enclosures[{template_id, quantity}])` — with the caller's forwarded
  member token, mints `quantity` instances per enclosure into that member's **stash** in one
  transaction: rarity `normal`, the template's base stats and `min_item_level`, no affix roll
  (D4, S4), status `AVAILABLE`, location `STASH`. All-or-nothing: if the stash plus the grant's
  slot count would exceed 60, nothing is minted and the call is refused `STASH_FULL` (the
  existing errcode). An unknown template mints nothing and is refused (S2 backstop).
- `grant_id` is a unique key recorded **in the minting transaction** (a new grants table, or an
  equivalent unique record). A repeat with a known grant id mints nothing and returns the first
  grant's instance ids with `already_granted = true`. Concurrent identical calls mint once (the
  unique index decides, not a read-then-write).
- `GetTemplateSummaries(template_ids)` — public catalogue facts (name, item type, weapon type,
  armor slot, base stats, item level, rarity `normal`) for each known template; unknown ids are
  omitted. No member token required (like the public item summaries, FS-8EGFA).

items-service gains no gold or letter concept (R22).

**Files it expects to touch:** `game-server/common/api/proto/items/items.proto` + its regenerated
Go (regenerate, never patch); `game-server/items-service/internal/items/handler.go`,
`service.go`, `repository.go`, `model.go` (or a new `grant.go` beside them) and their tests; a
**new** numbered migration pair `game-server/items-service/migrations/0000NN_create_item_grants.{up,down}.sql`
(next free number; never edit an existing migration); `game-server/common/errcode/errcode.go`
only if a new refusal code is needed for an unknown template. This is the **only** issue that
touches `items.proto`.

## Acceptance Criteria

- [ ] `GrantItems` with enclosures (template A ×1, template B ×3) mints four `AVAILABLE` stash
      instances owned by the token's member, `normal`, base stats, the template's
      `min_item_level`, no affixes, and returns their ids.
- [ ] With the stash 2 slots short, it mints nothing and is refused `STASH_FULL`.
- [ ] An unknown template id mints nothing and is refused.
- [ ] **Guard 2:** a second call with the same grant id mints nothing and returns the first call's
      ids with `already_granted = true`.
- [ ] **Guard 2 (concurrent):** two identical `GrantItems` calls started together against a real
      database mint exactly one set.
- [ ] No member field exists on the request; the member is the forwarded token's.
- [ ] `GetTemplateSummaries` returns facts for known ids and omits unknown ones, without a token.
- [ ] The new migration's down reverses its up; no existing migration file changed.
- [ ] Tests pass (`go test ./...` in items-service), lint clean.

## Blocked By

None

## Spec Reference

FS-1GZGD §Requirements R18–R22 (grants, template summaries), R26 (grant retried); §Decisions D4,
D6, D7; spec defaults S2, S4. User stories 9, 11, 12, 13.

## TDD Approach

- RED: a repository-backed test that `GrantItems` twice with one grant id leaves one set of rows.
- GREEN: the grants unique key written in the minting transaction, with the conflict path
  returning the recorded ids.
