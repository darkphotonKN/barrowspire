# FS-XGW7H: Party chat

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" → "Party chat within the party's pod"; `game-client/SPECIFICATION.md` "### Chat" → "Send to the party channel from the chat window" → this FS · Depends on: [FS-R82NV](R82NV-party-formation.md) (party, party pod) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (the chat window, the reserved `party` channel type, `%` prefix, arcane colour), [FS-5SH4G](5SH4G-world-chat.md) (relay rules: 200 code points, shared 2 s flood window) · Related ADRs: [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) · Vocabulary: no new terms

## Scoping notes (raw)

Scoped 2026-11-01 with Nick, as part of the party session.

- Channel type `party` already exists in the chat skeleton (FS-WJGFJ): prefix `%`, arcane green,
  scope key = party id. This FS opens it.
- **Scope = the party id.** Delivery = broadcast to the party's members. Because every member is on
  the party pod (FS-R82NV), this is a **pod-local broadcast like area chat**, not a Redis channel.
  The earlier plan (`chat:party:<id>` over Redis, same path as world) was dropped when members
  moved to one pod. If a member is mid-handoff into the party pod they miss lines sent meanwhile;
  accepted (at-most-once, ADR-0033 stance).
- Channel is **closed** (`channel_closed` notice, greyed in the picker) when the sender has no
  party. Opens on join, closes on leave / kick.
- Same relay rules as the other channels: normalise, 200 code points, shared 2 s flood window.
- **System lines in the party channel.** Loot allocation notices (FS-V780R) and party events (X
  joined, X left, X is now leader, ready check results) are lines with `channel = party` but no
  sender: rendered in the system colour (vellumDark), filtered with the party channel. Nick asked
  whether loot allocation belongs in the party channel; agreed yes, as system lines so they are
  never mistaken for a member speaking. Needs one field on the line (or an empty sender) to mark
  it; the client already has a system colour.
- Inside an instance the party channel is the instance chat (members == occupants).
- Nothing stored (ADR-0033); no text logged.

### Open questions

- Whether party events should also echo as `chat_notice` toasts, or only as party-channel lines.
- Whether a system line's `scope` is the party id or omitted.
