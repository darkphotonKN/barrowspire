# FS-1J1CB: Specialization looks

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Character" (specialization looks) → this FS · Siblings (same scoping session, 2026-11-21): [FS-E1ZDG](E1ZDG-specializations.md) (the eight specializations; puts `specialization` on `current_player` and `other_players`), [FS-8RZ51](8RZ51-passive-skill-tree.md) (the pick) · Changes: [FS-JTNPR](JTNPR-shadow-shot.md) (Shadow Shot's shadow effect) via `## Change: Shadow look only for the Shadow Ranger → FS-1J1CB` (§F here) · Related ADRs: ADR-0013 (tokens only), ADR-0020 (pre-rendered 3D baked to isometric sprites), ADR-0021 (characters authored in code), ADR-0058 and ADR-0076 (sheet scale), ADR-0059 (class groups are resident), ADR-0071 and ADR-0081 (on-demand groups and stand-ins), ADR-0082 (a spend takes effect at the next seating), ADR-0084–0086 (the UI scene, and which pieces stay in the world; §I) *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*, [ADR-0088](../adr/0088-a-specialization-looks-art-is-its-own-on-demand-group-fetched-when-the-world-state-carries-it.md) (a spec look's art is its own on-demand group, fetched when the world state carries a player with that specialization, the base class sheet as stand-in, the player's own look preloaded; §C R18–R24; amends ADR-0059 Decision 1, takes ADR-0071 Decision 6's new trigger) · Vocabulary: pending via `domain-model` (*spec look*, *spec-look group*, *off-hand clip*, *aura*, *ward*, *gloom*; *stand-in* widened from monsters to players)

## Summary

Each of the eight specializations (FS-E1ZDG) changes how the character looks, so a level-20
character reads as what it became, to itself and to everyone near it. Each look is the class's own
figure re-dressed: the same rig, build and clips, with a few pieces changed (a helm, a coat, a
weapon, a dye). Two specs also wear a quiet effect that never turns off: the Spellwarden's ward
and the Shadow Ranger's gloom. The Berserker swings an axe in each hand, one after the other.
The archer's right-click shows its shadow only for a Shadow Ranger; every other archer's is the
plain Heavy Shot. Modest, readable at play size, built in code.

## Requirements

Values marked **(decided)** are Kranti's picks from the 2026-11-21 `/variants` round, or the
scoping session before it. **(reading)** marks the integrator's reading of a pick. **(v1)** marks
the smaller first version, picked where neither covered the question. Art calls are delegated to
Claude; every look is gated on Kranti's approval of a contact sheet (R12). Every colour is a
`BARROW` token or a blend of tokens.

### §A. The eight looks

Each look starts from today's class sheet and changes only what is listed. Anything not named
stays as the class has it today (`tools/bake/page/characters/cast.js`). The `/variants` builders
named below are reference code to port, not to copy blind (they are throwaway and were checked on
idle only).

**Warrior** (base: the knight)

1. **Guardian** *(decided: variant B plus variant C's helm)*:
   - A sleeveless surcoat in worn bone over the hauberk, open at the front like it, stopping a
     hand above its hem, with the house cross in oxblood on the breast (variant B `surcoat`).
   - The **flat-topped great helm** in place of the conical nasal helm, over the coif: a steel drum
     closed over the face, a dark eye-slit, a brass brow band and a brass cross down the face
     (variant C `greatHelm`). Nothing else from C.
   - The kite shield **slightly larger** *(decided)*: about 1.15x today's in height and width
     *(v1)*, still carried and raised as today.
   - A **prettier decal** *(decided)*: the per-pale bone and oxblood kept, with the house cross
     laid over it **counterchanged** (oxblood on the bone half, bone on the oxblood half), and a
     narrow brass border inside the rim *(v1 — reason: it ties the shield to the surcoat's
     cross)*. The iron boss stays.
   - The cloak, longsword and mail stay.
2. **Berserker** *(decided: variant C, dual-wielding)*:
   - The helm off and the coif pushed down to a mail mantle round the neck; the head bare, with
     dark hair and a full short beard (variant C `bareHead`).
   - Blood-dark cloth wound round **both** forearms *(v1 — reason: C wrapped the one axe arm;
     both arms now carry an axe)*.
   - The cloak **torn short** to the hips, its hem ragged (variant C `TORN`).
   - **A bearded axe in each hand** *(decided)*, no shield and no longsword. The kite shield is
     gone from the sheet entirely.
   - **The axe is held the right way** *(decided)*: the cutting edge faces **forward and down**
     in the carry and **leads** the swing. In variant C's `beardedAxe` the edge points up; the
     build fixes the head's orientation in the grip frame, never by turning the hand over (the
     guideline's normal grip).
   - A Berserker carry and attack of its own (a new style beside `KNIGHT_STYLE`): both arms low
     with the axes down and forward by the legs, and a wide cut with the free arm swung back for
     balance, not the knight's compact cut behind a raised shield. The guideline's attack rules
     hold (wind-up, weight, curve, strike at key 3, 7 keys at 12 fps).
   - **Off-hand clips** for the alternate-hand swing (§D).

**Mage** (base: the wizard)

3. **Spellwarden** *(decided: variant B)*:
   - Blackened-iron spaulders on both shoulders, three lames each, and a blackened-iron gorget at
     the base of the neck over the collar's foot (variant B `gorget`, `spaulder` at 0.9).
   - The tome **bound in iron bands** (variant B `wardedTome`).
   - A **larger ward focus** in place of the short sceptre *(decided: larger and spec-specific)*:
     about 1.5x the sceptre's length, short of a staff *(v1 — reason: it keeps the sceptre's
     carry, its thrust and today's frame size; a full staff is a later tweak if the contact sheet
     asks for one)*. An iron haft with an open iron ring at its head round a pale stone lit
     `necrotic` toward `vellum`, low, never neon.
   - The always-on **ward** (§E).
   - The gown, teal scapular and hair stay.
