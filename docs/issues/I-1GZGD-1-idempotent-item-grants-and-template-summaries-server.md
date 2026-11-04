---
id: I-1GZGD-1
status: open
implements: FS-1GZGD
blocked_by: []
labels: [ready-for-agent]
title: "FS-1GZGD slice 1: item snapshots from templates and instances, and idempotent grants that mint from them (items-service)"
---
Implements FS-1GZGD §Requirements R18–R22, R26, §Amendment 2026-11-04 (A1, A2, A3), §Acceptance Criteria (Claim; Guard 2), §Edge States (stash full, template retired, copy source changed)

**Lane: server (human lane; the 2026-11-04 mailbox charter authorises this feature's server work, so `/develop` may run it when Nick asks).**

> **Amended 2026-11-04** (FS-1GZGD amendment A1–A3): `GetTemplateSummaries` became
> `ResolveItemSnapshots` (templates *and* instances → full item snapshots, send time only), and
> `GrantItems` now mints exactly from snapshots instead of from template ids. The filename keeps
> its old slug (issue files are never renamed).

## What to Build

Two new items-service RPCs, end to end (proto → handler → service → repository → DB), with no
gateway route — notification-service is the only caller (I-1GZGD-3, I-1GZGD-4).

- `ResolveItemSnapshots(templates[{template_id, item_level?}], instance_ids[])` — one **item
  snapshot** per known id (FS R21, A1, A2):
  - a template → a fresh item: the template's base stats, rarity `normal`, no affixes, at the
    given item level or the template's `min_item_level`;
  - an instance → a copy as it stands now: its template, name, description, item type, weapon
    type / armor slot, base stats, item level, required level, rarity, affixes and their values
    (uniques too); durability is the template's. Owner, listing, status, location and run state
    are not in a snapshot.
  - A snapshot carries template id, name, description, item type, weapon type, armor slot, base
    stats, durability, item level, required level, rarity, affixes and a unique's effect text.
  - **No drop rule** (no affix count by rarity, no tier against item level, no
    `min_item_level` floor, no unique ranges). Only representability: `Affix.wellFormed`
    (`internal/items/affix.go`), item level ≥ 1. The response names the unknown template ids, the
    unknown instance ids and any unrepresentable id, so the caller refuses with
    `UNKNOWN_ITEM_TEMPLATE` / `UNKNOWN_ITEM_INSTANCE` / `ENCLOSURE_INVALID` (A3).
  - No member token required (a letter request has none).
- `GrantItems(grant_id, items[{snapshot, quantity}])` — with the caller's forwarded member token,
  mints `quantity` brand-new instances per entry **exactly from its snapshot** into that member's
  **stash** in one transaction, status `AVAILABLE`, location `STASH`, no listing. All-or-nothing:
  if the stash plus the grant's slot count would exceed 60, nothing is minted and the call is
  refused `STASH_FULL`. A snapshot with an unknown template or that is not representable mints
  nothing and is refused (S2 backstop). No drop rule is applied.
- `grant_id` is a unique key recorded **in the minting transaction** (a new grants table, or an
  equivalent unique record). A repeat with a known grant id mints nothing and returns the first
  grant's instance ids with `already_granted = true`. Concurrent identical calls mint once (the
  unique index decides, not a read-then-write).

items-service gains no gold or letter concept (R22): a snapshot is an item, not an enclosure.

**Files it expects to touch:** `game-server/common/api/proto/items/items.proto` + its regenerated
Go (regenerate, never patch); `game-server/items-service/internal/items/handler.go`,
`service.go`, `repository.go`, `model.go` (or new `grant.go` / `snapshot.go` beside them) and their
tests; `internal/items/affix.go` only to reuse `wellFormed`; a **new** numbered migration pair
`game-server/items-service/migrations/0000NN_create_item_grants.{up,down}.sql` (next free number;
never edit an existing migration). This is the **only** issue that touches `items.proto`.
`errcode.go` is not touched here (I-1GZGD-3 adds the mailbox codes).

## Acceptance Criteria

- [ ] `ResolveItemSnapshots` for a template without item level returns a snapshot at its
      `min_item_level`, `normal`, base stats, no affixes; with item level 40 returns it at 40,
      even above the template's drop band.
- [ ] `ResolveItemSnapshots` for a unique instance with affixes returns its template, item level,
      rarity, affixes and values, and no owner, listing, status or location; an affix set no drop
      rule would allow is returned unrefused.
- [ ] Unknown template ids and unknown instance ids are reported as such; an item level of 0 is
      reported unrepresentable; no token is needed.
- [ ] `GrantItems` with (snapshot A ×1, snapshot B ×3) mints four `AVAILABLE` stash instances
      owned by the token's member, each equal to its snapshot (template, stats, item level,
      required level, rarity, affixes), and returns their ids; a copy's source instance is
      untouched.
- [ ] With the stash 2 slots short, it mints nothing and is refused `STASH_FULL`.
- [ ] A snapshot with an unknown template, or a malformed affix, mints nothing and is refused.
- [ ] **Guard 2:** a second call with the same grant id mints nothing and returns the first call's
      ids with `already_granted = true`.
- [ ] **Guard 2 (concurrent):** two identical `GrantItems` calls started together against a real
      database mint exactly one set.
- [ ] No member field exists on the `GrantItems` request; the member is the forwarded token's.
- [ ] The new migration's down reverses its up; no existing migration file changed.
- [ ] Tests pass (`go test ./...` in items-service), lint clean.

## Blocked By

None

## Spec Reference

FS-1GZGD §Requirements R18–R22 (grants, item snapshots), R26 (grant retried); §Amendment
2026-11-04 A1–A3; §Decisions D6, D7; spec default S2. User stories 9, 11–13, 31, 34–37.

## TDD Approach

- RED: a repository-backed test that `GrantItems` twice with one grant id leaves one set of rows,
  each equal to its snapshot.
- GREEN: the grants unique key written in the minting transaction, with the conflict path
  returning the recorded ids.
