# ADR-0092 — A chat item link carries the sender's own snapshot, checked for shape only

Status: accepted
Date: 2026-11-26
Scope: `game-server/game-service` (the chat relay), `game-client` (the chat window and the gear
overlay)
Realized by: [FS-KBA4Q](../specs/KBA4Q-item-links-in-chat.md) R24–R31 (the wire, the validation,
the refusal)
Builds on: [ADR-0033](0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (chat is never
stored), [ADR-0032](0032-area-chat-is-scoped-to-the-pod-not-the-session.md) (area chat is scoped to
the pod), [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one
connection)

## Context

FS-KBA4Q lets a player link an item into a chat line: `[Name]` in the text, drawn as a tag in the
item's rarity colour, and hovering the tag shows the item tip to everyone who sees the line. The
line goes everywhere a chat line goes: area chat on one pod, world chat across every pod over the
Redis bus, party and whisper lines in pod letters. Lines are never stored (ADR-0033).

So the other players need the item's details, and there were two ways to get them:

- **A. The server looks the item up.** The client sends an item id; the pod asks items-service for
  the item, checks the sender owns it, and stamps the real data on the line. This needs a gRPC call
  on the chat path (which today touches no other service and no world, FS-WJGFJ R11), an
  ownership rule for items in a run that items-service does not hold yet, and a failure mode for
  when items-service is slow or down.
- **B. The sender's client sends the details.** The client takes a snapshot of the item as its own
  overlay holds it (what the server last sent it) and sends it with the line. The pod checks the
  snapshot's shape and relays it.

The owner chose B on 2026-11-25. In their words: "我只是hover時顯示物品資訊要怎麼騙錢" (a tip
shown on hover cannot be used to cheat anyone out of money). Trading only happens on the Bazaar,
which reads the server's own records, so a false tip in chat cannot settle a trade.

Recorded without adversarial review: the choice was made in the charter conversation, not in a
`challenge-me` pass.

## Decision

A chat item link carries a snapshot the sender's client built. The pod checks its shape and never
looks the item up.

- The client builds the snapshot at the link press, from the item as the gear overlay holds it:
  bag, worn slot or stash, in town or in a run. It carries what the item tip shows (name, kind,
  rarity, base stats, item level, required level, affixes, unique effect, description) and no
  ids, owner or listing state.
- The pod validates shape only, before the flood window. At most 3 snapshots. A closed set of keys
  with stated types, ranges and lengths; an unknown key refuses the line. No control or invisible
  characters. Each snapshot pairs with a `[name]` token in the text, in order. The rebuilt JSON is
  at most 4096 bytes. Any failure refuses the whole line with one notice, `bad_item_link`.
- The pod rebuilds each snapshot key by key from what it validated; nothing else from the
  inbound object reaches the stamped line. A receiving pod trusts the sending pod and checks
  nothing again.
- The pod checks no ownership and calls no other service. Nothing is stored, and no log line
  carries a snapshot.

## Consequences

- **A modified client can show an item that does not exist.** Anyone who sends their own payload
  can link a made-up item with any stats and rarity, and others see it in the tip. This is
  accepted: it can mislead a player who believes a chat boast, but it moves no item and no gold.
- **A link shows the item as it was when it was sent.** If the item is later enchanted, sold or
  dropped, old lines still show the snapshot.
- **The chat path stays as it was:** no new service call, no new failure mode, no extra latency.
  The cost is a fixed shape check, and the size cap keeps a modified client from pushing large
  payloads through Redis to every pod.
- **Revisit this decision, and move to option A, if a chat link ever does more than show a
  tip:** offering an item for trade, buying from a link, a link in a system announcement or
  anything else a player could act on, or if forged links turn into an abuse problem players
  report. Option A then needs ownership rules for run items and a way to degrade when
  items-service is unavailable.
