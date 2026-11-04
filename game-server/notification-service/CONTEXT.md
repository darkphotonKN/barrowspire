# CONTEXT — notification-service

Ubiquitous language for the **notification-service** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## Terms

<!-- **Term** — one-line definition -->

## Mailbox (FS-1GZGD, ADR-0044)

**Mailbox** — the in-game letters a member can read in the town, and the bounded context in this service that holds them. Not the notification list: a notification is a one-way line about something that happened; a letter has a sender, a body, an expiry and may carry enclosures to claim.
**Letter** — one in-game message in the mailbox: a plain-text title (≤ 60) and body (≤ 2000), a sender kind, a sent time, an expiry, and zero or more enclosures. Addressed to one member or to every member. Never "mail" or "email" in code.
**Official letter** — a letter sent by an admin through the gateway; the screen names its sender "The Barrowspire Wardens".
**System letter** — a letter created from a broker letter request; the screen names its sender "The Spire".
**Broadcast letter** — a letter addressed to every member, stored once; no per-member copy exists until that member reads or claims it. A member who signs up later still sees it until it expires.
**Letter state** — one row per member per letter, created lazily on first read or claim: whether that member has read it, and its claim state. A broadcast's absence of a row means unread and unclaimed.
**Claim state** — `unclaimed` → `claiming` → `claimed`, per member per letter. Only one conditional move out of `unclaimed` wins; a row left `claiming` by a crash is finished by the next claim re-using the same grant id. A letter with no enclosures has nothing to claim.
**Enclosure** — something a letter carries for the reader to claim: an **item enclosure** (an item snapshot + quantity) or a **gold enclosure** (an amount of gold, credited straight to the member's wallet on claim; no item carries it). Never "attachment" in code (an email word).
**Template enclosure** — how a sender asks for an item enclosure by catalogue template (template id, quantity, optional item level): a fresh item, base stats, rarity `normal`, no affixes, at the given item level or the template's `min_item_level`. A send-time request form only: once resolved it is stored as an item snapshot like any other item enclosure. (FS-1GZGD A1)
**Copy enclosure** — how a sender asks for an item enclosure as a copy of an existing item instance (`copy of` instance id, quantity): the instance's template, item level, rarity and affixes as they stand at send, uniques too. The reader gets brand-new instances; nothing of the source's owner, listing, status, location or run state carries over, and the source can change or vanish afterwards without touching the letter. A send-time request form only. (FS-1GZGD A1)
**Item snapshot** — the full description of one item, resolved by items-service at send and stored in the letter: everything the letter shows and everything the claim mints from. Never re-read later; what the reader sees is what they get. No drop rule applies to it, only representability. (FS-1GZGD A2)
**Mail arrival** — the hint, published on the Redis pub/sub channel `mail:arrived` after a letter commits, that a letter was just sent: `{"member_id"}` for one member, `{"broadcast": true}` for all. Best-effort, at most once, never part of the send's success; game-service relays it to players in the town. Not a notification and not a letter. (FS-1GZGD A4, ADR-0045)
**Claim** — a member taking every enclosure of one letter at once: its items into their stash (the items grant, the only step that can be refused) and then its gold into their wallet (the credit). This service drives the two steps and records `claimed` only after both succeeded.
**Grant id** — the idempotency key of a claim, derived from letter id + member id, minted here and treated by items-service as a unique key (ADR-0009). The same claim always carries the same grant id.
**Credit key** — the idempotency key of a claim's gold credit, `mail:<letter id>:<member id>`, minted here and deduplicated by wallet-service in the credit's own transaction (ADR-0009). With the grant id, it is why re-sending both steps of a half-done claim completes it without doubling anything.
**Letter request** — the broker event `mail.letter.requested`, carrying an event id, asking this service to create a system letter; deduplicated through the inbox (`processed_events`) like any other consumed event.
**Expiry** — the time after which a letter is hidden from its readers; 30 days after sending unless the sender set another. Unclaimed enclosures of an expired letter are **forfeited**: nothing is granted and nothing is kept for later.

**Boundary — "mail" is two words here.** Before the mailbox, "mail", `Mailer`, `config/mail.go` and the SMTP sender meant **outbound email** (ADR-0043), and they still do. The in-game concept is **Mailbox / Letter / Enclosure** in Go identifiers, tables and prose. The only places "mail" names the in-game mailbox are the wire names fixed by the charter: the HTTP paths `/api/mail/*` and `/api/admin/mail`, the event `mail.letter.requested`, and (since ADR-0045) the Redis channel `mail:arrived`; game-service's WebSocket action `mail_arrived` is the same word on the game side. Never name an in-game type `Mail*`.
