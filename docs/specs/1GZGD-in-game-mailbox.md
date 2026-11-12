# FS-1GZGD: In-game mailbox — system letters with enclosures

> Status: shipped · SPECIFICATION.md: `game-server/notification-service/SPECIFICATION.md` "## Mailbox", `game-server/items-service/SPECIFICATION.md` "## Grants", `game-server/wallet-service/SPECIFICATION.md` "### Account" (idempotent credit), `game-server/api-gateway/SPECIFICATION.md` "### Mail", `game-client/SPECIFICATION.md` "### Mailbox", `game-server/game-service/SPECIFICATION.md` "### Hub world" (the new-letter notice; added by the 2026-11-04 amendment) → this FS · Related ADRs: [ADR-0044](../adr/0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md) (mailbox in notification-service; the claim protocol), [ADR-0045](../adr/0045-a-new-letter-is-pushed-to-hub-players-over-redis-at-most-once.md) (the `mail:arrived` push; amends ADR-0044 §Decision 1's wire names), [ADR-0046](../adr/0046-grant-items-trusts-its-caller-until-a-service-credential-exists.md) (accepted risk: `GrantItems` trusts the snapshots its caller sends until a service credential exists; blocks the GKE rollout), [ADR-0047](../adr/0047-an-admin-is-a-role-on-a-player-account-until-a-back-office-identity-exists.md) (an admin is a role on a player account until a back-office identity exists; the seeded admin's public password blocks the GKE rollout; added by A7), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-minted keys), [ADR-0006](../adr/0006-only-balanced-movements-are-recorded.md) (mailed gold is an unrecorded deposit), [ADR-0043](../adr/0043-verification-codes-are-owned-by-auth-and-mailed-by-notification.md) ("mail" already means email in notification-service) · Builds on: [FS-VPD8Y](VPD8Y-town-stash.md) (stash 60, `STASH_FULL`), [FS-PJPNA](PJPNA-deduplicated-match-result-notifications.md) (notification's inbox), [FS-22WKC](22WKC-uniform-error-contract.md) (problem+json errors), [FS-NXP1W](NXP1W-auction-settlement-saga.md) (`CreditSellerUC`, the model for the wallet credit), [FS-8EGFA](8EGFA-marketplace-web-page.md) (the item-summary shape a snapshot follows) · Vocabulary: [`notification-service/CONTEXT.md`](../../game-server/notification-service/CONTEXT.md) § Mailbox, [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md), [`wallet-service/CONTEXT.md`](../../game-server/wallet-service/CONTEXT.md), [`api-gateway/CONTEXT.md`](../../game-server/api-gateway/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Mailbox terms, [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Mailbox arrivals · Scoped 2026-11-04 in a `/charter` run; promoted the same day from the charter's locked decisions (`--from-thread`), with the user's mid-run override (gold is credited on claim; no gold pouch) applied.

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

> **Amended again 2026-11-04 (A7)** by the user, after the send slice (I-1GZGD-3) was merged:
> **both entry points stay** (the admin API is the door for people, the system paths the door for
> code; the admin door is guarded today by a stand-in role, ADR-0047); every letter records **who
> sent it** (an audit stored in the letter, never shown to players), so `mail.letter.requested`
> gains a required `source`; and each new account gets one **welcome letter** with a small
> starter gift when notification consumes `member.signedup`. See "Amendment 2026-11-04 (A7)"
> after A6. New requirements are R52–R62. **[charter default]** and **[spec default]** mean what
> they mean in A6.

> **Amended again 2026-11-04 (A8)**, before the welcome slice (I-1GZGD-11) was built: the
> welcome gift's potion snapshot is **cached** in notification-service's memory after the first
> successful resolve (the user's decision), and a **permanent** problem with the gift never
> breaks signup: the welcome is stored with its gold only (the `/charter` run's default, flagged
> to the user). See "Amendment 2026-11-04 (A8)" after A7. R60, R61, story 58, the welcome
> acceptance criteria and two A7 edge states are corrected in place, each saying *(Amended
> 2026-11-04, A8 …)*.

> **Amended again 2026-11-04 (A9)**, after all eleven slices were merged on
> `feat/notification-mailbox` and a code-review fix round (merged at `fb1abf5c`) changed some
> behaviour: the client confirms the seal with the server after every read, take and crumble;
> claims are capped per pod and the gateway puts deadlines on mailbox calls; an items refusal
> puts the claim row back; more outage answers are 503 and a letter request that fails to store
> is retried; mark read never waits on a claim; a sent letter is always mintable; wallet's credit
> keys get their own namespace; the game relay's queue and decoder tighten; notification refuses
> to boot without `JWT_SECRET`. See "Amendment 2026-11-04 (A9)" after A8, and "Before GKE" after
> it for what must happen before the mailbox reaches GKE. D16, R8, R11, R12, R15, R17, R19, R21,
> R23, R24, R32, R34, R38, R39, R42, R43, the client and claim acceptance criteria, the edge states
> and the API surface are corrected in place, each saying *(Amended 2026-11-04, A9 …)*. New
> requirements are R63–R65.
>
> **Amended again 2026-11-04 (A10)**, after the branch was merged to main and run live: the
> welcome potion is found by its **catalogue name**, not a fixed template id. The id A7.3 named
> came from an items migration later migrations removed; the potions in use are minted by the dev
> seed, with an id that differs per environment, so every welcome fell back to gold only. See
> "Amendment 2026-11-04 (A10)" after A9. A7.3, A8.1, R58, R59, the welcome acceptance criterion,
> one edge state and "Before GKE" are corrected in place, each saying *(Amended 2026-11-04, A10 …)*.

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
| D2 | Two entry points: admin `POST /api/admin/mail` (`RoleAdmin` only), to one member or to all; AMQP `mail.letter.requested` with an event id, deduplicated by the inbox. No in-repo producer in v1. *(Amended 2026-11-04, A6: the admin send may also name a list of members; the event stays one member or all.)* *(Amended 2026-11-04, A7: both kept on purpose, the admin API as the door for people and the system paths as the door for code; the event gains a required `source`; notification's own welcome trigger is the first system path in the repo.)* | Official mail now, system compensations later. |
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
| D16 | Claim order: items `GrantItems(grant_id)` first (the only step that can be refused), then wallet's idempotent credit keyed `mail:<letter id>:<member id>` with the player's token. `claimed` only after **both** succeed; on any failure the row stays `claiming` and the next claim re-sends both with the same keys. Gold-only letters skip items; item-only letters skip wallet. *(Amended 2026-11-04, A9.3: a business refusal from items, `STASH_FULL` or unmintable snapshots, puts the row back to the state the claim locked; only a transport or outage failure leaves it `claiming`.)* | Never lost, never doubled. (user override; ADR-0044) |
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

## Amendment 2026-11-04 (A7: both doors, sent-by audit, welcome letter)

Decided by the user on 2026-11-04, after the send slice (I-1GZGD-3) was merged and while the
claim (I-1GZGD-4) and the client (I-1GZGD-6) were being built. A1–A6 and every decision and
default above stand. The letter request (R12) and the event row of the RPC surface are corrected
in place, each saying *(Amended 2026-11-04, A7 …)*. New requirements are R52–R62. Everything
here is server-side: no HTTP endpoint, no generated contract and no client screen changes.

- **A7.1 — both doors stay.** The user weighed dropping the admin API and kept it. There are two
  ways a letter gets into the mailbox, and they are for different senders:
  - **The door for people is the admin API**, `POST /api/admin/mail`. A person sends through it:
    a compensation after an incident, an event announcement, a support answer. Its letters are
    `official`. Today it is guarded by the `admin` role on a **player account**, a stand-in until
    a separate back-office identity exists ([ADR-0047](../adr/0047-an-admin-is-a-role-on-a-player-account-until-a-back-office-identity-exists.md));
    when that identity arrives it replaces the role check at this door, not the mailbox behind it.
  - **The door for code is the system path**: the `mail.letter.requested` event, which another
    service publishes, and notification-service's own **letter triggers**, which run inside it. Code sends
    through it, with no person behind each letter. Its letters are `system`. The welcome letter
    (A7.3) is the first trigger of the second kind and the first system letter the repo produces.
  - Both doors end in the same store path (`prepareLetters` → `InsertLetters`): the same rules,
    the same snapshots, the same push. Only the sender kind and the sent-by audit differ.
- **A7.2 — every letter records who sent it (the sent-by audit).** Stored with the letter, for
  operators reading the database; **never shown to players**, and not part of any HTTP or
  player-facing gRPC answer.
  - An `official` letter records the **admin's member id, taken from the verified token** the
    admin send forwards; nothing in the request names it. Every letter of one request (one member,
    a list, a broadcast) records the same admin.
  - A `system` letter records its **sent-by source**: the requesting service or feature. For the letter
    request it is the event's new **required** `source` field; for a letter trigger it is a
    fixed name (`welcome` for A7.3).
  - **Columns:** two nullable columns on `letters`, `sent_by_member_id uuid` and
    `sent_by_source text`, with a `CHECK` that ties them to `sender`: an `official` row has a
    member id and no source, a `system` row has a source and no member id. **[charter default]**
  - **A new migration pair**, `000006_add_letter_sent_by` (next free number in
    notification-service). `000005_create_mailbox_tables` is never edited (the user's rule).
  - **Rows stored before the migration** keep both columns null. The `CHECK` is added
    `NOT VALID`, so Postgres enforces it on every row inserted or updated from then on and does
    not check the old rows; the migration neither backfills nor deletes them. Only development
    databases hold such rows, because the mailbox has not shipped anywhere. **[spec default]**
  - **The `source` field:** a string of 1–64 characters after trimming, naming the requesting
    service and feature, for example `marketplace.settlement`. Its value is not checked against a
    list. An event whose `source` is missing, blank or too long breaks R12's rules: it is logged at
    error, marked processed, acked and never requeued. **[spec default]**
  - **No read surface in v1.** No RPC, endpoint or screen reads the audit; an operator queries the
    table. **[spec default]**
- **A7.3 — a welcome letter for every new account.** When notification-service consumes
  `member.signedup`, it also stores one `system` letter for that member.
  - **Same transaction.** The letter is inserted in the **same inbox transaction** as the
    existing signup handling (`ProcessMemberSignedUp`'s `runInTx`: the inbox mark and the signup
    notification). The inbox dedups the event, so each account gets **exactly one** welcome
    letter, however often the event is delivered; if anything in the transaction fails, none of
    the three is stored.
  - **Per account, not per character.** The mailbox belongs to the account (the member id in
    `member.signedup`). The player first sees the letter on their first town entry, with their
    first character; a later character of the same account sees the same letter, already read or
    taken if it was.
  - **No backfill.** Accounts that signed up before this ships get no welcome letter.
  - **Sent by** `system`, `sent_by_source` `welcome`, addressed to that one member, expiring
    **30 days** after it is stored (the default expiry, R5).
  - **The copy** (English, the game's voice; title 29 characters, well inside R3's bounds).
    **[spec default]** for the wording:

    > **Title:** The Town Keeps a Fire for You
    >
    > **Body:**
    > The town keeps a fire for every newcomer, and tonight one burns for you.
    >
    > North of the square the Spire waits, as it has since the town woke to find it there. Those
    > who go down come back with relics and plunder, or do not come back at all. What you carry
    > out is yours to keep. What you leave behind, the barrow keeps.
    >
    > Go in prepared. Sealed in this letter are three small health potions and a hundred gold,
    > enough to buy what the Quartermaster thinks you will need.
    >
    > Take them. They will wait in your stash.

  - **The starter gift:** a template enclosure of **3 Small Health Potions** at the template's
    `min_item_level`, and a gold enclosure of **100**. **[charter default]** for the amounts.
    Both are claimed like any letter's enclosures (R13–R17); an empty new stash always has room.
  - ~~**How the potion is named:** by the **seeded template id**
    `aa0e8400-e29b-41d4-a716-446655440006` (Small Health Potion, code `HEALTH_POT_SMALL`,
    items-service migration `000002_seed_basic_data`), held as one named constant in
    notification's mailbox package. `ResolveItemSnapshots` takes template ids, items-service has no
    lookup by name or code, and a config key would be a knob nobody sets. **[spec default]**~~
    *(Amended 2026-11-04, A10: the potion is found by its catalogue name,
    `WELCOME_GIFT_TEMPLATE_NAME`, default "Lesser Heal Potion"; the fixed id no longer exists.)*
  - **Resolving it:** the welcome goes through the same `prepareLetters` path as any letter, so
    its potion is resolved by `ResolveItemSnapshots` and stored as a snapshot (A2). The resolve
    runs **inside** the inbox transaction, after the inbox mark, under a short deadline, the way
    `ProcessVerificationRequested` sends its email inside its own. A duplicate delivery stops at
    the inbox mark and never calls items-service. **[spec default]** *(Amended 2026-11-04,
    A8.1: only while the in-memory gift cache is empty.)*
  - **When items-service is unavailable** (unreachable, a deadline, an outage answer), the
    handler returns a **transient** error (`ErrTransient`). The whole transaction rolls back
    (no inbox mark, no signup notification, no letter), and the consumer requeues the event with
    its usual delays (5 s, 15 s, 60 s), then dead-letters it. Replaying it later stores all three,
    once. **[spec default]**
  - **When items-service refuses the potion** (the seeded template is gone, or unrepresentable),
    retrying cannot help: the handler logs at error and returns a permanent error, the transaction
    rolls back and the event is dead-lettered. There is never a partial welcome (gold without the
    potions, or a letter without its gift). **[spec default]** *(Replaced 2026-11-04 by A8.2: a
    refusal stores a gold-only welcome and the signup commits.)*
  - **The push:** after the transaction commits, notification-service publishes one
    `mail:arrived` `{"member_id": "<uuid>"}` through I-1GZGD-8's arrival publisher, outside the
    transaction, never failing the event (R41). A duplicate delivery stores nothing and publishes
    nothing. A brand-new account usually has no character in the town yet, so the push mostly
    finds nobody, and the first town entry's summary fetch shows the letter (R34, R44).
  - **The seam:** the signup handling (`internal/notification`) reaches the mailbox through a
    narrow interface it owns, implemented in `internal/mailbox` and wired in `config/routes.go`:
    store the welcome letter for a member on the given transaction, and, after the commit,
    announce it. The notification package learns nothing else of letters. **[spec default]**
  - *(Amended 2026-11-04, A8: the resolve runs only while the gift cache is empty, and a refused
    potion stores a gold-only welcome instead of dead-lettering the event. See A8.)*

## Amendment 2026-11-04 (A8: the welcome gift is cached; a refused gift never breaks signup)

Decided on 2026-11-04, before the welcome slice (I-1GZGD-11) was built. A1–A7 stand except where
this says otherwise. R60, R61, story 58, the welcome acceptance criteria and the A7 edge states
"items-service down at signup" and "the seeded potion template removed" are corrected in place.

- **A8.1 — the potion snapshot is cached for the life of the process.** *(the user's decision)*
  After the first `ResolveItemSnapshots` that resolves the welcome potion, notification-service
  keeps that snapshot in memory and every later welcome letter encloses it without calling
  items-service. Only a signup that finds the cache empty (a freshly started process) resolves,
  inside the inbox transaction as A7.3 says; if items-service is then unavailable, A7.3's transient
  path applies unchanged (roll back whole, requeue at 5 s, 15 s, 60 s, then dead-letter).
  - A resolve that fails or is refused leaves the cache empty, so the next signup tries again.
    The cache is filled only by a snapshot that resolved, never by an attempt (not a
    once-only initialiser).
  - Concurrent signups on a cold cache may each resolve; whichever finishes fills the cache, and
    each letter encloses a snapshot items-service resolved.
  - **Accepted consequence:** a rebalance of the welcome potion's template reaches new welcome
    letters only after notification-service restarts. Letters already stored keep their snapshot
    either way (A2).
- **A8.2 — a permanent problem with the gift never breaks signup.** **[charter default]**,
  flagged to the user. When items-service **refuses** the potion (`UNKNOWN_ITEM_TEMPLATE`, or an
  unrepresentable template, `ENCLOSURE_INVALID`), retrying cannot help, so the handler logs at
  error with the member id and stores the welcome letter with its **gold enclosure only** (100
  gold, no potion enclosure). The inbox mark, the signup notification and that letter commit as
  normal, the event is acked, and the push follows as for any welcome. The refusal is not cached:
  the next signup resolves again, so a fixed seed is picked up without a restart, and a fixed
  constant after one. This replaces A7.3's "refusal → permanent error → dead-letter" and its
  "never a partial welcome" rule; a welcome is still never stored without its gold, and an
  account whose welcome went out gold-only is not topped up later.

## Amendment 2026-11-04 (A9: the review-fix round)

Recorded on 2026-11-04, after a two-axis code review of the eleven merged slices. The fixes were
merged at `fb1abf5c` on `feat/notification-mailbox` under the user's `/charter` approval. A1–A8
stand except where this says otherwise. Two earlier choices change: the seal's local-only update
(R34, R38) and D16/R17's "any failure leaves the row `claiming`". The requirements, acceptance
criteria, edge states and API surface are corrected in place, each saying *(Amended 2026-11-04,
A9 …)*. New requirements are R63–R65.

- **A9.1 — the seal settles on the server's count.** After every mark read, Take and crumble (a
  `LETTER_EXPIRED` refusal), the client still drops the seal at once from what it knows, then
  fetches `GET /api/mail/summary` once more to confirm. The server's answer replaces the local
  one. Only the latest summary request applies: a newer one drops any older one still in flight,
  and leaving the town drops it too. Still no timer, and nothing is fetched outside the town.
  This amends R34 (the summary is fetched on more than its three occasions) and R38 ("without
  another fetch").
  - **Why:** concurrent fetches, other tabs (a letter read or taken there) and expiry made the
    local arithmetic drift from the server, and nothing corrected it until the next town entry.
  - **Every Take outcome confirms.** The confirming fetch follows every Take, whatever its
    outcome: success, `STASH_FULL`, `LETTER_ALREADY_CLAIMED`, `LETTER_EXPIRED` and any other
    failure. A mark read that fails puts the letter's unread dot back (and the seal with it),
    so the panel never shows read what the server holds unread.
  - **The same round, client:** one Take at a time per panel (every Take waits while one is in
    flight); a panel opening applies its letters only if it is still the latest opening; the
    crumbled line shows only when the expired letter is the open one; the chat window, the party
    invite prompt and the ready check sit under the letter panel, and chat keeps its draft while
    the panel holds the keys.
- **A9.2 — claims are capped per pod, and mailbox calls have deadlines.** A claim holds a
  database connection across its items and wallet calls, for up to about 10 s.
  notification-service's pool is **8** connections (was 2, the repo default), and at most **3**
  claims run at once per pod. Taking a claim slot never waits: a claim over the cap does nothing
  and answers `503 · SERVICE_UNAVAILABLE` at once, and is safe to repeat. So reads, mark read and
  the consumers always keep connections. The gateway runs every mailbox call under a deadline
  (summary, letters and mark read 5 s; claim 15 s; admin send 15 s) and answers a missed deadline
  `503 · SERVICE_UNAVAILABLE`. The generated contract does not change. New R63, R64.
- **A9.3 — an items refusal puts the claim row back.** When items-service refuses the grant as a
  business answer (`STASH_FULL`, or snapshots it cannot mint), nothing was minted. The claim puts
  the row back to the state it locked (`unclaimed` on a first attempt, `claiming` when it was
  finishing an earlier attempt) and keeps `read_at`. A transport or outage failure from items or
  wallet still leaves the row `claiming` (R17), because a step may have applied. This settles
  R17 ("any failure leaves `claiming`") against D7 and the stash-full acceptance criterion
  ("stays unclaimed"): D7 and the criterion stand, and R17 and D16 are corrected.
- **A9.4 — more answers count as an outage; a failed letter store is retried.**
  - items `Internal` (on resolve or grant) and wallet `NotFound` (no account yet, R24) or
    `Internal` are `503 · SERVICE_UNAVAILABLE`, as `Unavailable` and a missed deadline already
    were: a retry may succeed. items-service answers a transient resolve failure `Unavailable`,
    as its grant already did.
  - A letter request (R12) whose store or transaction fails (begin, inbox mark, insert, commit)
    rolls back and returns a transient error (`ErrTransient`). The consumer requeues it with its
    usual delays instead of dead-lettering it. Only a request that breaks the letter rules is
    permanent.
  - A non-admin `SendLetter` is refused `PermissionDenied` before its draft is parsed, so a
    player learns nothing about the draft rules from the admin RPC.
- **A9.5 — mark read never waits on a claim.** Mark read creates the state row only when it
  sees none, and sets `read_at` only on an unread row it can lock without waiting
  (`FOR UPDATE SKIP LOCKED`). A row a claim holds is skipped and mark read still succeeds; the
  claim sets `read_at` itself (R13). An already read letter takes no lock, so mark read never
  makes a claim of an **already read** letter answer `LETTER_CLAIM_IN_PROGRESS`. On an **unread**
  letter, the first mark read holds the row lock for one statement; a claim landing in that
  instant may answer `LETTER_CLAIM_IN_PROGRESS`. That is benign and retryable (the claim did
  nothing, and the next press goes through). *(Corrected 2026-11-04 after the round-2 review;
  the first wording said mark read never blocks a claim.)*
- **A9.6 — a sent letter is always mintable (items-service).** `ResolveItemSnapshots` reports as
  unrepresentable (so the send is refused `ENCLOSURE_INVALID`) anything `GrantItems` would refuse
  to mint, for example a template of required level 0. A letter whose send succeeded can always
  be claimed, unless its template is retired after the send (Edge States). `GrantItems` refuses
  `InvalidArgument` up front when its lines' quantities total more than the stash capacity (60),
  before it builds any id; notification never sends such a grant (S1).
- **A9.7 — wallet's credit keys get their own namespace.** `Credit` stores its dedup key as
  `credit:` + the caller's key (`credit:mail:<letter id>:<member id>`), so it can never collide
  with settlement's keys (`<workflow id>:CreditSeller`) or any other writer's in
  `processed_activities`. Repeats of one caller key still dedupe against each other. `Credit`
  refuses an amount that would overflow the balance (`InvalidArgument`); the refusal rolls back
  with the mark, so the key is not burned.
- **A9.8 — game-service's relay.** The mail-arrival queue holds **1024** arrivals, so an A6 list
  send of 1000 members cannot crowd this pod's member out. A member arrival looks up only that
  member's town connection, instead of copying the town. The decoder takes exactly the keys
  ADR-0045 names (`member_id`, or `broadcast`), with non-null values, and skips anything else. A
  full-queue drop logs at Debug, like chat.
- **A9.9 — notification refuses to boot without a JWT secret.** An unset or blank `JWT_SECRET`
  stops notification-service at boot, because it verifies every forwarded mailbox token with that
  key and an empty key is never a working configuration. New R65. Six other services accept an
  empty secret the same way; they are a follow-up under "Before GKE".

## Amendment 2026-11-04 (A10: the welcome potion is found by name)

Found in the first live run after the merge to main: a new account's welcome carried its 100 gold
but no potions. items-service answered `UNKNOWN_ITEM_TEMPLATE` for
`aa0e8400-e29b-41d4-a716-446655440006`, so A8.2's gold-only fallback fired as designed. That id
came from items migration `000002_seed_basic_data`, whose catalogue later migrations removed; the
potions players use are minted by `game-server/scripts/seed-dev.sh`, which gives every
environment its own template ids. A fixed id can therefore never be right in more than one place.

- **A10.1 — the potion is named by its catalogue name.** *(the user's choice of the three offered:
  by name, by a per-environment id, or a migration-seeded template with a fixed id)* notification
  finds the template whose name is `WELCOME_GIFT_TEMPLATE_NAME` (default **"Lesser Heal
  Potion"**, the dev seed's small healing potion), matched exactly but ignoring case and spaces at
  either end, through items-service's public `ListItemTemplates`. It needs no new items RPC and no
  token. **[spec default]** for the default name.
- **A10.2 — the id is cached with the snapshot.** The first welcome a process builds finds the
  id, then resolves the snapshot as before (A8.1); both are cached for the life of the process, so
  later welcomes call neither. A lookup that finds nothing, or fails, fills nothing.
- **A10.3 — outcomes of the lookup.** The catalogue unreachable is an outage: the signup handling
  rolls back and is retried, exactly as an outage of the resolve (A8.1, R61). No template by that
  name, or no gift configured at all, is a **permanent** problem: logged at error, the welcome is
  stored with its gold only, and signup commits (A8.2); the miss is not cached, so a catalogue
  that gains the name is picked up by the next welcome.
- **A10.4 — accepted consequence.** A rename of the template in the catalogue turns new welcomes
  gold-only until the name or `WELCOME_GIFT_TEMPLATE_NAME` agrees again; the error log says which
  name was missing.

## Before GKE

What must be done before the mailbox ships to GKE. None of it blocks merging the branch to main;
the last blocker is local and blocks only running the mailbox from the main checkout. Written
2026-11-04 (A9).

**Blockers**

- [ ] **Service credential (ADR-0046).** items `GrantItems` and `ResolveItemSnapshots` and wallet
      `Credit` trust their caller. They need a service credential before GKE; it lands with
      I-GV8WN-11 (the same credential `ApplySettlement` is waiting for).
- [ ] **The seeded admin's password (ADR-0047).** Change or remove the default password of the
      seeded `admin@barrowspire.com` account, which is public in the repo.
- [ ] **`JWT_SECRET` in the notification Secret.** The hand-made `notification` Secret must carry
      `JWT_SECRET`, the key the gateway signs with; without it notification does not start (R65).
      `game-server/deploy/gke/notification.yaml` says so beside its `secretRef`.
- [ ] **Database connection budget.** Cloud SQL `db-f1-micro` allows about 25 connections.
      notification now opens up to 8 per pod while every other service opens 2. Check that the
      sum over services and replicas fits before scaling notification out.
- [ ] **The welcome potion in the GKE catalogue (A10).** The GKE items catalogue must hold a
      template named "Lesser Heal Potion", or `notification-config` must set
      `WELCOME_GIFT_TEMPLATE_NAME` to the name it does hold; otherwise every welcome is gold only.
      *(Added 2026-11-04, A10.)*
- [ ] **notification-config.** Verify `REDIS_ADDR`, `ITEMS_ADDR` and `WALLET_ADDR` in the live
      ConfigMap. `game-server/deploy/gke/notification-config.yaml` already carries
      `redis:6379`, `items-headless:7126` and `wallet-headless:7128` (checked 2026-11-04).
- [ ] **The main checkout's local notification `.env`** (local, not GKE): it needs `ITEMS_ADDR`,
      `WALLET_ADDR` and `REDIS_ADDR` (IP literals, `127.0.0.1:<port>`), and its glued
      `OTEL_ENABLED=trueITEMS_ADDR…` line split in two.

**Follow-up (not a blocker)**

- Six other services accept an empty JWT secret the way notification did before A9.9:
  wallet `cmd/server/main.go:63`, marketplace `cmd/server/main.go:162`, ledger
  `cmd/server/main.go:59`, items `config/routes.go:74`, api-gateway
  `internal/auth/jwt_middleware.go:45`, and auth-service `internal/auth/jwt.go`. Each should
  refuse to start without one, as notification's `config.JWTSecret` does.
- wallet's `Account.Deposit` (`internal/account/domain/account/account.go`) still adds without
  an overflow check, so its other callers (for example settlement's `CreditSeller`) can
  overflow a balance. `Credit` guards only its own path (A9.7); the guard belongs in `Deposit`.
- An admin send retried after a gateway timeout can store every letter twice, because the admin
  send has no idempotency key (the A6 edge state "a list send retried after a timeout"). Keep it
  on the back-office list: the back office must not retry a send blindly until a send key exists.

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
   nothing and succeeds. It never waits on a claim: it locks an unread row only if it can
   without waiting, and a row a claim holds is skipped (mark read still succeeds, and the claim
   sets `read_at` itself, R13). An already read letter takes no lock, so its claim is never
   refused because of a mark read. On an unread letter the first mark read holds the row lock
   for one statement, and a claim landing in that instant may answer `LETTER_CLAIM_IN_PROGRESS`
   (benign, retryable). *(Amended 2026-11-04, A9.5, as corrected after the round-2 review.)*
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
    member or all.)* A non-admin caller is refused `PermissionDenied` before the draft is
    parsed. *(Amended 2026-11-04, A9.4.)*
12. **Letter request** — notification-service consumes `mail.letter.requested` (a new message in
    a new file under `common/api/proto/events/`, carrying an event id, recipient, title, body,
    enclosures, an optional expiry and a **required `source`**, stored as the letter's sent-by
    source, R55). The letter is `system`. *(Amended 2026-11-04, A7: `source` added.)* The event is deduplicated through
    the inbox (`processed_events`, FS-PJPNA) in the same transaction that stores the letter, so a
    redelivery stores nothing. A request that breaks R3–R5 is logged at error, marked processed
    and acked, never requeued. A request whose store or transaction fails (begin, inbox mark,
    insert, commit) rolls back whole and is transient (`ErrTransient`): the consumer requeues it
    with its usual delays, as for an items outage, instead of dead-lettering it at once.
    *(Amended 2026-11-04, A9.4.)* v1 has no
    producer in the repo (D2). Its recipient stays one member
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
    refused (`STASH_FULL`, D7; or snapshots items cannot mint, R19). *(Amended 2026-11-04, A9.3:
    the unmintable refusal named.)*
16. **Step 2 — wallet** (only if the letter has a gold enclosure), and only after step 1
    succeeded or was skipped: wallet's `Credit` with the player's forwarded token, the gold
    amount and the credit key (D5, D16).
17. notification-service sets the claim state to `claimed` only after **both** steps succeed,
    an already-granted or already-applied answer counting as success. A transport or outage
    failure in either step leaves the row `claiming`; the next claim re-sends both steps with the
    same keys — a done step answers success, the missing one completes (D16). A **business
    refusal** from items (`STASH_FULL`, or snapshots it cannot mint) minted nothing, so the claim
    puts the row back to the state it locked (`unclaimed` on a first attempt, `claiming` when it
    was finishing an earlier one) and keeps `read_at`. *(Amended 2026-11-04, A9.3; was: any
    failure in either step leaves the row `claiming`, which contradicted D7 and the stash-full
    acceptance criterion.)*

### Grants (items-service)

18. `GrantItems(grant_id, items[{snapshot, quantity}])` mints, in **one transaction**,
    `quantity` brand-new instances per entry, each **exactly as its snapshot** describes
    (template, name, item type, base stats, item level, required level, rarity, affixes; A2), all
    into the **stash** of the member in the forwarded token, status `AVAILABLE` (D7). No drop rule is applied (A1). *(Amended 2026-11-04; was: minted from the template id at
    rarity `normal`, base stats, `min_item_level`, no affix roll — D4, S4.)*
19. If the member's stash plus the grant's slot count would exceed 60, `GrantItems` mints nothing
    and refuses `STASH_FULL` (D7). A snapshot whose template is unknown, or that is not
    representable (A1), mints nothing and is refused (S2 backstop). *(Amended 2026-11-04; was:
    an unknown template is refused.)* A grant whose quantities total more than the stash
    capacity (60) can never fit and is refused `InvalidArgument` up front, before any id is
    built. *(Amended 2026-11-04, A9.6.)*
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
    **[amendment default]** for the field list and the way unknown ids are reported. It flags as
    unrepresentable anything `GrantItems` would refuse to mint (for example a required level of
    0), so a letter whose send succeeded is always mintable; a transient failure answers
    `Unavailable`. *(Amended 2026-11-04, A9.6.)*
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
    (charter bound; ADR-0006). The key is stored as `credit:` + the caller's key, so it never
    meets settlement's keys or any other writer's in `processed_activities`; an amount that
    would overflow the balance is refused `InvalidArgument`, and the refusal rolls back with the
    mark, so the key is not burned. *(Amended 2026-11-04, A9.7.)*
24. A member with no wallet account cannot be credited: `Credit` fails, and the claim stays
    `claiming` (the items, if any, are already in the stash) until a retry succeeds. The claim
    answers `503 · SERVICE_UNAVAILABLE`, since wallet creates the account from the same signup.
    *(Amended 2026-11-04, A9.4.)*

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
    An outage includes items `Unavailable`, `DeadlineExceeded` or `Internal`, wallet
    `Unavailable`, `DeadlineExceeded`, `Aborted`, `NotFound` (no account yet, R24) or `Internal`,
    a full claim cap (R63) and a missed gateway deadline (R64). *(Amended 2026-11-04, A9.2,
    A9.4.)*

### Client (game-client, town only)

33. **Envelope** — in the town only, a line envelope with a small wax seal, drawn in Phaser, at the
    bottom-right of the HUD (D11, D12). It is never shown in a delve or a field world.
34. **Fetching the summary** — the client fetches `GET /api/mail/summary` on entering the town,
    on each `mail_arrived` message while in the town (R43), and on opening the panel; never on a
    timer, and never outside the town (A4). *(Amended 2026-11-04; was: polling at once on entry,
    every 60 s and on opening the panel, stopped on leaving the town — D13.)* It also fetches it
    once after every mark read, Take and crumble, to confirm the seal it has already lowered
    (R38, R39). Only the latest request applies: a newer one drops any older one in flight, and
    leaving the town drops it. The server's answer wins over the client's own arithmetic.
    *(Amended 2026-11-04, A9.1; was: those three occasions only.)*
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
    (selecting) a letter marks it read (R8) and lowers the seal at once, then fetches the summary
    once to confirm it (R34); the server's answer wins. *(Amended 2026-11-04; was: "without
    waiting for the next poll". Amended again 2026-11-04, A9.1; was: "without another fetch".)*
    Only the latest panel opening applies its letters and selection. *(A9.1.)*
39. **Take button** — one "Take" button, shown only while the letter's enclosures are
    unclaimed. Press → "Taking…", disabled → on success ("Taken"): slots dim, a "Taken" wax stamp,
    the button gone, the list glyph dims, the seal count drops, and any gold balance the client shows
    is refetched. `STASH_FULL` → warning line "Your stash needs N free slots" (N = the letter's
    slot count), button stays. `LETTER_EXPIRED` → "This letter has crumbled to dust." and the
    letter leaves the list. `LETTER_ALREADY_CLAIMED` → shown taken. `LETTER_CLAIM_IN_PROGRESS`
    and any other failure → "The seal would not break. Try again.", button stays. (D14)
    *(Amended 2026-11-04, A5; was: "Claim" → "Claiming…" → claimed, with a "Claimed" stamp. The
    request is still the claim.)* After a Take or a crumble the seal drops at once and the
    summary is fetched once to confirm it (R34). The confirming fetch follows every Take outcome,
    failures included, and a failed mark read restores the letter's unread dot. One Take runs at
    a time per panel. The crumbled line shows only when the expired letter is the open one.
    *(Amended 2026-11-04, A9.1.)*
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
    most once. The decoder takes exactly ADR-0045's keys with non-null values, so anything else
    is "neither form". The pod's arrival queue holds 1024 messages, enough for an A6 list send of
    1000; a full queue drops the message (logged at Debug) rather than block the subscriber.
    *(Amended 2026-11-04, A9.8.)*
43. For `{"member_id": M}` the pod sends `{"action": "mail_arrived", "payload": {}}` to M if M
    stands in the HUB world on this pod; for `{"broadcast": true}` it sends it to every player in
    the HUB world on this pod. A player in a run or a field world, or on another pod, gets
    nothing from this pod. The message carries no letter content: the client asks the gateway.
    A member arrival looks up only that member's town connection. *(Amended 2026-11-04, A9.8.)*
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

### Both doors (added 2026-11-04, A7)

52. Letters enter the mailbox through two doors, and both stay: the **admin send** (R11) for
    people, whose letters are `official`, and the **system path** for code, whose letters are
    `system`: the letter request (R12) and notification-service's own triggers (R57). Both use the
    same store path and the same rules (R3–R5, S1, A2), and both publish the same push (R41). The
    admin door accepts the `admin` role of a player account until a back-office identity exists
    (ADR-0047). *(the user's decision)*

### Sent-by audit (notification-service; added 2026-11-04, A7)

53. Every letter stored from now on records **who sent it** in two columns of `letters`:
    `sent_by_member_id` (uuid, null) and `sent_by_source` (text, null). A `CHECK` ties them to
    `sender`: `official` has a member id and no source; `system` has a source and no member id.
    They come in a **new** migration pair, `000006_add_letter_sent_by`; `000005` is not edited.
    **[charter default]** for the columns and the check.
54. Rows stored before the migration keep both columns null. The `CHECK` is added `NOT VALID`:
    every row inserted or updated afterwards is checked, the old ones are not; nothing is
    backfilled or deleted. The down migration drops the constraint and both columns.
    **[spec default]**
55. The **admin send** records the admin's member id **from the verified forwarded token**, never
    from the request, on every letter it stores (one member, each letter of a list, or the
    broadcast). The **letter request** records the event's `source` as its sent-by source (1–64 characters after
    trimming, not checked against a list); an event whose `source` is missing, blank or longer is
    invalid under R12 (logged at error, marked processed, acked, never requeued). A
    letter trigger records its own fixed sent-by source. **[spec default]** for the bounds.
56. The sent-by audit is **never shown to players**: no player-facing gRPC answer, no gateway
    response (including the admin send's `201`) and no generated client type carries it, and no
    RPC or endpoint reads it in v1. **[spec default]** for the absence of a read surface.

### Welcome letter (notification-service; added 2026-11-04, A7)

57. When notification-service consumes `member.signedup`, it stores one **welcome letter** for
    that member **in the same inbox transaction** as its existing signup handling (the inbox mark
    and the signup notification). So each account gets exactly one, however often the event is
    delivered, and a failure anywhere stores none of the three. Accounts that signed up before
    this ships get none (no backfill).
58. The welcome letter is a `system` letter to that one member, `sent_by_source` `welcome`,
    expiring 30 days after it is stored, with A7.3's title and body **[spec default]** and two
    enclosures: a template enclosure of **3** welcome potions at the template's
    `min_item_level`, and **100** gold. **[charter default]** for the amounts. *(Amended
    2026-11-04, A10: "welcome potions"; was: Small Health Potions.)*
59. The potion's template is the one in items-service's catalogue whose name is
    `WELCOME_GIFT_TEMPLATE_NAME` (default "Lesser Heal Potion"), matched exactly ignoring case and
    surrounding spaces, found through the public `ListItemTemplates` by the first welcome a process
    builds and cached with its snapshot (A10). The catalogue unreachable is an outage (R61); no
    template by that name, or none configured, stores a gold-only welcome, logged at error and not
    cached. *(Amended 2026-11-04, A10; was: the seeded template id
    `aa0e8400-e29b-41d4-a716-446655440006`, a constant in notification's mailbox package.)*
60. The welcome is built through the same path as every letter (R3–R5, S1), so its potion is
    stored as a snapshot that `ResolveItemSnapshots` resolved. The first welcome a process builds
    resolves it, inside the inbox transaction, after the inbox mark, under a short deadline; the
    snapshot is then cached in memory for the life of the process and every later welcome uses
    it without calling items-service. A failed or refused resolve does not fill the cache. A
    duplicate delivery never calls items-service. **[spec default]** *(Amended 2026-11-04, A8.1:
    the cache is the user's decision; was: every welcome resolves.)*
61. If items-service is **unavailable** while the cache is empty, the handler returns a transient
    error: the transaction rolls back whole and the event is requeued with the consumer's delays,
    then dead-lettered. If items-service **refuses** the potion (unknown or unrepresentable
    template), the handler logs at error and stores the welcome letter with its gold only; the
    inbox mark, the signup notification and that letter commit, and the event is acked. The
    refusal is not cached. **[spec default]** for the transient path; **[charter default]** for
    the gold-only fallback. *(Amended 2026-11-04, A8.2; was: a refusal is a permanent error, the
    event is dead-lettered, and a welcome is never stored without its whole gift.)*
62. After the commit, notification-service publishes one `mail:arrived` `{"member_id"}` for the
    welcome letter through the arrival publisher (R41), outside the transaction; a failed publish
    is logged and the event is still acked. A duplicate delivery publishes nothing.

### Capacity, deadlines and boot (added 2026-11-04, A9)

63. notification-service's database pool holds **8** connections, and at most **3** claims run
    at once on one pod (each holds a connection across its items and wallet calls). Taking a
    claim slot never waits: a claim over the cap does nothing and answers
    `503 · SERVICE_UNAVAILABLE` at once, and repeating it is safe. Every outcome of a claim frees
    its slot. Reads, mark read and the consumers keep connections while the cap is full.
64. The gateway runs every mailbox call under a deadline: summary, letters and mark read 5 s,
    claim 15 s, admin send 15 s. A missed deadline answers `503 · SERVICE_UNAVAILABLE`. The
    generated contract does not change.
65. notification-service refuses to start when `JWT_SECRET` is unset or blank, since it verifies
    every forwarded mailbox token with that key.

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

*Added by amendment A7 (2026-11-04):*

47. As an admin, I want to keep sending letters by hand through the admin API, so that a
    compensation, an event or a support answer needs no code change.
48. As a platform developer, I want code to send letters through the system path, so that an
    automated letter never needs a person or an admin token.
49. As an operator, I want every official letter to record which admin sent it, so that I can
    answer "who sent this?" after an incident.
50. As an operator, I want every system letter to record which service or feature asked for it,
    so that I can trace an automated letter back to its cause.
51. As an operator, I want an admin who mails items or gold to themselves to leave a record, so
    that the stand-in admin role (ADR-0047) is at least visible when it is misused.
52. As a player, I never want to see an admin's id or a service's name in my letters, so that the
    letters stay in the game's voice.
53. As a service publishing a letter request, I want a request without a `source` refused, so that
    no system letter is ever stored without a cause.
54. As a new player, I want a welcome letter waiting in my mailbox the first time I reach the
    town, so that the game greets me and points me at the Spire.
55. As a new player, I want a few health potions and some gold with the welcome, so that my first
    delve is not empty-handed.
56. As a new player, I want exactly one welcome letter, however often the signup event is
    delivered, so that the gift cannot be farmed by redelivery.
57. As a player making a second character, I want no second welcome gift, so that the gift
    belongs to the account and cannot be farmed by new characters.
58. As an operator, I want a welcome that could not be built because items-service is down to
    retry or dead-letter whole, never half-stored, and a potion that items-service refuses never
    to block a signup, so that an outage is fixed by a replay and a broken seed costs new players
    their potions, not their signup. *(Amended 2026-11-04, A8; was: down or gone, retry or
    dead-letter whole.)*
59. As an existing player, I get no welcome letter after this ships, so that the welcome stays a
    welcome and is not a surprise handout.

*Added by amendment A8 (2026-11-04):*

60. As an operator, I want the welcome potion resolved once per process, so that a burst of
    signups does not lean on items-service. *(Added 2026-11-04, A8.)*

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
- [ ] A business refusal from items (`STASH_FULL`, unmintable snapshots) puts the row back to
      the state the claim locked (`unclaimed` on a first attempt) with `read_at` kept; an items
      or wallet outage leaves it `claiming`. *(Added 2026-11-04, A9.3.)*
- [ ] With 3 claims in flight on one pod, a fourth answers `503 · SERVICE_UNAVAILABLE` at once
      and does nothing, while reads still answer promptly; every claim outcome frees its slot.
      *(Added 2026-11-04, A9.2.)*
- [ ] A mark read during a claim of the same letter does not wait for it, and the claim leaves
      the letter read; a mark read of an already read letter never makes a claim answer
      `LETTER_CLAIM_IN_PROGRESS`. *(Added 2026-11-04, A9.5, as corrected after the round-2
      review.)*
- [ ] items `Internal` and wallet `NotFound` or `Internal` answer the claim
      `503 · SERVICE_UNAVAILABLE`. *(Added 2026-11-04, A9.4.)*
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
- [ ] `Credit` marks `credit:` + the caller's key, so a key settlement already marked does not
      stop a credit and a credit does not stop `CreditSeller`; an amount that would overflow the
      balance is refused `InvalidArgument` and burns no key. *(Added 2026-11-04, A9.7.)*

### Items (added 2026-11-04, A9.6)

- [ ] `ResolveItemSnapshots` reports as unrepresentable a template `GrantItems` could not mint
      (required level 0), so the send is refused `ENCLOSURE_INVALID`.
- [ ] `GrantItems` whose quantities total more than 60 is refused `InvalidArgument` before any
      write.

### Capacity, deadlines and boot (added 2026-11-04, A9)

- [ ] A gateway mailbox call whose notification answer misses its deadline (5 s reads, 15 s
      claim and send) answers `503 · SERVICE_UNAVAILABLE`.
- [ ] A non-admin `SendLetter` is `PermissionDenied` before its draft is parsed.
- [ ] A letter request whose store or transaction fails is requeued as transient, with nothing
      stored and the inbox mark rolled back.
- [ ] notification-service exits at boot with an unset or blank `JWT_SECRET`.
- [ ] A game pod's arrival queue takes a 1000-message burst and still delivers the member's
      message on this pod; the decoder refuses unknown keys and null values.

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
- [ ] After a mark read, a Take and a crumble, the seal drops at once and one summary fetch
      follows; when two fetches overlap only the later answer applies, and the seal ends on the
      server's count (e.g. after a letter is read in another tab). The fetch follows every Take
      outcome, failures included, and a failed mark read restores the letter's unread dot.
      *(Added 2026-11-04, A9.1.)*
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
      letter has crumbled to dust." and leaves the list. Only one Take runs at a time in a panel.
      *(Amended 2026-11-04, A9.1.)*
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

### Sent-by audit (added 2026-11-04, A7)

- [ ] Migration `000006_add_letter_sent_by` adds `sent_by_member_id` and `sent_by_source` to
      `letters` with the sender `CHECK` (`NOT VALID`); `000005` is byte-for-byte unchanged; the
      down migration removes both columns and the constraint, and up → down → up succeeds.
- [ ] A letter row stored before the migration survives it with both columns null.
- [ ] After the migration, inserting an `official` row without a member id, an `official` row
      with a source, a `system` row without a source, or a `system` row with a member id is
      refused by the database (repository test).
- [ ] An admin send to one member, to a list of three and to all members stores the admin's
      member id from the token on every letter, and no source.
- [ ] A `mail.letter.requested` with `source: "test.compensation"` stores that source and no
      member id; one with a missing, blank or 65-character `source` stores nothing, is logged at
      error, marked processed and acked.
- [ ] Neither `ListLetters`, the letters read, the summary nor the admin send's `201` carries a
      sent-by field, and the regenerated `openapi.yaml` and client have none.

### Welcome letter (added 2026-11-04, A7)

- [ ] Consuming one `member.signedup` stores, in one transaction, the inbox mark, the existing
      signup notification and one `system` letter to that member with `sent_by_source`
      `welcome`, A7.3's title and body, 3 welcome potions (as a snapshot at the template's
      `min_item_level`) and 100 gold, expiring 30 days after it was stored.
- [ ] The welcome potion is found by its catalogue name (R59): one lookup per process, then
      cached; a name missing from the catalogue stores a gold-only welcome, logged at error, and
      is asked again on the next signup. *(Added 2026-11-04, A10.)*
- [ ] The same event delivered twice stores one welcome letter and publishes `mail:arrived`
      once; the second delivery calls no items RPC.
- [ ] After one welcome has resolved the potion, later signups in the same process store their
      welcome with that snapshot and call no items RPC. *(Added 2026-11-04, A8.1.)*
- [ ] Concurrent signups on a cold cache each store one whole welcome letter, with no data race.
      *(Added 2026-11-04, A8.1.)*
- [ ] Two different `member.signedup` events for two accounts store one welcome letter each.
- [ ] After the commit, exactly one `{"member_id": M}` is published; with Redis unreachable the
      letter and the notification are still stored and the event acked.
- [ ] With the cache empty and items-service unreachable, nothing is stored (no inbox mark, no
      notification, no letter), and the event is requeued as transient; the cache stays empty, and
      once items is back, the redelivery resolves and stores all three once. *(Amended
      2026-11-04, A8.1: "with the cache empty".)*
- [ ] With items-service refusing the potion template, the inbox mark, the signup notification
      and a welcome letter holding only the 100 gold are stored, the refusal is logged at error,
      and the event is acked; the next signup calls items again. *(Amended 2026-11-04, A8.2; was:
      nothing is stored and the event is dead-lettered.)*
- [ ] A failure forced in the letter insert rolls back the inbox mark and the signup notification
      too (service or repository test).
- [ ] The welcome letter appears in that member's mailbox and summary like any letter, and its
      claim mints three potions into the stash and credits 100 gold once.
- [ ] Members who existed before the change have no welcome letter; nothing backfills one.

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
  Take button, and its row goes back to `unclaimed` (or to `claiming` if the claim was finishing
  an earlier attempt), still read. *(Amended 2026-11-04, A9.3.)*
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
  `generic`.)* Each refused claim puts the row back where it was (A9.3). This is now the only way
  a stored letter can be unmintable: resolve refuses at send whatever a grant would refuse
  (A9.6). *(Amended 2026-11-04, A9.)*
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

*Added by amendment A9 (2026-11-04):*

- **Claim cap full:** a fourth claim on a pod while three run answers `503` at once and does
  nothing; the client shows "The seal would not break. Try again." and the next press may
  succeed. Reads and mark read still answer.
- **notification slow or hung:** the gateway's deadline (5 s reads, 15 s claim and send) answers
  `503`; a claim cut off this way may still finish on the server, and the next claim or read
  shows where it ended (the keys make a repeat safe).
- **Mark read while a claim runs on the same letter:** mark read skips the locked row and
  succeeds; the claim marks the letter read. A claim that lands in the one statement in which
  an unread letter's first mark read holds the row may answer `LETTER_CLAIM_IN_PROGRESS`; the
  next press goes through.
- **A mark read that fails:** the letter's unread dot comes back, and the seal with it (A9.1).
- **A letter read or taken in another tab:** this tab's next read, Take, crumble, town entry or
  panel open fetches the summary, and the seal settles on the server's count.
- **Overlapping summary fetches:** only the latest one applies; an older answer arriving later is
  dropped.
- **A letter request whose store fails** (database blip): rolled back and requeued as
  transient, like an items outage; it is dead-lettered only after the consumer's retries run out.
- **A credit that would overflow the balance:** refused `InvalidArgument`; the claim fails with
  the generic error, the row stays `claiming` and the key is not burned.
- **A 1000-member list send on a game pod:** 1000 messages fit the pod's 1024-slot arrival
  queue, so a listed member in this pod's town still gets `mail_arrived`.
- **notification started without `JWT_SECRET`:** it exits at boot rather than run without a key.

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

*Added by amendment A7 (2026-11-04):*

- **An admin mails themselves:** allowed; the letter records the admin's member id as both
  sender and recipient, which is the only trace (ADR-0047). Accepted until the back office exists.
- **Letters stored before migration 000006:** both sent-by columns null; the check skips them.
- **A letter request without a `source`:** invalid (R55); nothing stored, marked processed, acked.
- **Signup event redelivered:** the inbox stops it before any work; no second welcome, no items
  call, no push.
- **items-service down at signup:** with the potion cached, nothing changes: the welcome needs no
  items call. With the cache empty (a fresh process), the whole signup handling waits with it. The event is
  requeued three times (5 s, 15 s, 60 s); an outage longer than that dead-letters the event, so
  the signup notification and the welcome letter are both missing until the event is replayed.
  Accepted for v1. **[spec default]** *(Amended 2026-11-04, A8.1: only on a cold cache.)*
- **The welcome potion's name missing from the catalogue (renamed, removed, or never seeded):** a
  process that already cached the potion keeps enclosing it until it restarts. A process with an
  empty cache stores every welcome with its gold only, logged at error with the missing name, and
  keeps asking items-service on each signup until the catalogue or `WELCOME_GIFT_TEMPLATE_NAME`
  agrees again. Those accounts never get the potions. **[charter default]** *(Amended
  2026-11-04, A8.2; was: every signup dead-letters until fixed and replayed. Amended 2026-11-04,
  A10: by name, not by a seeded id.)*
- **The potion template rebalanced while the process runs:** new welcomes keep the cached
  snapshot until notification-service restarts (A8.1, accepted). *(Added 2026-11-04, A8.)*
- **A new player claims the welcome before wallet-service has created their account:** the
  credit fails and the claim stays `claiming`, retryable (R24); wallet creates the account from
  the same `member.signedup`.
- **A player's second character:** sees the same welcome letter, in whatever state the first left
  it; no second gift.
- **The welcome expires unread** (the player never reached the town within 30 days): it is gone
  with its gift, like any letter (R5).
- **Push at signup:** the new member is almost never in the town yet; the push finds nobody and
  the first town entry's summary shows the letter.

## API surface

New resources, so field-level. Identity is never in a request: the member comes from the token.
Refusals follow the errcode convention (`400 · <CODE>`); outages are `503 · SERVICE_UNAVAILABLE`;
no token is `401 · UNAUTHENTICATED` on every row.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| Mailbox summary | `GET /api/mail/summary` | — | — | `200` `{ unreadCount: int, unclaimedCount: int, waitingCount: int, newestLetterAt?: date-time }` | `503 · SERVICE_UNAVAILABLE` |
| Read my letters | `GET /api/mail/letters` | — (≤ 50, newest first, no paging) | — | `200` `{ letters: Letter[] }` (below) | `503 · SERVICE_UNAVAILABLE` |
| Mark a letter read | `POST /api/mail/letters/{letterId}/read` | `letterId` uuid | — | `204` | `404 · NOT_FOUND` (absent or not addressed to the caller) · `400 · LETTER_EXPIRED` · `422 · VALIDATION_FAILED` (bad uuid) · `503 · SERVICE_UNAVAILABLE` (added 2026-11-04, A9.2: a missed deadline) |
| Claim a letter | `POST /api/mail/letters/{letterId}/claim` | `letterId` uuid | — | `200` `{ letterId: uuid, claimState: "claimed", itemIds: uuid[], gold: int64 }` (`gold` 0 on an item-only letter) | `404 · NOT_FOUND` · `400 · LETTER_EXPIRED` · `400 · NOTHING_TO_CLAIM` · `400 · LETTER_ALREADY_CLAIMED` · `400 · LETTER_CLAIM_IN_PROGRESS` · `400 · STASH_FULL` · `503 · SERVICE_UNAVAILABLE` · `422 · VALIDATION_FAILED` |
| Send official mail | `POST /api/admin/mail` | — | `{ recipient: { memberId: uuid } \| { memberIds: uuid[] } \| { allMembers: true }, title: string, body: string, enclosures?: EnclosureRequest[] (≤ 10, ≤ 1 gold), expiresAt?: date-time }` | `201` `{ letters: { letterId: uuid, memberId?: uuid }[], expiresAt: date-time }` (one entry per stored letter; `memberId` absent only for `allMembers`) | `403 · FORBIDDEN` (not `RoleAdmin`) · `400 · LETTER_RECIPIENTS_INVALID` (empty list, > 1000 distinct ids) · `400 · LETTER_TITLE_INVALID` · `400 · LETTER_BODY_INVALID` · `400 · LETTER_EXPIRY_INVALID` · `400 · ENCLOSURE_INVALID` (count, gold count, quantity, amount, slot count, item level < 1, unrepresentable copy) · `400 · UNKNOWN_ITEM_TEMPLATE` · `400 · UNKNOWN_ITEM_INSTANCE` · `422 · VALIDATION_FAILED` (shape: more than one or none of the recipient forms, a non-uuid id, unknown members) · `503 · SERVICE_UNAVAILABLE` |

*Admin send amended 2026-11-04 (A6): the `memberIds` form, the `letters` answer (was
`{ letterId: uuid, expiresAt }`) and `LETTER_RECIPIENTS_INVALID` are new. **[spec default]** for
the answer's shape and the code's name.*

*Amended 2026-11-04 (A9.2): every mailbox row may answer `503 · SERVICE_UNAVAILABLE` when
notification misses the gateway's deadline (5 s for the three reads, 15 s for claim and send),
and a claim also answers it when the pod's claim cap is full (R63, R64). The generated contract
is unchanged.*

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
| items | `GrantItems(grant_id, items[{snapshot, quantity}])` → instance ids, `already_granted` | member from forwarded token; mints from the snapshots (amended 2026-11-04); refuses a total over 60 `InvalidArgument` up front (A9.6) |
| items | `ResolveItemSnapshots(templates[{template_id, item_level?}], instance_ids)` → snapshots, unknown ids, unrepresentable ids | no member token; send time only (replaces `GetTemplateSummaries`, 2026-11-04); flags as unrepresentable anything `GrantItems` would refuse (A9.6) |
| wallet | `Credit(amount, idempotency_key)` → `applied` | member from forwarded token; no account field; marks `credit:` + the key; refuses an overflowing amount (A9.7) |
| events | `LetterRequested` (`mail.letter.requested`) | new file under `common/api/proto/events/`; enclosures of the three request kinds; recipient one member or all members, never a list (A6); a required `source` string, 1–64 characters, stored as the letter's sent-by source (added 2026-11-04, A7) |
| events | `member.signedup` (consumed, existing) | also stores the welcome letter in the same inbox transaction (added 2026-11-04, A7); the payload does not change |
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
- *(Added 2026-11-04, A7:)* a separate back-office or operator identity, its login and its
  per-action audit (ADR-0047); stopping an admin from mailing themselves; any read surface for
  the sent-by audit, and showing a sender's identity to players; checking a letter request's
  `source` against a list; a welcome letter for accounts that existed before, one per character,
  or in another language; other notification triggers besides the welcome.
- *(Added 2026-11-04, A8:)* refreshing the cached welcome potion without a restart (a TTL, an
  event from items-service); topping up the potions of a welcome that went out gold-only.
- *(Added 2026-11-04, A9:)* a configurable claim cap or pool size; queueing claims over the cap
  instead of answering 503; a gateway retry of a missed deadline; fixing the six other services
  that accept an empty JWT secret (a follow-up in "Before GKE").

## Change: The envelope toggles the letter panel and stands in the corner row
Status: work-order
Date: 2026-11-12

Charter "右下角圖示與面板操作", approved by the owner 2026-11-12 ("核准"). Owner: "信箱ui可以透過再按一次信箱關閉"
(the letter panel can be closed by pressing the envelope again), "mail沒有快捷鍵 所以就顯示mail就好"
(the mailbox has no key, so its hover text is just "Mail"). Made alongside
[FS-3EBCA](3EBCA-hud-corner-icons.md), which owns the corner row the envelope joins. R33, R36
and R40 above are not edited; where this section and they disagree, this section wins.

Amended the same day, before the browser check, by the owner: "信箱似乎也會卡住其他面板 但信箱是全畫面
那設定成開信箱時其他視窗會被關閉 開其他視窗時信箱會被關閉 開menu時其他視窗也會關閉 然後menu開啟時其他都不能按" (the
mailbox seems to block the other panels; since the letter panel is full-screen, opening it closes
the other windows, opening another window closes it, opening the menu closes every window too, and
while the menu is open nothing else can be pressed). C1 is edited in place and C4 added; R40's "the
letter panel owns the keys" no longer holds for I, B, C and T (FS-3EBCA R16). The rules for every
world are FS-3EBCA §D.

Amended again the same day, by the owner: "mailbox的x關閉按鈕好像位置跟其他的不太一樣" (the mailbox's ×
close button seems to sit differently from the others'): C5 added; R36's panel keeps its size,
place and contents.

### Requirements

C1. **The envelope toggles.** With the letter panel open, a press on the envelope closes it, as
    the × and Esc do (R40), whatever else is open. With it shut, a press opens it as before (R36),
    and opens nothing while a dialogue or the ESC menu owns the screen. The inventory, the
    character panel and the party panel no longer refuse it: they close (C4).
    **(charter default: owner, "信箱ui可以透過再按一次信箱關閉"; the gear overlay taken out of the
    refusal, owner 2026-11-12: "開信箱時其他視窗會被關閉")**
C2. **The envelope is the corner row's Mail icon.** It stands in the row's leftmost slot, left of
    Menu, Inventory, Character and Party (FS-3EBCA R1, R2): at 1080 × 720 its plate is (742, 658,
    58, 46) (808 before FS-3EBCA's fifth icon, the owner's decision of 2026-11-12), and it keeps that slot when the view's size changes. The mailbox stays town only (R33, D11);
    outside the town the row draws a greyed envelope in the same slot that cannot be pressed
    (FS-3EBCA R9; owner, "野外 email也不用消失 就顯示灰色表示不能按"), and nothing of the mailbox is
    fetched there. Its plate, lines, seal, count and pulse are drawn exactly as before; only its
    place moves. **(charter default)**
C3. **It names itself under the pointer**: "Mailbox", in the row's hover label (FS-3EBCA R5), and
    no key. The screen's word for it stays mailbox and letter (`game-client/CONTEXT.md` § Mailbox
    terms). **(owner: "mail沒有快捷鍵 所以就顯示mail就好", then "信箱hover改mailbox", 2026-11-12)**
C4. **The letter panel is full-screen, so it stands alone.** Opening it first closes the inventory,
    the character panel (the stash with the inventory, at the stash chest) and the party panel
    (FS-3EBCA R15, R19). Opening any of them (I, B, C, T or their corner icons) with the letter
    panel open closes the letter panel first (FS-3EBCA R16); the letter panel no longer refuses
    them. Opening the ESC menu closes it too, and while the menu is open the envelope opens
    nothing (FS-3EBCA R17, R18). `E` stays dropped under it (R40). **(owner, 2026-11-12, above)**
C5. **The letter panel wears every window's frame and ×.** It is drawn by the shared frame
    drawing (`drawPanelFrame`, FS-3EBCA R25), as the party panel, the menu and the inventory and
    character panel are: the same carved ground, and its × at the shared place, a 24 × 24 box
    12 px in from the panel's top and right edges (it stood 20 px in), in the same glyph, amber
    and brighter under the pointer. A press on it closes the panel, as before; Esc as before (R40).
    Its title stays the shared one (FS-3EBCA R22); nothing else in it moves: the list and the
    letter already begin below the title band. **(owner, 2026-11-12: "mailbox的x關閉按鈕好像位置跟其他的不太一樣";
    the shared frame derived here: the × is the frame's, so the panel takes the frame)**

### Acceptance Criteria

- [ ] With the letter panel open, a press on the envelope closes it; a second press opens it again.
- [ ] With the panel shut, a press while a dialogue or the ESC menu is open opens nothing.
- [ ] With the inventory, the character panel, the stash or the party panel open, a press on the envelope closes them and opens the letter panel.
- [ ] With the letter panel open, I, B, C, T and the Inventory, Character and Party icons close it and open their window.
- [ ] At 1080 × 720 the envelope's plate is (742, 658, 58, 46) and at 1280 × 720 (942, 658, 58, 46); its seal, count and pulse are unchanged.
- [ ] Under the pointer the envelope shows "Mailbox"; the label goes when the pointer leaves.
- [ ] Esc and the × still close the panel.
- [ ] The letter panel draws its frame through `drawPanelFrame`, and its one × stands at `frameClose(panel)`: (924, 122, 24, 24) at 1080 × 720.

### Edge States

- **A press while the panel is still loading:** the panel is open as soon as it is asked for
  (`openPanel` sets it open at once), so a second press closes it and the late answer applies to
  nothing.
- **A press on the envelope while the gear overlay is open:** the overlay stops above the row
  (FS-HRH2J § Change C12); the overlay closes and the letter panel opens (C4).
- **Leaving the town with the panel open:** as before (R44): it closes with the town.

### Out of Scope

- A key for the mailbox.
- The mailbox outside the town (D11); the greyed icon there is FS-3EBCA's.
- Any change to the letter panel's contents (its frame and × are C5's), the seal, or the summary's fetches.
