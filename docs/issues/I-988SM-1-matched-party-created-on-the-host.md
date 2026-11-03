---
id: I-988SM-1
status: done
implements: FS-988SM
blocked_by: []
labels: [ready-for-agent]
title: "FS-988SM slice 1: the host pod creates a matched party from ALL matched players at run init (game-service)"
---
Implements FS-988SM §Requirements R1–R6, R3a, R8, R8a, R9, R10, R19, R22

**Lane: human (HITL) by default (game-server). `/develop` may run this slice under the approved
charter "單人排隊自動組隊" (Nick, 2026-11-03).**

> **Amended 2026-11-03 (charter override of #4).** A first pass of this slice is already in the
> worktree (uncommitted) and creates the party from **local** matched players only. This issue now
> asks for **every** matched player at initialisation. The delta is listed under *Delta from the
> first pass*; everything else that pass built stands.
>
> **Amended again 2026-11-03 (charter; Nick: "建立配對的時候發現他已經在隊伍的話是不是就取消這場遊戲跟所有人說配對失敗請
> 重新配對").** A matched player already in a party now **cancels the whole match**, and the party
> is created **before** the run. See *Delta from the second pass*.

## What to Build

- **Matched origin in the party record (R1, R2).** The Redis party hash gains an origin field
  (`matched` for this FS; absent = pre-formed, so every existing party reads as pre-formed). It is
  never put in `party_update` or any message.
- **A store script that creates a matched party with several members at once (R3, R4).**
  Members in the given order: leader first, then the other local players, then the players on
  other pods in `MatchStart` order. If **any** joiner already has a party it writes nothing and
  reports a cancel naming them (R8). It respects the party size (R10), with the leader always
  among the members. `Create` is not reused or changed.
- **The hub's match case creates the party first, then the run (R3, R3a–R5).** On a `MatchStart`,
  before `CreateGameSession`, the party registry (on its loop, like every party write) creates the
  matched party from **`ResolvedMatchedPlayers.LocalPlayers` plus
  `ResolvedMatchedPlayers.HandoffPlayers`** (the latter are `MatchStart.Players` whose `Pod` is not
  the host's). The leader is chosen at random among the **local** players only. It records
  `partyRuns[run.ID] = {partyID, roster}`, with the roster being every member, so the instance lock
  applies (FS-BJNYC R19). The run is created on the hub loop only when the script answers
  success; the hub loop never blocks on Redis.
- **A cancelled match (R8, R8a).** No run, no `world_entered`, no handoff announcement. Every
  local matched player gets the `find_game` refusal "The match failed. Queue again."
  (`messageHub.refuse`). Each remote one gets a new pod-inbox letter kind (inbox.go) that their
  own pod turns into the same refusal. Nobody is re-queued. Warn log naming the players found in
  a party.
- **Seating adds nothing (R6).** No join-on-seating path. A remote member in transit is already a
  member; on arrival the host's reconcile shows them the party (`sync`, FS-NCC9J R21a) if the
  creation update missed them on their old pod.
- **Notices (R19).** Every member receives `party_update` reason `joined` with the full party.
- **A Redis error is not a cancel (R9).** It is logged at Warn and the run is created and goes on
  without a party.

## Delta from the first pass

- `formMatched` (gameserver/party_matched.go) takes the handoff players too, not only
  `LocalPlayers`: the hub passes both groups of `ResolvedMatchedPlayers`.
- `cfg.pickLeader` draws among the local players only; the members list is the leader first,
  then the other locals, then the handoff players.
- `partyRuns[run.ID].roster` holds every member, the remote ones included.
- `joined` updates for remote members go through the existing delivery (pod letters / the
  presence index). A member in transit may miss theirs; the arrival reconcile covers it. Don't
  add a join-on-seating path.
- Tests: a match with one local and one remote player creates a party of both, with the local
  as leader; the remote is in `partyRuns`' roster; seating the remote sends no `joined`.

## Delta from the second pass

The code in the worktree (green) has, from the rework:

- `MatchedArgs.Leads` and a **skip-in-party fallback** in `create_matched.lua`: a joiner already in a
  party is left out, and the leader is the first of the first `Leads` joiners who can join.
- A **`NoLeader` placeholder** (`MatchedResult.NoLeader`): when no local can lead, no party, the run
  goes on. Tests `*_NoLocalCanLead_*` pin it.
- `formMatched` is called **after** `CreateGameSession` and `world_entered` in hub.go.

They become:

- `create_matched.lua` refuses the **whole creation** if any joiner's `player:<id>:party` pointer
  names a live party: no writes; the result reports a cancel and who was found in a party. The
  per-member skip and the `NoLeader` placeholder go. The leader is the drawn local, who can always
  lead now. Whether `Leads` survives is the implementer's call: it is only needed if a size bound
  could cut the drawn leader.
- hub.go: on a `MatchStart`, resolve the players, then hand the creation to the party registry
  **before** `CreateGameSession`. The result comes back to the hub loop (as other off-loop results
  do), and only then: success → `CreateGameSession`, `partyRuns`, `world_entered`,
  `announceHandoffs`; cancel → refusals and nothing else; Redis error → create the run without a
  party (R9).
- On cancel, locals get `refuse(conn, "find_game", "The match failed. Queue again.")`. Remotes:
  a new letter kind in inbox.go (e.g. `match_failed`), sent to each remote player's pod. Their pod
  sends the same refusal to that player's connection. A letter for a player the pod no longer
  holds is dropped, as every letter is.
- Tests: replace the `*_NoLocalCanLead_*` tests and the skip-in-party tests with: (a) a match where
  one player (local, or remote) is in a party writes nothing, creates no session, sends no
  `world_entered` or handoff, and refuses every matched player, remotes through the letter; (b) a
  Redis error creates the run without a party; (c) on success the session is created only after
  the script answered.
- Files: gameserver/party_matched.go, partystore/scripts/create_matched.lua, partystore/scripts.go
  (+ redis_test.go), gameserver/hub.go, gameserver/inbox.go (+ the letter handler), tests.

## Acceptance Criteria

- [ ] A match whose players are all local creates one matched party with every matched player, its leader one of them, and each receives `party_update` `joined`.
- [ ] A match with players on other pods creates one matched party at initialisation with every matched player, local and remote, before anyone is seated; the leader is always a local player.
- [ ] Seating a remote member adds nothing to the party and sends no `joined`.
- [ ] The origin is in the Redis record and nowhere in any message.
- [ ] A match in which any matched player (local or remote) already has a party is cancelled: nothing is written, no run is created, no `world_entered` or handoff, nobody leaves their own party, and the pod logs a Warn.
- [ ] On a cancel every matched player, the one in a party included, receives the `find_game` refusal "The match failed. Queue again.": locals directly, remotes from their own pod through the new inbox letter. None is queued afterwards.
- [ ] The run is created only after the creation script answers success.
- [ ] More matched players than the party size: the first up to the size are members, the leader always among them.
- [ ] A Redis failure on create is logged at Warn and the run is created and plays normally without a party.
- [ ] Inside the run, `party_leave`, `party_kick`, `party_transfer` and a loot-rule change from a matched member are refused as for a gate-entered party.
- [ ] Pre-formed parties (`party_create`, invites, gate entry) behave exactly as before; existing party tests stay green.
- [ ] No file under `internal/matchmaker` or `internal/match_queue` changes.
- [ ] Tests pass (`go test ./...` in game-service, including the partystore Redis tests).

## Blocked By

None

## Spec Reference

FS-988SM §Requirements R1–R6, R3a, R8, R8a, R9, R10, R19, R22; User Stories 1, 2, 9, 11, 12a, 15–18, 20; Acceptance Criteria (creation, cancel, cancel notices, ordering, Redis error, lock, pre-formed, matchmaker untouched); Edge States "the host has one local matched player", "a local matched player is gone before the run is created", "race with an invite", "no local player can lead" (gone), "a remote player's pod is unreachable when the cancel letter is sent".

## TDD Approach

- RED: gameserver test — a `MatchStart` with one local and one remote player yields one matched party of both, the local leading, and `partyRuns` lists both.
- GREEN: pass the handoff players through `formMatched` into the existing create-matched script (already ordered and size-bounded), leader drawn among locals.
- RED (second pass): a `MatchStart` where one player already has a party creates no session and refuses every matched player, the remote one through the inbox letter.
- GREEN (second pass): make the script all-or-nothing, move run creation behind the script's answer, add the letter kind and its handler.
