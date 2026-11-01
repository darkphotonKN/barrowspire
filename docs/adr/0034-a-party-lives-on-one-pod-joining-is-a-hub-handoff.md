# ADR-0034 — A party lives on one pod; joining it is a handoff into that pod's hub

Status: superseded by [ADR-0036](0036-party-state-lives-in-redis-membership-spans-pods.md)
Date: 2026-11-01
Scope: `game-server/game-service`, `game-client`
Realized by: [FS-R82NV](../specs/R82NV-party-formation.md) (party formation, hub handoff, presence
index, pod inbox), [FS-BJNYC](../specs/BJNYC-party-instance-entry.md) (party entry as a local
world switch), [FS-XGW7H](../specs/XGW7H-party-chat.md) (party chat delivered in-process)
Builds on: [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one
connection, per-pod ceiling), [FS-K2HKP](../specs/K2HKP-cross-replica-matchmaking-and-handoff.md)
(the handoff mechanic, reused with a new destination)
Amends: [ADR-0030](0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md)
— the "friends on different pods see different fields" consequence and its parked fix. Fields stay
per-replica channels entered by a local world switch; that part stands.

## Context

Decided by the user on 2026-11-01 while scoping parties (FS-R82NV). The first shape on the
table kept members on whatever pod they had connected to: a party would only matter at the Spire
gate (the roster) and in chat (the party channel), and entering an instance would hand every
member off to the host pod as a random match does today. The user pushed back on two counts:

- "要進副本還是必須移動到同一個pod 但是加入隊伍後可以移動到隊長的pod" — joining should already
  put you next to your teammates, not entry.
- "全員都要在同一個地方 例如村莊" — entry should require everyone present in the leader's world,
  which is only meaningful if they can be in the same world at all.

Hub worlds are shared across replicas (FS-JEAVX) only as render-only ghosts; fields are strictly
per pod (ADR-0030). So two party members on different pods cannot walk the same field, trade
blows at the same monster, or stand in the same village in any way that matters. ADR-0030
accepted this and parked the fix "join a friend's channel" until party formation existed. Party
formation now exists, and this is that fix.

Forces: the handoff mechanic (new socket to a pod address, old one dropped, the receiving pod
expecting the member id) already works for runs and carries a JWT the client holds, so pointing
it at a hub world is a small variant, not a new system. Keeping everyone on one pod also removes
the need for a cross-pod party state, party chat over Redis, and a handoff at entry. The cost is
that a party pins its members to one pod regardless of the load balancer's wishes.

Recorded without adversarial review (the scoping gate judged it cheap to reverse: Redis-only
state, no database, no public API).

## Decision

**A party has one pod, the party pod, and every member is connected to it.** The party pod is the
leader's pod at creation, or the host pod for a party formed from a random match. It never moves
while the party lives.

**Accepting an invite is a hub handoff.** The invitee's client reconnects to the party pod's
address, exactly as a matched player reconnects to a host pod, and arrives in that pod's hub
world. A member who reconnects elsewhere is handed off back. Fields are still never a handoff
destination: a member walks into the field from the party pod's hub, by the local world switch
ADR-0030 prescribes, and because every member starts from the same hub, they land in the same
channel.

**Party entry is a local world switch.** When the leader starts an instance, every member is
already on the party pod and in the leader's world, so the run is built from the party the way
`start_solo` builds one for a single player and the members are switched in. No handoff, no
matchmaker.

**Cross-pod traffic is reduced to lookups and letters.** Other pods need only: a presence index
(name → player id, pod id) to find an invitee, a per-pod inbox channel to deliver the invite, and
two Redis pointers (`party:<id>` → party pod, `player:<id>:party` → party id) so a reconnecting
member and an inviting pod can find the party. The party's state lives in the party pod's memory.
Party chat is delivered in-process like area chat and never rides the chat bus.

## Consequences

- **Teammates share a hub and share fields.** ADR-0030's "friends on different pods see different
  fields" is no longer accepted for party members; it remains true for two strangers who happen
  to meet as hub ghosts. The two ADR-0030 clauses that said the fix was parked are amended by
  this ADR; nothing else in it changes.
- **Pod occupancy caps bind parties.** FS-JEAVX's per-pod hub cap can refuse a pull. An invite to
  a full party pod fails with a notice rather than placing the member elsewhere. Parties cannot
  be rebalanced across pods by the load balancer; a popular leader's pod carries their friends.
- **The handoff gains a hub destination.** K2HKP's arrival path seats an expected player in a
  run; the hub variant must expect an arrival into the hub world so the receiving pod does not
  treat it as a fresh login on the wrong pod. Same mechanic, one more destination kind.
- **A party pod crash drops the party.** State is in that pod's memory; the Redis pointers expire
  by TTL. Members reconnect wherever the balancer sends them, without a party. Accepted: parties
  are ephemeral (ADR-0035), like chat (ADR-0033).
- **Simpler everywhere else.** No cross-pod party state to keep consistent, no Lua beyond the two
  pointers, no party channel on the chat bus, no handoff at entry, and a party of one is exactly
  `start_solo`.
- **Reversible.** A zone-server model (every player on the pod that owns a zone) would supersede
  this and ADR-0030 together; nothing here depends on which pod owns which hub.
