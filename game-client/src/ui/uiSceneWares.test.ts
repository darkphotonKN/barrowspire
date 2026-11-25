import { describe, expect, it, vi } from "vitest";
import type { PurseShelf, PurseView } from "./purse";
import type { UiRequest, WorldReport } from "./uiBridge";
import { UiWaresSlot, type WaresPiece, type WaresWiring } from "./uiSceneWares";
import type { ShownWares } from "./wares";

const shown = (over: Partial<ShownWares> = {}): ShownWares => ({
  merchantId: "merchant-1",
  rows: [{ ware: "antidote", icon: "icon_antidote", name: "Antidote", price: "40 gold", left: "3 left", action: "Buy", enabled: true }],
  ...over,
});

const report = (world: "run" | "hub") => ({ world }) as WorldReport;

/** The slot on a recording bridge, its panels and purse readers. */
function onSlot() {
  const asked: UiRequest[] = [];
  const played: string[] = [];
  const bridge = {
    request: (request: UiRequest) => void asked.push(request),
    act: (run: () => void) => run(),
    play: (effect: string) => void played.push(effect),
  };
  type Piece = WaresPiece & { sets: ShownWares[]; purse?: PurseView; destroyed: boolean; relaid: number };
  const pieces: Piece[] = [];
  const wirings: WaresWiring[] = [];
  const readers: { shelf: PurseShelf; refresh: ReturnType<typeof vi.fn>; forget: ReturnType<typeof vi.fn> }[] = [];
  const slot = new UiWaresSlot(
    bridge as never,
    (wiring) => {
      wirings.push(wiring);
      const piece: Piece = {
        sets: [],
        destroyed: false,
        relaid: 0,
        set: (wares) => void piece.sets.push(wares),
        setPurse: (view) => void (piece.purse = view),
        relayout: () => void piece.relaid++,
        destroy: () => void (piece.destroyed = true),
      };
      pieces.push(piece);
      return piece;
    },
    (shelf) => {
      const reader = { shelf, refresh: vi.fn(), forget: vi.fn() };
      readers.push(reader);
      return reader;
    },
  );
  return { slot, asked, played, pieces, wirings, readers };
}

// FS-9JV5K §F R22, R23 (I-9JV5K-5)
describe("UiWaresSlot: the wares panel on the UI scene (FS-9JV5K §F R22)", () => {
  it("should build the panel on the run's first show, read the purse onto it, and draw each show after on it", () => {
    const { slot, pieces, readers } = onSlot();
    slot.world(report("run"));
    expect(slot.isOpen()).toBe(false);
    slot.hear({ kind: "show", wares: shown() });
    slot.hear({ kind: "show", wares: shown({ line: "Not enough gold." }) });
    expect(slot.isOpen()).toBe(true);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].sets.map((s) => s.line)).toEqual([undefined, "Not enough gold."]);
    expect(readers).toHaveLength(1);
    expect(readers[0].shelf).toBe(pieces[0]);
    expect(readers[0].refresh).toHaveBeenCalledTimes(1);
  });

  it("should read the purse again after every purchase answer", () => {
    const { slot, readers } = onSlot();
    slot.world(report("run"));
    slot.hear({ kind: "show", wares: shown() });
    slot.hear({ kind: "answered" });
    expect(readers[0].refresh).toHaveBeenCalledTimes(2);
  });

  it("should take the panel down on the run's close, its purse read let go, and build it afresh on the next show", () => {
    const { slot, pieces, readers } = onSlot();
    slot.world(report("run"));
    slot.hear({ kind: "show", wares: shown() });
    slot.hear({ kind: "close" });
    expect(slot.isOpen()).toBe(false);
    expect(pieces[0].destroyed).toBe(true);
    expect(readers[0].forget).toHaveBeenCalled();
    slot.hear({ kind: "answered" });
    expect(readers[0].refresh).toHaveBeenCalledTimes(1);
    slot.hear({ kind: "show", wares: shown() });
    expect(pieces).toHaveLength(2);
  });

  it("should ask the run to buy a ware on Buy, with a click", () => {
    const { slot, wirings, asked, played } = onSlot();
    slot.world(report("run"));
    slot.hear({ kind: "show", wares: shown() });
    wirings[0].buy("antidote");
    expect(asked).toEqual([{ kind: "buy", ware: "antidote" }]);
    expect(played).toEqual(["menu_click"]);
  });

  it("should ask the run to close it on its × and on Esc, which changes nothing on the server", () => {
    const { slot, wirings, asked, played } = onSlot();
    slot.world(report("run"));
    slot.hear({ kind: "show", wares: shown() });
    wirings[0].close();
    slot.close();
    expect(asked).toEqual([
      { kind: "close", window: "wares" },
      { kind: "close", window: "wares" },
    ]);
    expect(played).toEqual(["dialog_cancel", "dialog_cancel"]);
  });

  it("should ask nothing on a close with the panel down", () => {
    const { slot, asked } = onSlot();
    slot.world(report("run"));
    slot.close();
    expect(asked).toEqual([]);
  });

  it("should take the panel down, asking nothing, as the run leaves or another world is reported", () => {
    const { slot, pieces, asked } = onSlot();
    slot.world(report("run"));
    slot.hear({ kind: "show", wares: shown() });
    slot.world(report("run"));
    expect(pieces[0].destroyed).toBe(false);
    slot.world(null);
    expect(pieces[0].destroyed).toBe(true);
    slot.world(report("hub"));
    slot.hear({ kind: "show", wares: shown() });
    expect(pieces).toHaveLength(1);
    expect(asked).toEqual([]);
  });

  it("should stand the open panel at the new centre on a relayout, and go with the scene", () => {
    const { slot, pieces } = onSlot();
    slot.world(report("run"));
    slot.relayout();
    slot.hear({ kind: "show", wares: shown() });
    slot.relayout();
    expect(pieces[0].relaid).toBe(1);
    slot.destroy();
    expect(pieces[0].destroyed).toBe(true);
  });
});
