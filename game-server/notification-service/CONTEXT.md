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
**Enclosure** — something a letter carries for the reader to claim: an **item enclosure** (item template id + quantity) or a **gold enclosure** (an amount of gold, delivered as one gold pouch). Never "attachment" in code (an email word).
**Claim** — a member taking every enclosure of one letter at once, all-or-nothing, into their stash. The claim itself is the items grant; this service only records that it happened.
**Grant id** — the idempotency key of a claim, derived from letter id + member id, minted here and treated by items-service as a unique key (ADR-0009). The same claim always carries the same grant id.
**Letter request** — the broker event `mail.letter.requested`, carrying an event id, asking this service to create a system letter; deduplicated through the inbox (`processed_events`) like any other consumed event.
**Expiry** — the time after which a letter is hidden from its readers; 30 days after sending unless the sender set another. Unclaimed enclosures of an expired letter are **forfeited**: nothing is granted and nothing is kept for later.

**Boundary — "mail" is two words here.** Before the mailbox, "mail", `Mailer`, `config/mail.go` and the SMTP sender meant **outbound email** (ADR-0043), and they still do. The in-game concept is **Mailbox / Letter / Enclosure** in Go identifiers, tables and prose. The only places "mail" names the in-game mailbox are the wire names fixed by the charter: the HTTP paths `/api/mail/*` and `/api/admin/mail`, and the event `mail.letter.requested`. Never name an in-game type `Mail*`.
