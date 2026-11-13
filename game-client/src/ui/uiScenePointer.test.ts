import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOUSE_MOVE, UiScenePointer, hearMove, type InputCamera } from "./uiScenePointer";

// FS-TQZ5J Amendment A1 (I-TQZ5J-6). Phaser hands each DOM pointer event to the scenes top down and
// stops at the first whose interactive object is under the pointer (InputManager.globalTopOnly). With
// the corner row in the UI scene, above the worlds, three things a player touches changed
// (I-TQZ5J-3, verified in the harness against Phaser 4.2.1): a press begun in the world and let go
// over the row never ended in the world (R25); a press on the row no longer let go of the chat input
// or the party invite field (R26); a single move from a world hover onto the row left the hover up
// (R27). The harness proves the rules against real Phaser; these pin each one through the module's
// own surface.

/** A pointer as Phaser shares it between the scenes: one object, its last DOM event, its camera. */
function pointerAt(event: object = { type: "mousemove" }) {
  return { x: 900, y: 680, event, camera: "the UI scene's camera" as unknown };
}

/** The UI scene's pointer rules over stand-ins: its cameras, the pointers' state, the world, the field. */
function rules() {
  const cameras: InputCamera[] = [{ inputEnabled: true }];
  const down = { now: false };
  const heard: string[] = [];
  let letGo = 0;
  const ui = new UiScenePointer({
    cameras: () => cameras,
    anyDown: () => down.now,
    world: { moved: (_pointer, onUi) => void heard.push(onUi ? "move over the UI" : "move off the UI") },
    letGo: () => void letGo++,
  });
  return { ui, cameras, down, heard, letGoes: () => letGo };
}

/** Something of the UI scene's under the pointer, as Phaser lists it. */
const PIECE = [{ name: "the Inventory icon" }];
const NOTHING: unknown[] = [];

describe("a press begun in the world stays the world's to its end (FS-TQZ5J A1 R25)", () => {
  it("should take the UI scene's cameras out of Phaser's hit test from a press it had nothing under", () => {
    const { ui, cameras, down } = rules();
    down.now = true;

    ui.pressed(pointerAt(), NOTHING);

    expect(cameras.map((c) => c.inputEnabled)).toEqual([false]);
  });

  it("should leave them in for a press on one of its pieces: that press is the UI scene's (R7)", () => {
    const { ui, cameras, down } = rules();
    down.now = true;

    ui.pressed(pointerAt(), PIECE);

    expect(cameras.map((c) => c.inputEnabled)).toEqual([true]);
  });

  it("should put them back as the release leaves no button down, over the row or off the canvas alike", () => {
    const { ui, cameras, down } = rules();
    down.now = true;
    ui.pressed(pointerAt(), NOTHING);

    down.now = false;
    ui.released();

    expect(cameras.map((c) => c.inputEnabled)).toEqual([true]);
  });

  it("should keep them out while another button is still down, and through a second press (it is the world's too)", () => {
    const { ui, cameras, down, letGoes } = rules();
    down.now = true;
    ui.pressed(pointerAt(), NOTHING);

    ui.pressed(pointerAt(), NOTHING);
    ui.released();

    expect(cameras.map((c) => c.inputEnabled)).toEqual([false]);
    expect(letGoes()).toBe(0);
  });

  it("should put them back on the next move or frame with no button down, a release it never heard (asleep, held) included", () => {
    const { ui, cameras, down } = rules();
    down.now = true;
    ui.pressed(pointerAt(), NOTHING);
    down.now = false;

    ui.moved(pointerAt(), NOTHING);
    expect(cameras.map((c) => c.inputEnabled)).toEqual([true]);

    down.now = true;
    ui.pressed(pointerAt(), NOTHING);
    down.now = false;
    ui.frame();
    expect(cameras.map((c) => c.inputEnabled)).toEqual([true]);
  });

  it("should hand the world none of the press's moves itself: Phaser hands them on, the UI scene hitting nothing", () => {
    const { ui, down, heard } = rules();
    down.now = true;
    ui.pressed(pointerAt(), NOTHING);

    ui.moved(pointerAt(), NOTHING);

    expect(heard).toEqual([]);
  });
});

describe("a press on the UI scene lets go of the game's text field (FS-TQZ5J A1 R26)", () => {
  it("should let go of it for a press on one of its pieces, once", () => {
    const { ui, letGoes } = rules();

    ui.pressed(pointerAt(), PIECE);

    expect(letGoes()).toBe(1);
  });

  it("should leave a press beside its pieces to the world, whose fields' owners let go as they always have", () => {
    const { ui, letGoes } = rules();

    ui.pressed(pointerAt(), NOTHING);

    expect(letGoes()).toBe(0);
  });
});

