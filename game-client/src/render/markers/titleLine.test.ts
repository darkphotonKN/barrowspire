import { describe, expect, it } from "vitest";
import { MARKER_DEPTH } from "./markers";
import { NameplateTitle, TITLE_LINE_PX } from "./titleLine";

// FS-E1ZDG §K.41: a second, smaller line with the player's title under their name over their figure, drawn
// by each world (ADR-0086 2.1); no title, no line

interface FakeText {
  text: string;
  x: number;
  y: number;
  originY: number;
  height: number;
  visible: boolean;
  depth?: number;
  size?: string;
  destroyed: boolean;
}

function fakeText(text: string, style: { fontSize?: string } = {}, height = 10): FakeText & Record<string, unknown> {
  const t = {
    text,
    x: 0,
    y: 0,
    originY: 0.5,
    height,
    visible: true,
    size: style.fontSize,
    destroyed: false,
  } as FakeText & Record<string, unknown>;
  Object.assign(t, {
    setText: (s: string) => ((t.text = s), t),
    setPosition: (x: number, y: number) => ((t.x = x), (t.y = y), t),
    setY: (y: number) => ((t.y = y), t),
    setOrigin: (_x: number, y = _x) => ((t.originY = y), t),
    setDepth: (d: number) => ((t.depth = d), t),
    setVisible: (v: boolean) => ((t.visible = v), t),
    destroy: () => void (t.destroyed = true),
  });
  return t;
}

function stage() {
  const made: FakeText[] = [];
  const scene = {
    add: {
      text: (_x: number, _y: number, content: string, style: { fontSize?: string }) => {
        const t = fakeText(content, style);
        made.push(t);
        return t;
      },
    },
  };
  const live = () => made.filter((t) => !t.destroyed);
  return { scene: scene as never, live };
}

/** A 12 px name, centred on its point, as the worlds stand theirs. */
const nameAt = (x: number, y: number) => {
  const name = fakeText("Wren", {}, 14);
  Object.assign(name, { x, y });
  return name;
};

describe("NameplateTitle (FS-E1ZDG §K.41)", () => {
  it("should draw the player's title, smaller than the name, at the markers' depth", () => {
    const { scene, live } = stage();
    new NameplateTitle(scene, {}).show({ class: "warrior", specialization: "berserker" });
    expect(live().map((t) => t.text)).toEqual(["Berserker"]);
    expect(live()[0].size).toBe(`${TITLE_LINE_PX}px`);
    expect(live()[0].depth).toBe(MARKER_DEPTH.name);
  });

  it("should draw no line before the pick, nor for a spec the client does not know", () => {
    const { scene, live } = stage();
    const title = new NameplateTitle(scene, {});
    title.show({ class: "warrior" });
    title.show({ class: "warrior", specialization: "paladin" });
    expect(live()).toHaveLength(0);
  });

  it("should stand the line where the name stood and lift the name over it", () => {
    const { scene, live } = stage();
    const title = new NameplateTitle(scene, {});
    title.show({ class: "archer", specialization: "shadow_ranger" });
    const name = nameAt(100, 50);

    title.stand(name as never);

    const line = live()[0];
    // the line's foot on the name's foot: 50 + 14 / 2
    expect([line.x, line.y, line.originY]).toEqual([100, 57, 1]);
    expect(name.y + name.height / 2).toBeLessThanOrEqual(line.y - line.height);
    expect(name.x).toBe(100);
  });

  it("should leave the name where it stands with no line", () => {
    const { scene } = stage();
    const title = new NameplateTitle(scene, {});
    title.show({ class: "archer" });
    const name = nameAt(100, 50);
    title.stand(name as never);
    expect(name.y).toBe(50);
  });

  it("should show and hide with the name", () => {
    const { scene, live } = stage();
    const title = new NameplateTitle(scene, {});
    title.show({ class: "mage", specialization: "pyromancer" });
    const name = nameAt(0, 0);
    name.visible = false;
    title.stand(name as never);
    expect(live()[0].visible).toBe(false);
    title.setVisible(true);
    expect(live()[0].visible).toBe(true);
  });

  it("should change its words with the state, and go when the title does", () => {
    const { scene, live } = stage();
    const title = new NameplateTitle(scene, {});
    title.show({ class: "warrior", specialization: "guardian" });
    title.show({ class: "warrior", specialization: "berserker" });
    expect(live().map((t) => t.text)).toEqual(["Berserker"]);
    title.show({ class: "warrior" });
    expect(live()).toHaveLength(0);
    title.show({ class: "warrior", specialization: "guardian" });
    title.destroy();
    expect(live()).toHaveLength(0);
  });
});
