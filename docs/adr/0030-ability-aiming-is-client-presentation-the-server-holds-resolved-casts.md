# ADR-0030 — Ability aiming is client presentation; the server holds only resolved casts

Status: accepted
Date: 2026-10-30
Scope: `game-server/game-service` (cast handling, the CombatSystem, per-delver state) and
`game-client` (ability input and its presentation)
Drives: [FS-JTNPR](../specs/JTNPR-shadow-shot.md) (Shadow Shot), [FS-MAMHR](../specs/MAMHR-mercenary-class.md)
(the parry exception), [FS-8AY7S](../specs/8AY7S-class-resources-and-combat-hud.md) (costs paid on cast)

## Context

Recorded without adversarial review. The user decided this in the 2026-10-30 class scoping
session and declined challenge-me.

The archer's new ability, Shadow Shot, is aimed by holding right-click: the archer stands still,
turns to follow the mouse, and fires when the button is released. Holding to aim could be modelled
on the server, with an aiming state per delver, a start tick, and a facing streamed every tick. The
user turned that down: "the server only deals with the fire, the rest is FE work, don't make
backend game state complex there."

Every aimed skill already works this way. `cast_skill` carries a skill id and a target point, and
the CombatSystem resolves it on the next tick against cooldown and cost. The server never sees the
cursor.

The Mercenary's parry, scoped in the same session, is different. A parry succeeds or fails
depending on whether a monster strike lands inside a short window. Monster strikes are resolved on
the server (`MonsterAISystem`'s wind-up, then `AttackMonsterStrike`). If the client decided the
window, it would be judging an outcome that only the server can see.

## Decision

**Aiming, holding and other wind-ups before a player's ability fires are client presentation. The
game-service state holds only resolved casts.** For Shadow Shot, the server receives one cast when
the button is released. It never learns that a hold began, how long it lasted, or where the archer
faced while aiming. Standing still and turning to follow the mouse are drawn on the client, and the
client stops sending movement while the player aims.

**Exception: a player timing window is server-authoritative state when its outcome is decided
against something the server resolves.** The parry stance opens on the tick its cast arrives.
Whether a monster strike lands inside it, the lockout that follows a whiff, and the charges a parry
grants are all server state.

The test for any new ability: if the outcome depends only on the moment of release and where the
player aimed, the hold belongs to the client. If it depends on whether something happens on the
server during the window, the window belongs to the server.

## Consequences

- Shadow Shot needs no new server state beyond its attack row. The backend stays small in the
  hand-coded lane.
- A modified client can skip the hold and fire straight away. That is accepted. Cooldown and
  stamina cost already limit how often it can fire, and the server already turns away casts made
  inside the cooldown.
- How long the player held cannot affect the result. A damage ramp for a longer draw would need the
  server to know the hold time, so it would mean revisiting this ADR (FS-JTNPR open question).
- Teammates do not see another archer turning while they aim, because aiming facing is not
  broadcast. They see the shot when it is fired.
- The parry adds per-delver state to game-service: the stance window, the lockout and the charge
  count. That cost is accepted because the outcome depends on monster strikes the server resolves.