describe("every move reaches the world (FS-TQZ5J A1 R27)", () => {
  it("should hand the world a move over one of its pieces, as a move over nothing of the world's", () => {
    const { ui, heard } = rules();

    ui.moved(pointerAt(), PIECE);

    expect(heard).toEqual(["move over the UI"]);
  });

  it("should hand it a move leaving one of its pieces as any move, once however many it leaves", () => {
    const { ui, heard } = rules();
    const pointer = pointerAt();

    ui.moved(pointer, NOTHING);
    ui.left(pointer);
    ui.left(pointer);

    expect(heard).toEqual(["move off the UI"]);
  });

  it("should hand it nothing for a move beside its pieces that leaves none: Phaser hands that on itself", () => {
    const { ui, heard } = rules();

    ui.moved(pointerAt(), NOTHING);

    expect(heard).toEqual([]);
  });

  it("should hand it nothing for a piece left in a press or a release: those stay the UI scene's (R7)", () => {
    const { ui, heard } = rules();
    const pointer = pointerAt();
    ui.moved(pointer, NOTHING);

    pointer.event = { type: "mousedown" };
    ui.pressed(pointer, PIECE);
    ui.left(pointer);

    expect(heard).toEqual([]);
  });
});

describe("hearMove: the world hears a move the UI scene took, through Phaser's own pass (FS-TQZ5J A1 R27)", () => {
  /** A world's input: Phaser's pass over one DOM event, recording what its cameras let it hit. */
  function worldInput(cameras: InputCamera[]) {
    const passes: string[] = [];
    const input = {
      update: (type: number, pointers: object[]) => {
        passes.push(`${type} x${pointers.length} cameras ${cameras.map((c) => c.inputEnabled).join(",")}`);
        return false;
      },
    };
    return { input, passes };
  }

  it("should run a move off the UI through the world's pass as it is", () => {
    const cameras = [{ inputEnabled: true }];
    const { input, passes } = worldInput(cameras);

    hearMove(input, cameras, pointerAt(), false);

    expect(passes).toEqual([`${MOUSE_MOVE} x1 cameras true`]);
  });

  it("should run a move over the UI with the world's cameras out of the hit test, and put them and the pointer's camera back", () => {
    const cameras = [{ inputEnabled: true }, { inputEnabled: false }];
    const { input, passes } = worldInput(cameras);
    const pointer = pointerAt();

    hearMove(input, cameras, pointer, true);

    expect(passes).toEqual([`${MOUSE_MOVE} x1 cameras false,false`]);
    expect(cameras.map((c) => c.inputEnabled)).toEqual([true, false]);
    expect(pointer.camera).toBe("the UI scene's camera");
  });

  it("should put the cameras back even if a world handler throws", () => {
    const cameras = [{ inputEnabled: true }];
    const input = {
      update: () => {
        throw new Error("a world handler");
      },
    };

    expect(() => hearMove(input, cameras, pointerAt(), true)).toThrow();
    expect(cameras[0].inputEnabled).toBe(true);
  });
});

// The rules lean on Phaser 4.2.1's input as it stands: pinned to its source, so an upgrade that
// changes any of it fails here before it changes what a player touches.
describe("Phaser 4.2.1's input, as the rules lean on it", () => {
  const phaserSrc = path.join(path.dirname(createRequire(import.meta.url).resolve("phaser/package.json")), "src");
  const source = (file: string) => readFileSync(path.join(phaserSrc, file), "utf8");
  const load = (file: string) => createRequire(import.meta.url)(path.join(phaserSrc, file));

  it("should number a mouse move as MOUSE_MOVE does (input/const.js)", () => {
    expect(load("input/const.js").MOUSE_MOVE).toBe(MOUSE_MOVE);
  });

  it("should hand each scene top down its InputPlugin's update(type, pointers), and stop at a scene that hit something", () => {
    const manager = source("input/InputManager.js");
    expect(manager).toContain("var scenes = this.game.scene.getScenes(false, true);");
    expect(manager).toContain("var capture = scene.sys.input.update(type, pointers);");
    expect(manager).toContain("if ((capture && this.globalTopOnly) || this._tempSkip)");
    expect(typeof load("input/InputPlugin.js").prototype.update).toBe("function");
    expect(load("input/InputPlugin.js").prototype.update.length).toBe(2);
  });

  it("should hit-test a scene only through its cameras that take input (Camera.inputEnabled)", () => {
    expect(source("cameras/2d/CameraManager.js")).toContain(
      "if (camera.visible && camera.inputEnabled && RectangleContains(camera, x, y))",
    );
  });

  it("should tell a scene's pointermove before its over and out, and its pointerdown with what lay under it", () => {
    const plugin = source("input/InputPlugin.js");
    expect(plugin).toMatch(
      /case CONST\.MOUSE_MOVE:\s*case CONST\.TOUCH_MOVE:\s*total \+= this\.processDragMoveEvent\(pointer\);\s*total \+= this\.processMoveEvents\(pointer\);\s*total \+= this\.processOverOutEvents\(pointer\);/,
    );
    expect(plugin).toContain("this.emit(Events.POINTER_DOWN, pointer, currentlyOver);");
    expect(plugin).toContain("this.emit(Events.POINTER_MOVE, pointer, currentlyOver);");
  });
});
