# FS-1GZGD: In-game mailbox — system letters with enclosures

> Status: work-order · SPECIFICATION.md: `game-server/notification-service/SPECIFICATION.md` "## Mailbox", `game-server/items-service/SPECIFICATION.md` "## Grants", `game-server/wallet-service/SPECIFICATION.md` "### Account" (idempotent credit), `game-server/api-gateway/SPECIFICATION.md` "### Mail", `game-client/SPECIFICATION.md` "### Mailbox" → this FS · Related ADRs: [ADR-0044](../adr/0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md) (mailbox in notification-service; the claim protocol), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-minted keys), [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (mailed gold is an unrecorded deposit), [ADR-0043](../adr/0043-verification-codes-are-owned-by-auth-and-mailed-by-notification.md) ("mail" already means email in notification-service) · Builds on: [FS-VPD8Y](VPD8Y-town-stash.md) (stash 60, `STASH_FULL`), [FS-PJPNA](PJPNA-deduplicated-match-result-notifications.md) (notification's inbox), [FS-22WKC](22WKC-uniform-error-contract.md) (problem+json errors), [FS-NXP1W](NXP1W-auction-settlement-saga.md) (`CreditSellerUC`, the model for the wallet credit), [FS-8EGFA](8EGFA-marketplace-web-page.md) (gateway-composed item summaries) · Vocabulary: [`notification-service/CONTEXT.md`](../../game-server/notification-service/CONTEXT.md) § Mailbox, [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md), [`wallet-service/CONTEXT.md`](../../game-server/wallet-service/CONTEXT.md), [`api-gateway/CONTEXT.md`](../../game-server/api-gateway/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Mailbox terms · Scoped 2026-11-04 in a `/charter` run; promoted the same day from the charter's locked decisions (`--from-thread`), with the user's mid-run override (gold is credited on claim; no gold pouch) applied.

## Summary

Players get a mailbox in the town. The Wardens (an admin) can send an official letter to one
player or to everyone, and the platform can send a system letter through the broker. A letter is
plain text and may carry enclosures: items minted from a template, and gold. The player claims a
letter in one step: its items land in the stash and its gold in the wallet. No layer can hand out
a claim twice.

## Decisions (charter defaults)

Every decision below was approved by the user in the charter (2026-11-04); D5, D16 and D20.4 are
the user's override of the same day, which removed the gold pouch (old D17 and D19 are gone).
None went through `/challenge-me`, so all are **(not challenged)**. The requirements implement
them; the reason is the charter's.

| # | Decision | Reason |
|---|---|---|
| D1 | The mailbox is a new bounded context in notification-service. | It already owns per-member in-app notifications and inbox dedup; no new service, DB or deploy. (ADR-0044) |
| D2 | Two entry points: admin `POST /api/admin/mail` (`RoleAdmin` only), to one member or to all; AMQP `mail.letter.requested` with an event id, deduplicated by the inbox. No in-repo producer in v1. | Official mail now, system compensations later. |
| D3 | A broadcast is stored once; per-member state rows are created lazily on read/claim; later signups still see it until expiry. | No fan-out; notification doesn't know signup dates. |
| D4 | Item enclosure = template id + quantity, minted at base stats, no affix roll. | Compensation must be deterministic. |
| D5 | A gold enclosure `{gold: N}` is credited straight to the member's wallet on claim, as the marketplace credits a seller (`CreditSellerUC`). No pouch item. | (user override) |
| D6 | The claim is player-initiated: notification forwards the player's token to items `GrantItems(grant_id = letter id + member id)`; `grant_id` is unique in items; a failed claim is simply retried. | No saga/Temporal, no whitelist. (ADR-0044) |
| D7 | Granted items go to the stash; if not every item fits, the whole claim is refused (`STASH_FULL`) and the letter stays unclaimed. | All-or-nothing. |
| D8 | Letters expire 30 days after sending unless the admin sets another expiry; expired letters are hidden and unclaimed enclosures forfeited. | — |
| D9 | No delete, no claim-all in v1. | — |
| D10 | Plain-text title ≤ 60 chars, body ≤ 2000 chars, no rich text. | — |
| D11 | The mailbox shows only in the town, icon bottom-right; hidden in runs and fields. | A run's bottom-right is the ability card, and items can't move in a run. |
| D12 | The envelope's wax seal lights with a count while anything is unread or unclaimed; a new letter makes it pulse a few times; dark only when all is read and claimed. Drawn in Phaser as a line envelope with a wax seal (no emoji, no Heroicons). | The HUD is canvas; the guideline asks for line icons and wax-seal badges. |
| D13 | The client polls `GET /api/mail/summary` every 60 s in the town, and at once on town entry and on opening the panel; a newer newest-letter time triggers the pulse. | No push in v1; push via game-service is out. |
| D14 | Letter panel: carved panel, list left (newest first, ≤ 50, non-expired), letter right, Enclosed row, one Claim button, the listed states and copy. | — |
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
- **S3 — enclosure previews are composed at the gateway**, as listing reads compose item
  summaries (FS-8EGFA): the letters read joins each item enclosure with items-service's
  template summary. notification-service stores only template id + quantity.
- **S4 — a minted instance is rarity `normal` at the template's `min_item_level`.**
- **S5 — in-flight detection without timing.** A claim holds a row lock on its letter-state row
  while it calls items and wallet; a second claim that cannot take the lock at once is refused
  `LETTER_CLAIM_IN_PROGRESS`; a claim that finds the row `claiming` and takes the lock (its
  claimer died, or an earlier attempt failed) re-sends both steps. (Reconciles D20.1 with D20.3;
  recorded in ADR-0044.)
- **S6 — the summary carries a fourth number, `waitingCount`** (letters that are unread or hold
  unclaimed enclosures), because the seal's count (D12) is not derivable from the unread and
  unclaimed counts alone.
- **S7 — a recipient member id is not checked for existence**; notification-service has no
  member directory. A letter to an unknown id is stored and never read.
- **S8 — the gold enclosure is drawn with the existing `coins` item icon**, its amount under the
  slot (D14 said "the gold amount under a pouch"; with no pouch, the coins slot takes its place).

## Requirements

### Letters (notification-service, Mailbox context)

1. notification-service gains a **Mailbox** bounded context (its own package, tables and gRPC
   methods) beside the existing notifications. Go identifiers, tables and prose use **Mailbox /
   Letter / Enclosure**; no in-game type is named `Mail*` (that word stays outbound email,
   ADR-0043). New tables come in new numbered migration pairs.
2. A **letter** holds: id, title, body, sender kind (`official` | `system`), recipient (one
   member id, or **all members**), enclosures, sent time, expiry time. A broadcast is stored
   **once** (D3).
3. Title is 1–60 characters and body 1–2000 characters after trimming, plain text only (D10).
   Lengths count characters (runes), not bytes. A violation is refused by notification-service
   with its own code; the gateway does not restate the rule.
4. An **item enclosure** is a template id + quantity; a **gold enclosure** is an amount of gold.
   Bounds per S1. Every item enclosure's template must exist in items-service at send (S2); an
   unknown one refuses the whole letter `UNKNOWN_ITEM_TEMPLATE`.
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
    gRPC method cannot be used by a player token from inside the cluster.
12. **Letter request** — notification-service consumes `mail.letter.requested` (a new message in
    a new file under `common/api/proto/events/`, carrying an event id, recipient, title, body,
    enclosures and an optional expiry). The letter is `system`. The event is deduplicated through
    the inbox (`processed_events`, FS-PJPNA) in the same transaction that stores the letter, so a
    redelivery stores nothing. A request that breaks R3–R5 is logged at error, marked processed
    and acked, never requeued. v1 has no producer in the repo (D2).

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

18. `GrantItems(grant_id, enclosures)` mints, in **one transaction**, `quantity` instances per
    item enclosure (rarity `normal`, the template's base stats, its `min_item_level`, no affix
    roll — D4, S4), all into the **stash** of the member in the forwarded token, status
    `AVAILABLE` (D7).
19. If the member's stash plus the grant's slot count would exceed 60, `GrantItems` mints nothing
    and refuses `STASH_FULL` (D7). An unknown template mints nothing and is refused (S2 backstop).
20. `grant_id` is a unique key in items-service, recorded in the minting transaction. A
    `GrantItems` whose grant id is already recorded mints nothing and returns the first grant's
    instance ids, marked already-granted (D6, D20.2).
21. `GetTemplateSummaries(template_ids)` returns, for each known template, the facts an item
    view needs (name, item type, weapon type, armor slot, base stats, item level, rarity
    `normal`), and omits unknown ids. Public catalogue facts: no member token needed (S2, S3).
22. items-service has no gold or mailbox concept: a grant is items only. (The schema needs no
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
31. The letters read joins each item enclosure with `GetTemplateSummaries` (S3); an enclosure
    whose template no longer resolves carries no preview and the client draws it as `generic`.
32. Domain refusals pass through as `400 · <CODE>` (the existing errcode convention); a
    downstream outage is `503 · SERVICE_UNAVAILABLE`. New codes are added to `common/errcode`.

### Client (game-client, town only)

33. **Envelope** — in the town only, a line envelope with a small wax seal, drawn in Phaser, at the
    bottom-right of the HUD (D11, D12). It is never shown in a delve or a field world.
34. **Polling** — while in the town the client fetches the summary at once on entry, every 60 s,
    and on opening the panel; polling stops on leaving the town (D13).
35. **Seal** — lit with `waitingCount` while it is > 0; dark at 0. When `newestLetterAt` is newer
    than the last value the client saw, the envelope glows/pulses a few times, then stays lit
    (D12). The last-seen value is kept per player in browser storage (every access in
    try/catch); without it, the first summary of a session records the value without pulsing.
36. **Letter panel** — clicking the envelope opens a centered carved panel (`carvedPanel.ts`,
    `menuChrome.ts`, design guideline). Left: the mailbox list (R7), each row title, relative
    time, enclosure glyph; unread rows bright with a lit seal dot, read rows dim; the glyph lit
    while unclaimed. Right: title; sender ("The Barrowspire Wardens" for `official`, "The Spire"
    for `system`); sent date; days until expiry, in the warning tone at ≤ 3 days; the body,
    scrollable, plain text. (D14)
37. **Enclosed row** — only on a letter with enclosures: bag-sized slots with the existing item
    icons and the existing item tip on hover, "x3" for a quantity above 1, and the gold as a
    `coins` slot with its amount under it (S8). (D14)
38. **Selection** — opening the panel selects the first unread letter, else the newest; opening
    (selecting) a letter marks it read (R8) and updates the seal without waiting for the next
    poll.
39. **Claim button** — one "Claim" button, shown only while the letter's enclosures are
    unclaimed. Press → "Claiming…", disabled → on success: slots dim, a "Claimed" wax stamp, the
    button gone, the list glyph dims, the seal count drops, and any gold balance the client shows
    is refetched. `STASH_FULL` → warning line "Your stash needs N free slots" (N = the letter's
    slot count), button stays. `LETTER_EXPIRED` → "This letter has crumbled to dust." and the
    letter leaves the list. `LETTER_ALREADY_CLAIMED` → shown claimed. `LETTER_CLAIM_IN_PROGRESS`
    and any other failure → "The seal would not break. Try again.", button stays. (D14)
40. **Empty** — "No letters wait for you." **Close** with × or Esc; while the panel is open WASD
    does not move the character (as with chat input). (D14)

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
   so that I know what I am claiming before I claim it.
9. As a player, I want one Claim button that takes everything at once, so that claiming is simple
   and nothing is half-delivered.
10. As a player, I want a letter's gold to reach my purse when I claim, so that I need no second
    step.
11. As a player, I want a clear message when my stash is too full, saying how many slots I need,
    so that I can make room and claim again.
12. As a player, I want a failed claim to be safely retryable, so that a hiccup never costs me the
    enclosures.
13. As a player, I want double-clicking Claim or claiming in two tabs to give me the enclosures
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
- [ ] An item enclosure with an unknown template is refused `UNKNOWN_ITEM_TEMPLATE` and stores
      nothing.
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
      instances in the claimer's stash (base stats, `normal`, the template's `min_item_level`, no
      affixes), credits 500 gold to the claimer's account, and marks the letter `claimed` and
      read.
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
- [ ] The letters read carries a preview on each resolvable item enclosure and none on an
      unresolvable one.
- [ ] Existing migrations are untouched; any schema change ships as a new numbered up/down pair
      whose down reverses the up.

### Client

- [ ] The envelope appears in the town at the bottom-right and never in a delve or field world.
- [ ] The summary is fetched on town entry, on opening the panel and every 60 s in the town, and
      not at all outside it.
- [ ] The seal is lit with `waitingCount` when it is > 0 and dark at 0; a newer
      `newestLetterAt` makes the envelope pulse a few times and stay lit.
- [ ] The panel lists letters as D14 describes, selects the first unread (else the newest) on
      open, and marks the selected letter read.
- [ ] The Enclosed row shows item icons with the item tip, "x3" for quantity 3, and a `coins`
      slot with the gold amount under it; it is absent on a letter without enclosures.
- [ ] Claim walks Claim → "Claiming…" → claimed (dim slots, "Claimed" stamp, no button, dim glyph,
      lower seal count, gold refetched); `STASH_FULL` shows "Your stash needs N free slots";
      another failure shows "The seal would not break. Try again."; an expired letter shows "This
      letter has crumbled to dust." and leaves the list.
- [ ] An empty mailbox reads "No letters wait for you."; × and Esc close the panel; WASD does not
      move the character while it is open.

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
  has crumbled to dust." and the letter leaves the list; a poll does not yank an open letter
  unasked.
- **Stash full:** the claim is refused whole; nothing is minted or credited; the letter keeps its
  Claim button.
- **items-service or wallet-service down at claim:** `503 · SERVICE_UNAVAILABLE`; the row stays
  `unclaimed` or `claiming`; the client shows "The seal would not break. Try again."
- **No wallet account** (wallet's known signup gap): the credit fails and the claim stays
  retryable (R24); items already granted remain in the stash.
- **items-service down at send:** template checks cannot run, so the admin send is
  `503 · SERVICE_UNAVAILABLE` and a letter request is nacked for redelivery (not marked
  processed).
- **Unauthorized:** no token → `401 · UNAUTHENTICATED` on every endpoint; a player on the admin
  send → `403 · FORBIDDEN`; a letter not addressed to the caller → `404 · NOT_FOUND` (its existence
  is not revealed).
- **Broadcast to a member who signs up later:** visible from their first read until expiry (D3).
- **Recipient id that is no member:** stored, never read (S7).
- **Template retired after send:** the preview is absent (drawn `generic`) and `GrantItems`
  refuses it (S2 backstop), shown as the generic error; the letter stays unclaimable until it
  expires. Accepted for v1.
- **Disconnected / leaving the town:** polling stops; the panel closes with the town; on return
  the summary is fetched at once.

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
| Send official mail | `POST /api/admin/mail` | — | `{ recipient: { memberId: uuid } \| { allMembers: true }, title: string, body: string, enclosures?: Enclosure[] (≤ 10, ≤ 1 gold), expiresAt?: date-time }` | `201` `{ letterId: uuid, expiresAt: date-time }` | `403 · FORBIDDEN` (not `RoleAdmin`) · `400 · LETTER_TITLE_INVALID` · `400 · LETTER_BODY_INVALID` · `400 · LETTER_EXPIRY_INVALID` · `400 · ENCLOSURE_INVALID` (count, gold count, quantity, amount, slot count) · `400 · UNKNOWN_ITEM_TEMPLATE` · `422 · VALIDATION_FAILED` (shape: both or neither recipient form, unknown members) · `503 · SERVICE_UNAVAILABLE` |

**Letter** (response): `{ id: uuid, title: string, body: string, sender: "official" | "system",
sentAt: date-time, expiresAt: date-time, read: bool, claimState: "none" | "unclaimed" |
"claiming" | "claimed", enclosures: Enclosure[] }` — `claimState` is `none` on a letter with no
enclosures; the client treats `claiming` like `unclaimed`.

**Enclosure** (request): `{ kind: "item", templateId: uuid, quantity: int (1–60) }` or
`{ kind: "gold", gold: int64 (≥ 1) }`. In a response, an item enclosure also carries
`preview?: ItemPreview` — the template's name, item type, weapon type, armor slot, base stats,
item level and rarity, in the item-summary shape the client already maps (S3).

**RPC surface (design, not generated):**

| Service | Method | Notes |
|---|---|---|
| notification | `SendLetter` | admin identity from forwarded token; recipient, title, body, enclosures, expiry |
| notification | `ListLetters`, `GetMailboxSummary`, `MarkLetterRead`, `ClaimLetter` | member from token |
| items | `GrantItems(grant_id, enclosures)` → instance ids, `already_granted` | member from forwarded token |
| items | `GetTemplateSummaries(template_ids)` | public catalogue facts |
| wallet | `Credit(amount, idempotency_key)` → `applied` | member from forwarded token; no account field |
| events | `LetterRequested` (`mail.letter.requested`) | new file under `common/api/proto/events/` |

## Out of Scope

- Player-to-player letters, replies, and any sending from the client.
- Deleting letters and claim-all (D9).
- Rich text, links or images in letters (D10).
- Push of new-letter events (through game-service or otherwise); polling only (D13).
- A producer of `mail.letter.requested` (D2).
- Any change to settlement, runs, game-service, or marketplace rules.
- A gold pouch item or any other gold-holding item (removed by the user's override).
- A ledger entry for mailed gold, and a system account (ADR-0006); a future reconciler will see
  these credits as unrecorded deposits.
- Affix rolls, rarity rolls or chosen rarities on enclosed items (D4).
- A new service, database or deploy (D1).
- An admin UI: admin send is the HTTP endpoint only.
- The mailbox in a delve or a field world (D11).
