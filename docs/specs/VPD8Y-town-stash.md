# FS-VPD8Y: Town stash

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" (town stash) · Related: FS-HRH2J (30-slot carried bag)

## Scoping notes (raw)

Session 2026-10-30, split out of the FS-HRH2J `/scope-it`. **(not challenged)**

- FS-HRH2J caps the **carried bag** at 30 slots. Everything a character owns beyond that
  needs somewhere to live: a separate stash, accessible **in town** (the hub) only.
- Only the "separate stash in town" decision was made. Everything else is open:
  - How it's accessed: an NPC (the Quartermaster, the old storekeeper, is the natural fit
    now he no longer gates gear), a building or chest, or a hotkey while in the hub?
  - Stash size: capped or unlimited? Tabs?
  - Moving items between bag and stash: same right-click/E pattern as FS-HRH2J? No drag?
  - Is it per character or account-wide?
  - Which server surface owns it (items-service persistence vs game-service hub)? Add
    thin lines on those surfaces at write-a-spec.
  - Overflow for existing prod characters with >30 items when the bag cap ships: dump into
    the stash?
