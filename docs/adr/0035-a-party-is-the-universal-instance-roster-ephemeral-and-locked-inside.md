# ADR-0035 — A party is the universal instance roster: random matches form one, it is never stored, and an instance locks it

Status: accepted
Date: 2026-11-01
Scope: `game-server/game-service`
Realized by: [FS-BJNYC](../specs/BJNYC-party-instance-entry.md) (party entry, auto-formed party,
instance lock), [FS-R82NV](../specs/R82NV-party-formation.md) (party lifetime, Redis pointers),
[FS-V780R](../specs/V780R-party-loot-rule.md) (a party setting that the lock covers)
Builds on: [ADR-0034](0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md) (where a party
lives), [ADR-0033](0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (the same
nothing-stored stance), [FS-K2HKP](../specs/K2HKP-cross-replica-matchmaking-and-handoff.md) (the
random match whose roster becomes a party), [FS-NSV3D](../specs/NSV3D-solo-delve-entry.md) (the
one-player roster)

## Context

Decided by the user on 2026-11-01 while scoping parties. The question was what a party *is* in
relation to the Spire and the instances after it. Three shapes were possible: a party as a social
group that happens to queue together (the instance keeps its own roster); a party as a
pre-formed group that enters together while random matches stay roster-only; or one thing that
every instance's occupants are, however they got there.

The user chose the third, in these words: "可以一起組隊在入塔 這時可以選擇以隊伍進入 如果是隨機
配對 入塔後也要自動幫進入的組隊並且塔內不能退隊這樣就可以合乎規則 就能直接用隊伍頻道溝通 塔只是
一個範例 之後所有副本都通用這個模組", then "退出塔副本後隊伍會繼續存在", then "在副本不能退出 除非
斷線脫離就當他死了 隊長也不能踢人 斷線就由隊員繼承隊長".

Forces: kill experience already goes to every living, un-escaped occupant (FS-BDA7X), loot is
single-copy ground piles and coffers (FS-4R9M9), and the party channel's audience must be exactly
the instance's occupants for it to serve as the instance's chat. If a party and an instance's
roster can diverge inside the instance (someone leaves the party mid-run, someone is kicked),
every one of those rules needs a second definition. Locking the party inside an instance keeps
one definition. Persisting the party across instances lets a random match become a lasting group
without any extra flow.

Recorded without adversarial review (cheap to reverse: no database, no public API).

## Decision

**Every instance's occupants are a party, and the party is the only roster.** A pre-formed party
enters as itself. A random match's host pod creates a party from the matched roster at run
creation (leader chosen at random; a no-show whose seat is released is not a member). Solo entry
is a party of one. Every later instance type uses the same module; nothing is Spire-specific.

**A party is ephemeral.** Its state lives in the party pod's memory (ADR-0034); Redis holds only
TTL'd pointers; no database table exists. A party ends when its last member leaves or its pod
dies. It persists across instances until then: finishing a run does not dissolve it.

**An instance locks the party.** While the party is inside an instance, leaving the party,
kicking, transferring leadership, and changing party settings are refused. Two things are not
locked: leader succession (the earliest-joined member takes over at once if the leader
disconnects, so the run always has a leader) and the run's own resolution rules (a member may
still die, escape, leave the run early or time out of its reconnect grace; they stay a member).

## Consequences

- **One definition of "the people in here".** Party members, XP recipients, loot-rule
  candidates and party-chat audience are the same set inside an instance, by construction.
- **Strangers become a group.** After a random match the players return to the hub still a
  party, on the host pod. Anyone who dislikes it leaves there. This is a feature, not a side
  effect: it is how players meet.
- **The matchmaker's match size is the party size.** One config value feeds both, so a random
  roster and a full party have the same shape. Changing one changes the other.
- **A member cannot be removed mid-instance, even a griefer.** Accepted: the run is short, and
  the alternative reopens every per-occupant rule. Mute (FS-4HEG7) is the in-run remedy.
- **A party pod crash ends the party.** Nothing is recovered; matches in flight resolve as
  K2HKP already says. Same stance as chat (ADR-0033).
- **Party-as-queue-entry is deferred.** A party that wants to be filled from the queue is not
  covered; parties enter as parties. Adding it later is a queue change, not a party change.
- **Reversible.** A persistent guild-like group would need a store and a different lifetime; it
  would sit beside this party, not replace it.
