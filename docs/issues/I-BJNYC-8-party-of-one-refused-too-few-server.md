---
id: I-BJNYC-8
status: done
implements: FS-BJNYC
blocked_by: []
labels: [ready-for-agent]
title: "FS-BJNYC slice 8: a party of just the leader is refused too_few, in R5's amended order (game-service)"
---
Implements FS-BJNYC §Requirements R3, R5 (amended 2026-11-02)

**Lane: human (HITL), authorised by Nick's request 2026-11-02.** `/develop` may run this slice.
Nick, verbatim: "改成都可以按 然後出現對應拒絕文字 包含沒組隊時按組隊進場 也會出現需要先組隊的文字
如果隊伍只有一人 也顯示需要大於1人". Runs in parallel with I-BJNYC-9 against the wire below.

## What to Build

- **New `party_notice` code `too_few`** (`constants.PartyNoticeTooFew PartyNoticeCode = "too_few"`),
  no name and no names. It goes to the pressing leader only, like every other `party_enter` refusal.
- **`party_enter` refuses a party of just the leader (R3).** In `entered`, a party read from
  Redis with fewer than two members is refused `too_few`: no ready check opens and no run is built.
  The v1 path where a party of one opened a check, found everyone accepted and started at once
  (`openCheck` → `allAccepted` → `startCheck`) is no longer reachable from a press. Leave
  `openCheck` safe for one member, or drop that branch and its comment, as the refactor pass judges.
- **R5's amended order:** `not_member`, `not_leader`, `locked`, **`too_few`**, `checking`,
  `not_at_gate`, `not_in_town`, `unavailable` (Redis unreachable answers before the list, as today).
  `too_few` sits after `locked` so a party still in its run that has shrunk to one is told
  `locked`; it sits before `checking` and the place checks. Decided on the Redis read, on the loop
  (R6); the party cache never decides it.
- Nothing else changes: `start_solo` and `find_game` still refuse every party member, a party of
  one included, with "Your party enters together." (R1, R2); the Redis keys and scripts are
  unchanged (R14).

## Acceptance Criteria

- [ ] A leader whose party is just them pressing `party_enter` (at the gate, in the town) gets one `party_notice` `{code: "too_few"}` with no name; no `party_ready_check` is sent and no run is built. (FS AC row 11)
- [ ] The R5 table-driven test covers the amended order, `too_few` row included: `not_member`, `not_leader`, `locked`, `too_few`, `checking`, `not_at_gate`, `not_in_town`, `unavailable`. (FS AC row 4)
- [ ] A leader whose party is still in its run and has shrunk to one is refused `locked`, not `too_few`. (FS AC row 22)
- [ ] A party of one not at the gate is refused `too_few`, not `not_at_gate`.
- [ ] A party that drops to one during an open check is still cancelled `changed`; the leader's next press is refused `too_few`. (FS AC row 21)
- [ ] A party of two or more enters exactly as before (ready check, run).
- [ ] `start_solo` / `find_game` from a party of one is still refused "Your party enters together."
- [ ] `make lint && make test` green in game-service.

## Blocked By

None.

## Spec Reference

FS-BJNYC §Requirements R3, R5 (and R2's amended party-of-one sentence); §Copy row `too_few`;
§User Stories 16, 34; §Acceptance Criteria rows 4, 11, 21, 22; §Edge States "Party of one",
"Party of two drops to one during the check", "Party still in its run, shrunk to one".

## Wire (what I-BJNYC-9 relies on)

- `party_notice` `{code: "too_few"}`, no `name`, no `names`, to the leader who pressed.
- Unchanged: `not_member`, `not_leader` and the other R5 codes; the `start_solo` / `find_game`
  error reply `{action, error, payload: {message: "Your party enters together."}}`.

## Files expected to touch (game-service)

- `common/constants/game.go` (`PartyNoticeTooFew`, the R5 order comment)
- `internal/gameserver/party_entry.go` (`entered`'s switch; `openCheck`'s party-of-one comment and branch)
- `internal/gameserver/party_ready_test.go` and/or `internal/gameserver/party_entry_test.go` (the R5 table, the party-of-one case; replace the v1 "party of one starts at once" test)
- `internal/gameserver/party_lock_test.go` (only if the shrunk-in-run `locked` case lives with the lock tests)

## TDD Approach

- RED: the R5 table gains a `too_few` row (party of one at the gate, in the town) and expects
  `too_few`, no check, no run; the v1 "party of one enters at once" test now fails as intended
  and is rewritten.
- RED: shrunk-in-run party of one expects `locked`; party of one away from the gate expects
  `too_few`.
- GREEN: the constant and one case in `entered`'s switch, after `locked`.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Review fix: the two-player minimum is a named constant.
