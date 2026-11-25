import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { ContractLineHud } from "./ContractLineHud";

/** A scene that records its one text's words and whether it shows. */
function onScene() {
  const seen = { words: "", visible: true, destroyed: false };
  const text: Record<string, unknown> = {};
  Object.assign(text, {
    setOrigin: () => text,
    setScrollFactor: () => text,
    setDepth: () => text,
    setPosition: () => text,
    setText: (w: string) => ((seen.words = w), text),
    setVisible: (v: boolean) => ((seen.visible = v), text),
    destroy: () => void (seen.destroyed = true),
  });
  const scene = { add: { text: () => text } } as unknown as Phaser.Scene;
  return { scene, seen };
}

// FS-4EC7Z §G R34 (I-4EC7Z-6)
describe("ContractLineHud: the mark's heading under the notices (FS-4EC7Z §G R34)", () => {
  it("should show the line it is handed, and hide for none", () => {
    const { scene, seen } = onScene();
    const hud = new ContractLineHud(scene);
    expect(seen.visible).toBe(false);
    hud.show("Mark: last seen to the east");
    expect(seen).toMatchObject({ words: "Mark: last seen to the east", visible: true });
    hud.show(null);
    expect(seen.visible).toBe(false);
    hud.destroy();
    expect(seen.destroyed).toBe(true);
  });
});
