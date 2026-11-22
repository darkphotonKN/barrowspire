// A specialization look's shape (FS-1J1CB §B R9, look.js): the named pieces a class builder dresses
// its figure in, and how a look swaps, adds to, re-dyes or leaves them off.
import { describe, it, expect } from "vitest";
import { dress } from "./look.js";

const F = { coat: "coat", sash: "sash" };
const M = { brass: "brass" };
const rig = { name: "rig" };

/** A tiny figure: a coat and a sash, each a piece, built into `out`. */
function figure(look) {
  const out = [];
  const d = dress(look, { F, M });
  d.bones(rig);
  d.piece("coat", d.F.coat, { length: 1 }, (m, o) => out.push(["coat", m, o]));
  d.piece("sash", d.F.sash, {}, (m, o) => out.push(["sash", m, o]));
  const { style } = d.finish(rig, "base style");
  return { out, style };
}

describe("dress (look.js)", () => {
  it("builds every piece with its own material and options when there is no look, and `{}` alike", () => {
    const today = figure(undefined);
    expect(today.out).toEqual([
      ["coat", "coat", { length: 1 }],
      ["sash", "sash", {}],
    ]);
    expect(today.style).toBe("base style");
    expect(figure({})).toEqual(today);
    expect(figure(null)).toEqual(today);
  });

  it("re-dyes a fabric for the whole figure (tones) or one piece (mats)", () => {
    expect(figure({ tones: () => ({ coat: "black" }) }).out[0][1]).toBe("black");
    const one = figure({ mats: (f) => ({ sash: f.coat }) }).out;
    expect(one.map(([, m]) => m)).toEqual(["coat", "coat"]);
  });

  it("merges a look's options over a piece's own", () => {
    expect(figure({ opts: { coat: { ragged: true } } }).out[0][2]).toEqual({ length: 1, ragged: true });
  });

  it("leaves an omitted piece off and builds a swapped one by the look, with the kit", () => {
    const seen = [];
    const look = { omit: ["sash"], swap: { coat: (r, kit) => seen.push([r, kit.mat, kit.o, kit.M]) } };
    expect(figure(look).out).toEqual([]);
    expect(seen).toEqual([[rig, "coat", { length: 1 }, M]]);
  });

  it("adds the look's bones before and its gear after the base pieces, and its style", () => {
    const order = [];
    const d = dress({ bones: () => order.push("bones"), add: (r, kit) => order.push(["add", r, kit.F.coat]), style: "berserk" }, { F, M });
    d.bones(rig);
    d.piece("coat", F.coat, {}, () => order.push("coat"));
    expect(d.finish(rig, "base").style).toBe("berserk");
    expect(order).toEqual(["bones", "coat", ["add", rig, "coat"]]);
  });

  it("fails a look that names a piece the figure lacks, so a typo cannot bake today's figure", () => {
    expect(() => figure({ omit: ["sahs"] })).toThrow(/sahs/);
    expect(() => figure({ swap: { helm: () => {} } })).toThrow(/helm/);
    expect(() => figure({ opts: { cloak: {} } })).toThrow(/cloak/);
    expect(() => figure({ mats: () => ({ boots: "x" }) })).toThrow(/boots/);
  });

  it("fails a key that is not a look's", () => {
    expect(() => figure({ extra: () => {} })).toThrow(/no key "extra"/);
  });
});