4. **Pyromancer** *(decided: variant B)*:
   - The scapular in a scorched, near-black oxblood in place of the necrotic teal (variant B
     `soot`, dirt 0.5).
   - The gown's hem **singed**: torn short and ragged (variant B `hem`).
   - **Embers on the hem that move with the gown** *(decided)*: painted into the gown's hem texture
     as emissive specks in the fire ramp *(v1 — reason: it rides the skinned skirt for free; the
     variant's rigid specks on the hips bone stood still while the hem swung)*. Never rigid on a
     body bone.
   - A **larger fire focus** in place of the short sceptre *(decided)*: about 1.5x the sceptre's
     length *(v1, as R3)*, its head an open iron cage holding a tongue of flame kept upright in the
     world in every pose (variant C `brazierSceptre`'s cage and upright hook, scaled). The flame
     takes the fire ramp.

**Archer** (base: the Nightwood ranger)

5. **Hunter** *(decided: variant A, more wild clothing, no green, no hood)*:
   - A grey-brown **wolf pelt** over the shoulders, shaggy at its torn edge (variant A
     `peltMantle`, `LOOK_TONES.wolf`).
   - **More wild-hunter clothing** *(decided)*: a laced hide jerkin over the buff (variant C
     `jerkin`), long pale goose fletching standing high out of the quiver, and horn caps on the
     bow's nocks (variant C) *(v1 — reason: the variant round's other wild-hunter pieces, already
     built)*.
   - **No green dye** *(decided)*: the cloak and capelet in undyed grey-brown wool, warm and earthy,
     so nothing of the Nightwood green is left.
   - **No hood** *(decided)*: the cowl is gone. The archer's face and hair show (`face()` as every
     human): brown hair loose to the collar, unbearded *(v1 — reason: apart from the mercenary's
     tied-back hair and trimmed beard and the Berserker's dark hair and full beard)*.
   - The bow, quiver strap and buff leather stay.
6. **Shadow Ranger** *(decided: variant A)*:
   - The Nightwood green dyed through to a cold soot-black on the cowl, capelet and cloak; the buff
     leather blackened to a cold grey; bracers, boots and fletching black (variant A `shadowA`).
   - **The back still reads in a dark room** *(decided)*: the soot lifted toward slate, or its
     edges rimmed (a lighter turned edge on the cowl and cloak), until R10's floor holds, without
     losing the black at a glance.
   - The always-on **gloom** (§E).

**Mercenary** (base: the swordsman in madder)

7. **Duelist** *(decided: variant A's half-cloak plus an almost samurai-like robe)*:
   - A **half-cloak** in slate-black slung from the **off (left) shoulder**, down the back and over
     the arm to the hip, in place of the left spaulder (variant A `halfCape`). Hung on cloak bones
     and skinned like the knight's cloak, never rigid on the chest as the variant was.
   - **A robe in place of the quilted arming coat** *(decided)*: wrapped closed across the chest,
     the left panel over the right in a deep V to the sash, sleeves cut wide to the forearm, and
     skirts split at the sides falling to mid-calf over the tall boots. Faded madder, so the
     mercenary's colour is kept on the Duelist *(v1)*. "Almost" samurai: a cut, not a costume; no
     armour lacing, no topknot.
   - A wide sash in the half-cloak's slate-black, wound twice *(v1)*.
   - The sword-arm vambrace, the dueling blade, the hair and beard stay.
8. **Sellsword** *(reading: variant B; Kranti wrote "Duelist go with B" a second time, and the only
   B whose red base "carried forward from the original" is Sellsword B)*:
   - A sleeveless buff-leather coat buckled in brass down the front over the arming coat, a
     spaulder on **both** shoulders, and a purse at the belt (variant B `buffJerkin`, `spaulder`,
     `purse`).
   - **The madder base turned black** *(decided)*: the arming coat and the sash dyed a charcoal
     black, never pure black (guideline Palette), so the buff coat carries the figure.
   - The blade, vambrace, hair and beard stay.

### §B. Rules every look keeps (the bake)

9. **One rig, one build.** A look is a re-dress of its class's builder (`knight(look)`,
   `wizard(look)`, `archer(look)`, `mercenary(look)`: an optional look argument, no look being
   today's figure byte for byte). Same rig, proportions, height, sheet scale (1.5x, ADR-0076),
   trim and anchor. Every clip the class sheet has, the look's sheet has: `idle`, `walk`, `run`,
   `attack`, `walk_attack`, `backpedal_attack`, `death`, and the mercenary's `parry`; the
   Berserker adds its off-hand clips (§D).
10. **The back reads in a dark room.** For every look, the mean luminance of the opaque pixels of
    its back-facing (`n`) idle frame is no lower than the darkest of today's four class sheets'
    own `n` idle frames *(v1 — reason: a floor Kranti already approved, measured the same way;
    the guideline's dark-room rule had no number)*. Checked by a bake test against the baked
    sheets.
11. **Every clip passes the guards.** Each look's sheet passes the leg-clearance and the
    cloak-clearance guards (`characters/clearance.js`) on **every** pose of **every** clip the
    guards hold, the off-hand clips included, not only idle. No look is added to
    `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. A garment over the legs is a `skirt` with `legs(...,
    { under })`; a panel over a garment is cut with `skirt({ over })`; a cloak or half-cloak
    hangs on cloak bones.
12. **The contact sheet gate.** Kranti approves a contact sheet of each look, beside its base
    class, every clip × 8 directions at game scale, plus a dark-room strip (each look's back on
    the run's darkest floor under the run's ambient), before the look's sheet ships. Tweaks he
    asks for are made in the same work. Art calls (tones, sizes, cuts) are Claude's within this
    FS.
13. **Built, never sourced** (ADR-0021). The `/variants` builders are ported into the real
    builders (`cast.js`, a per-class looks module beside it, `fabrics.js`, `gear.js`), cleaned
    up, and never committed from the variants worktrees.
14. **The faces rule holds.** Every bare human head is `head()` with `face()`, the shared face; a
    look is told by hair, beard, gear and colour only.
15. **Sheets and groups are named by class and spec.** Sheet `char_<base>_<spec>`, packed alone in
    group `<base>_<spec>`, where `<base>` is the class's sheet stem (`knight`, `wizard`,
    `archer`, `mercenary`) and `<spec>` FS-E1ZDG's id: `char_knight_guardian`,
    `char_knight_berserker`, `char_wizard_spellwarden`, `char_wizard_pyromancer`,
    `char_archer_hunter`, `char_archer_shadow_ranger`, `char_mercenary_duelist`,
    `char_mercenary_sellsword`. The base class sheets and groups do not change.

### §C. How a look reaches the screen (game-client)

16. **The look follows the body's specialization.** Every player body drawn in a world (town,
    fields, runs; the player's own and every other player's) draws its spec look's sheet when its
    state entry (`current_player`, `other_players[]`) carries a `specialization` (FS-E1ZDG §B.9,
    I-E1ZDG-2) whose look is baked. No specialization, an id the client does not know, or a look
    not yet baked: the base class sheet, as today.
17. **The sheet rule is one function.** The class → sheet rule (`characterSheet` in
    `src/render/art/animationSelect.ts`) takes the specialization too, so a scene, the dev
    gallery and the tests resolve a body's sheet in one place.
18. **Each look is its own on-demand group** *(v1, the ADR-0071/0081 pattern)*. No spec-look group
    is resident or in any scene's preload set, so a game with no specialized player holds no
    spec-look art.
19. **What fetches it.** A world scene fetches a look's group, on its own loader while it runs, the
    first time a snapshot carries a player with that specialization, whether or not that body is
    in sight. Two players with one look are one fetch.
20. **The player's own look preloads.** A world scene's `preload()` also queues the group of the
    player's own specialization when the selected character's read carries one (FS-E1ZDG §B.6;
    app state, `gameStore`'s active character, read by the world itself, never through the
    UiBridge *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed
    upstream)*),
    so the player's own figure is never a stand-in after the boot bar. A specialization the read
    did not carry (a pick applied since) falls back to R19.
21. **The stand-in is the base class sheet.** Until a look's group is in, its body draws its base
    class sheet (resident), untinted, never the placeholder and never nothing, and logs no
    placeholder warning. When every page has landed and its frames are registered, each such body
    is re-dressed on its own sprite with a new animator for the look's sheet, between one frame
    and the next (ADR-0071 Decision 3's swap), keeping its facing and its current clip's place.
22. **A body whose specialization appears mid-scene** (FS-8RZ51's spend applied to the character
    in play) is re-dressed the same way once the look's group is in.
23. **Eviction is ADR-0059's.** A spec-look group is scene-scoped: the next scene's completed
    preload evicts it, animations first, unless that scene holds it (R20). A floor change keeps
    it.
24. **A failed fetch** leaves the base look for the rest of that scene, with one warning and no
    retry until a later scene sees that specialization again (ADR-0071 Decision 5). A fetch is
    called off with its scene.
25. **Menus and party busts stay on the base look** *(v1)*: the main menu's hero, the character
    list, character creation and the party frames' busts draw the class sheet as today. The title
    beside them is FS-E1ZDG's. The party frames live in `UIScene`, which outlives every world
    scene, so a bust on a scene-scoped spec-look group would hold its frame across scenes
    (ADR-0059 Decision 5); spec busts need their own decision. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*
26. **The scene art table names every look.** `sceneArt.ts` gains one row per look (group, the
    class and spec that fetch it, the base class as stand-in) beside `ON_DEMAND_ART`, and the
    coverage test holds each look's stand-in to a resident group. A look not yet in the manifest
    resolves to its base (R16), so the table may list all eight before any is baked.
27. **Memory.** Estimates from today's manifest, to be re-measured when the looks are baked: a
    look's group costs about what its class's does (the knight's 45.4 MB, the archer's 41.1, the
    wizard's 32.9, the mercenary's 45.0 decoded), the Berserker's about 1.5x the knight's with its
    off-hand clips (about 70 MB), and all eight about 370 MB. A party of four can hold at most four
    looks in a run; the town, with many players, can hold all eight. Accepted for v1; the browser
    check records the measured figures.

### §D. The Berserker's alternate-hand swing (game-client and the bake)

28. **Off-hand clips are baked, not flipped.** The Berserker's sheet carries `attack_offhand`,
    `walk_attack_offhand` and `backpedal_attack_offhand`: its attack's upper-body keys mirrored
    left for right at bake time (`clips.js` `mirror`), over the same legs as the right-hand clip,
    lit by the bake as every clip. Never a runtime sprite flip, which would put the baked key light
    on the wrong side. Same keys, fps and strike key as the right-hand clips.
29. **Successive swings swap hand.** On a sheet that carries `attack_offhand`, each attack the
    animator plays uses the other hand from the one before: right first after the animator is
    built, then left, then right. Every attack clip alternates: the left-click slash, the charge
    (played whole as `attack`, FS-3V7GC R6), and the tree ability's attack (FS-04EEA). The
    walking and backpedalling variants pick the same hand as the swing they belong to.
30. **Client presentation only.** No server change: the server's slash, its cooldown, its arc and
    its damage are FS-E1ZDG §D's. Each client alternates each body on its own, so two players may
    see one Berserker's swing on different hands (accepted).

### §E. The always-on auras (game-client)

31. **An aura** is a quiet loop of particles over one body, on for as long as that body is drawn
    alive. It is not a shimmer (a one-shot under 1200 ms) and does not count toward a shimmer's
    rules. Two exist, each tied to a specialization: the Spellwarden's **ward** and the Shadow
    Ranger's **gloom**. Built on the shimmer's glint drawing (`ShimmerFx`, `glitter.ts`
    `drawGlint`, the baked `fx_glint` and `fx_mote`), never on a new baked texture.
32. **The ward** *(decided: the heal shimmer, dimmer, dark-blue and white, shield-like)*: glints in
    `necrotic` with `vellum` centres *(v1 tokens — reason: the ramp has no truer blue; a new token
    is a palette change)*, winking slowly on a faint shell round the figure (an ellipse a little
    wider than the shoulders, from the shins to just over the crown), so they trace a shield
    rather than scatter over the body. Dimmer than the heal: alpha at most about half the heal
    glint's, a wink every 400 to 700 ms, at most 6 alive *(v1, tuned at the contact sheet)*. No
    light on the light-map and no feet glow *(v1 — reason: "dimmer", and cheap)*.
33. **The gloom** *(decided: the heal shimmer's glimmer particles without the shine or the light)*:
    motes in `umbra`, with no hot centre, no glow sprite and no light, rising a little off the
    figure and sinking back as they fade, never bright. At most 8 alive *(v1)*. It reads by hue,
    as the Shadow Shot does.
34. **Cheap enough for every body.** Per body: at most the counts above alive, drawn from a pool
    built once per body, with no per-frame allocation, no light and no tween that yoyos. Built
    when the body is first drawn with that specialization, torn down with the body, the scene, or
    `forget()`. Sorted with the body's depth, part in front and part behind (as the granted
    shimmer). Drawn in the world, under the light-map, so a dark room dims it as it dims the body.
35. **It follows the body.** It moves with the body's drawn feet each frame, hides when the body
    is hidden (fog, an indoor blackout, out of interest), stops during the death clip and while
    the body is dead, and starts again when the body is alive and drawn (a field respawn).
36. **Reduced motion.** Under `prefers-reduced-motion` an aura keeps a few still glints at a lower
    alpha and drops the winking and drift.
37. **Shimmers still play over an aura.** A heal shimmer on a Spellwarden plays in full; neither
    cuts the other short.
38. **The dev gallery** carries a card for each aura (on the baked mage and archer), per the
    tracked `effects` family.

### §F. Heavy Shot, and the shadow only on a Shadow Ranger (game-client; changes FS-JTNPR)

39. **A Shadow Ranger's right-click** keeps today's Shadow Shot look (FS-JTNPR R20–R23): the umbra
    release, the pitch halo and umbra gloom in flight, the umbra wake and impact.
40. **Every other archer's** (no specialization, or Hunter) right-click is the plain **Heavy Shot**
    *(decided)*: the same slow bolt (the baked `fx_arrow` at bow height) with no umbra, no pitch
    halo and no light, a harder string-snap and a burst of fibre and dust at the bow, a thicker
    pale wake that hangs a little longer than the arrow's air-streak, and a heavier thud of dust
    and splinters where it lands. Vellum and barrow brown only. Ported from the variant round's
    `PLAIN_SHOT` entries (release, trail, impact) into the effects table.
41. **Which look a bolt flies.** The release is the player's own (the own `CastSkill`), so it
    follows the player's own specialization. A `shadow_shot` projectile in flight carries no
    shooter on the wire, so the client attributes it at its first sighting to the nearest archer
    body within 48 world px of where it is first seen *(v1 — reason: no server change; the bolt is
    first seen within a tick of the bow)*: a Shadow Ranger's flies the Shadow Shot, any other's,
    or one no archer is near, the Heavy Shot. A bolt keeps the look it was given for its whole
    flight. A server field naming the shooter or the shot is out of scope (Out of Scope).
42. **The aim line** (FS-JTNPR R11, R22) is drawn in umbra only for a Shadow Ranger; every other
    archer's is drawn in `vellumDark` with a `vellum` glow-up *(v1 — reason: the umbra arrow is
    part of the shadow look)*.
43. **Sound is unchanged** *(v1)*: both shots keep today's Shadow Shot sounds.
44. **The dev gallery** carries a Heavy Shot card beside the Shadow Shot's.

### §G. The design guideline (game-client/docs/design-guideline.md, Part I)

45. The guideline is amended, attributed to the owner's pick of 2026-11-21 (FS-1J1CB), so these
    looks are rules, not exceptions:
    - *Characters / Enemies*: a **Specializations** clause: each specialization re-dresses its
      class on the same rig, build, clips and scale; the class still reads at a glance; the eight
      looks as §A states them, in a sentence or two each.
    - **Knight**: "mail, never plate" and the conical nasal helm stay the warrior's and the
      Guardian's body; the Guardian's head is the flat-topped great helm, the Berserker goes
      unhelmed with the coif down, carries a bearded axe in each hand, and has no shield.
    - **Archer**: the cowl and the Nightwood green are the archer's and the Shadow Ranger's (dyed
      to soot-black); the Hunter wears no hood and no green.
    - **Mage**: a spec's focus may be about 1.5x the sceptre, still no staff; the Pyromancer's
      scapular is scorched oxblood, not teal.
    - **Mercenary**: the Duelist wears a wrapped robe and a half-cloak on the off shoulder (a
      half-cloak is not the archer's hood and cloak); the Sellsword's madder is dyed black under a
      buff coat.
    - **Off-hand clips** (with the attack rules): a dual-wielder's off-hand attack is baked from
      the mirrored keys, never flipped at runtime.
    - **The dark-room floor** (R10) under *Legs stay inside the garment* or beside the archer's
      dark-room note: no figure's back reads darker than the darkest approved class's.
    - *Palette*: **umbra** is the Shadow Shot and the Shadow Ranger's gloom (and the whisper's
      text exception); **fire's ramp** may also be baked into a body as embers and a flame on the
      Pyromancer, never marking an interactable.
    - *Shimmers*: an **Auras** subsection after it: a body's loop for a held specialization, not a
      shimmer, the ward and the gloom as §E states them, no light, under the light-map.
46. Nothing in Part II (web UI) changes.

### §H. Review

47. **The styling-only rule does not apply to this FS.** It carries behaviour: the sheet rule by
    specialization, on-demand loading and the swap, the alternate-hand clip choice, the auras'
    lifecycle, and the shot's attribution. Tests run and `/code-review` applies to every slice.
    A pure bake slice is verified by the bake's guards, the manifest tests and the contact sheet.

### §I. Placement under the UI scene (ADR-0084–0086)

*(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*

48. **Everything this FS draws stays in the world scenes**, by ADR-0086's rules: the bodies and
    their sheets, the swap and the off-hand swing follow a world object (Decision 2.1); the ward,
    the gloom, Heavy Shot, the Shadow Shot and the aim line are world effects (2.1, 2.2). None is
    added to `UIScene`, and nothing crosses the UiBridge for them: each world reads the
    specialization from its own game state. The right-click's release is a world-play message and
    stays the world's (ADR-0085 Decision 1). The only interface pieces the looks meet are the
    party busts (R25, base look) and the ability's name (FS-E1ZDG's), both unchanged here.

## User Stories

1. As a level-20 character, I want my figure to change when I specialize, so that I look like what
   I became.
2. As a player in town, I want to tell a Guardian from a Berserker at a glance, so that I know what
   the warriors around me chose.
3. As a party member, I want to see each teammate's spec in their figure, so that I can read the
   party before the fight starts.
4. As a Guardian, I want a closed great helm, a bone surcoat with the house cross and a larger,
   handsomer shield, so that I look like the wall the party stands behind.
5. As a Berserker, I want to go bareheaded in torn kit with an axe in each hand, so that I look as
   reckless as I play.
6. As a Berserker, I want my swings to alternate between my two axes, so that the dual wield is
   real, not a prop.
7. As a Berserker, I want each axe held edge forward, so that the weapon reads as an axe.
8. As a Spellwarden, I want iron on my shoulders and throat, an iron-bound tome and a larger ward
   focus, so that I read as the mage who endures.
9. As a Spellwarden, I want a faint ward always on me, so that my Arcane Ward is something others
   can see.
10. As a Pyromancer, I want a scorched scapular, a singed hem with embers that move as I walk, and a
    larger fire focus, so that I read as fire.
11. As a Hunter, I want a wolf pelt, wild hide and feather and no hood, so that I look like a
    hunter of the wilds, not a shadow.
12. As a Shadow Ranger, I want to go black from cowl to boots, so that the shadow is mine.
13. As a Shadow Ranger, I want my back to stay visible on a dark floor, so that my teammates can
    still find me.
14. As a Shadow Ranger, I want a faint gloom always on me, so that I carry the shadow I shoot.
15. As a Shadow Ranger, I want my right-click to keep its shadow, so that the shot feels earned.
16. As a Hunter or an unspecialized archer, I want a plain heavy shot with no shadow, so that the
    shadow means Shadow Ranger.
17. As a Hunter, I want no umbra aim arrow, so that nothing of the shadow look is mine.
18. As a Duelist, I want a wrapped robe and a half-cloak on my off shoulder, so that I read as a
    fencer.
19. As a Sellsword, I want a buff coat over black, with steel on both shoulders and a purse, so
    that I read as a paid professional.
20. As a player whose teammate's look is still downloading, I want to see their class figure
    meanwhile, so that no one vanishes or turns into a placeholder.
21. As a player, I want my own spec look ready when I arrive in a world, so that I never see
    myself as the old figure.
22. As a player who just picked a specialization in town, I want my figure to change once the pick
    takes effect, so that the moment lands.
23. As a player in a crowded town, I want the auras to stay quiet, so that the screen stays
    readable.
24. As a player who prefers reduced motion, I want the auras still, so that nothing winks at me
    endlessly.
25. As a player on a weak machine, I want looks fetched only when someone wears them, so that a
    game with no specialized players costs no more memory.
26. As Kranti, I want to approve each look from a contact sheet before it ships, so that the art
    stays my game's.
27. As Kranti, I want every look's every clip to pass the leg and cloak guards, so that no leg or
    boot ever shows through cloth.
28. As a developer, I want one function to resolve a body's sheet by class and spec, so that
    scenes and tests cannot disagree.
29. As a developer, I want the guideline to state each look, so that a later change starts from
    the rule, not from the code.
30. As a developer, I want the looks to be re-dresses of the class builders, so that a fix to a
    class body reaches its looks.

## Acceptance Criteria

**The bake**

- [ ] The manifest carries the eight sheets of R15, each alone in its group, at 1.5x, with every
      clip of its base sheet; the Berserker's also has `attack_offhand`, `walk_attack_offhand`
      and `backpedal_attack_offhand`, with the right-hand clips' frame counts and fps.
- [ ] Every look's sheet passes the leg- and cloak-clearance guards on every guarded pose of every
      clip; `KNOWN_CLIPPING` and `MIRRORED_LEGACY` gain no entry.
- [ ] The base class sheets are unchanged (a builder called with no look bakes today's figure).
- [ ] A bake test holds every look's `n` idle frame to R10's luminance floor.
- [ ] A bake test on the Berserker's rig: in the idle carry each axe's edge points forward and not
      up, and at the strike key the edge leads the head's motion, in both hands' clips.
- [ ] The Pyromancer's embers are in the gown's texture, not meshes on a body bone.
- [ ] The Duelist's half-cloak hangs on cloak bones and passes the cloak guard.
- [ ] No raw colour: every new tone is a `BARROW` token or a blend of tokens.
- [ ] Kranti approved each class's contact sheet (both looks beside the base, every clip × 8
      directions, plus the dark-room strip).

**On screen**

- [ ] A body whose state carries a specialization with a baked look draws that look in town,
      fields and runs, for the player's own body and every other player's.
- [ ] No specialization, an unknown id, or an unbaked look draws the base class sheet.
- [ ] A game with no specialized player fetches no spec-look group.
- [ ] A snapshot first listing another player's spec fetches that look's group once, and the body
      draws the base sheet untinted until it lands, then is re-dressed without disappearing.
- [ ] A world scene entered by a character whose read carries a spec has that look's group in its
      preload.
- [ ] A failed fetch leaves the base look with one warning and no retry in that scene.
- [ ] Leaving the scene evicts the spec-look groups the next scene does not hold, animations first.
- [ ] The coverage test passes with a row for each of the eight looks.
- [ ] The main menu, character list, character creation and party busts draw the base sheet.

**Berserker swing**

- [ ] Three successive attacks on a Berserker body play right, left, right; walking and
      backpedalling attacks pick the matching off-hand clip.
- [ ] A body on a sheet without `attack_offhand` always plays `attack`, as today.

**Auras**

- [ ] A Spellwarden body draws the ward and a Shadow Ranger body the gloom, in every world; no
      other body draws either.
- [ ] Each aura stays within its alive cap, adds no light to the light-map, and allocates nothing
      per frame after it is built (a pooled-object test).
- [ ] The aura hides with its body, stops on death and resumes on respawn.
- [ ] Under reduced motion the aura holds still at a lower alpha.
- [ ] A heal shimmer on a Spellwarden plays in full over the ward.
- [ ] The gallery shows both auras; Kranti approved them from a contact sheet.

**Shots**

- [ ] A Shadow Ranger's release, flight, impact and aim line are FS-JTNPR's.
- [ ] An unspecialized archer's and a Hunter's release, flight and impact are Heavy Shot's, with no
      umbra token, no pitch halo and no light; their aim line is vellum.
- [ ] Another player's bolt first seen within 48 px of a Shadow Ranger flies the Shadow Shot; of
      any other archer, or of none, the Heavy Shot.
- [ ] The gallery shows Heavy Shot; Kranti approved it beside the Shadow Shot.

**Guideline and checks**

- [ ] `design-guideline.md` Part I carries §G's amendments, attributed to the owner's pick of
      2026-11-21 (FS-1J1CB); Part II is unchanged.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Edge States

- **No specialization:** the base class sheet, no aura, the Heavy Shot for an archer.
- **Specialization not yet on the wire** (I-E1ZDG-2 not shipped): every body is the base look;
  nothing in this FS fails.
- **A look not yet baked** (one class's slice shipped before another's): that spec draws its base,
  no fetch is made for a group the manifest lacks.
- **Download slow:** the base look stands in; on a slow connection a whole fight may be seen as the
  base. Never the placeholder, never nothing.
- **Download fails:** base look for the rest of the scene, one warning, no retry.
- **Scene stopped mid-download:** the fetch is called off; nothing lands on the next scene.
- **Pick applied mid-scene:** the body is re-dressed once the group is in; the aura starts with the
  new look.
- **Eight different looks in town at once:** all eight are fetched; memory as R27.
- **Many auras on screen:** each body within its cap; no global cap in v1.
- **A Berserker attack cut short** by another attack: the next swing still takes the other hand.
- **A Berserker seen from mid-session:** the first swing this client sees is the right hand.
- **Two archers side by side, one a Shadow Ranger:** a bolt is given to the nearer; a wrong pick is
  cosmetic.
- **A bolt first seen far from any archer** (entering the interest radius mid-flight): Heavy Shot.
- **A body in fog, indoors under blackout, or dead:** its aura is hidden or stopped with it.
- **Reduced motion:** still auras; the swings and shots are unchanged.
- **The dev test room:** looks and auras behave as in any world.

## Out of Scope

- The specializations themselves, their effects, titles and the wire field: FS-E1ZDG.
- The pick and when it takes effect: FS-8RZ51, ADR-0082.
- Spec looks in the main menu, the character list, character creation and the party busts (v1
  draws the base there).
- Any server change: no shooter or shot kind on a projectile, no hand on a swing.
- New sounds for Heavy Shot or the auras.
- Gear changing the figure (worn armour visuals); this FS changes the look by specialization only.
- A full staff for either mage spec; a new palette token for the ward.
- A global aura budget or culling auras outside the camera.
- Recording the ADR (§C) and the vocabulary (domain-model): named here, done by their owners.

## Change: Looks v2: more drastic, more different
Status: work-order
Date: 2026-11-22

> Anchored here: this FS owns "Specialization looks" (`game-client/SPECIFICATION.md` "### Character"),
> and this change rewrites its §A looks, a value in R1, R3 and R4 each, and §G's guideline
> wording. The line is unchanged. Scoped and promoted under the owner's charter of 2026-11-22:
> every value below not quoted from him is a **charter default**, with its reason. Art calls inside
> each pick (tones, sizes, cuts) stay Claude's (R12), gated on the contact sheet.

The owner's words, on the eight baked looks (2026-11-22): "They need to be more different. The
weapons need to change more. Just don't give me variants. Just improve them further. The current
designs are good, but make them more drastic, more different. Enhance the details more. In the
future, we're going to be building upon that and adding more variety in the specialization tree.
So keep that in mind."

### Facts this change rests on

- The eight looks are baked as §A states them (I-1J1CB-4 to -7), each a look object (`look.js`:
  `tones`, `mats`, `opts`, `omit`, `swap`, `bones`, `add`, `style`) over its class's builder in
  `cast.js`, authored in `warriorLooks.js`, `mageLooks.js`, `archerLooks.js` and `mercLooks.js`,
  each baked as its own `specRow` into its own group.
- Each spec's weapon today is close to its base's: the Guardian keeps the longsword; the
  Berserker's axes are one-handed at 0.36 H; both mage foci are the sceptre's carry at about 1.5x
  (`gear.js` `wardFocus`, `fireFocus`, `FOCUS_TOP`, `FOCUS_BUTT`); both archers carry the class's
  longbow; the Duelist and the Sellsword carry the mercenary's knuckle-bowed dueling sword.
- The dark-room floor (R10) measured on today's four class sheets is **0.0222** (mean relative
  luminance of the darkest class back's opaque `n` idle pixels, `lib/darkRoom.mjs`).
- The contact tool (`lib/contact.mjs`) already composes each class's looks beside the base
  (`lookSets`, `composeLooks`), a ×2 sheet per sheet, and the dark-room strip (`composeDarkRoom`).
- `CONTEXT.md` already defines **Silhouette** (a player's outline drawn through a building). To keep
  that term clean, this change calls the owner's "black silhouette" test the look's **outline in a
  black fill**, and its contact-sheet row the **outline strip**.

### Requirements

**§J. The bar**

49. **Identity kept, pushed much further** *(charter default — reason: the owner's "the current
    designs are good ... just improve them further", "don't give me variants")*. Each look keeps
    the pieces §A names as its identity (the Guardian's great helm and surcoat, the Berserker's
    bare head and torn cloak, the Spellwarden's iron, the Pyromancer's scorch and singed hem, the
    Hunter's pelt and bare head, the Shadow Ranger's soot, the Duelist's robe and half-cloak, the
    Sellsword's buff coat over black), and enlarges, re-cuts and layers them. No look is replaced
    by another design, and no `/variants` round is run.
50. **Outline first** *(charter default — reason: the owner's "more different"; a dye or a trim
    alone disappears in a black fill)*. At game scale (1x screen px), each look's outline in a
    black fill, in the idle and at the attack's strike key in all 8 facings, reads as a different
    figure from its base class AND from its sibling spec. To get there, each look differs from each of
    the other two in at least two of the outline's parts: the head, the shoulder line, the
    weapon, the hem or cloak line. The owner judges it on the outline strip (R70).
51. **The outline is measured and logged, not gated** *(charter default — reason: no approved
    number exists yet; the logged figures are what a later floor would be set from)*. The bake
    logs, for each look, the fraction of differing opaque pixels against its base and against its
    sibling: the two idle frames' opaque masks laid on one anchor and XORed, over the `n`, `e`,
    `s` and `w` facings, divided by their union.
52. **Then the weapon, then the detail.** A detail never costs the outline: a strap, trim or pouch
    that softens a cut the outline relies on is moved or dropped.

**§K. The weapons**

53. **Every spec's weapon or focus changes**, and is clearly unlike its base's and its sibling's
    in outline at game scale. The picks below are the charter's. The baking slice may refine a
    pick's shape, size and tone, and may not drop the pick.
54. **Guardian:** a **flanged mace** in the right hand in place of the longsword: an iron haft,
    a leather grip and a pommel knob, and a head of flanges standing clear of the haft, so it reads
    as a mace and never as a sword. It is shorter than the longsword *(charter default — reason: a
    one-handed mace, so the shield carries the outline)*. The **kite shield is bigger again**,
    about 1.3x the knight's in height and width *(charter default — reason: "bigger again" over
    R1's 1.15x; refined at the contact sheet)*. It keeps its iron boss, the house cross
    counterchanged over the per-pale field and the brass border. Shield and mace are carried and
    swung in the knight's compact cut behind the raised shield.
55. **Berserker:** the two bearded axes kept and made **heavier**: hafts about 1.3x today's
    (0.36 H → about 0.47 H) *(charter default — reason: "longer hafts"; refined at the contact
    sheet)*, a broader bit and beard, and the grip **wrapped** in cord to a pommel knob. Each edge
    faces **forward and down** in the carry and **leads** the swing in both hands' clips (R2, the
    owner's earlier fix; `axe.test.mjs` holds the new head, with `AXE_EDGE_TURN` re-set if the
    beard's sweep changes). The hands still alternate (R28, R29 unchanged).
56. **Spellwarden:** an **iron-shod warding staff** in the right hand in place of the ward focus.
    It is a staff taller than her crown, with an iron shoe at the foot and, at its head, an iron
    **cage** round the ward stone (bars closing over it, not R3's open ring). The stone keeps R3's
    tone (`necrotic` toward `vellum`, low, glowing with the clip). The iron-bound tome moves **to
    the left hip**, hung from the belt (rigid on the hips, clear of the gown's swing), so the left
    hand is free and opens in the cast as the guideline's thrust has it. **This bends the
    guideline's "no staff" for the Spellwarden only** (R66). The wizard and the Pyromancer still
    carry no staff.
57. **Pyromancer:** a **brazier-headed rod** in place of the fire focus: a short haft, about the
    sceptre's length, under a large open **fire cage**, an iron brazier of bars about twice the
    width of today's cage *(charter default — reason: short and top-heavy, so her outline is the
    opposite of the Spellwarden's tall staff)*, holding coals and a larger upright tongue of flame
    (kept upright in the world in every pose, the existing hook). Fire's ramp only.
58. **Hunter:** a **heavy recurve hunting bow** in the left hand in place of the longbow: shorter
    than the longbow, with thicker limbs, tips curling away from her and horn-capped (R5), and a
    leather grip wrap. The live string and the draw are kept (`cast.js` `bowInHand`, `draw.js`
    `drawGrip` / `solveDraw`), with the nock points taken from the recurve. A **skinning knife** in
    a leather sheath rides the belt, clear of the draw and of the bow hand's carry.
59. **Shadow Ranger:** a **slimmer blackened longbow**: the longbow's length, thinner limbs, the
    wood blackened and the string darker than the base's, both in token mixes. A **hooded
    quiver**: a leather hood over its mouth, so the fletching shows only as a dark edge under it,
    unlike the Hunter's high goose fletching. The quiver still rides over the cloak, never sunk
    into it. If the hood darkens the back, it is lifted toward slate as R6's soot is, until R65
    holds.
60. **Duelist:** a **long-hilted curved single-edged blade** in place of the knuckle-bowed dueling
    sword, to match the robe: a wrapped grip about two fists long, a plain round iron guard in
    place of the cross and knuckle-bow, and a blade of even, shallow curve to a clean point. It is
    still swung one-handed in the mercenary's wide cut, the hilt's butt clear of the forearm. The
    empty scabbard at the hip is re-cut to the blade. "Almost" samurai (R7) holds: a plain guard,
    no ornament.
61. **Sellsword:** a **broad falchion**: a heavy, wide single-edged blade swelling toward a clipped
    point, with a plain cross and a longer grip, so it looks like a two-handed weapon. He carries
    and swings it one-handed in the mercenary's cut. The scabbard is re-cut to it. The coin purse
    stays.
62. **Every weapon stays inside its class's clips.** Same clips, keys, fps and strike key (7 keys
    at 12 fps, the strike at key 3). Where a weapon's length breaks a pose (a haft through a
    thigh, a staff's foot through the ground, a head through her head, the shield through the
    front knee), the **look's** grip or hold is re-keyed in a look style beside the class's (as
    `BERSERKER_STYLE` and `FOCUS_STYLE` are), never by editing the class's style. The base clips
    keep their bytes. The motion tests that hold a weapon clear (`classMotion.test.mjs`'s blade
    points against the shield and the head; `axe.test.mjs`) hold for each new weapon too.

**§L. The detail**

63. **Layered detail on every look** *(charter default — reason: the owner's "enhance the details
    more")*. Each look gains:
    - **trims**: edge bindings and contrasting hem or cuff bands;
    - **straps and buckles** where a garment or a piece of gear hangs (the shield's guige, the
      tome's hanger, the quiver's strap, the purse and knife on the belt);
    - **wear and dirt in the fabrics**: each look's cloths and metals carry their own `dirt`,
      `rust` and `dents` and their own seeds in `fabrics.js`, never the base's texture reused at a
      new tone;
    - **per-spec material contrast**: the two siblings differ in surface as well as outline
      (metal against cloth, matte against sheen, light against dark).
64. **Tokens only.** Every new tone is a `BARROW` token or a mix or shade of tokens (`palette.js`
    `mix`, `shade`). No raw colour, and no new palette token.

**§M. What holds**

65. **The guards and the floor hold on every look.** Every look passes the leg- and cloak-clearance
    guards on every guarded pose of every clip, the Berserker's off-hand clips included (R11). No
    look is added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. Each look's `n` idle back is no darker
    than the dark-room floor, 0.0222 (R10).
66. **Base and other atlases are byte-identical.** `char_knight_base`, `char_wizard_base`,
    `char_archer_base`, `char_mercenary_base` and every atlas outside the eight look groups keep
    their bytes. Only the rebaked class's look pages and the manifest's entries for them change.
67. **Each look is still its own on-demand group** (ADR-0088). Sheet and group names (R15), the
    manifest's format, the scene art rows (R26) and §C's loading are unchanged. A look's frame box
    may grow (a staff, a larger shield); the memory is re-measured at the browser check (R27).

**§N. Built to grow**

68. **A class kit, and looks composed from it** *(charter default — reason: the owner's "we're
    going to be building upon that and adding more variety in the specialization tree")*. Each
    class's looks module opens with that class's **kit**: its shared trims (bindings, straps,
    buckles, rivet rows, the wear settings) and its spec weapons (the warrior's mace, heavy axe
    and shield options; the mage's staff and brazier rod; the archer's recurve, slim longbow,
    knife and hooded quiver; the mercenary's long-hilted blade and falchion). Each spec look is a
    look object (`look.js`) composed from kit pieces. A future third or fourth look for a class
    is then one more look object in that module, one more id in `cast.js` `SPEC_LOOKS` (FS-E1ZDG's)
    and one more `specRow`, with no change to the kit's existing pieces or to `look.js`.
69. **Where gear lives.** A weapon only spec looks use is built in its class's kit. `gear.js` keeps
    what a base figure uses or two classes share (`inHand`, `spaulder`, `limbGuard`, `tome`, the
    base weapons). Today's spec-only builders (`beardedAxe`, `wardFocus`, `fireFocus` and their
    constants) move into their class kits as each class is rebaked. A module that grows past about
    400 lines splits its kit into `<class>Kit.js` beside it.

**§O. The gate and the guideline**

70. **One contact sheet per class** (R12), approved by Kranti before that class's slice closes:
    both looks beside the base, every clip × 8 facings at game scale, the ×2 sheet per look, the
    dark-room strip, and the new **outline strip**. The outline strip shows each look, its base
    and its sibling as black fills on one anchor at game scale, idle and strike key × 8 facings,
    with R51's logged figures under it. Tweaks he asks for are made in the same slice.
71. **The guideline (Part I) is amended**, attributed to the owner's charter of 2026-11-22
    (FS-1J1CB §Change: Looks v2). Each class's slice updates its own lines:
    - *Specializations* clause: "changing only a few pieces (a helm, a coat, a weapon, a dye)"
      becomes a re-dress of outline, weapon and detail, so a look reads as a different figure
      from its base and its sibling in a black fill. The class still reads by its rig, build and
      motion and at least one class mark (the knight's mail, the archer's bow and cloak, the
      mage's gown, the mercenary's bare head and one-handed blade) *(charter default — reason: §A
      kept the class reading at a glance; v2 keeps it by the body, not the kit)*.
    - Each spec's bullet is restated for its v2 look and weapon.
    - **Knight**: the Guardian carries a flanged mace, not the longsword, and a larger shield; the
      Berserker's axes are long-hafted with wrapped grips.
    - **Mage**: "no staff" gains its one exception, the Spellwarden's iron-shod warding staff (her
      tome on the hip). The Pyromancer's focus is a short brazier rod. R45's "a spec's focus may be
      about 1.5x the sceptre, still no staff" is restated to match.
    - **Archer**: the Hunter's heavy recurve and skinning knife; the Shadow Ranger's slim black
      longbow and hooded quiver (her fletching under the hood, an exception to "its fletching over
      the right shoulder").
    - **Mercenary**: the Duelist's long-hilted curved blade with a round guard; the Sellsword's
      broad falchion. "His sword is a long, slender, curved dueling blade with a knuckle-bow" stays
      the base's.
72. **Superseded values.** For the looks they name, this change supersedes: R1's "about 1.15x"
    shield and "the ... longsword ... stay"; R3's "about 1.5x the sceptre's length, short of a
    staff", and its "open iron ring", and the Out of Scope line "A full staff for either mage spec"
    for the Spellwarden; R4's "about 1.5x the sceptre's length"; R5's "The bow ... stay"; R7's
    "the dueling blade ... stay"; R8's "The blade ... stay". Every other §A–§I requirement stands.
73. **Review** (R47 holds). Each rebake slice runs the bake's guards, the manifest tests and the
    bake tests, and goes through `/code-review` (the kit restructure is code). The owner's contact
    sheet is the art gate.

### Acceptance Criteria

**The bake (each class)**

- [ ] Both looks of the class are rebaked as R49–R63 state them, each with its charter weapon
      (R54–R61), in its own group under its R15 name, at 1.5x, with every clip of its base sheet
      (the Berserker's three off-hand clips too).
- [ ] The bake logs R51's outline figures for both looks against the base and the sibling.
- [ ] Both looks pass the leg- and cloak-clearance guards on every guarded pose of every clip;
      `KNOWN_CLIPPING` and `MIRRORED_LEGACY` gain no entry.
- [ ] Both looks' `n` idle backs are at or above the dark-room floor (0.0222).
- [ ] The class's base sheet and every atlas outside the rebaked look groups are byte-identical
      (`git diff --stat public/art/` lists only the class's look pages and `manifest.json`).
- [ ] The weapon-clearance motion tests hold for the new weapons: the Guardian's mace head clear
      of the shield and the head; the Berserker's axe edges forward and down in the carry and
      leading at the strike in both hands' clips; the Spellwarden's staff clear of her head, legs
      and the ground; the archers' strings follow the draw.
- [ ] Any re-keyed grip or hold is in a look style; the class's own style is unchanged.
- [ ] No raw colour; every new tone is a `BARROW` token, mix or shade.
- [ ] The class's looks module is a kit plus looks composed from it (R68); its spec-only weapon
      builders live in the kit (R69).
- [ ] The class's guideline lines carry R71's amendments.
- [ ] Kranti approved the class's contact sheet, outline strip included (R70).
- [ ] `npm test` and `npm run lint` pass.

**Across the change**

- [ ] All four classes' slices are done; all eight looks are v2.
- [ ] The manifest's sheet and group names, its format, the scene art rows and §C's loading are
      unchanged.
- [ ] Browser check: every v2 look in town and a run as I-1J1CB-11 walks it; the memory is
      re-measured and recorded (R27).
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

### Edge States

- **One class rebaked before the others:** its two looks are v2, the rest v1. Each look is its
  own group, so nothing else moves, and the slices run serially, so the manifest never conflicts.
- **A look's frame box grows** (the staff, the larger shield): only that look's frames and pages
  grow. The base and the anchor convention are untouched, and the stand-in swap (R21) still keeps
  the feet where they were.
- **The swap from stand-in to look** now changes the weapon too (a knight's sword becomes a mace,
  a sceptre becomes a staff) between one frame and the next (accepted, ADR-0088 Decision 4).
- **The staff's foot** in idle stays above the ground plane. In walk and run it is carried clear
  of the legs. A key that sinks it is re-keyed in the look style (R62).
- **A larger shield against the knee** in the walk or the cut: re-keyed in the look style, never
  by shrinking it below "bigger again".
- **The Berserker's longer hafts in the low carry** cross no thigh. If one does, the carry is
  re-keyed in `BERSERKER_STYLE`, and the mirrored off-hand clips follow (R28).
- **The Hunter's recurve is shorter:** the drawn arrow and Heavy Shot's runtime bolt are unchanged
  (out of scope). Only the string's rest and nock points move with the bow.
- **The hooded quiver darkens the Shadow Ranger's back:** lifted toward slate until the floor
  holds (R59).
- **The contact sheet is rejected:** tweaks in the same slice. The slice does not close, and the
  next class's slice stays blocked.
- **The outline figures look small** for a pair the owner approves: logged as they are. Only the
  owner's eye gates them (R51).
- **A future third spec per class:** one more look object, `SPEC_LOOKS` id and `specRow` (R68).
  Not built here.

### Out of Scope

- The auras (§E): the ward and the gloom are unchanged.
- Runtime effects: Heavy Shot, the Shadow Shot, the aim line, the shimmers, the swap (§C, §F).
- New specializations, or a third or fourth look per class (the structure allows one, R68).
- New clips, new attack styles beyond a look's grip and hold re-keys, new sounds.
- The base class looks, the menus and the party busts (R25: base look).
- Any server change; the manifest's format; ADR-0088's loading; new palette tokens.

### Integrated with FS-JS7C8, 2026-11-23

The class sprints (FS-JS7C8) merged onto this change on `integrate/class-sprint-into-main`. The
owner: 「如果有改武器就套用main的」, then 「Duelist 也改拖劍」. Looks v2's decisions it touched, each the
smallest change, recorded in full in FS-JS7C8's "Integrated with Looks v2" notes:

- The Spellwarden and the Pyromancer keep this change's carries, run carries and cast (R56, R57,
  R62), as clips.js `staffCast`; the sprint's lean, stride and fps apply.
- The Duelist (R60, R62): his run trails the long blade (the mercenary's sprint), the run wrist
  re-key dropped, the trailing arm out 0.45 past the longer half-cloak; the robe's `legFollow`
  0.5 → 0.8 so the sprint's knee drive stays inside it. His silhouette at rest is unchanged.
- The Shadow Ranger (R59, R65): her cloak's drag 0.36 → 0.46 so the sprint's heel kick stays inside
  it; her slim longbow's tip in the low ready stands over her cowl in n and ne by up to 0.030 H,
  escalated to the owner.
- The Berserker (R55): his heavy axes ride 0.32 rad higher at the wrist in the run only; his idle
  and walk carry is untouched, its lowest axe points (0.018 and 0.0017 H) left to the owner.
- The Guardian (R54): `GUARDIAN_SHIELD_LIFT` kept; his run is the knight's sprint.
- Every look's frame box is this change's, unchanged.

## Change: The wizard's sprint and pointed cast → FS-JS7C8

## Change: The knight's sprint, and the attack-on-the-move clips retired → FS-JS7C8
