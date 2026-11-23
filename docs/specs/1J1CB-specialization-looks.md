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

## Change: The wizard's sprint and pointed cast → FS-JS7C8

## Change: The knight's sprint, and the attack-on-the-move clips retired → FS-JS7C8
