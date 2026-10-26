import { describe, expect, it } from "vitest";
import { palette, toCss } from "@/utils/canvasPalette";
import { EquipmentPanel, GAME_EQUIPMENT_THEME } from "./EquipmentPanel";
import { MENU_EQUIPMENT_THEME } from "./menuChrome";

/**
 * A scene that records every colour the panel draws with: graphics fills and strokes as 0x
 * ints, text colours as CSS strings. Every other call is accepted and ignored.
 */
function recordingScene() {
  const fills = new Set<number>();
  const lines = new Set<number>();
  const texts = new Set<string>();

  const chain = (extra: Record<string, unknown> = {}): unknown =>
    new Proxy(extra, {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        return () => proxy;
      },
    });
  let proxy: unknown;

  const graphics = () => {
    const g: Record<string, unknown> = {
      fillStyle: (c: number) => (fills.add(c), g),
      lineStyle: (_w: number, c: number) => (lines.add(c), g),
    };
    return chain(g);
  };
  const text = (_x: number, _y: number, _s: string, style?: { color?: string }) => {
    if (style?.color) texts.add(style.color);
    const t: Record<string, unknown> = {
      setColor: (c: string) => (texts.add(c), t),
    };
    return chain(t);
  };
  const container = (x = 0, y = 0) => chain({ x, y });
  proxy = chain();

  const scene = {
    add: { graphics, text, container },
    cameras: { main: { width: 1080, height: 720 } },
    input: { on: () => undefined, off: () => undefined },
    time: { delayedCall: () => undefined },
  } as unknown as Phaser.Scene;

  return { scene, fills, lines, texts };
}

describe("EquipmentPanel theme", () => {
  it("defaults to the game look", () => {
    const { scene } = recordingScene();
    expect(new EquipmentPanel(scene).theme).toBe(GAME_EQUIPMENT_THEME);
  });

  it("keeps the game look's colours exactly as they were", () => {
    expect(GAME_EQUIPMENT_THEME).toEqual({
      panelFill: palette.ink,
      frame: palette.frame,
      heading: palette.frameBright,
      well: palette.hudPanelDeep,
      itemText: palette.hudText,
      itemFaint: palette.hudFaint,
      itemHover: palette.frameBright,
      slotWeapon: palette.damageBright,
      slotArmor: palette.hostile,
      slotConsumable: palette.safe,
      slotRing: palette.frameBright,
      flashText: palette.damageBright,
      flashFill: palette.mapEdge,
    });
  });

  it("draws an empty default panel in ink, brass and vellum, as the run always has", () => {
    const { scene, fills, lines, texts } = recordingScene();
    new EquipmentPanel(scene).show();
    // ink and hudPanelDeep are both charcoal today; compare as sets so that stays incidental.
    expect(fills).toEqual(new Set([palette.ink, palette.hudPanelDeep]));
    expect(lines).toEqual(new Set([palette.frame]));
    expect(texts).toEqual(
      new Set([toCss(palette.frameBright), toCss(palette.hudFaint)]),
    );
  });

  it("draws the menu panel in Bone & Soot, with no brass or amber", () => {
    const { scene, fills, lines, texts } = recordingScene();
    new EquipmentPanel(scene, MENU_EQUIPMENT_THEME).show();
    const used = [...fills, ...lines];
    const usedText = [...texts];
    const menu = Object.values(palette.menu);
    for (const c of used) expect(menu).toContain(c);
    for (const c of usedText) expect(menu.map(toCss)).toContain(c);
    for (const banned of [
      palette.frame,
      palette.frameBright,
      palette.interactable,
      palette.interactableBright,
    ]) {
      expect(used).not.toContain(banned);
      expect(usedText).not.toContain(toCss(banned));
    }
  });

  it("gives every menu-theme colour from the menu palette", () => {
    const menu = Object.values(palette.menu);
    for (const [role, color] of Object.entries(MENU_EQUIPMENT_THEME)) {
      expect(menu, role).toContain(color);
    }
  });
});
