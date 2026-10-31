# CONTEXT — api-gateway

Ubiquitous language for the **api-gateway** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## Terms

<!-- **Term** — one-line definition -->

- **Chat report** (FS-4HEG7) — one player's complaint about one chat message, received over HTTP
  with the evidence inside the request: the message, the few messages around it, reporter,
  reported player, chat channel and time. The gateway has no chat history to consult and asks
  game-service for nothing (ADR-0033). Until a report store exists, a report *lands* as one
  structured log line; "filing" a report means that line was written.
