# FS-48CTQ: Monster target frame on floor 1

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" → "Monster target frame" → this FS

## Scoping notes (raw)

Charter run, 2026-11-06, item C. Revives the idea Nick parked on 2026-11-01 (monster bars hidden
except on damage or hover, elites always, boss top bar). Client only. Recorded without
adversarial review: no `challenge-me` pass.

### Locked decisions, as revised by the owner (coordinator relay, same day)

Owner: "怪物名字血條滑鼠移上去才會看到 或是攻擊他的時候顯示在畫面中間上方" and "類似d2". The
charter's C1–C3 (plates fading per monster) were replaced by:

- C1. No overhead plates or bars on floor 1, normal monsters and elites alike.
- C2. One target frame at the top centre: name, level, HP bar; an elite's prefix lettered in the
  hostile accent, as `elitePlate` does today. Hover: while the pointer is over a monster, the
  frame shows it. Attack: with nothing hovered, the frame shows the monster the local player last
  hit, until it dies or 3 s pass without another hit; only the player's own hits count. Hover wins
  over the last-hit target. With neither, hidden. Fades in and out quickly.
- C3. The boss uses the same frame: while engaged (aggroed on the party or damaged by it) it shows
  whenever nothing is hovered, ahead of the last-hit target. Its bar is wider or more prominent.
- C4. Placement minds the top-centre HUD (run texts, the floor indicator) and the fullscreen
  button; the FS decides after looking at the HUD.
- Reference point: Diablo II's behaviour (hover or attack → name and bar at the top centre; elite
  names set apart by colour). Behaviour only: our chrome and art stay ("UI Chrome").

### Owner constraint: floor 1 only

Floors 2–3 and the field worlds keep today's always-on overhead plates and bars. Built as a
per-floor/per-world switch so later floors can opt in (ADR-0061 Decision 12).

### Facts

- Plates: `nameplate` "Ghoul · Lv 14" and `elitePlate` (`render/creatures/monsters.ts:194-223`);
  bars drawn in `mark` (`:576-600`), `MARKER_BAR` colours.
- No hit attribution on the wire: `MonsterState` has no attacker (`types/game.go:327-344`),
  `ProjectileState` no owner (`types/messages.go:37-42`); the client flashes on any HP drop
  (`monsters.ts:402`). The client knows what it attacked: `attack {enemy_entity_id}`
  (`utils/gameSession.ts:109-110`).
- No target or aggro on the wire; the demon's aggro is 320 px, leash 700 px
  (`monster_tuning.go:198-202`). The demon is 1% on floor 1, guaranteed on floor 3.
- Top centre today: the spectate HUD at y 10 (`SPECTATE_HUD_Y`, `BarrowspireScene.ts:225`) while
  resolved; notices at y 100 (`showNotification`); the floor-change card at the centre. Floor
  indicator and escaped count at the top right under the fullscreen button. Logical width
  1080–1280.

### Derived while scoping

- "Own hit": an HP drop on the monster the player's latest `attack` intent named, within 1 s of
  it; aimed skills that name no monster do not count (v1).
- Boss "engaged": HP below max, or within 700 px of a living member while moving or attacking.
- Frame hidden while the spectate HUD shows.
