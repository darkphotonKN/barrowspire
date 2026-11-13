# FS-XWHZP: Spire messages as lore lines

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" (Spire messages as lore lines) → this FS · Consumers: [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) §I (the tome, altar and hell lines move here from the HUD notice) · Related: [FS-PQ2TW](PQ2TW-arrival-card.md) (the arrival card: the nearest look), [FS-F6F88](F6F88-multi-floor-delves.md) / [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) (the floor card), [FS-KE075](KE075-floor-1-dungeon.md) (guarded chest line), [FS-9K8EZ](9K8EZ-die-by-choice.md) (Fall), ADR-0013 (token-only colours)

## Scoping notes (raw)

Owner request, 2026-11-14, during the FS-C8VM7 / FS-3103M charter run.

- Asked whether the tome's lines had their own visual: "we didn't have in-game story pop up
  visual vibe lore thing yet". FS-3103M R24 had defaulted to the plain fading HUD notice
  (`showNotification`). Owner: no, a new lore visual.
- Then widened it: "I wanted to make **all spire related messages** use it, for example when you
  click the escape switch and the door opens the message is very off-putting and non lore
  friendly. It should use the same message / lore system and visual too."
- Visual calls are delegated (owner's standing rule for art): decided here, judged after on a
  gallery card and a screenshot.

### Decided

- **A lore line** is a new client presentation, its own module, reusable for later story beats:
  high centre, the serif lore face, italic, quieter than the arrival and floor cards (same
  family), slow fade in, hold, fade out, fine dust. Colours from existing `BARROW` tokens only.
- **Tones** (starting set): `lore` (parchment, the default), `dread` (oxblood: adds a short low
  ember burst and a slight camera tremor; the hell line), `hope` (the escape lines; a warm
  lantern tone).
- **Every Spire world message becomes a lore line, with lore-voice copy written by the client**,
  keyed on the event or reply reason, never on the server's free text where a key exists:
  - switch thrown ("Exit door unlocked! Run to escape!") and the `exit_door_unlocked` message;
  - escape door opened ("Escape door opened!");
  - a delver escaping ("<name> escaped successfully!");
  - the stair gather refusal, the guarded chest's "It will not open.", Fall refused;
  - FS-3103M's tome pickup, altar-without-tome, and the hell line (that FS's R24 amended to point
    here; who sees which line stays as FS-3103M says).
  - Any other in-run interact reply that is about the world (not the interface) and arrives as
    server free text: shown as a lore line with the server's words until a reason key exists.
    Server strings are the human lane; no server change in this FS.
- **Stays a HUD notice:** equip refusals and other interface or system messages (bag, network,
  inventory). They are about the UI, not the world.
- **The "Burn tome?" confirm** stays FS-3103M's menu panel: a choice, not a line.
- **Several at once:** lore lines queue, never overlap; a newer `dread` line jumps the queue.
  (default)
- **Reconnect** replays nothing: lines fire on transitions, as the floor card and the hell line do.
- Copy is a starting set, written in the client's existing lore voice (the floor card's "The dead
  walk heavier here." is the register). Escape copy e.g. "The seal breaks. Somewhere, a door
  gives." / "The way out stands open." / "<name> walks out of the dark." (defaults, tune freely)

### Open

- Whether fields and the hub use lore lines later (not now: Spire only, per the owner).
- Sound for a lore line: none in v1 unless an existing interface sound fits.
