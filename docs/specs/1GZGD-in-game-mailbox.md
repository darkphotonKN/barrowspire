# FS-1GZGD: In-game mailbox — system letters with enclosures

> Status: draft · SPECIFICATION.md: `game-server/notification-service/SPECIFICATION.md` "## Mailbox", `game-server/items-service/SPECIFICATION.md` "## Grants" and "## Inventory" (gold pouches), `game-server/wallet-service/SPECIFICATION.md` "### Account" (idempotent credit), `game-server/api-gateway/SPECIFICATION.md` "### Mail" and "### Items", `game-client/SPECIFICATION.md` "### Mailbox" and "### Hub" → this FS · Vocabulary: [`notification-service/CONTEXT.md`](../../game-server/notification-service/CONTEXT.md) § Mailbox, [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md), [`wallet-service/CONTEXT.md`](../../game-server/wallet-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Mailbox terms · Scoped 2026-11-04 from a `/charter` run; every decision below was approved by the user in the charter.

## Scoping notes (raw)

Residue of the 2026-11-04 charter. The locked-decisions block arrived pre-formed and approved by
the user; it **is** the residue and is kept close to verbatim. Each decision is tagged
`[charter default]` with its reason. None of them went through `/challenge-me` (the user approved
the charter's lock preview directly), so they are **(not challenged)**.

### Bounds

- May add a **Mailbox bounded context to notification-service** (tables, gRPC, AMQP consumer),
  **item-grant + gold-pouch support in items-service** (a new migration is allowed — never edit
  an existing migration, add a new numbered up/down pair), **ONE idempotent credit RPC in
  wallet-service** (no ledger change), **player + admin endpoints in api-gateway** (openapi and
  client regenerated with `make openapi && make client`, never hand-edited), a **hub HUD in
  game-client**.
- NOT: settlement/run changes, game-service changes, a new service, player-to-player sending.

### Decisions

- **D1 — Mailbox lives in notification-service as a new bounded context.** [charter default]
  It already owns per-member in-app notifications and inbox dedup (FS-PJPNA); no new
  service/DB/deploy. → ADR (with D6/D20, D16).
- **D2 — Two entry points.** [charter default] (a) admin `POST /api/admin/mail` on the gateway,
  `RoleAdmin` only (`common/auth` `RoleAdmin`), to one member or to all; (b) AMQP event
  `mail.letter.requested` carrying an event id, deduplicated by an inbox. No in-repo producer in
  v1 · reason: official mail now, future system compensations later.
- **D3 — A broadcast is stored ONCE.** [charter default] Per-member read/claim state rows are
  created lazily on read/claim; members who sign up later still see it until it expires · reason:
  no fan-out, and notification doesn't know signup dates.
- **D4 — Item enclosure = item template id + quantity**, minted from the template's base stats,
  NO affix roll. [charter default] · reason: compensation must be deterministic.
- **D5 — Gold is sent as an ITEM.** [charter default] A "gold pouch" enclosure `{gold: N}` mints
  ONE pouch instance whose amount lives on the instance (new `gold_amount` column on
  `item_instances`) · reason: any amount in one slot.
- **D6 — Claim is player-initiated.** [charter default] notification forwards the PLAYER's token
  and calls items `GrantItems(grant_id = letter id + member id)`; items treats `grant_id` as a
  unique key; notification marks claimed only after items succeeds; a failed claim can simply be
  retried · reason: no saga/Temporal, no whitelist. → ADR.
- **D7 — Granted items go to the STASH.** [charter default] If all enclosures don't fit, the
  whole claim is refused (`StashFull`) and the letter stays unclaimed · reason: all-or-nothing.
  (Stash capacity 60, bag 30 already exist in items-service, FS-VPD8Y.)
- **D8 — Letters expire 30 days after sending by default**; admin may set a different expiry;
  expired letters are hidden and unclaimed enclosures are forfeited. [charter default]
- **D9 — No delete and no claim-all-letters in v1.** [charter default]
- **D10 — Plain-text title ≤ 60 chars, body ≤ 2000 chars; no rich text.** [charter default]
- **D11 — Client: the mailbox shows ONLY in the hub, icon at the bottom-right; hidden in runs.**
  [charter default] · reason: the run's bottom-right is the ability card, and items can't move in
  a run.
- **D12 — Indicator.** [charter default] When any letter is unread OR has unclaimed enclosures,
  the envelope's wax seal lights and shows the count; the moment a NEW letter arrives the
  envelope glows/pulses a few times then stays lit; the seal goes dark only when everything is
  read and claimed.
- **D13 — Client POLLS `GET /api/mail/summary`** (unread count, unclaimed count, newest letter
  time) every 60 s while in the hub, and immediately on hub entry and on opening the panel; a
  newer "newest letter time" than last seen triggers the D12 pulse. [charter default] · reason:
  no push in v1 (push via game-service is explicitly out).
- **D14 — Letter UI.** [charter default] Centered panel in the carvedPanel house style
  (`game-client/src/ui/carvedPanel.ts`, `menuChrome.ts`; art spec
  `game-client/docs/design-guideline.md`).
  - Left: letter list, newest first, non-expired only, max 50 (scroll, no paging); each row =
    title, relative time, enclosure glyph; unread rows have a lit wax-seal dot + bright title,
    read rows dim; enclosure glyph lit while unclaimed.
  - Right: title, sender ("The Barrowspire Wardens" for official, "The Spire" for system), sent
    date, days until expiry (warning tone ≤ 3 days), scrollable plain-text body, and — only if the
    letter has enclosures — an "Enclosed" row of bag-sized slots with the existing item icons and
    the existing item tooltip on hover, "x3" for quantity > 1, the gold amount under a pouch; a
    single "Claim" button (whole letter, all-or-nothing) shown only while enclosures are
    unclaimed.
  - States: Claim → "Claiming…" disabled → claimed (slots dim, a "Claimed" wax stamp, button
    gone, list glyph dims, envelope count drops); StashFull → warning line "Your stash needs N
    free slots", button stays; error → "The seal would not break. Try again.", button stays;
    expired while open → "This letter has crumbled to dust." and it leaves the list.
  - Opening a letter marks it read. Opening the panel selects the first unread letter, else the
    newest. Empty → "No letters wait for you." Close with × or Esc; while open, WASD does not
    move the character (same as chat input). English copy in the game's lore voice.
- **D12/D14 icon** — drawn in Phaser as a line envelope with a small wax seal (no emoji, no
  Heroicons — the HUD is canvas); design guideline: line icons + wax-seal badges. [charter default]
- **D15 — One ADR for D1 + D6/D20 + D16.** [charter default]
- **D16 — Opening a pouch.** [charter default] In the hub bag/stash UI, a pouch's tooltip has
  "Open" → gateway → items `OpenPouch` → items calls the new wallet credit with key
  `pouch:<instance id>` (forwarding the player's token), then deletes the pouch only after the
  credit succeeds; a crash in between leaves the pouch, and re-opening is a no-op credit + delete
  · reason: never lost, never doubled. Model the wallet side on
  `wallet-service/internal/account/usecase/credit_seller_usecase.go` (credit +
  `MarkActivityProcessed(key)` in one transaction). → ADR.
- **D17 — A pouch can't be equipped, listed on the marketplace, or taken into a run** (stash-only:
  can't be moved to the bag). [charter default] · reason: only refusals, no change to market/run
  rules.
- **D18 — Wallet credits only the account of the member in the forwarded token.** [charter
  default] · reason: nobody can open your pouch for you.
- **D19 — A new gold-pouch item icon in the item icon set**; tooltip "Holds N gold" with the Open
  action. [charter default]
- **D20 — NO DUPLICATE CLAIMS** (the user emphasised this) — every layer guards: [charter default]
  1. double-click / two tabs: one per-member-per-letter state row; only one conditional
     `UPDATE ... WHERE state='unclaimed'` wins the move to `claiming`, the loser gets "already
     claiming/claimed";
  2. `GrantItems` retried: `grant_id` unique, a repeat returns the first result and mints
     nothing;
  3. crash after items granted but before notification marked claimed: the row stays `claiming`;
     the next claim re-calls the same `grant_id`, items answers already-granted, notification
     marks `claimed` — never doubled, never stuck;
  4. pouch: wallet dedups `pouch:<id>`, items deletes the pouch only after the credit.
  Each guard needs a test; at least one must be a concurrent two-requests test. These become
  explicit acceptance criteria. → ADR.

### Alternatives rejected (from the charter's reasons)

- A new mail service with its own DB/deploy — rejected by D1 (notification already has the
  per-member store and the inbox).
- Fan-out of a broadcast into one row per member — rejected by D3 (no fan-out; notification
  cannot enumerate members or know signup dates).
- Rolling affixes on enclosed items — rejected by D4 (compensation must be deterministic).
- Gold credited directly at claim — rejected by D5 (gold travels as a pouch item; any amount in
  one slot).
- A saga / Temporal workflow or a service whitelist for the claim — rejected by D6 (player-
  initiated, retried by the player, idempotent by `grant_id`).
- Granting what fits and leaving the rest — rejected by D7 (all-or-nothing).
- Push of new-letter events through game-service — rejected by D13 (polling in v1).

### Constraints referenced

- FS-VPD8Y: stash cap 60, bag cap 30, `BAG_FULL`-style refusal code already in use.
- FS-PJPNA / ADR-0043: notification-service's inbox (`processed_events`) dedup pattern.
- ADR-0009: idempotency belongs to the caller (the caller mints the key: `grant_id`,
  `pouch:<id>`).
- ADR-0006: deposits (gold entering the economy without a counterparty) are not recorded in the
  ledger until a system account exists. A pouch credit is such a deposit; the charter's
  "no ledger change" keeps it out of the ledger. Recorded as a consequence in the ADR.
- `common/auth` `RoleAdmin`; the gateway's contract is generated (`make openapi && make client`).
- Existing migration files are never edited; new numbered up/down pairs only.

### Edge cases raised

- A broadcast seen by a member who signed up after it was sent (D3: visible until expiry).
- Expiry reached while a member's row is `claiming` after a crash: the letter is hidden; if items
  had already granted, the member keeps the items; nothing is doubled.
- A claim that arrives after expiry: refused, the letter is gone ("crumbled to dust").
- Two tabs claiming at once (D20.1) and a crash between grant and mark (D20.3).
- Two concurrent pouch opens (D20.4): one credit, one delete.
- A pouch open whose wallet account does not exist (wallet's known signup gap): credit fails,
  pouch kept.
- "mail" / "mailer" already means outbound EMAIL in notification-service (ADR-0043, the
  `Mailer` interface, `config/mail.go`). The in-game concept uses Mailbox / Letter / Enclosure;
  the wire names fixed by D2/D13 (`/api/mail`, `/api/admin/mail`, `mail.letter.requested`) keep
  the word "mail" and mean the in-game mailbox (recorded in CONTEXT.md).

### Open questions (not settled by the charter)

- Maximum number of enclosures per letter (bounded above by the stash cap of 60 under D7).
- Where an unknown item template id is caught: at send, or only at claim by items.
- How the client gets an enclosure's icon/tooltip data (the letter stores only template id +
  quantity; the item tooltip needs the template's name, type and base stats).
- Item level given to an instance minted from a template (D4 says base stats, no affix roll).
