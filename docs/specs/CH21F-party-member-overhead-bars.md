# FS-CH21F: Party members' health, resource and level in the party frames; names in the tower

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Party members' class resource in the broadcast"; `game-client/SPECIFICATION.md` "### Party" → "Teammates' health, resource and level in the party frames", "### Escape run" → "Other delvers' names over their heads" → this FS · Related ADRs: [ADR-0036](../adr/0036-party-state-lives-in-redis-membership-spans-pods.md) (each pod's party cache serves reads; ticks never wait on Redis), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (in an instance, occupants are the party) · Supersedes: [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) R27 (teammates' overhead health bar in a run: hidden), and R18 with its R111 charter default ("teammates send health only") **for party members only**; the hover-only name over other delvers in a run (code behaviour cited to [FS-77AB6](77AB6-monsters-and-combat.md) req 40, `BarrowspireScene.ts`; R40's ally channel itself stands) · Fulfils: [FS-R82NV](R82NV-party-formation.md) R34's "teammates' bars in the hub are FS-CH21F's" and "`resource` arrives with FS-CH21F" · Builds on: [FS-NCC9J](NCC9J-party-membership-across-pods.md) R4 (party cache), R25 (bars only for teammates in the player's world; name and bust otherwise), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) R17, R21–R22 (resource shape, kind labels, parry pips), [FS-MAMHR](MAMHR-mercenary-class.md) R28 (parry fields), [FS-BDA7X](BDA7X-character-leveling.md) R42 (level on every player) · Vocabulary: no new terms

## Summary

A party member sees, in the party frames on the left edge, each teammate who stands in the same
world (the same village, field or delve on the same pod): their health bar, their class resource
bar coloured by kind, and their level after the name. That holds in the village too. Teammates
elsewhere show name and portrait only. In the tower, every other delver's name now hangs over
their head all the time instead of only on hover, and the overhead health bars over other delvers
are turned off for now. To feed the resource bar, the server adds `resource` to the broadcast for
the recipient's party members, and only for them.

**Lane:** the server side (R1–R7) is **human lane**, authorised for the agent by the charter of
2026-11-02 (Nick); the client side (R8–R16) is agent lane.

## Requirements

### The wire (game-service)

1. **Party members' resource in each recipient's state.** When the state for recipient R is
   built, every other player in `other_players` who is in R's party carries `resource` (`kind`,
   `current`, `max`, `ability_cost`, the shape R's own `current_player` carries, FS-8AY7S R17)
   and, for a mercenary, the parry fields (`parry_open`, `parry_lockout`, `parries`, FS-MAMHR
   R28), exactly as their own client is told them. This holds in **every world**: hub, field and
   run. *Charter default 1 and 3 (Nick approved 2026-11-02) — reason: the frames need a
   teammate's resource; the HUD's shape is reused so the client reads one shape.*
2. **Non-members are unchanged.** A player not in R's party appears in R's state exactly as
   today: health and level present, no `resource`, no parry fields. `current_health`,
   `max_health` and `level` stay public, to every recipient, in every world (they already are:
   no `omitempty`, and the hub runs the same serializer). *Charter default 7 (Nick approved
   2026-11-02), replacing the draft's "non-members get neither health nor resource" — reason:
   Nick only needs teammates' health and mana, and the client reads other players' health for
   death, spectate, fallen and hit flash (`ui/party.ts` `resolved()`, `BarrowspireScene` dead
   check, `FieldScene` `isFallen`, `fieldCombat`); withholding strangers' health would break them
   until FS-BJNYC makes every run a party. Parked (Out of Scope).*
3. **"In R's party"** means R and the other player have the same party id in the pod's party
   membership snapshot (R5). A player in no party has no party members; nobody gets their
   resource and they get no one's. Remote members (on another pod) are never in this world's
   state, so they never arise. *Charter default 1 (Nick approved 2026-11-02) — reason: cross-pod
   vitals would need a per-tick vitals fan-out.*
4. **The shared player state is never written.** The per-recipient addition wraps the shared
   `PlayerState` for that one recipient's frame (as `CurrentPlayerState` already does); one
   recipient's resource never leaks into another recipient's state, and a non-member's JSON is
   byte-for-byte today's.

### Membership snapshot (game-service)

5. **A read-only player → party snapshot.** The party registry, after **every change to its
   cache** (a put, a drop, a re-read, an arrival read, a letter), publishes an immutable snapshot
   of the cache's player → party map (every member of every cached party, remote members
   included). Publishing is copy-on-write: a new map replaces the old behind an atomic pointer;
   no published map is ever mutated, so any goroutine may read it without a lock. *Charter
   default 8 (Nick approved 2026-11-02) — reason: the party cache is the hub loop's alone
   (ADR-0036, FS-NCC9J R4) while each world's serializer runs on that world's own goroutine.*
