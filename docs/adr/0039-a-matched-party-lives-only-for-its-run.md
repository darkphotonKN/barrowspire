# ADR-0039 — A matched party lives only for its run: members leave it as they leave the run

Status: accepted
Date: 2026-11-03
Scope: `game-server/game-service`
Amends: [ADR-0035](0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) —
for parties formed by a random match only: the "persists across instances" clause (with its
"strangers become a group" consequence) and the "they stay a member" clause of the instance lock
Realized by: [FS-988SM](../specs/988SM-matched-party.md)
Builds on: [ADR-0037](0037-party-state-lives-in-redis-membership-spans-pods.md) (where party state
lives, unchanged), [FS-K2HKP](../specs/K2HKP-cross-replica-matchmaking-and-handoff.md) (the random
match and its seats), [FS-QPDKN](../specs/QPDKN-resolved-delver-spectate-and-leave.md) (a resolved
delver may watch, then leave the run)

## Context

ADR-0035 decided that every instance's occupants are a party, that a random match's host pod
forms one from the matched roster, and that a party persists after its run ("退出塔副本後隊伍會繼續
存在"), so matched strangers come home a group. It also decided that a member who dies, escapes,
leaves early or times out of their reconnect grace stays a member until the run ends.

FS-BJNYC built party entry and the instance lock, but parked the random-match party. When the
user came to scope that party on 2026-11-03, they decided its lifetime differently: "做單人排隊進塔
會自動組隊 結束後自動解散" (a solo queue into the Spire forms a party automatically, and it
disbands automatically after). Asked whether "after" meant the end of the run, they narrowed it:
"先死掉離開的會先退隊" (whoever dies and leaves first leaves the party first). On spectators:
"死掉還留在裡面觀戰的不會分到物品" (a dead member still watching inside gets no items).
Asked when the party forms, they set it at the run's initialisation, with everyone in it:
"其他人晚進或是關掉分頁對遊戲來說他都算進塔 他關掉只能當作斷線 就算是host也一樣" (late arrivals and
those who close the tab count as having entered; closing is a disconnect, host or not), and
"超過時間還沒連回來被釋放當然就當死掉了" (one released for not reconnecting in time counts as dead).
Asked what to do when a matched player turns out to be in a party already (a race the queue
refusals should prevent), they chose to call the match off: "建立配對的時候發現他已經在隊伍的話是不是就
取消這場遊戲跟所有人說配對失敗請重新配對" (if creating the match finds someone already in a party,
cancel the game and tell everyone the match failed and to queue again).

A pre-formed party is a group whose members chose each other, and keeping it after a run is
still what the user wants. A matched party is a group the matchmaker chose. Keeping strangers
grouped after the run makes each of them leave by hand, and a party they never chose would sit
in their frames and block their next queue (FS-BJNYC R1 refuses `find_game` from party members).

Recorded without adversarial review. Cheap to reverse: no database, no public API, no new
message.

## Decision

**A party formed from a random match lives only for its run.** It carries a *matched* origin.
The host pod creates it at the run's initialisation with **every matched player as a member**,
local and on other pods alike, before anyone enters the tower; the leader is a random local
player. A late arrival is entering, not joining. A member who never connects, or closes the tab,
is a disconnected member like any other, host players included. A member leaves the party at the
moment they **leave the run**: after dying and leaving, after escaping and leaving, by leaving
early, when their reconnect grace runs out, or, if they never arrived, when their seat is
released. A disconnected member who can no longer come back counts as dead. The party ends when
its last member leaves, and it never persists after the run.

**A matched player already in a party cancels the match.** The party is created before the run,
in one atomic step that checks every matched player. If any of them, local or remote, already has
a party, nothing is written and no run is created: nobody enters, nobody is handed over, and every
matched player, the one in a party included, is told "The match failed. Queue again." through
the refusal `find_game` already uses. Remote players are told by their own pod over the pod inbox.
Nobody is re-queued automatically. A Redis failure is not a cancel: when whether anyone is in a
party cannot be known, the run goes on without a party.

**Leaving the run is the boundary, not death.** A dead or escaped member who stays to watch is
still a member and still hears party chat. They receive nothing: no item and no XP, because both
already go only to members alive and un-escaped (FS-V780R, FS-BDA7X).

**The leader leaving the run passes the lead** to the earliest-joined remaining member at once.
This is ADR-0035's succession, with "leaves the run" added to its triggers for matched parties.

**Everything else in ADR-0035 stands.** The instance lock still refuses voluntary leave, kick,
transfer and settings changes inside the run, so leaving the run is the only way out of a
matched party. A pre-formed party keeps both amended rules: it persists after its run, and its
members resolved inside the run stay members. ADR-0037 still governs where party state lives.

## Consequences

- **Two lifetimes, one origin flag.** Every place that ends or keeps a party asks its origin.
  Forgetting the flag on a new path would either keep strangers grouped or dissolve a group of
  friends.
- **Matched strangers do not become a lasting group.** ADR-0035's "this is a feature, not a side
  effect" no longer holds for them. Players who want to stay together form a party by hand after
  the run.
- **The party shrinks during the run.** Party chat's audience is whoever has not left yet, so a
  player back in town no longer hears the run they left. A spectator still does.
- **Every matched player is back in town party-less**, and can queue again at once.
- **No join-on-arrival path.** Membership is fixed at initialisation and only shrinks. The one
  new removal is the released seat, which the session has to report to the party.
- **A disconnected member inside the grace still earns kill XP** (FS-BDA7X pays every `InPlay`
  body). The user kept that for now; it would change every run, not only matched ones.
- **The run waits for its party.** The host creates the run only once the party script answers,
  so entering the tower is one Redis round trip later than before. The wait happens off the hub
  loop; the loop never blocks on Redis.
- **A random match never contains a pre-formed party.** A player in a party who slips past the
  queue refusal is caught at creation, and the match is called off rather than run with them
  outside the party. The cost falls on the other matched players, who queue again by hand; it
  only happens on a race the queue refusals should already prevent.
- **A new pod-inbox letter kind** carries the cancel to remote players' pods. It is internal
  between pods; no WebSocket message type is added.
- **Membership no longer equals the roster inside a matched run** once someone leaves. ADR-0035's
  "one definition of the people in here" still holds for the living: XP and loot go to the
  living, un-escaped, and those are always still members.
