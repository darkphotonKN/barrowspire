# ADR-0064 — Another player's state never carries their bag or worn gear; anything that needs them fetches them on demand

Status: accepted
Date: 2026-11-06
Scope: `game-service`'s per-tick state in every world (run, field, hub): the `other_players`
entries of `ClientGameState`; and `game-client`'s type for them. The recipient's own
`current_player` is not affected.
Specified by [FS-KE075](../specs/KE075-floor-1-dungeon.md) §I.
Amends: none. [ADR-0060](0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md)
Decision 4 ("party members are always sent") stands: they are still sent, without their bag and
worn gear. Related: [ADR-0063](0063-fog-of-war-is-client-presentation-shared-by-the-party.md)
Decision 5 (hiding information from a modified client is a server-side decision); this ADR is one
such decision, for bags and worn gear only.

## Context

Nick decided this on 2026-11-06, during the FS-KE075 work: "那就不用看到隊友的背包了" (then there
is no need to see a teammate's bag), and on a later loot feature, "就算之後要改應該也是撿的當下再撈就好了"
(even if that changes later, fetch it at the moment of picking up). Recorded without adversarial
review: no `challenge-me` pass.

Forces:

- **Every snapshot sent every other player's whole bag and worn gear.** `other_players` embedded
  the shared `PlayerState`, `inventory` and `equipment` included, for every recipient, 30 times a
  second, in the run, the field and the hub. In a hub at its occupancy cap (40) that was about
  156 KB per recipient per tick, nearly all of it other players' items.
- **It blocks FS-KE075's 16 KB per-tick target on floor 1.** A party of four's bags and worn gear
  were about 12 KB of each recipient's frame on the bench, more than the interest cut saves.
- **It leaks.** Anyone can read a matched stranger's bag from the WebSocket in devtools: what they
  carry out, what they found, what is worth killing them for.
- **The client never reads it.** Bag and worn gear are read only from `current_player`
  (the gear overlay, the potion count, the equipment HUD). Hub, field and run scenes, the party
  frames and field combat read only id, name, class, position, direction, health, level and, for
  party members, the class resource.

## Decision

1. **An `other_players` entry carries no `inventory` and no `equipment` key, in every world.** It
   keeps everything else a player shows: id, entity id, username, class, position, direction,
   escape, health, progression, and the party-only class resource and parry fields (FS-CH21F).
2. **The recipient's own `current_player` is unchanged.** It still carries their own bag and worn
   gear.
3. **Never stream another player's bag or worn gear.** A later feature that needs one (looting a
   dead teammate's finds, inspecting a player) fetches it **on demand, at that moment**, for that
   one player, through its own request. It never puts bags or worn gear back in the per-tick
   state.
4. **The trimmed entry is built without writing the shared state and without new aliasing of the
   pool.** The broadcast's shared player state is read, never written, per recipient (FS-CH21F R4);
   the pool's lists stay fresh per tick (FS-QG1HR D2 race B, FS-KE075 §G R38).
5. **The client's type for an `other_players` entry has no bag or worn gear fields**, so a new read
   of them fails the typecheck.

## Consequences

- Per-tick bytes drop in every world, most in the hub, where each recipient's frame grew with the
  number of players there and the hub's total with its square. FS-KE075 §I records the measured before and after.
- A stranger's bag is no longer on the wire. This is a privacy rule for bags and worn gear, not
  general anti-cheat: positions, health and the rest are still sent as before.
- A future "show what a player wears" (a worn-weapon sprite on another player, an inspect window)
  cannot read it from the snapshot. A worn look on other players would need its own, narrow field
  (the look, not the items) and its own decision; an inspect window fetches on demand (Decision 3).
- Looting a dead teammate's body, if added, needs an on-demand fetch and a server check at the
  moment of looting, never a snapshot read.
- Old clients that read `other_players[].inventory` would see it missing; none does, and client
  and server ship together.
