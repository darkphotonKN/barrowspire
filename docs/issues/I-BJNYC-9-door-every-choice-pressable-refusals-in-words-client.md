---
id: I-BJNYC-9
status: in-progress
implements: FS-BJNYC
blocked_by: []
labels: [ready-for-agent]
title: "FS-BJNYC slice 9: every Spire door choice for everyone, pressable, each refusal spoken in the door's panel (game-client)"
---
Implements FS-BJNYC §Requirements R20, R21, R22 (amended 2026-11-02), §Copy

**Lane: agent (AFK).** Nick, 2026-11-02, at the Spire's door with no party: "改成都可以按
然後出現對應拒絕文字 包含沒組隊時按組隊進場 也會出現需要先組隊的文字 如果隊伍只有一人 也顯示需要大於1人".
Runs in parallel with I-BJNYC-8 against the wire below. Until I-BJNYC-8 ships, a party of one's
press opens nothing visible (v1 starts the run); the `too_few` copy is simply not reached yet.

## What to Build

- **Every choice, for everyone (R20).** `delveChoices` offers Enter as a party (`party_enter`),
  Descend alone (`start_solo`), Wait for company (`find_game`) and Not yet to every player, in no
  party, a member, the leader or a party of just the leader. None is greyed or hidden for party
  standing (drop `closedToParty`).
- **Order (R20).** Leader: Enter as a party, Descend alone, Wait for company, Not yet. Everyone
  else (no party, or a member who is not the leader): Descend alone, Wait for company, Enter as a
  party, Not yet. "Not yet" always last. The existing redraw on a party-standing change keeps
  working (it redraws for the new order).
- **One opening line (R20).** "The Spire's door stands open. Few return whole,\nand fewer return
  twice." for everyone; the party member's "Your party enters together." line goes.
- **Pressing sends; the panel stays open (R21).** Each of the three sends its action whatever the
  standing. The one-in-flight guards stay (`enterPending`, `soloPending`; add one for `find_game`
  if needed so it is not sent twice) and are the only time a choice does not act. Wait for company
  now stays open until answered too: the queue taking the player replaces the door with the
  queue's panel, as today.
- **The door speaks the refusal (R22).** A refusal of the choice just pressed replaces the door's
  opening line in its own panel; every choice stays offered and pressable.
  - `party_enter`: by `party_notice` code, through a door table keyed by the action:
    `not_member` "Form a party first.", `not_leader` "Only your leader can lead the party in.",
    `too_few` "Your party needs at least two players."; every other `party_enter` code (`locked`,
    `checking`, `not_at_gate`, `not_in_town`, `unavailable`) in the chat's existing words.
  - `start_solo` / `find_game`: the error reply's words via `spireRefusalCopy` (a party member
    gets the server's "Your party enters together.").
  - The chat window's system line for a `party_notice` stays as it is. Add `too_few` to
    `PARTY_NOTICE_COPY` ("Your party needs at least two players.") and to `PARTY_ENTER_REFUSALS`,
    so the chat shows it and the press is answered.
  - A `start_solo` / `find_game` refusal arriving after the door closed is shown in passing, as
    today.
- Ready-check cancellations (R10) stay shown in passing; the popup (I-BJNYC-5) is unchanged.

## Acceptance Criteria

- [ ] No party, a member, the leader and a party of one each see all four choices, none greyed, with the same opening line. (FS AC rows 2, 17)
- [ ] Leader order: Enter as a party, Descend alone, Wait for company, Not yet; everyone else: Descend alone, Wait for company, Enter as a party, Not yet. (FS AC row 17)
- [ ] Each of the first three sends its action for every standing, once while unanswered; the door stays open until answered. (FS AC row 17)
- [ ] No party + Enter as a party → "Form a party first." in the door's panel. (FS AC row 23)
- [ ] Party of one + Enter as a party → "Your party needs at least two players." in the door's panel and as the chat line. (FS AC row 24)
- [ ] Non-leader member + Enter as a party → "Only your leader can lead the party in."; party member + Descend alone or Wait for company → "Your party enters together."; the door stays open with every choice pressable. (FS AC row 25)
- [ ] The other `party_enter` codes read in the door's panel in the chat's words; the chat lines for `not_member` / `not_leader` are unchanged. (FS AC row 20)
- [ ] A `start_solo` / `find_game` refusal after the door closed is shown in passing. (FS AC row 26)
- [ ] `npm test` and lint green.
- [ ] Browser check (Nick): at the Spire's door with no party, in a party of one, as a member and as the leader, every choice is listed and each refusal reads as above.

## Blocked By

None.

## Spec Reference

FS-BJNYC §Requirements R20, R21, R22; §Copy (door rows, `too_few`, the note on shared codes);
§User Stories 13–16, 29–33; §Acceptance Criteria rows 2, 17, 20, 23–26; §Edge States "No party,
presses Enter as a party", "Member, not leader, presses Enter as a party", "Party member presses
Descend alone or Wait for company", "Party standing changes while the door is open", "Door closed
before the answer comes", "Client and server disagree on standing".

## Wire (what the client matches)

- `party_notice` `{code}`: `not_member`, `not_leader`, `too_few` (new, no name, from I-BJNYC-8),
  `locked`, `checking`, `not_at_gate`, `not_in_town` (`names`), `unavailable`.
- `start_solo` / `find_game` error reply `{action, error, payload: {message}}`; for a party member
  `message` is "Your party enters together.".
- No outbound change: `party_enter` (no payload), `start_solo` `{}`, `find_game` as today.

## Files expected to touch (game-client)

- `src/scenes/HubScene.ts`, `src/scenes/HubScene.test.ts` (`delveChoices`, `HubState`, the door's refusal line, the `party_notice` / `StartSolo` / `Find_Game` error listeners, keeping the door open on Wait for company)
- `src/ui/partyNotice.ts`, `src/ui/partyNotice.test.ts` (`too_few` in `PARTY_NOTICE_COPY` and `PARTY_ENTER_REFUSALS`; the door's `party_enter` table keyed by action)
- `src/scenes/fieldRefusals.ts` (only if `spireRefusalCopy` needs a door variant)
- `src/stores/partyStore.ts` (only if the notice code type needs `too_few`)

## TDD Approach

- RED: `delveChoices` for each standing lists all four choices, none disabled for standing, in the stated order, with the one opening line.
- RED: the door's `party_enter` refusal text for `not_member`, `not_leader`, `too_few`, and the fallback to the chat copy for the rest.
- RED: `PARTY_NOTICE_COPY.too_few` and `PARTY_ENTER_REFUSALS.has("too_few")`.
- GREEN: the choices, the door table, the listeners writing the refusal into the open door's panel.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: all four door choices pressable, the door speaks each refusal.
