# FS-9K8EZ: Die by choice

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" (die by choice from the run's ESC menu); `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (a delver may end their own run as a death) → this FS · Related: [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (the dead delver's card, Watch / Leave the barrow, `leave_run`), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (the hub's ESC menu, the pattern to reuse), [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 15, 17 (end rule, resolved delvers), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) ("death loses everything"), [FS-NSV3D](NSV3D-solo-delve-entry.md) (a run of one ends when its delver resolves)

## Scoping notes (raw)

### How this arrived

ESC inside a run used to start MainMenuScene, leaving the body standing in the Spire being
killed while the roster was on screen; that exit was removed (2026-10-29). The user then
asked for a deliberate way out of a run that is honest about its cost: "按 ESC 可以選擇強制
脫離，等同死亡". Scoped 2026-10-29; every default below was accepted by the user.

### Decisions

1. **Entry: the run gets an ESC menu**, the same chrome and keys as the hub's (FS-G4VMQ:
   number keys, Enter for the first, Esc closes), with one choice for a living delver whose
   label says plainly that it is death, not a retreat: lore voice, in the register of "Fall
   where you stand" / "Let the barrow take you" (final copy at write-a-spec; the user asked
   for "類似立即死亡", never "forfeit"/"withdraw"). **(user)**
2. **Confirm first.** Unlike FS-NSV3D's solo start, the cost here is a real death, so the
   choice asks once ("Few return whole. Fall here?" / Yes / No) before sending. Esc declines.
3. **Who may:** a delver still in play. A dead delver's ESC menu shows the existing *Leave the
   barrow* (FS-QPDKN R13) instead, a second entry point to the same `leave_run`. An escaped
   delver has neither: they wait for the run's end (FS-QPDKN §Out of Scope).
4. **Server: a new inbound action `forfeit_run`** (name at write-a-spec; wire name must not
   say "leave"). Accepted from a member whose record names a run and whose body is in play:
   the server sets that body's health to 0 and does nothing else. The next tick's
   `EliminationSystem` records the elimination exactly as for any death, `RulesSystem` ends
   the run if nobody is left in play, settlement and experience follow the death rules.
   - Why health 0 rather than marking eliminated directly: one death path. Position in
     `match.ended`, `end_game`'s `eliminated`, run progress, FS-QPDKN's dead card all come
     for free, and nothing can drift between "died" and "chose to die".
   - Refused, with an error on the action: not in a run; already resolved (dead, escaped,
     left behind); the body cannot be found.
   - Human lane: the owner hand-codes the server side; agent writes RED tests.
5. **Result: `eliminated`**, elimination index in the order it happened. No new result value
   (`forfeited` would change `match.ended` and stats-service for nothing).
6. **Plunder: lost**, as for any death (FS-4R9M9). A way out that keeps the plunder is an
   escape, and the escape door is that.
7. **After the death the client follows FS-QPDKN exactly:** the dead delver's card with Watch
   the delve and Leave the barrow when a teammate is still in play; the result card when the
   run ends (a run of one ends on that tick, FS-NSV3D). The client adds nothing after sending
   `forfeit_run`; the next state broadcast shows the delver dead and the existing card logic
   takes over.
8. **The run's ESC menu owns the keyboard while open**, as the hub's does: no move is sent,
   E opens nothing. Attack/skill clicks while the menu is up are dropped. Closing resumes.
9. Client: `ActionType.ForfeitRun`; the menu built with the hub's `hubMenuChoices`-style pure
   rule (choices by state: in play → die; dead → leave; escaped → back only) so it is tested
   without a canvas.

### Edge cases raised

- `forfeit_run` twice before the tick records the death: the second finds health already 0 →
  refused as "already resolved"; harmless. Client disables the choice after sending.
- `forfeit_run` racing a monster's killing blow on the same tick: whichever lands first; both
  are the same death. Elimination index is recorded once.
- Confirm dialog open when the delver is killed by a monster: the next broadcast shows them
  dead; the menu is taken down and the dead card appears (menu state must yield to the
  resolved-card logic).
- Confirm dialog open when `end_game` arrives: the result card takes over; the menu goes down.
- Solo run: die by choice → run ends on that tick → result card → Return to the hub.
- Two delvers, one dies by choice: the run goes on for the other; the one who died may Watch
  or Leave (FS-QPDKN).
- ESC while a container view or the equipment panel is open: closes that panel first (today's
  Q/ESC semantics for panels, to be verified at write-a-spec); the menu opens on the next ESC.
- Reconnect with the menu open: the scene is rebuilt; the menu is gone; nothing was sent.

### Out of scope

- A retreat that keeps plunder or experience beyond what death keeps.
- Penalties or cooldowns for dying by choice.
- Dying by choice from the hub or the main menu (there is nothing to die from).
- Any change to how death is settled, ranked or rewarded.
- Spectator or escaped delvers dying by choice (they are already resolved).

### Open questions

- Exact label and confirm copy (lore voice; "立即死亡" in spirit).
- Whether the run's ESC menu should also carry a "Back" row like the hub's (likely yes, for
  symmetry) and whether the controls panel (H) lists ESC again.
- The wire name: `forfeit_run` vs `die` vs `fall`; it is internal, pick at write-a-spec.
