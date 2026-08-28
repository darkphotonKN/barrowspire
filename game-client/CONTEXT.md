# CONTEXT — game-client

Ubiquitous language for the **game-client** bounded context. One term per line: **Term** —
one-line definition. Keep consistent with the code and this member's
[`SPECIFICATION.md`](SPECIFICATION.md).

## The client is a translation boundary

game-client is where three vocabularies meet, and it is the only context that holds all three:

- **`Member`** — owned by auth-service. The account. Every `/api/member/*` route, `authStore`,
  and the JWT subject.
- **`player` / `game` / `session`** — owned by game-service's WebSocket protocol. `player_id`,
  `current_player`, `other_players`, `find_game`, `game_found`, `session_id`, `end_game`.
- **The lore vocabulary below** — owned here. It is what the **screen says**.

**The lore layer is presentational and stops at the pixel.** Identifiers, types, stores, REST
routes and WS actions keep their existing names; nothing in this glossary renames a field, an
endpoint, or a wire message. The mapping is written down here so the translation is one
documented hop rather than folklore that each new component re-invents.

This is a genuine bounded-context boundary, not a redundancy to clean up: auth-service has no
opinion about barrows, and game-service has no opinion about what a player is called. The
translation belongs to the surface that renders words.

## Terms

- **Delver** — the presentation name for a human who plays Barrowspire. Scope is deliberately
  wide: a delver is a delver in the hub, inside a run, and on the leaderboard, whether or not
  they have ever descended. Maps to `Member` (REST/auth) and `player` (WS). Replaces **operator**
  everywhere it appears — that word is sci-fi residue from the pre-fork game and is being removed
  by FS-0004/FS-0005, not kept as a synonym.
- **Delve** — both the act of entering a run (*"Delve"*, the primary CTA, replacing "Play") and
  the run itself (*"your last delve"*). The player-facing name for what
  [`SPECIFICATION.md`](SPECIFICATION.md) calls an **escape run** and the WS protocol calls a
  **game** / **session**. All three name one thing at different layers; none of them is wrong in
  its own layer.
- **The Spire** — the place delvers descend into. The antagonist-realm and the source of relics.
  Note the article: *the* Spire, never bare "Spire".
- **Barrowspire** — the product. The world entire, not a location within it. Never used as a
  synonym for the Spire.
- **Barrow** — the deep, buried, grave-earth register of the setting. Appears as a modifier
  (*barrow-deep*, *barrow earth*, the *barrow ramp* palette) rather than as a standalone noun for
  a place.
- **Lich Lord** — the ruling antagonist of the Spire. Named sparingly; dread over exposition.
- **Relic** / **plunder** — what a delver carries out. `items` on the wire, item cards in the
  marketplace.
- **Gold** — the in-game currency, in copy and in code alike (wallet-service and ledger-service
  both use it). One of the few words that needs no translation.

## Mapping table

| Screen says | REST / auth | WS protocol | SPECIFICATION.md |
|---|---|---|---|
| delver | `Member`, `member_id` | `player`, `player_id`, `current_player` | "player" |
| a delve | — | `game`, `session_id`, `find_game`, `end_game` | "escape run" |
| the Spire | — | the instance world | "escape run" (the instance) |
| relic, plunder | `/api/items/*` | `items[]` | "loadout", "items" |

## Voice rules that ride on the vocabulary

- **Grim and terse.** Dread over spectacle; rumor over exposition.
- **Money clarity overrides lore.** Real-money and subscription flows use unambiguous verbs —
  "Subscribe", "Pay", the actual price. Never hide a paid action behind flavor. Reserve
  "Acquire" / "Claim" for in-game-gold purchases. (Design guideline, Part II, Voice & tone.)
- **No lore in error messages that must be acted on.** A delver who cannot log in needs to know
  why, not that the gates are barred.

## Open

- The **HUB** world (refactor plan) has no lore name yet — "hub" is an engineering word. It needs
  one before the HUB client ships, and the answer is not obvious: the settlement above the Spire,
  the camp, the hall. Deliberately unresolved rather than guessed.
- **Escaping vs dying.** The end-of-run overlay distinguishes them (`current_player === null` ⇒
  escaped) but the vocabulary does not. The guideline offers *"Few return whole"* for death; the
  successful case has no term.
- `game-server/game-service/CONTEXT.md` is still empty. When it is populated, the protocol column
  of the mapping table above becomes a link rather than a restatement.
