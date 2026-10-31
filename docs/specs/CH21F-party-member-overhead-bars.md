# FS-CH21F: Overhead health and resource bars over party members

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Party" → "Overhead health and resource bars over party members"; `game-server/game-service/SPECIFICATION.md` "### Party" → "Health and resource in the broadcast for party members only" → this FS · Depends on: [FS-R82NV](R82NV-party-formation.md) (who is a party member; the party pod holds membership in memory, ADR-0034) · Builds on: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) R17–R18 (resource on `current_player` only — **reversed here for party members**), R26–R28 (teammate overhead health bar in a run, none in the hub, own bar removed), [FS-MAMHR](MAMHR-mercenary-class.md) (parry charges as a resource), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (fields) · Related ADRs: [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (in an instance, occupants are the party) · Vocabulary: no new terms

## Scoping notes (raw)

Scoped 2026-11-01 with Nick, as a follow-up to the party session.

- Nick's ask: "組隊後可以看到隊友的血量跟魔量在個自的頭上 就像看得到自己的一樣". First reduced to
  health only ("先暫時送血量吧 魔力先維持"), then, once the per-recipient cost was explained,
  widened back: "好那隊友看得到魔".

### What exists

- In a **run**, every other occupant already shows an overhead **health** bar (FS-8AY7S R27); by
  ADR-0035 those occupants are the party. The own overhead bar is gone in a run (R26). The **hub**
  shows no bars (R28). **Fields** draw no bars over other players today.
- `current_health` / `max_health` are in the broadcast for every player, to every recipient, in
  runs and fields today. This FS withdraws them from non-members.
- `resource` is sent on `current_player` only: the serializer builds state per recipient and only
  `CurrentPlayerState` carries it; other players are bare `PlayerState`s (`types/messages.go`,
  `serializer/state_serializer.go:489`). FS-8AY7S R111's charter default "teammates send health
  only" is what this FS reverses, for party members only.

### Decided

- **Server: health and resource for same-party players only.** When building the state for
  recipient R, each other player who is in R's party gets `current_health` / `max_health` and
  `resource` (kind, current, max; a mercenary's parry fields likewise). Players not in R's party
  get **neither**: Nick, 2026-11-01, "非隊友應該要看不到血跟魔". This makes health per-recipient
  too (today it is public to every recipient, in runs and fields); in a run nothing changes
  because every occupant is a member (ADR-0035). Needs `PlayerState` (or a thin wrapper) to carry
  optional health and `resource` (`omitempty`), and a party-membership lookup on the pod — in
  memory (ADR-0034), a map read per recipient. The client already treats a missing
  `current_health` as "draw nothing" (`ui/resources.ts`, `ui/party.ts`).
- **Client: two overhead bars over each party member** — health, and under it the member's
  resource, coloured by its kind (mana / stamina / parry charges, the HUD's existing resource
  colours). Same position, style and readability floor as R27's bar; not over a dead member's
  body.
- **Where:** runs and fields. Hub: none (R28 stands; safe zone, ghosts carry no health).
- Non-members in the same field: no bars, and no data behind them.
- The client knows membership from FS-R82NV's party state; a player with no party draws nothing
  over anyone in a field, and in a run everyone is a member.

### Open questions

- Whether a member's bar should carry their name (nameplate). R27 draws no name; not asked.

### Parking lot

- None.
