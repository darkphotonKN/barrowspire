# FS-CH21F: Overhead health bars over party members in a field

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Party" → "Overhead health bars over party members in a field" → this FS · Depends on: [FS-R82NV](R82NV-party-formation.md) (who is a party member; members share a field by ADR-0034) · Builds on: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) R26–R28 (teammate overhead health bar in a run, none in the hub, own bar removed), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (fields) · Related ADRs: [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (in an instance, occupants are the party, so R27 already covers them) · Vocabulary: no new terms

## Scoping notes (raw)

Scoped 2026-11-01 with Nick, as a follow-up to the party session.

- Nick's ask: "組隊後可以看到隊友的血量跟魔量在個自的頭上 就像看得到自己的一樣".
- What exists: in a **run**, every other occupant already shows an overhead **health** bar (FS-8AY7S
  R27), and by ADR-0035 those occupants are the party, so runs need nothing new. The player's own
  overhead bar is gone in a run (R26; bottom-left HUD instead). The **hub** shows no bars (R28).
  **Fields** draw no bars over other players today.
- `current_health` / `max_health` are already in the broadcast for every player in a run and a
  field, to every recipient. No server change for health.
- **Resource (mana / stamina / parry charges) stays own-only for now.** Nick: "那就先暫時送血量吧
  魔力先維持". The serializer builds per-recipient state (`CurrentPlayerState` carries `resource`),
  so a later "resource for party members only" is a per-recipient filter, not a public field.
  Parked below.
- **Decided:** draw the overhead health bar over **party members in a field**, same style and
  position as R27's run bar, same readability floor, not over a dead member's body. Non-members in
  the same field get no bar (health is public data, but the bar is a party affordance). Hub: still
  none.
- Client-only; server untouched. Needs the client to know the party membership (FS-R82NV's panel
  state) to pick whom to draw over.

### Open questions

- Whether a party member's bar should also carry their name (nameplate) — not asked; R27 draws no
  name.

### Parking lot

- Resource bar over party members (server: per-recipient `resource` for same-party players; client:
  a second bar keyed on the member's resource kind). Reverses FS-8AY7S's "teammates send health only"
  charter default when it comes.
