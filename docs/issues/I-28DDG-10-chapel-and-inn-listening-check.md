---
id: I-28DDG-10
status: open
implements: FS-28DDG
blocked_by: [I-28DDG-9]
labels: [hitl]
title: "FS-28DDG slice 10: the owner's listening check of the chapel's and the Inn's music (HITL)"
---
Implements FS-28DDG §Change: The chapel's and the Inn's music

**Lane: HITL (owner).** Restart the client only. No server change.

## What to Check

- On the street the village plays as before.
- Walk into the chapel. The village falls away (about 1 s) as the chapel rises (about 2 s): soft
  organ for the first ~18 s, then the chant, with a bell every eight bars.
- Walk out. The village rises again from its top. Step in and straight out: no gap and no jolt.
- Walk into the Inn. Its dance rises: drone, lute and drum, then the fiddle's tune, then the
  recorder.
- **Feel.** Do both sit with the village (serious, medieval, the same world)? If one is off,
  name what: the tempo, an instrument, the mix. These are code-built and re-render in seconds
  (`node tools/music/compose.mjs chapel`).
- **Loudness.** At the same Music level, is either louder or softer than the village? That sets
  its ceiling (`Tunes FS-28DDG`, M4).
- Let each play past one loop (chapel 107 s, Inn 113 s): no gap and no click at the wrap.
- ESC → Options → Music indoors: ←/→ change it at once. Back on the street it holds.
- Another house (the smithy): the village plays.
