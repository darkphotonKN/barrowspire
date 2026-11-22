// A specialization look (FS-1J1CB §B R9): one class's figure re-dressed on its own rig, build and
// clips. Each class builder in cast.js (`knight(look)`, `wizard(look)`, `archer(look)`,
// `mercenary(look)`) builds its figure as a run of named pieces through `dress`, and a look names
// the pieces it changes. No look, or `{}`, builds today's figure exactly: every piece takes its own
// material and options, in today's order.
//
// A look is a plain object; every key is optional:
//   tones(F, M)   fabric keys re-dyed for the whole figure, merged over `fabrics()` before any
//                 piece is built: { coat: charcoalWool } turns every piece cut from F.coat
//   mats(F, M)    one piece's material: { boots: soot } dyes the boots and nothing else cut
//                 from the same cloth
//   opts          options merged over one piece's own: { cloak: { length: 0.3, ragged } }. A
//                 garment worn over the legs (the hauberk, tunic, gown, coat) also draws the legs
//                 in under the merged cut, so a lengthened skirt keeps them inside it (R11)
//   omit          pieces left off: ["helm", "shield"]
//   swap          pieces built by the look instead: { helm: (rig, kit) => greatHelm(rig, kit.F) };
//                 `kit` is the builder's materials and measures, plus the piece's own `mat` and `o`
//   bones(rig, kit)  bones a look's own garment hangs on (a half-cloak's chain), added before any
//                 mesh is skinned
//   add(rig, kit) gear the base figure lacks, added after every base piece
//   style         the clips' style in place of the class's (the Berserker's carry and cut)
//
// The head and the face are never pieces: every bare human head is `head()` with `face()` (R14).
// A look that names a piece its builder lacks, or a key that is not one of the above, fails the
// bake, so a typo cannot silently bake today's figure under a spec's name.

const KEYS = ["tones", "mats", "opts", "omit", "swap", "bones", "add", "style"];

/**
 * Dresses one figure in `look` (or none). `kit` holds the builder's materials (`F`, `M`) and is
 * handed to the look's hooks; the builder adds its rig and measures to it as it goes.
 *
 * @returns {{ F: object, kit: object, opts: Function, mat: Function, piece: Function, bones: Function, finish: Function }}
 */
export function dress(look, { F: fabrics, M }) {
  const L = look ?? {};
  for (const k of Object.keys(L)) if (!KEYS.includes(k)) throw new Error(`look: no key "${k}" (one of ${KEYS.join(", ")})`);
  const F = L.tones ? { ...fabrics, ...L.tones(fabrics, M) } : fabrics;
  const mats = L.mats ? L.mats(F, M) : {};
  const kit = { F, M };
  const named = new Set();

  /** A piece's options: its own, with the look's for it merged over them. */
  const opts = (name, o) => {
    named.add(name);
    return L.opts?.[name] ? { ...o, ...L.opts[name] } : o;
  };
  /** A piece's material: its own, or the look's for it. */
  const mat = (name, m) => {
    named.add(name);
    return mats[name] ?? m;
  };
  /**
   * Builds the piece `name` as `build(mat, o)`, or the look's swap for it, or nothing when the look
   * omits it. Returns what was built.
   */
  const piece = (name, m, o, build) => {
    named.add(name);
    if (L.omit?.includes(name)) return undefined;
    const pm = mat(name, m);
    const po = opts(name, o);
    return L.swap?.[name] ? L.swap[name](kit.rig, { ...kit, mat: pm, o: po }) : build(pm, po);
  };
  /** The look's own bones, after the builder's and before any mesh. */
  const bones = (rig) => {
    kit.rig = rig;
    L.bones?.(rig, kit);
  };
  /** Adds the look's own gear and returns the figure; fails on a piece the builder never named. */
  const finish = (rig, style) => {
    kit.rig = rig;
    L.add?.(rig, kit);
    const asked = [...(L.omit ?? []), ...Object.keys(L.swap ?? {}), ...Object.keys(mats), ...Object.keys(L.opts ?? {})];
    const unknown = asked.filter((n) => !named.has(n));
    if (unknown.length) throw new Error(`look: no piece ${unknown.map((n) => `"${n}"`).join(", ")} on this figure (pieces: ${[...named].join(", ")})`);
    return { rig, style: L.style ?? style };
  };
  return { F, kit, opts, mat, piece, bones, finish };
}

/**
 * A garment's cut as `legs({ under })` draws the thighs in under it: its top, hem and radii, from
 * its `skirt` options (anatomy.js `underGarment`). Its hang over the legs (`legFollow`, `panels`,
 * `trail`, ...) is the skirt's own.
 */
export const cut = ({ top, bottom, rTop, rBottom }) => ({ top, bottom, rTop, rBottom });