6. **Handed to every serializer.** One snapshot holder is built at wiring and given to the hub's,
   every run's and every field's serializer (`gameserver/server.go`, `fields.go`) through a
   narrow interface the serializer defines (consumer owns it). A broadcast reads the snapshot
   **once** and uses that one map for all its recipients, so one tick never mixes two versions.
   No serializer reads Redis or the cache itself.
7. **Staleness is display only.** A join or leave reaches the broadcast on the first tick after
   the cache changes; a stale snapshot can only show or hide a resource for a tick or so, never
   change an outcome (FS-NCC9J R4). Bounds: no new action, no change to party Redis structure, no
   new API.

### Party frames (game-client)

8. **Same-world teammates show bars, in every world including the hub.** A teammate's row shows
   a health bar and a resource bar (FS-R82NV R34's half-scale HUD style) when this world's state
   lists them in `other_players` with their health. The refusal of bars in the hub
   (`partyFramesLayout.ts` `slotOf`, `world !== "hub"`) is lifted. *Charter default 1 (Nick
   approved 2026-11-02) — reason: Nick, "組隊後在村莊側邊組隊ui要可以看得到隊友血量跟魔量".*
9. **The resource bar is coloured and labelled by kind** as the player's own HUD bar is: mana,
   stamina, or parry charges as pips (FS-8AY7S R21–R22), via the existing `ui/resources.ts`
   helper. Before the server sends it (or when absent) the resource bar stands empty, as today.
   *Charter default 3 (Nick approved 2026-11-02) — reason: decided earlier in the draft.*
10. **Level after the name.** A same-world teammate's row shows "Lv N" after the name, from the
    `level` the broadcast already carries. The player's own row and teammates elsewhere show no
    level (the level/XP bar above already shows the player's own). A long name is shortened
    short of the level and of the Travel button (FS-NCC9J R28). *Charter default 2 (Nick
    approved 2026-11-02) — reason: Nick, "等級資訊只顯示在組側邊ui"; the state already carries
    level.*
11. **Teammates elsewhere: name and class bust only**, no numbers, no level, no state word
    (FS-NCC9J R25 unchanged): another world, another pod, or not listed in this world's state.
    Away teammates stay greyed. *Charter default 1 (Nick approved 2026-11-02).*
12. **Decided from this world's state alone**, never from the party's `where` or `pod_id` (a field
    of the same name on another pod is not this world), as `slotOf` decides today.

### Run scene (game-client)

13. **Every other delver's name always shows over their head** in the tower, in the ally channel
    (FS-77AB6 R40), without hover. It is placed at the marker base, where it sat under the bar.
    Not over a baked corpse (no marker base, as today). The player's own name is unchanged.
    Supersedes the hover-only name (`nameText.setVisible(false)` at creation, `markTeammate`'s
    `hoveredPlayerId === playerId` test). *Charter default 4 (Nick approved 2026-11-02) — reason:
    Nick, "進入塔時 也要顯示名字".*
14. **No overhead health or resource bars over other players in a run.** The existing teammate
    health bars (FS-8AY7S R27: `teammateHealthBars` / `drawTeammateBar`) are hidden for now, and
    the draft's two new overhead bars are not built. Monsters' bars are unchanged. Hiding is a
    switch, not a rewrite: name placement must not depend on a bar being drawn. Supersedes
    FS-8AY7S R27. *Charter default 6 (Nick approved 2026-11-02) — reason: Nick, "暫時不顯示血量",
    "可以不用在頭頂顯示血量".*
15. **Village and field overhead names are unchanged** (already always shown); no bars are added
    over players there (FS-8AY7S R28 stands for the hub). *Charter default 5 (Nick approved
    2026-11-02) — reason: already meets the ask.*
16. **Level is never drawn over anyone's head**, in any world. *Charter default 2 (Nick approved
    2026-11-02).*

## User Stories

1. As a party member in the village, I want to see my teammates' health in the party frames, so that I know who is hurt before we set out.
2. As a party member in the village, I want to see my teammates' mana or stamina, so that I know who is ready for the next fight.
3. As a party member in a field, I want my teammates' health and resource in the frames, so that I can tell who needs help without looking for them.
4. As a party member in a delve, I want my teammates' health and resource in the frames, so that I can follow the fight from one place on screen.
5. As a mercenary's teammate, I want their parry charges shown as pips like my own HUD's, so that I read every resource the same way.
6. As a party member, I want each teammate's resource bar coloured by its kind, so that I tell mana from stamina at a glance.
7. As a party member, I want each nearby teammate's level after their name, so that I know how strong my group is.
8. As a party member, I want level shown only in the frames, never over heads, so that the screen stays clean.
9. As a party member, I want teammates on another server or in another world to show only name and portrait, so that the frames never show numbers that are not live.
10. As a delver, I want every other delver's name always over their head, so that I know who is who without hovering.
11. As a delver, I want no health bars over the other delvers, so that the tower stays uncluttered while teammates' health is in the frames.
12. As a delver, I want monsters' bars unchanged, so that combat reads as before.
13. As a player in the village or a field, I want names over players to stay as they are, so that nothing I rely on moves.
14. As a player not in a party, I want strangers' health to behave as today, so that deaths, spectating and the fallen state keep working.
15. As a player, I want my class resource sent only to my party, so that strangers never see my mana.
16. As a player who joins a party, I want my new teammates' resources to appear at once, so that joining feels immediate.
17. As a player who leaves a party, I want my former teammates' resources to stop reaching me, so that membership means something.
18. As an operator, I want the broadcast to never read Redis or the hub loop's cache, so that a world tick never waits on party state.
19. As a developer, I want membership read from an immutable snapshot, so that world goroutines and the hub loop never race.
20. As a developer, I want a non-member's JSON unchanged, so that every existing client path keeps working.
21. As a developer, I want the shared player state wrapped, never written, per recipient, so that one recipient's extra fields cannot leak to another.
22. As a developer, I want the frames' hub refusal gone, so that one rule decides bars in every world.

## Acceptance Criteria

- [ ] Serializer (table test): for recipient R in party P, another player in P carries `resource` (and parry fields for a mercenary) in R's `other_players`; a player not in P carries health and level but no `resource` and no parry keys; with no snapshot entry for R, nobody carries `resource`.
- [ ] The same table holds for a hub, a field and a run world.
- [ ] A non-member's `other_players` entry marshals to exactly today's JSON (golden or field-by-field test).
- [ ] Two recipients built from one backend state never see each other's additions (the shared `PlayerState` is unchanged after building both).
- [ ] The party registry publishes a new snapshot after every cache change (put, drop, re-read, arrival); a published map is never mutated; a concurrent reader under `go test -race` sees whole snapshots only.
- [ ] The hub's, every run's and every field's serializer receive the snapshot holder at wiring; no serializer touches Redis or the cache.
- [ ] Client frames: a same-world teammate in the **hub** shows health and resource bars and "Lv N"; the same in a field and a run.
- [ ] Client frames: a teammate not in this world's `other_players` shows name and bust only, no level, no bars.
- [ ] Client frames: the resource bar uses the HUD's kind colours, and parry charges show as pips; with no `resource` on the wire it stands empty.
- [ ] Client frames: the player's own row shows no level; a long name is shortened short of the level and the Travel button.
- [ ] Client run: every other living delver's name is visible over their head without hover; none over a baked corpse; the player's own name unchanged.
- [ ] Client run: no overhead health bar is drawn over any other delver; monsters' bars unchanged.
- [ ] Client hub and field: overhead names unchanged; no level drawn over anyone in any world.
- [ ] `go test ./... -race` on the touched packages and `vitest` green; lint fence passes.

## Edge States

- **No party:** the recipient gets no one's `resource`; frames are not shown; tower names still show over every other delver.
- **Run occupants not in one party** (matched players, before FS-BJNYC): they get each other's health as today and no resource; with R27's bars hidden nothing is lost.
- **Join or leave mid-tick:** the next published snapshot decides; the broadcast that read the old one shows or omits a resource for that tick only.
- **Teammate on another pod or in another world:** absent from this world's state, so no data and name + bust in the frames.
- **Teammate dead in a run:** the frames show the health bar at zero; their name hides over the baked corpse (no marker base). **Left behind on a floor the party left / escaped:** absent from `other_players`, so name + bust.
- **Teammate fallen in a field:** health at zero in the frames until they rise.
- **Recipient resolved (spectating):** keeps receiving state; frames keep showing same-world teammates.
- **Snapshot not yet published at boot:** treated as empty (no one is a party member) until the first cache change.
- **Redis unreachable:** the cache and its snapshot keep serving (FS-NCC9J R8); resources keep flowing to cached members.
- **Away teammate still in this world:** the frame is greyed (FS-NCC9J R25) and still shows the numbers the state carries.
- **Unauthorized:** nothing here is client-driven; membership comes only from the server's cache.

## Out of Scope

- FS-77AB6 itself (monster bars and nameplates).
- FS-BDA7X's "level on other players' nameplates" (level is shown only in the frames, R10, R16).
- FS-JEAVX cross-pod hub and ghosts.
- Vitals for teammates on another pod or in another world (would need a per-tick vitals fan-out).
- Overhead health or resource bars over any player in any world; bringing back R27's run bars is a later decision.

### Parking lot

- **Withholding health from non-members (stranger privacy).** The draft's "非隊友應該要看不到血跟魔"
  for health: parked until FS-BJNYC makes every run a party, because death, spectate, fallen and
  hit-flash logic read other players' `current_health` today. `resource` is already withheld
  from non-members (R2).
- A nameplate on teammates' overhead bars (the draft's open question): moot while no overhead bars
  are drawn over players.
