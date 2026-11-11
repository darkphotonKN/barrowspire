# FS-MQYEX: Timed container opening

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Timed container opening"; `game-client/SPECIFICATION.md` "### Escape run" → "Progress shown while a container opens" → this FS

## Scoping notes (raw)

Charter "一樓壓力", option A, owner approved 2026-11-11. The locked block below is the owner's
answer set; nothing was asked again.

**Why (owner, playtest 2026-11-11).** Floor 1's chests are too easy. Players move at 200 and every
monster at 90–175, the open is instant, and monsters leash home, so a player circles the monsters
and opens the chest. Only chests in treasure rooms and pack halls are guarded (FS-KE075 §J); an
ordinary room's chest opens at once.

**Locked decisions.**

- Opening a shut container takes a channel of 1.5 s.
- The channel is server-authoritative: the server starts it on the interact, counts it on the
  tick, and ends it; the client only draws it.
- It is cancelled when the player moves, takes damage, or leaves interact range.
- It applies to chests and sacks on every floor of a run. A drop pile (already open) has none. An
  already-open container opens its coffer at once, as today.
- Run worlds only: field and hub containers are unchanged.
- The guarded-chest rule is unchanged (FS-KE075 §J): while a guard stands the reach is refused at
  once and no channel starts; once every guard is dead the channel runs.
- Several players may channel the same container at once, each on their own timer; nobody is
  refused because another is channelling. The first to finish opens it (contents rolled once);
  every other player still channelling it stops channelling and sees the contents too. A cancel
  affects only the player it happened to.
- Starting a channel is not subject to the existing 100 ms per-container interact throttle
  (`containerInteractedCache` in `internal/game/session.go`), which today drops a second player's
  interact without a reply.
- The client shows a progress bar for the local player's channel; a cancelled channel shows no
  notice. Taking loot follows today's rules.

**Bounds.** game-service and game-client only. No proto, api-gateway, OpenAPI or generated client;
no database or migration; no other microservice; no edit to a shipped FS's text.

**Out of scope (owner).** Monster move speeds, the guard definition, new monsters (a ranged
monster is a sibling item on another branch), loot rolls.

**Ownership check (five-bin sorter).** New capability. No thin line owns the act or the time of
opening a container: "Guarded chests → FS-KE075" owns whether a guarded chest may open, "Sacks as
a floor container alongside chests" and "Distinct look per container kind → FS-1D6BX" own the sack
and the views, "Container-open presentation → FS-2325V" owns the view's look, "Container loot
drops from the template pool → FS-none" owns the roll, and "Interaction system for proximate
openables" is doors. The line passes the splinter test: it names a mechanism (an interruptible
open counted by the server) and survives any retune of the 1.5 s or re-skin of the bar. FS-B3NDZ
left "cast or channel bars (none exist today)" out of its scope, so the bar is not a splinter of
the countdown line either.

**Edge noted, not settled here.** FS-KE075 §J's criterion "the next reach once the last guard
falls opens it at once" and its story 37 ("never wait on a hidden timer") read literally against a
1.5 s open. The owner locked "the guarded-chest rule is unchanged", so the guard refusal is
untouched and the timed open starts at once on that reach. FS-KE075's text is not edited.

**Constraints found in the code.**

- `handleInteract` (`internal/game/session.go`) checks the per-container throttle first, for every
  target kind; a successful open hands a 100 ms hold of the container and of the player to two
  sleeping goroutines; a refusal releases the container at once.
- Client actions are queued and applied at the start of the tick (`applyIntents`), 30 ticks a
  second (`constants.GameFrameRate`).
- Damage lands in one place, `CombatSystem.applyHit`; a landed hit costs at least 1 health.
- The reach is `constants.DefaultInteractableRange` (60 px), player to container.
- A run container never closes once open; a drop pile is created open and already rolled.
- The recipient's own state rides `current_player` with owner-only parts beside it (resource,
  parry); snapshots are cut per recipient (ADR-0060); other players never carry more than their
  public state (ADR-0064).
- The client opens a shut container's coffer only on the state that shows it open (FS-KE075 §J
  R60, `reaching` in `BarrowspireScene.ts`).

**Vocabulary.** "Channel" is taken in game-service (`CONTEXT.md`: a pod's copy of a field world;
"never a bare channel"). The owner's "channel" is written **timed open** in specs and code.

**Open questions.**

- How the timed open reaches the client (state field or messages): for write-a-spec.
- Whether attacking, casting or drinking should also cancel: the owner listed three causes only.
