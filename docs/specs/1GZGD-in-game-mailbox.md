# FS-1GZGD: In-game mailbox — system letters with enclosures

> Status: work-order · SPECIFICATION.md: `game-server/notification-service/SPECIFICATION.md` "## Mailbox", `game-server/items-service/SPECIFICATION.md` "## Grants", `game-server/wallet-service/SPECIFICATION.md` "### Account" (idempotent credit), `game-server/api-gateway/SPECIFICATION.md` "### Mail", `game-client/SPECIFICATION.md` "### Mailbox", `game-server/game-service/SPECIFICATION.md` "### Hub world" (the new-letter notice; added by the 2026-11-04 amendment) → this FS · Related ADRs: [ADR-0044](../adr/0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md) (mailbox in notification-service; the claim protocol), [ADR-0045](../adr/0045-a-new-letter-is-pushed-to-hub-players-over-redis-at-most-once.md) (the `mail:arrived` push; amends ADR-0044 §Decision 1's wire names), [ADR-0046](../adr/0046-grant-items-trusts-its-caller-until-a-service-credential-exists.md) (accepted risk: `GrantItems` trusts the snapshots its caller sends until a service credential exists; blocks the GKE rollout), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-minted keys), [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (mailed gold is an unrecorded deposit), [ADR-0043](../adr/0043-verification-codes-are-owned-by-auth-and-mailed-by-notification.md) ("mail" already means email in notification-service) · Builds on: [FS-VPD8Y](VPD8Y-town-stash.md) (stash 60, `STASH_FULL`), [FS-PJPNA](PJPNA-deduplicated-match-result-notifications.md) (notification's inbox), [FS-22WKC](22WKC-uniform-error-contract.md) (problem+json errors), [FS-NXP1W](NXP1W-auction-settlement-saga.md) (`CreditSellerUC`, the model for the wallet credit), [FS-8EGFA](8EGFA-marketplace-web-page.md) (the item-summary shape a snapshot follows) · Vocabulary: [`notification-service/CONTEXT.md`](../../game-server/notification-service/CONTEXT.md) § Mailbox, [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md), [`wallet-service/CONTEXT.md`](../../game-server/wallet-service/CONTEXT.md), [`api-gateway/CONTEXT.md`](../../game-server/api-gateway/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Mailbox terms, [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Mailbox arrivals · Scoped 2026-11-04 in a `/charter` run; promoted the same day from the charter's locked decisions (`--from-thread`), with the user's mid-run override (gold is credited on claim; no gold pouch) applied.

> **Amended 2026-11-04** by the user, before any slice was built: **S4** and **S3** are replaced
> (two enclosure kinds, template and copy, each stored in the letter as an **item snapshot**
> taken at send; no drop rules), **D13** is replaced (a new letter is **pushed** over Redis
> `mail:arrived` and relayed by game-service to players in the HUB world; no polling;
> ADR-0045), and the claim button's copy becomes **Take** → "Taking…" → "Taken". S1, S2 and
> S5–S8 are approved as written. The requirements, acceptance criteria, edge states, API surface
> and Out of Scope are corrected in place; each corrected item says *(Amended 2026-11-04; was:
> …)*. See "Amendment 2026-11-04" after the spec defaults. **[amendment default]** marks a
> choice this amendment had to make that the user's text left open.

> **Amended again 2026-11-04 (A6)** by the user, before the send slice was built: the admin send
> also accepts a **list of members** as its recipient, for a future admin back office. It stores
> one one-member letter per recipient, in one transaction. The letter request event does not
> change. See "Amendment 2026-11-04 (A6)" after the first amendment block. **[charter default]**
> marks a choice the `/charter` run made under the user's approval; **[spec default]** marks one
> this amendment made where both left it open.

## Summary

Players get a mailbox in the town. The Wardens (an admin) can send an official letter to one
player, to a list of players or to everyone, and the platform can send a system letter through the broker. A letter is
plain text and may carry enclosures: items (made from a template, or copied from an existing
item) and gold. What a letter shows is a snapshot taken when it was sent, and it is exactly what
the player gets. The player takes a letter's enclosures in one step (a **claim**): its items land
in the stash and its gold in the wallet. No layer can hand out a claim twice. A new letter is
pushed to the player while they are in the town, so the envelope lights without polling.

## Decisions (charter defaults)

Every decision below was approved by the user in the charter (2026-11-04); D5, D16 and D20.4 are
the user's override of the same day, which removed the gold pouch (old D17 and D19 are gone).
None went through `/challenge-me`, so all are **(not challenged)**. The requirements implement
them; the reason is the charter's.

| # | Decision | Reason |
|---|---|---|
| D1 | The mailbox is a new bounded context in notification-service. | It already owns per-member in-app notifications and inbox dedup; no new service, DB or deploy. (ADR-0044) |
| D2 | Two entry points: admin `POST /api/admin/mail` (`RoleAdmin` only), to one member or to all; AMQP `mail.letter.requested` with an event id, deduplicated by the inbox. No in-repo producer in v1. *(Amended 2026-11-04, A6: the admin send may also name a list of members; the event stays one member or all.)* | Official mail now, system compensations later. |
| D3 | A broadcast is stored once; per-member state rows are created lazily on read/claim; later signups still see it until expiry. | No fan-out; notification doesn't know signup dates. |
| D4 | ~~Item enclosure = template id + quantity, minted at base stats, no affix roll.~~ *(Amended 2026-11-04: replaced by A1, A2 — a template or a copy enclosure, stored as a snapshot.)* | Compensation must be deterministic. |
| D5 | A gold enclosure `{gold: N}` is credited straight to the member's wallet on claim, as the marketplace credits a seller (`CreditSellerUC`). No pouch item. | (user override) |
| D6 | The claim is player-initiated: notification forwards the player's token to items `GrantItems(grant_id = letter id + member id)`; `grant_id` is unique in items; a failed claim is simply retried. | No saga/Temporal, no whitelist. (ADR-0044) |
| D7 | Granted items go to the stash; if not every item fits, the whole claim is refused (`STASH_FULL`) and the letter stays unclaimed. | All-or-nothing. |
| D8 | Letters expire 30 days after sending unless the admin sets another expiry; expired letters are hidden and unclaimed enclosures forfeited. | — |
| D9 | No delete, no claim-all in v1. | — |
| D10 | Plain-text title ≤ 60 chars, body ≤ 2000 chars, no rich text. | — |
| D11 | The mailbox shows only in the town, icon bottom-right; hidden in runs and fields. | A run's bottom-right is the ability card, and items can't move in a run. |
| D12 | The envelope's wax seal lights with a count while anything is unread or unclaimed; a new letter makes it pulse a few times; dark only when all is read and claimed. Drawn in Phaser as a line envelope with a wax seal (no emoji, no Heroicons). | The HUD is canvas; the guideline asks for line icons and wax-seal badges. |
| D13 | ~~The client polls `GET /api/mail/summary` every 60 s in the town, and at once on town entry and on opening the panel; a newer newest-letter time triggers the pulse.~~ *(Amended 2026-11-04: replaced by A4 — push on `mail:arrived`, no polling.)* | ~~No push in v1; push via game-service is out.~~ |
| D14 | Letter panel: carved panel, list left (newest first, ≤ 50, non-expired), letter right, Enclosed row, one ~~Claim~~ **Take** button, the listed states and copy. *(Amended 2026-11-04: button copy per A5.)* | — |
| D15 | One ADR for D1 + the claim protocol (D6/D16/D20). | (ADR-0044) |
| D16 | Claim order: items `GrantItems(grant_id)` first (the only step that can be refused), then wallet's idempotent credit keyed `mail:<letter id>:<member id>` with the player's token. `claimed` only after **both** succeed; on any failure the row stays `claiming` and the next claim re-sends both with the same keys. Gold-only letters skip items; item-only letters skip wallet. | Never lost, never doubled. (user override; ADR-0044) |
| D18 | Wallet credits only the account of the member in the forwarded token. | Nobody can claim gold into another's account. |
| D20 | No duplicate claims, guarded at every layer (R25–R29), each guard tested, at least one concurrently. | The user's emphasis. (ADR-0044) |

### Spec defaults (filled at promotion; not in the charter)

The charter left these open. They are the smallest choices consistent with the decisions above;
override any of them before its slice is developed.

- **S1 — enclosure bounds:** at most 10 enclosures per letter, at most **one** gold enclosure; an
  item enclosure's quantity is 1–60; a gold amount is ≥ 1; the letter's **slot count** (sum of
  item quantities; gold takes no slot) is at most 60, the stash cap, so every letter is
  claimable by an empty stash.
- **S2 — unknown templates are caught at send.** notification-service checks every item
  enclosure's template against items-service before storing the letter; `GrantItems` refuses an
  unknown template too, as a backstop.
- ~~**S3 — enclosure previews are composed at the gateway**, as listing reads compose item
  summaries (FS-8EGFA): the letters read joins each item enclosure with items-service's
  template summary. notification-service stores only template id + quantity.~~ *(Amended
  2026-11-04: replaced by A2 — the letter stores a snapshot; nothing is composed at read.)*
- ~~**S4 — a minted instance is rarity `normal` at the template's `min_item_level`.**~~
  *(Amended 2026-11-04: replaced by A1 — two enclosure kinds, no drop rules.)*
- **S5 — in-flight detection without timing.** A claim holds a row lock on its letter-state row
  while it calls items and wallet; a second claim that cannot take the lock at once is refused
  `LETTER_CLAIM_IN_PROGRESS`; a claim that finds the row `claiming` and takes the lock (its
  claimer died, or an earlier attempt failed) re-sends both steps. (Reconciles D20.1 with D20.3;
  recorded in ADR-0044.)
- **S6 — the summary carries a fourth number, `waitingCount`** (letters that are unread or hold
  unclaimed enclosures), because the seal's count (D12) is not derivable from the unread and
  unclaimed counts alone.
- **S7 — a recipient member id is not checked for existence**; notification-service has no
  member directory. A letter to an unknown id is stored and never read. (Holds for every id in a
  member list too, A6.)
- **S8 — the gold enclosure is drawn with the existing `coins` item icon**, its amount under the
  slot (D14 said "the gold amount under a pouch"; with no pouch, the coins slot takes its place).

## Amendment 2026-11-04 (enclosure kinds, item snapshots, push, Take)

Decided by the user on 2026-11-04, after promotion and before any slice was built. A1–A5 replace
S4, S3, D13 and the button copy; S1, S2 and S5–S8 are approved as written. The requirements
below are corrected in place.

- **A1 — two enclosure kinds (replaces S4).** Both are looked up by id in items-service's
  database **at send**; an unknown id refuses the whole letter (S2 stands).
  - A **template enclosure** `{template, quantity, item level?}` is a fresh item of that
    template: its base stats, rarity `normal`, no affixes, at the given item level or, when none
    is given, the template's `min_item_level`. For ordinary items and potions.
  - A **copy enclosure** `{copy of: <item instance id>, quantity}` copies that instance as it
    stands at send: its template, item level, rarity, affixes and their values (uniques too).
    The reader gets brand-new instances; the source's owner, listing, status, location and run
    state are not carried over, and later changes to or deletion of the source do not touch the
    letter.
  - **No drop rule is applied to either kind**: no rarity-to-affix-count rule, no tier against
    item level, no `min_item_level` floor, no unique ranges. The Wardens may send anything.
    Only **representability** is checked: every affix's stat code is known, its tier is 0–3 and
    its value ≥ 0 (items' existing `Affix.wellFormed`), the item level is ≥ 1, and the id exists.
  - A copy also takes the source's stored name, description, item type, weapon type or armor
    slot, base stats and required level, so the copy is the item the sender saw; its durability
    is the template's, as a fresh item's is. **[amendment default]**
- **A2 — every enclosure is stored as an item snapshot (replaces S3).** At send,
  notification-service asks items-service to **resolve** the enclosures (template ids and
  instance ids) into full item snapshots and stores the snapshots in the letter. Reading a
  letter and its item tip use the stored snapshot: no gateway composition and no items lookup at
  read. `GrantItems` mints exactly from the snapshot, so what the player sees is what they get.
  The items RPC planned as `GetTemplateSummaries` becomes `ResolveItemSnapshots`.
- **A3 — refusal codes for the two kinds.** An unknown template id is `UNKNOWN_ITEM_TEMPLATE`
  (as before); an unknown instance id is the new `UNKNOWN_ITEM_INSTANCE`; an unrepresentable
  enclosure (item level < 1, a malformed affix on the source) is `ENCLOSURE_INVALID`.
  **[amendment default]**
- **A4 — a new letter is pushed, not polled (replaces D13; ADR-0045).** After a letter commits,
  notification-service publishes one Redis pub/sub message on the channel `mail:arrived`:
  `{"member_id": "<uuid>"}` for a one-member letter, `{"broadcast": true}` for a broadcast.
  Best-effort and at most once: a failed publish is logged and never fails the send. Every
  game-service pod subscribes, as it does for world chat, and sends the WebSocket message
  `mail_arrived` to that member if they stand in the HUB world on this pod, or to every player
  in the HUB world on this pod for a broadcast; a player in a run or a field gets nothing. The
  client fetches `GET /api/mail/summary` on `mail_arrived`, on entering the town and on opening
  the panel, and never on a timer. A missed message is recovered at the next town entry.
  - The WebSocket message rides the existing envelope as `{"action": "mail_arrived",
    "payload": {}}` (the user's text said `{type: "mail_arrived"}`; every game message names
    itself by `action`). **[amendment default]**
  - The publish runs after the commit, outside the transaction, under a short deadline; a
    redelivered letter request that stores nothing publishes nothing. **[amendment default]**
  - Bounds widened for this alone: game-service gains the `mail:arrived` subscriber and the
    forwarding to HUB-world players, and nothing else in game logic; notification-service gains a
    Redis client (`REDIS_ADDR`).
- **A5 — the button says Take.** "Take" → "Taking…" → "Taken"; the dimmed slots wear a "Taken"
  wax stamp. This replaces Claim / Claiming… / Claimed and the "Claimed" stamp, and settles the
  Claim-voice question in `game-client/CONTEXT.md`. Code and API names keep "claim".

## Amendment 2026-11-04 (A6: admin send to a member list)

Decided by the user on 2026-11-04, after the first amendment and before the send slice
(I-1GZGD-3) was built. The admin send gains a third recipient form so that a future admin back
office can mail a chosen set of players in one request. A1–A5 and every decision and default above
stand. The requirements, acceptance criteria, edge states and API surface below are corrected in
place, and each change says *(Amended 2026-11-04, A6 …)*. New requirements are R45–R51.

- **A6 — the admin send accepts `recipient: { memberIds: [uuid, ...] }`**, beside
  `{ memberId }` and `{ allMembers: true }`. Exactly one of the three forms per request.
  - **One letter row per recipient, all written in one transaction.** Either every letter is
    stored or none is. Each is an ordinary one-member letter. The mailbox read query, the letter
    state rows and the claim protocol (ADR-0044) do not change, and nothing marks a letter as
    having come from a list. **[charter default]**
  - **Enclosures are resolved once per request.** The item enclosures go to
    `ResolveItemSnapshots` once, and every letter of the request stores the same snapshots,
    quantities and gold, plus the same title, body, sent time and expiry. **[charter default]**
  - **Bounds:** at most **1000** member ids per request. Duplicate ids are de-duplicated, so a
    member gets one letter however often they are named. An empty list is refused. The ids are not
    checked for existence (S7 holds). **[charter default]** The 1000 counts **distinct** ids
    after de-duplication, because the bound limits the letters one request writes. Both an empty
    list and more than 1000 distinct ids are refused `400 · LETTER_RECIPIENTS_INVALID`, a new
    code, by notification-service, which owns the rule; a malformed id is shape,
    `422 · VALIDATION_FAILED`. **[spec default]**
  - **Push:** after the commit, one `mail:arrived` `{"member_id": "<uuid>"}` per recipient
    (ADR-0045 §Decision 1, one message per stored letter; its contract is unchanged, and
    game-service does not change). **[charter default]** The whole batch of publishes runs under
    one short deadline and is logged once on failure, with the letter count, so a 1000-member send
    never waits 1000 deadlines. **[spec default]**
  - **Only the admin endpoint gains the list.** `mail.letter.requested` stays one member or all
    members. **[charter default]**
  - **The `201` answers the created letters:** `{ letters: { letterId: uuid, memberId?: uuid }[],
    expiresAt: date-time }`, one entry per letter. For a list it holds one entry per distinct
    recipient, in the order each id first appears in the request. For `{ memberId }` it holds one
    entry with that member. For `{ allMembers: true }` it holds one entry without `memberId`. The
    same shape answers all three forms, so a caller never branches on the response. It replaces
    the old `{ letterId, expiresAt }`, which nothing has built yet. **[spec default]**

## Requirements

### Letters (notification-service, Mailbox context)

1. notification-service gains a **Mailbox** bounded context (its own package, tables and gRPC
   methods) beside the existing notifications. Go identifiers, tables and prose use **Mailbox /
   Letter / Enclosure**; no in-game type is named `Mail*` (that word stays outbound email,
   ADR-0043). New tables come in new numbered migration pairs.
2. A **letter** holds: id, title, body, sender kind (`official` | `system`), recipient (one
   member id, or **all members**), enclosures, sent time, expiry time. A broadcast is stored
   **once** (D3). A send to a member list stores one one-member letter per recipient (R45); no
   letter is ever addressed to a list.
3. Title is 1–60 characters and body 1–2000 characters after trimming, plain text only (D10).
   Lengths count characters (runes), not bytes. A violation is refused by notification-service
   with its own code; the gateway does not restate the rule.
4. An enclosure is a **template enclosure** (template id, quantity, optional item level), a
   **copy enclosure** (an item instance id, quantity) or a **gold enclosure** (an amount of
   gold) (A1). Bounds per S1; the template and copy kinds are both item enclosures for S1's
   counts. At send, notification-service resolves every item enclosure through items-service
   `ResolveItemSnapshots` (S2, A2) and stores the returned **item snapshot** with its quantity in
   the letter; nothing is resolved again later. An unknown template refuses the whole letter
   `UNKNOWN_ITEM_TEMPLATE`, an unknown instance `UNKNOWN_ITEM_INSTANCE`, an unrepresentable one
   `ENCLOSURE_INVALID` (A3). *(Amended 2026-11-04; was: an item enclosure is a template id +
   quantity, checked against items-service at send and stored as template id + quantity.)*
5. Expiry defaults to sent time + 30 days; a sender may give another expiry, which must be later
   than now (D8). From its expiry on, a letter is invisible to every read and refused by every
   write; its unclaimed enclosures are forfeited.
6. **Letter state** is one row per (letter, member), created lazily on that member's first read
   or claim (D3). It holds `read_at` and a **claim state** `unclaimed` | `claiming` | `claimed`.
   No row means unread and unclaimed. A letter with no enclosures has no claim state.
7. A member's **mailbox** is every non-expired letter addressed to them or to all members, newest
   first, at most 50 (D14). A member who signed up after a broadcast was sent sees it.
8. **Mark read** sets `read_at` on the member's state row (creating it); repeating it changes
   nothing and succeeds.
9. The **mailbox summary** returns `unreadCount`, `unclaimedCount` (letters with enclosures whose
   claim state is `unclaimed` or `claiming`), `waitingCount` (S6) and `newestLetterAt` (the
   newest non-expired letter's sent time, absent when the mailbox is empty). Expired letters
   count nowhere.
10. Member identity on every player-facing read and write comes from the verified token, never
    from a request field.

### Entry points

11. **Admin send** — `POST /api/admin/mail` on the gateway, allowed only for `RoleAdmin`
    (`common/auth`); the gateway checks the role and forwards the admin's token. The letter is
    `official`. notification-service checks the role again from the forwarded identity, so its
    gRPC method cannot be used by a player token from inside the cluster. The recipient is one
    member, a list of members (R45–R51) or all members. *(Amended 2026-11-04, A6; was: one
    member or all.)*
12. **Letter request** — notification-service consumes `mail.letter.requested` (a new message in
    a new file under `common/api/proto/events/`, carrying an event id, recipient, title, body,
    enclosures and an optional expiry). The letter is `system`. The event is deduplicated through
    the inbox (`processed_events`, FS-PJPNA) in the same transaction that stores the letter, so a
    redelivery stores nothing. A request that breaks R3–R5 is logged at error, marked processed
    and acked, never requeued. v1 has no producer in the repo (D2). Its recipient stays one member
    or all members; it has no list form (A6).

### Claim (notification-service → items-service, wallet-service)

13. **Claim** is a player's request to take every enclosure of one letter at once (D6, D7). It is
    allowed only on a non-expired letter addressed to the player that has enclosures. Claiming
    also marks the letter read.
14. notification-service derives both keys deterministically from letter id + member id, so the
    same claim always carries the same keys (ADR-0009): the **grant id** for items and the
    **credit key** `mail:<letter id>:<member id>` for wallet.
15. **Step 1 — items** (only if the letter has item enclosures): `GrantItems` with the player's
    forwarded token, the grant id and the item enclosures. This is the only step that can be
    refused (`STASH_FULL`, D7).
16. **Step 2 — wallet** (only if the letter has a gold enclosure), and only after step 1
    succeeded or was skipped: wallet's `Credit` with the player's forwarded token, the gold
    amount and the credit key (D5, D16).
17. notification-service sets the claim state to `claimed` only after **both** steps succeed,
    an already-granted or already-applied answer counting as success. Any failure in either step
    leaves the row `claiming`; the next claim re-sends both steps with the same keys — a done step
    answers success, the missing one completes (D16).

### Grants (items-service)

18. `GrantItems(grant_id, items[{snapshot, quantity}])` mints, in **one transaction**,
    `quantity` brand-new instances per entry, each **exactly as its snapshot** describes
    (template, name, item type, base stats, item level, required level, rarity, affixes; A2), all
    into the **stash** of the member in the forwarded token, status `AVAILABLE` (D7). No drop rule is applied (A1). *(Amended 2026-11-04; was: minted from the template id at
    rarity `normal`, base stats, `min_item_level`, no affix roll — D4, S4.)*
19. If the member's stash plus the grant's slot count would exceed 60, `GrantItems` mints nothing
    and refuses `STASH_FULL` (D7). A snapshot whose template is unknown, or that is not
    representable (A1), mints nothing and is refused (S2 backstop). *(Amended 2026-11-04; was:
    an unknown template is refused.)*
20. `grant_id` is a unique key in items-service, recorded in the minting transaction. A
    `GrantItems` whose grant id is already recorded mints nothing and returns the first grant's
    instance ids, marked already-granted (D6, D20.2).
21. `ResolveItemSnapshots(templates[{template_id, item_level?}], instances[instance_id])`
    returns one **item snapshot** per known id: for a template, a fresh item of it (base stats,
    rarity `normal`, no affixes, the given item level or the template's `min_item_level`); for an
    instance, a copy of it as A1 says. A snapshot carries everything `GrantItems` mints from and
    everything an item view shows: template id, name, description, item type, weapon type, armor
    slot, base stats, durability, item level, required level, rarity, affixes and a unique's
    effect text, in the facts of the item-summary shape (FS-8EGFA). It names the ids it could
    not resolve and flags an unrepresentable one, so the caller refuses with the right code
    (A3); it never applies a drop rule. Catalogue and item facts only: no member token is needed,
    so a letter request with no token can be resolved too. *(Amended 2026-11-04; was:
    `GetTemplateSummaries(template_ids)`, template facts for previews composed at read.)*
    **[amendment default]** for the field list and the way unknown ids are reported.
22. items-service has no gold or mailbox concept: a grant is items only, and a snapshot is an
    item, not an enclosure. (The schema needs no
    change unless recording grant ids requires a table, which then comes as a new numbered
    up/down migration pair.)

### Idempotent credit (wallet-service)

23. wallet-service gains **one** RPC, `Credit(amount, idempotency_key)`, called by
    notification-service, that adds `amount` to the account of the **member in the forwarded
    token** (D18); the request names no account. It marks the key processed
    (`MarkActivityProcessed`) and applies the credit in **one transaction**, exactly as
    `CreditSellerUC` does; a known key credits nothing and succeeds, reporting it was already
    applied. An empty key or a non-positive amount is refused. No ledger entry is written
    (charter bound; ADR-0006).
24. A member with no wallet account cannot be credited: `Credit` fails, and the claim stays
    `claiming` (the items, if any, are already in the stash) until a retry succeeds.

### No duplicate claims (D20)

25. **Two requests, one letter, one member** (double-click, two tabs): exactly one claim moves the
    state row out of `unclaimed` (a conditional `UPDATE … WHERE state = 'unclaimed'`) and calls
    items/wallet; while it is in flight a second claim is refused `LETTER_CLAIM_IN_PROGRESS`
    without calling either (S5); a claim of a `claimed` letter is refused
    `LETTER_ALREADY_CLAIMED`.
26. **`GrantItems` retried** with a known grant id mints nothing and returns the first result
    (R20).
27. **Crash after the grant, before `claimed`**: the row stays `claiming`; the next claim takes
    it, re-calls `GrantItems` with the same grant id (already-granted), re-sends the credit with
    the same key, and marks `claimed`. Never doubled, never stuck.
28. **Items succeeded, wallet failed**: the row stays `claiming`; the retry gets already-granted
    from items, the credit applies once, and the letter is `claimed`. The member ends with one
    set of items and the gold once.
29. **Wallet retried**: `Credit` with the key `mail:<letter id>:<member id>` already processed
    credits nothing; the dedup row commits in the same transaction as the credit, so a crash
    can never leave one without the other.

### Gateway

30. The gateway exposes the endpoints in *API surface* as typed (serialized) handlers; the
    openapi document and the generated client are regenerated with `make openapi && make
    client`, never hand-edited.
31. The letters read passes each item enclosure's stored snapshot through as its `item`; the
    gateway composes nothing and calls no items RPC for it (A2). *(Amended 2026-11-04; was: the
    read joins each item enclosure with `GetTemplateSummaries`, and an unresolvable one carries
    no preview and is drawn `generic`.)*
32. Domain refusals pass through as `400 · <CODE>` (the existing errcode convention); a
    downstream outage is `503 · SERVICE_UNAVAILABLE`. New codes are added to `common/errcode`.

### Client (game-client, town only)

33. **Envelope** — in the town only, a line envelope with a small wax seal, drawn in Phaser, at the
    bottom-right of the HUD (D11, D12). It is never shown in a delve or a field world.
34. **Fetching the summary** — the client fetches `GET /api/mail/summary` on entering the town,
    on each `mail_arrived` message while in the town (R43), and on opening the panel; never on a
    timer, and never outside the town (A4). *(Amended 2026-11-04; was: polling at once on entry,
    every 60 s and on opening the panel, stopped on leaving the town — D13.)*
35. **Seal** — lit with `waitingCount` while it is > 0; dark at 0. When `newestLetterAt` is newer
    than the last value the client saw (whichever of R34's fetches brought it), the envelope
    glows/pulses a few times, then stays lit (D12). The last-seen value is kept per player in browser storage (every access in
    try/catch); without it, the first summary of a session records the value without pulsing.
36. **Letter panel** — clicking the envelope opens a centered carved panel (`carvedPanel.ts`,
    `menuChrome.ts`, design guideline). Left: the mailbox list (R7), each row title, relative
    time, enclosure glyph; unread rows bright with a lit seal dot, read rows dim; the glyph lit
    while unclaimed. Right: title; sender ("The Barrowspire Wardens" for `official`, "The Spire"
    for `system`); sent date; days until expiry, in the warning tone at ≤ 3 days; the body,
    scrollable, plain text. (D14)
37. **Enclosed row** — only on a letter with enclosures: bag-sized slots with the existing item
    icons and the existing item tip on hover, both drawn from the enclosure's stored snapshot
    (A2), "x3" for a quantity above 1, and the gold as a `coins` slot with its amount under it
    (S8). (D14) *(Amended 2026-11-04: the icon and tip come from the snapshot, not a read-time
    preview.)*
38. **Selection** — opening the panel selects the first unread letter, else the newest; opening
    (selecting) a letter marks it read (R8) and updates the seal at once, without another
    fetch. *(Amended 2026-11-04; was: "without waiting for the next poll".)*
39. **Take button** — one "Take" button, shown only while the letter's enclosures are
    unclaimed. Press → "Taking…", disabled → on success ("Taken"): slots dim, a "Taken" wax stamp,
    the button gone, the list glyph dims, the seal count drops, and any gold balance the client shows
    is refetched. `STASH_FULL` → warning line "Your stash needs N free slots" (N = the letter's
    slot count), button stays. `LETTER_EXPIRED` → "This letter has crumbled to dust." and the
    letter leaves the list. `LETTER_ALREADY_CLAIMED` → shown taken. `LETTER_CLAIM_IN_PROGRESS`
    and any other failure → "The seal would not break. Try again.", button stays. (D14)
    *(Amended 2026-11-04, A5; was: "Claim" → "Claiming…" → claimed, with a "Claimed" stamp. The
    request is still the claim.)*
40. **Empty** — "No letters wait for you." **Close** with × or Esc; while the panel is open WASD
    does not move the character (as with chat input). (D14)

### New-letter push (notification-service → game-service → client; added 2026-11-04, A4, ADR-0045)

41. After a letter commits (admin send or letter request), notification-service publishes one
    message on the Redis pub/sub channel `mail:arrived`: `{"member_id": "<uuid>"}` for a letter to
    one member, `{"broadcast": true}` for a broadcast. The publish runs after the commit, outside
    the transaction, under a short deadline; a failed publish is logged at warn and never fails
    or undoes the send. A redelivered letter request that stores nothing publishes nothing.
    notification-service holds a Redis client configured by `REDIS_ADDR`. A send to a member list
    publishes one `{"member_id"}` per stored letter (R50). *(Amended 2026-11-04, A6.)*
42. Every game-service pod subscribes to `mail:arrived` at boot and stays subscribed, subscribing
    again after a drop, in the same subscriber → message hub shape as world chat (FS-5SH4G). A
    message that is neither form is skipped with a warning. Nothing is stored or retried: at
    most once.
43. For `{"member_id": M}` the pod sends `{"action": "mail_arrived", "payload": {}}` to M if M
    stands in the HUB world on this pod; for `{"broadcast": true}` it sends it to every player in
    the HUB world on this pod. A player in a run or a field world, or on another pod, gets
    nothing from this pod. The message carries no letter content: the client asks the gateway.
44. A missed `mail_arrived` (Redis down, the player in a run, a dropped subscription) is recovered
    by the summary fetch on the next town entry (R34). game-service gains nothing else of the
    mailbox: it neither reads nor stores letters.

### Sending to a member list (notification-service + api-gateway; added 2026-11-04, A6)

45. The admin send (R11) accepts a third recipient form, a **member list**
    `{ memberIds: [uuid, ...] }`. It stores **one one-member letter per distinct recipient**,
    exactly as a `{ memberId }` send would store it for that member, and all of them in **one
    transaction**: every letter commits or none does. **[charter default]**
46. A request names exactly one recipient form. Naming two, or none, is shape and is refused
    `422 · VALIDATION_FAILED` at the gateway. So is a list entry that is not a uuid.
47. notification-service de-duplicates the list first. It then refuses the send
    `LETTER_RECIPIENTS_INVALID` when no id remains (an empty list) or when more than **1000**
    distinct ids do, and stores nothing. Duplicates themselves are never refused. Ids are not
    checked for existence (S7). **[charter default]** for the bounds and the de-duplication;
    **[spec default]** for counting after de-duplication and for the code.
48. Every other rule is checked **once per request**, before anything is stored: title and body
    (R3), enclosure bounds (S1), expiry (R5) and admin role (R11). A refusal refuses the whole
    request.
49. Item enclosures are resolved through `ResolveItemSnapshots` **once per request**, not once
    per recipient. Every letter of the request stores the same snapshots and quantities, the same
    gold, title, body, sent time and expiry (A2). An unresolvable enclosure refuses the whole
    request with R4's codes. **[charter default]**
50. After the commit, notification-service publishes one `mail:arrived` `{"member_id": "<uuid>"}`
    per stored letter (R41, ADR-0045 unchanged). The batch runs outside the transaction under one
    short deadline. A failure, partial or whole, is logged once at warn with the number of letters
    and never fails the send. Members whose publish was lost recover at their next town entry
    (R44). **[charter default]** for one message per recipient; **[spec default]** for the single
    deadline and log line.
51. The `201` lists the created letters as `{ letterId, memberId? }`, one per letter, in the order
    each recipient first appears in the request. The same shape answers `{ memberId }` (one entry,
    with the member) and `{ allMembers: true }` (one entry, no member). **[spec default]**

## User Stories

1. As a player, I want to see an envelope in the town when a letter waits for me, so that I
   never miss an official message or a compensation.
2. As a player, I want the envelope to pulse when a new letter arrives, so that I notice it even
   if the seal was already lit.
3. As a player, I want the seal to go dark once everything is read and claimed, so that a lit seal
   always means something to do.
4. As a player, I want to read my letters in one panel, newest first, so that I find the latest
   at once.
5. As a player, I want unread letters to stand out from read ones, so that I know what I have not
   seen.
6. As a player, I want to see who sent a letter (the Wardens or the Spire), so that I can tell an
   official message from a system one.
7. As a player, I want to see how many days a letter has left, with a warning near the end, so
   that I claim before it crumbles.
8. As a player, I want to see what a letter encloses, with the usual item tip and the gold amount,
   so that I know what I am taking before I take it.
9. As a player, I want one Take button that takes everything at once, so that taking is simple
   and nothing is half-delivered. *(Amended 2026-11-04: "Claim" → "Take".)*
10. As a player, I want a letter's gold to reach my purse when I claim, so that I need no second
    step.
11. As a player, I want a clear message when my stash is too full, saying how many slots I need,
    so that I can make room and claim again.
12. As a player, I want a failed claim to be safely retryable, so that a hiccup never costs me the
    enclosures.
13. As a player, I want double-clicking Take or taking in two tabs to give me the enclosures
    exactly once, so that the game stays fair.
14. As a player, I want a claim interrupted after my items arrived to finish my gold on retry,
    exactly once, so that I never lose or double the gold.
15. As a player, I want nobody else to be able to claim my letter's gold into their account, so
    that what was sent to me stays mine.
16. As a player, I want the mailbox out of the way in a delve and in the fields, so that it never
    covers the ability card or tempts me to move items where I cannot.
17. As a player who joined after a broadcast went out, I want to still receive it, so that new
    players get the same welcome or compensation.
18. As a player, I want the panel to close with Esc or ×, and my keys not to move my character
    while it is open, so that reading never walks me into something.
19. As a player, I want an empty mailbox to say so in the game's voice, so that the panel never
    looks broken.
20. As an admin, I want to send an official letter to one player, so that I can answer a single
    case.
21. As an admin, I want to send one letter to every player, so that I can announce or compensate
    everyone without a list.
22. As an admin, I want to enclose gold as well as items, so that I can compensate a lost sum.
23. As an admin, I want to set a letter's expiry, so that a time-limited gift ends when it should.
24. As an admin, I want a letter naming an unknown item to be refused at send, so that I never
    send something nobody can claim.
25. As an admin, I want lengths and enclosure bounds checked when I send, so that every letter I
    send can be shown and claimed.
26. As a non-admin, I am refused when I call the admin send, so that only the Wardens speak with
    their voice.
27. As a future platform service, I want to request a system letter by publishing an event, so
    that compensations can be automated without a new API.
28. As a platform operator, I want a redelivered letter request to create nothing new, so that
    broker redelivery never doubles a gift.
29. As a platform operator, I want a broadcast stored once, so that sending to everyone costs one
    row, not one per member.
30. As a developer, I want each no-duplicate guard pinned by a test, one of them concurrent, so
    that a refactor cannot quietly reopen a double claim.

*Added by the 2026-11-04 amendment:*

31. As a player, I want the item I take to be exactly the item the letter showed me, so that a
    letter never promises one thing and delivers another.
32. As a player in the town, I want the envelope to light as soon as a letter is sent, so that I
    see it without waiting.
33. As a player in a delve or a field, I want no mailbox message at all, so that nothing
    distracts me there; I see my letters when I return to the town.
34. As an admin, I want to enclose an ordinary item or a potion by its template, optionally at a
    chosen item level, so that I can send a plain replacement.
35. As an admin, I want to enclose a copy of an existing item, affixes and all (a unique too), so
    that I can give back exactly what a player lost.
36. As an admin, I want a copied item to stay as it was when I sent it, so that later changes to
    or the loss of the source never change what the letter gives.
37. As an admin, I want to send any item that can exist, unbound by drop rules, so that a
    compensation is never blocked by a rule meant for loot.
38. As an admin, I want a letter naming an unknown item instance to be refused at send, so that I
    never send a copy of nothing.
39. As a platform operator, I want a failed new-letter push never to fail the send, so that Redis
    trouble costs at most a late envelope, never a letter.

*Added by amendment A6 (2026-11-04):*

40. As an admin (later, through a back office), I want to send one letter to a chosen list of
    players in one request, so that I can compensate the players of one incident without a
    request per player or a broadcast to everyone.
41. As an admin, I want a list send to reach either every listed player or none, so that a
    failure never leaves me working out who was mailed and who was not.
42. As an admin, I want a player named twice in my list to get one letter, so that a sloppy list
    never doubles a compensation.
43. As an admin, I want the send to answer with each created letter and its recipient, so that a
    back office can record what went to whom.
44. As an admin, I want an empty or oversized list refused with a clear code, so that I fix the
    list rather than guess what was sent.
45. As a listed player standing in the town, I want my envelope to light just as for a letter
    sent to me alone, so that a list send feels no different to me.
46. As a listed player, I want the letter to be mine alone, with my own read and claim state, so
    that another recipient taking theirs never touches mine.

## Acceptance Criteria

### Letters and entry points

- [ ] An admin's `POST /api/admin/mail` to one member stores one `official` letter; that member's
      mailbox shows it, another member's does not.
- [ ] An admin's broadcast stores **one** letter row and **no** state rows; every member's
      mailbox shows it, including a member whose first read happens after the send.
- [ ] A non-admin token on `POST /api/admin/mail` gets `403 · FORBIDDEN`; a player token calling
      notification's send RPC directly is refused too.
- [ ] Title 61 characters, body 2001 characters, an empty title, more than 10 enclosures, two
      gold enclosures, a slot count above 60, a quantity of 0, a gold amount of 0, and a past
      expiry are each refused with their code and store nothing.
- [ ] A template enclosure with an unknown template is refused `UNKNOWN_ITEM_TEMPLATE`, a copy
      enclosure with an unknown instance `UNKNOWN_ITEM_INSTANCE`, and an item level of 0
      `ENCLOSURE_INVALID`; each stores nothing. *(Amended 2026-11-04.)*
- [ ] A template enclosure without an item level is stored as a snapshot at the template's
      `min_item_level`, rarity `normal`, base stats, no affixes; with item level 40 on a template
      whose `min_item_level` is 10 (or above any drop band), at 40, unrefused. *(Added
      2026-11-04.)*
- [ ] A copy enclosure of a unique instance with affixes is stored as a snapshot carrying its
      template, item level, rarity, affixes and their values; it is accepted even where a drop
      rule would refuse it (an affix count or tier its rarity or item level could not roll).
      After the send, changing or deleting the source changes nothing the letter shows or gives.
      *(Added 2026-11-04.)*
- [ ] Without an expiry, a letter expires 30 days after it was sent; with one, at that time.
- [ ] An expired letter is absent from the mailbox and every summary count, and a claim or mark
      read of it is refused `LETTER_EXPIRED`.
- [ ] The mailbox lists at most 50 letters, newest first.
- [ ] Mark read creates the state row on first use and is a no-op success on repeat; the summary's
      `unreadCount` and `waitingCount` drop.
- [ ] The summary returns `unreadCount`, `unclaimedCount`, `waitingCount`, `newestLetterAt` as R9
      defines them, for direct and broadcast letters alike.
- [ ] A `mail.letter.requested` event stores one `system` letter; the same event delivered twice
      stores one; an invalid one is logged, marked processed and not requeued.

### Claim

- [ ] Claiming a letter with two item enclosures (quantities 1 and 3) and 500 gold mints four
      instances in the claimer's stash, each equal to its stored snapshot (template, base stats,
      item level, required level, rarity, affixes), credits 500 gold to the claimer's account, and
      marks the letter `claimed` and read. *(Amended 2026-11-04; was: base stats, `normal`, the
      template's `min_item_level`, no affixes.)*
- [ ] A copy enclosure ×2 mints two new instances, each with its own id, owned by the claimer, in
      the stash, `AVAILABLE`, with no listing; the source instance is untouched. *(Added
      2026-11-04.)*
- [ ] A gold-only letter calls wallet and never items; an item-only letter calls items and never
      wallet.
- [ ] With the stash 2 short, the claim mints nothing, credits nothing, returns
      `400 · STASH_FULL`, and the letter stays unclaimed; after freeing slots, the same claim
      succeeds.
- [ ] Claiming a letter without enclosures is refused `NOTHING_TO_CLAIM`.
- [ ] Granted items and credited gold go to the member in the forwarded token, never one named in
      a request; wallet `Credit` has no field naming an account.

### No duplicate claims (D20) — each guard has its own test

- [ ] **Guard 1 (concurrent):** two claims of one letter by one member started together produce
      exactly one grant and one credit, one success, and one `LETTER_CLAIM_IN_PROGRESS` or
      `LETTER_ALREADY_CLAIMED`; the stash holds one set and the account gained the gold once.
      This test runs the two requests concurrently against a real database.
- [ ] **Guard 1 (sequential):** a claim of a `claimed` letter is refused
      `LETTER_ALREADY_CLAIMED` and calls neither items nor wallet.
- [ ] **Guard 2:** `GrantItems` called twice with one grant id mints once; the second call returns
      the first call's instance ids, marked already-granted. A concurrent pair of identical
      `GrantItems` calls also mints once.
- [ ] **Guard 3:** with the grant applied in items and the state row left `claiming` (the crash),
      the next claim calls `GrantItems` with the same grant id, mints nothing, completes the
      credit, marks `claimed` and succeeds; the stash holds one set.
- [ ] **Guard 4:** wallet `Credit` called twice with `mail:<letter id>:<member id>` credits once
      and reports already-applied the second time; its dedup row and the credit commit in one
      transaction.
- [ ] **Items succeeded, wallet failed:** with items granting and wallet failing, the claim fails
      and the row stays `claiming`; with wallet restored, the retry gets already-granted from
      items, credits the gold exactly once, and marks `claimed`.

### Wallet

- [ ] Wallet `Credit` with an empty key or a non-positive amount is refused; it writes no ledger
      entry; a member with no account is not credited and the claim stays retryable.

### Gateway contract

- [ ] Every endpoint in *API surface* exists with that shape, and `openapi.yaml` plus the
      generated client are regenerated and committed with the handler change.
- [ ] The letters read returns each item enclosure's stored snapshot unchanged and calls no items
      RPC. *(Amended 2026-11-04; was: a preview on each resolvable enclosure, none on an
      unresolvable one.)*
- [ ] Existing migrations are untouched; any schema change ships as a new numbered up/down pair
      whose down reverses the up.

### Client

- [ ] The envelope appears in the town at the bottom-right and never in a delve or field world.
- [ ] The summary is fetched on town entry, on each `mail_arrived` in the town and on opening the
      panel; no timer fetches it; nothing fetches it outside the town. *(Amended 2026-11-04; was:
      on entry, on opening and every 60 s in the town.)*
- [ ] The seal is lit with `waitingCount` when it is > 0 and dark at 0; a newer
      `newestLetterAt` makes the envelope pulse a few times and stay lit.
- [ ] The panel lists letters as D14 describes, selects the first unread (else the newest) on
      open, and marks the selected letter read.
- [ ] The Enclosed row shows item icons with the item tip, "x3" for quantity 3, and a `coins`
      slot with the gold amount under it; it is absent on a letter without enclosures.
- [ ] Take walks "Take" → "Taking…" → taken (dim slots, "Taken" stamp, no button, dim glyph,
      lower seal count, gold refetched) *(amended 2026-11-04; was: Claim → "Claiming…" →
      "Claimed" stamp)*; `STASH_FULL` shows "Your stash needs N free slots";
      another failure shows "The seal would not break. Try again."; an expired letter shows "This
      letter has crumbled to dust." and leaves the list.
- [ ] An empty mailbox reads "No letters wait for you."; × and Esc close the panel; WASD does not
      move the character while it is open.

### New-letter push (added 2026-11-04)

- [ ] A committed one-member letter publishes `{"member_id": M}` on `mail:arrived`, a broadcast
      `{"broadcast": true}`, once each; a refused send and a redelivered letter request publish
      nothing.
- [ ] With Redis unreachable, the admin send still stores the letter and answers `201`; the
      failure is logged.
- [ ] A pod receiving `{"member_id": M}` sends `mail_arrived` to M when M is in the HUB world on
      that pod, and to nobody when M is in a run, in a field, or not on the pod.
- [ ] A pod receiving `{"broadcast": true}` sends `mail_arrived` to every player in the HUB world on
      that pod and to nobody in a run or a field.
- [ ] A malformed `mail:arrived` message is skipped; the subscription survives it and is restored
      after a drop.
- [ ] In the browser, a letter sent to a player standing in the town lights their envelope (and
      pulses) without a reload or a timer; the same player returning from a delve during which a
      letter was sent sees it lit on arrival.
- [ ] A send to a member list of three distinct members publishes exactly three
      `{"member_id"}` messages, one per member, after the commit; with Redis unreachable it still
      stores all three letters and answers `201`. *(Added 2026-11-04, A6.)*

### Sending to a member list (added 2026-11-04, A6)

- [ ] `recipient: { memberIds: [A, B, C] }` stores three `official` one-member letters, one each
      for A, B and C, with identical title, body, enclosures, sent time and expiry. Each member's
      mailbox shows only their own letter, and a member not in the list sees none.
- [ ] `[A, B, A]` stores two letters, one for A and one for B, and answers two entries in the order
      A, B.
- [ ] The `201` body is `{ letters: [{ letterId, memberId }...], expiresAt }`. `{ memberId }`
      answers one entry with that member, and `{ allMembers: true }` one entry without a member.
- [ ] An empty list, and a list of 1001 distinct ids, are each refused
      `400 · LETTER_RECIPIENTS_INVALID` and store nothing. A list of 1000 distinct ids plus
      duplicates is accepted and stores 1000 letters.
- [ ] Naming both `memberId` and `memberIds`, naming no recipient form, or a non-uuid list entry
      is refused `422 · VALIDATION_FAILED`.
- [ ] A list send with item enclosures calls `ResolveItemSnapshots` exactly once, whatever the list
      length, and every stored letter carries the same snapshots.
- [ ] A list send whose title, body, enclosures or expiry break a bound is refused with that rule's
      code and stores no letter for any recipient.
- [ ] **All or none:** when storing one of the list's letters fails (forced in a repository test),
      no letter of the request is stored and nothing is published.
- [ ] Each recipient of a list send reads, marks read and claims their letter independently. A
      claims theirs, and B's letter stays unread and unclaimed. A claim's grant id and credit key
      come from that recipient's own letter id, so no two recipients share a key.
- [ ] A non-admin token sending to a member list gets `403 · FORBIDDEN`.
- [ ] A `mail.letter.requested` event carrying a member list is not accepted: the event has no list
      form.

## Edge States

- **Empty mailbox:** the list is empty, the right side reads "No letters wait for you.", the seal
  is dark, `newestLetterAt` is absent.
- **Concurrent claims:** see R25 (one wins; the other is refused in progress or already claimed).
- **Crashed or half-done claim:** the row stays `claiming` and counts as unclaimed; the next claim
  finishes it (R27, R28). If the letter expires first, the row is hidden with it; whatever step
  already applied stays with the member, the missing step is forfeited with the letter, and
  nothing is applied twice. Accepted for v1.
- **Claim at the moment of expiry:** a claim that passed the expiry check before the expiry
  instant completes; a later one is `LETTER_EXPIRED`. The client drops the letter on
  `LETTER_EXPIRED` and on the next list read.
- **Letter expires while the panel is open:** the next claim or read refusal shows "This letter
  has crumbled to dust." and the letter leaves the list; a summary fetch does not yank an open
  letter unasked.
- **Stash full:** the claim is refused whole; nothing is minted or credited; the letter keeps its
  Take button.
- **items-service or wallet-service down at claim:** `503 · SERVICE_UNAVAILABLE`; the row stays
  `unclaimed` or `claiming`; the client shows "The seal would not break. Try again."
- **No wallet account** (wallet's known signup gap): the credit fails and the claim stays
  retryable (R24); items already granted remain in the stash.
- **items-service down at send:** enclosures cannot be resolved to snapshots, so the admin send is
  `503 · SERVICE_UNAVAILABLE` and a letter request is nacked for redelivery (not marked
  processed). A letter without item enclosures needs no resolve.
- **Unauthorized:** no token → `401 · UNAUTHENTICATED` on every endpoint; a player on the admin
  send → `403 · FORBIDDEN`; a letter not addressed to the caller → `404 · NOT_FOUND` (its existence
  is not revealed).
- **Broadcast to a member who signs up later:** visible from their first read until expiry (D3).
- **Recipient id that is no member:** stored, never read (S7).
- **Template retired after send:** the letter still shows its snapshot, and `GrantItems` refuses
  the unknown template (S2 backstop), shown as the generic error; the letter stays unclaimable
  until it expires. Accepted for v1. *(Amended 2026-11-04; was: the preview is absent, drawn
  `generic`.)*
- **Copy source changed or deleted after send:** nothing changes; the letter holds its snapshot
  (A1).
- **Disconnected / leaving the town:** the panel closes with the town; `mail_arrived` is not sent
  outside the town; on return the summary is fetched at once.
- **Redis down at send, or the push lost:** the letter is stored and the send succeeds; the
  envelope stays as it was until the next town entry or panel open (R44).
- **Player on another pod, or in a run, when a letter is sent:** no `mail_arrived` reaches them;
  their next town entry fetches the summary and the pulse fires then if the letter is newer than
  the last seen.
- **Broadcast with many players in the town:** one `mail:arrived` message; each pod sends one
  `mail_arrived` per HUB-world player, each of whom fetches the summary once.

*Added by amendment A6 (2026-11-04):*

- **Member list of one:** behaves as `{ memberId }` with that member: one letter, one entry in the
  answer.
- **Member list naming the same id many times:** one letter for that member (R47).
- **Member list with ids that are no members:** their letters are stored and never read (S7).
  Nothing in the answer tells them apart.
- **Member list at the bound:** 1000 distinct ids are written as 1000 rows in one transaction and
  published as 1000 messages under one deadline. 1001 are refused whole.
- **Storage failure part-way through a list:** the transaction rolls back. No letter is stored,
  nothing is published, and the send answers `503 · SERVICE_UNAVAILABLE`.
- **items-service down at a list send with item enclosures:** refused `503` before anything is
  stored, as a one-member send is.
- **Redis down, or a publish lost part-way through a list:** every letter is stored and the send
  answers `201`. Listed members in the town whose message was lost see their envelope at their
  next town entry (R44).
- **A list send retried after a timeout or a lost answer:** the admin send has no idempotency key,
  so a retry stores a second letter for every listed member. The back office must not retry a send
  blindly. **[spec default]** (see Out of Scope)
- **The same member in a list send and a broadcast:** two letters, each with its own state; nothing
  merges them.

## API surface

New resources, so field-level. Identity is never in a request: the member comes from the token.
Refusals follow the errcode convention (`400 · <CODE>`); outages are `503 · SERVICE_UNAVAILABLE`;
no token is `401 · UNAUTHENTICATED` on every row.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| Mailbox summary | `GET /api/mail/summary` | — | — | `200` `{ unreadCount: int, unclaimedCount: int, waitingCount: int, newestLetterAt?: date-time }` | `503 · SERVICE_UNAVAILABLE` |
| Read my letters | `GET /api/mail/letters` | — (≤ 50, newest first, no paging) | — | `200` `{ letters: Letter[] }` (below) | `503 · SERVICE_UNAVAILABLE` |
| Mark a letter read | `POST /api/mail/letters/{letterId}/read` | `letterId` uuid | — | `204` | `404 · NOT_FOUND` (absent or not addressed to the caller) · `400 · LETTER_EXPIRED` · `422 · VALIDATION_FAILED` (bad uuid) |
| Claim a letter | `POST /api/mail/letters/{letterId}/claim` | `letterId` uuid | — | `200` `{ letterId: uuid, claimState: "claimed", itemIds: uuid[], gold: int64 }` (`gold` 0 on an item-only letter) | `404 · NOT_FOUND` · `400 · LETTER_EXPIRED` · `400 · NOTHING_TO_CLAIM` · `400 · LETTER_ALREADY_CLAIMED` · `400 · LETTER_CLAIM_IN_PROGRESS` · `400 · STASH_FULL` · `503 · SERVICE_UNAVAILABLE` · `422 · VALIDATION_FAILED` |
| Send official mail | `POST /api/admin/mail` | — | `{ recipient: { memberId: uuid } \| { memberIds: uuid[] } \| { allMembers: true }, title: string, body: string, enclosures?: EnclosureRequest[] (≤ 10, ≤ 1 gold), expiresAt?: date-time }` | `201` `{ letters: { letterId: uuid, memberId?: uuid }[], expiresAt: date-time }` (one entry per stored letter; `memberId` absent only for `allMembers`) | `403 · FORBIDDEN` (not `RoleAdmin`) · `400 · LETTER_RECIPIENTS_INVALID` (empty list, > 1000 distinct ids) · `400 · LETTER_TITLE_INVALID` · `400 · LETTER_BODY_INVALID` · `400 · LETTER_EXPIRY_INVALID` · `400 · ENCLOSURE_INVALID` (count, gold count, quantity, amount, slot count, item level < 1, unrepresentable copy) · `400 · UNKNOWN_ITEM_TEMPLATE` · `400 · UNKNOWN_ITEM_INSTANCE` · `422 · VALIDATION_FAILED` (shape: more than one or none of the recipient forms, a non-uuid id, unknown members) · `503 · SERVICE_UNAVAILABLE` |

*Admin send amended 2026-11-04 (A6): the `memberIds` form, the `letters` answer (was
`{ letterId: uuid, expiresAt }`) and `LETTER_RECIPIENTS_INVALID` are new. **[spec default]** for
the answer's shape and the code's name.*

**Letter** (response): `{ id: uuid, title: string, body: string, sender: "official" | "system",
sentAt: date-time, expiresAt: date-time, read: bool, claimState: "none" | "unclaimed" |
"claiming" | "claimed", enclosures: Enclosure[] }` — `claimState` is `none` on a letter with no
enclosures; the client treats `claiming` like `unclaimed`.

**EnclosureRequest** (request; amended 2026-11-04, A1): `{ kind: "template", templateId: uuid,
quantity: int (1–60), itemLevel?: int (≥ 1) }`, `{ kind: "copy", copyOf: uuid (an item
instance id), quantity: int (1–60) }` or `{ kind: "gold", gold: int64 (≥ 1) }`.
**[amendment default]** for the `kind` names and the camelCase field names.

**Enclosure** (response; amended 2026-11-04, A2): `{ kind: "item", quantity: int, item:
ItemSnapshot }` or `{ kind: "gold", gold: int64 }` — once stored, a template and a copy
enclosure are both items. **ItemSnapshot**: `{ templateId: uuid, name, description?, itemType,
weaponType?, armorSlot?, rarity, attackPower?, criticalRate?, defenseRating?, magicResistance?,
healingAmount?, manaAmount?, buffDuration?, itemLevel, requiredLevel, affixes: {stat, tier,
value}[], uniqueEffectText? }`, the facts of the item-summary shape the client already maps,
without an instance id (there is no instance until the claim). *(Was: an item enclosure
carried `templateId`, `quantity` and an optional read-time `preview`.)*

**RPC surface (design, not generated):**

| Service | Method | Notes |
|---|---|---|
| notification | `SendLetter` | admin identity from forwarded token; recipient (one member, a member list or all members), title, body, enclosures, expiry → the stored letters as (letter id, member id?) and the expiry (recipient list and answer amended 2026-11-04, A6) |
| notification | `ListLetters`, `GetMailboxSummary`, `MarkLetterRead`, `ClaimLetter` | member from token |
| items | `GrantItems(grant_id, items[{snapshot, quantity}])` → instance ids, `already_granted` | member from forwarded token; mints from the snapshots (amended 2026-11-04) |
| items | `ResolveItemSnapshots(templates[{template_id, item_level?}], instance_ids)` → snapshots, unknown ids, unrepresentable ids | no member token; send time only (replaces `GetTemplateSummaries`, 2026-11-04) |
| wallet | `Credit(amount, idempotency_key)` → `applied` | member from forwarded token; no account field |
| events | `LetterRequested` (`mail.letter.requested`) | new file under `common/api/proto/events/`; enclosures of the three request kinds; recipient one member or all members, never a list (A6) |
| Redis pub/sub | `mail:arrived` ← `{"member_id"}` \| `{"broadcast": true}` | published by notification after commit, subscribed by every game-service pod (added 2026-11-04, ADR-0045) |
| game WebSocket | `{"action": "mail_arrived", "payload": {}}` | game-service → client in the HUB world (added 2026-11-04) |

## Out of Scope

- Player-to-player letters, replies, and any sending from the client.
- Deleting letters and claim-all (D9).
- Rich text, links or images in letters (D10).
- ~~Push of new-letter events (through game-service or otherwise); polling only (D13).~~
  *(Amended 2026-11-04: push is in, A4.)* Periodic polling of the summary; a delivery guarantee,
  retry or store for `mail_arrived` (at most once); any push to a player in a run or a field.
- A producer of `mail.letter.requested` (D2).
- Any change to settlement, runs, game-service, or marketplace rules — except, since
  2026-11-04, game-service's `mail:arrived` subscriber and its forwarding to HUB-world players
  (A4), and nothing else in game logic.
- A gold pouch item or any other gold-holding item (removed by the user's override).
- A ledger entry for mailed gold, and a system account (ADR-0006); a future reconciler will see
  these credits as unrecorded deposits.
- Affix rolls or rarity rolls on enclosed items (D4); a rarity or affixes are only ever copied
  from an existing instance (A1). Drop rules on enclosures (A1).
- A new service, database or deploy (D1).
- An admin UI: admin send is the HTTP endpoint only. The back office that A6 prepares for is not
  part of this feature.
- *(Added 2026-11-04, A6:)* a member list on `mail.letter.requested`; a member list larger than
  1000, or paged or streamed across requests; a list stored as one letter row; checking that a
  listed id is a member (S7); an idempotency key on the admin send, so a retried list send is
  deduplicated (for now the back office must not retry blindly); a "sent with" grouping of a list
  send's letters.
- The mailbox in a delve or a field world (D11).
