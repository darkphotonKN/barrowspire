# ADR-0078 — A field's minimap fog is the player's own, shown on the minimap only, and kept per character in the browser

Status: accepted
Date: 2026-11-12
Scope: `game-client`, the field worlds (Gentle Meadows, the Forlorn Forest, the dev test room) and
the town. The server is not involved.
Specified by [FS-P0HSP](../specs/P0HSP-town-and-field-minimap.md) §A.2, §D ("Charted ground").
Amends: none. Related: [ADR-0063](0063-fog-of-war-is-client-presentation-shared-by-the-party.md)
(a run's fog of war: party-shared, not stored, no fog in other worlds), whose decisions all stand;
[ADR-0068](0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md)
(the run fog's look, untouched).

## Context

Charter run "村莊與野外小地圖", approved by Nick on 2026-11-12 ("核准"). The town and the field worlds
get the run's minimap (FS-P0HSP). The owner set the fog's place in plain words:

- "這些區域只有地圖有迷霧 畫面不需要迷霧": in these areas only the map has fog; the screen needs none.
- "村莊不用任何迷霧": the town has no fog of any kind.

The charter's locked defaults, approved with it: a field's map fills in round the player as they
walk (a circle about half a screen wide, one named value); what is charted is remembered per
character in browser storage, survives revisits on that machine and is lost on another; it is not
shared with the party.

Forces:

- **ADR-0063 already decides a fog**, and decides it differently: a run's fog veils the world on
  screen, is derived from every party member's position so the party sees one map, is never
  stored, and applies on dungeon floors only ("other floors and worlds have none", Decision 7).
  A field fog that follows those rules would be a screen veil the owner refused, would be lost on
  every visit, and would chart for a player ground their party walked without them.
- **A field is revisited** many times a session: it is where a player goes between delves, and
  the town's two roads lead to it. A run floor is seen once. Ground re-charted on every visit
  makes the map a chore rather than a record.
- **Nothing on the server knows a field's map**, and the charter put any server, proto, gateway
  or database change out of scope. A record that survives a revisit without a server change has
  to live in the browser.
- **The repo keeps light, blackout and fog presentation-only** (ADR-0063 Decision 5): what the
  client is shown is never a rule about what it may see.
- A browser store can be absent, blocked, full or cleared, and two tabs can hold one character in
  one field.

Recorded without adversarial review: no `challenge-me` pass.

## Decision

1. **A field's minimap fog is charted ground, drawn on the minimap only.** The screen is never
   fogged or veiled in a field; the town has no fog of any kind, on the screen or on its map, which
   shows whole from the first moment. A run's fog of war (ADR-0063, ADR-0068) is untouched and
   stays a dungeon floor's alone.
2. **It is the player's own.** Only the local player's position charts; party members' positions
   chart nothing for this client, though their dots still show. A field's fog is not shared with
   the party, unlike a run's.
3. **It is kept per character and per field, in this browser** (`localStorage`), so a revisit on
   the same machine shows what that character charted before. Another machine or a cleared browser
   starts uncharted. Nothing is sent to or kept on the server.
4. **Writes merge, never overwrite**: what is written is unioned with what is stored at that
   moment, so two tabs on one character never lose each other's ground; writes are throttled, not
   made every frame.
5. **Storage is a convenience, never a dependency**: every read and write is guarded, and a store
   that is missing, blocked, full or holding a value that does not fit the field now leaves the
   charting for that visit alone, with nothing thrown.
6. **Presentation only**, as ADR-0063 Decision 5: charted ground decides what the minimap draws,
   never what anyone can see, reach or hit.

## Consequences

- No server, wire or database change; the radius, cell and cadences are client constants
  (`FIELD_CHART`), tunable alone.
- Two fogs now live in the client with different rules: a run's (screen and minimap, the party's,
  unstored) and a field's (minimap only, the player's, stored). `CONTEXT.md` keeps them apart by
  name: **fog of war** and **explored / unexplored** are the run's; **charted ground** and
  **uncharted** are a field's.
- Charted ground is lost to another machine, a cleared browser, a private window, or a field the
  server resizes (a stored chart that no longer fits is dropped). Accepted.
- A player sees no map of ground their party walked without them. Accepted; sharing it would need
  either the run's derive-from-everyone rule (which then forgets on every visit) or a server.
- Anything that wants to act on charted ground (a quest "chart the Forest", an achievement) cannot
  rely on it, since it is the browser's alone and trivially edited. Making it authoritative would be
  a server-side record and a new ADR superseding Decision 3.
- If the run's fog should one day persist, or a field's become party-shared, that is a change to
  this ADR or to ADR-0063 Decision 4, recorded as such, not a quiet change to either fog.
