"use client";

import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import { installCrispText } from "@/render/crispText";
import { backingSize, fitGame, roundEveryObject, viewport } from "@/render/viewport";
import { palette, toCss, type TreeHue } from "@/utils/canvasPalette";
import { BARROW } from "@/utils/theme";
import { TREE_LOOK, type TreeLook } from "@/ui/PassiveTreeOverlay";
import { SHEET_CLASSES, colourOf, sheetEntries, withHue } from "./treeColours";
import { TREE_SHEET, TreeColoursScene } from "./treeColoursSheet";

// Rounded as the game is (ADR-0057), whichever page loaded Phaser first.
roundEveryObject(Phaser.GameObjects);

const SCALES = [1, 2] as const;
type Scale = (typeof SCALES)[number];

const HUES = Object.keys(palette.treeHue) as TreeHue[];

/** Each hue's nodes by name, every class's, each once: what a retune of it recolours. */
const NODES_OF: Readonly<Record<TreeHue, string>> = (() => {
  const names = new Map<TreeHue, Set<string>>(HUES.map((h) => [h, new Set()]));
  for (const cls of SHEET_CLASSES) for (const { node } of sheetEntries(cls)) names.get(node.hue!)!.add(node.name);
  return Object.fromEntries(HUES.map((h) => [h, [...names.get(h)!].join(", ")])) as Record<TreeHue, string>;
})();

/** The look's numbers the page can preview: each range, its step and how it reads. */
const NUMBERS = [
  { label: "TREE_BRONZE_MIX", min: 0, max: 0.4, step: 0.01, get: (l: TreeLook) => l.bronzeMix, set: (l: TreeLook, v: number) => ({ ...l, bronzeMix: v }) },
  { label: "TREE_LIT_LIFT", min: 0, max: 1, step: 0.05, get: (l: TreeLook) => l.lift, set: (l: TreeLook, v: number) => ({ ...l, lift: v }) },
  { label: "TREE_HALO.alpha", min: 0, max: 1, step: 0.05, get: (l: TreeLook) => l.halo.alpha, set: (l: TreeLook, v: number) => ({ ...l, halo: { ...l.halo, alpha: v } }) },
  { label: "TREE_HALO.discs", min: 1, max: 8, step: 1, get: (l: TreeLook) => l.halo.discs, set: (l: TreeLook, v: number) => ({ ...l, halo: { ...l.halo, discs: v } }) },
  { label: "TREE_HALO.inner", min: 0, max: 1, step: 0.05, get: (l: TreeLook) => l.halo.inner, set: (l: TreeLook, v: number) => ({ ...l, halo: { ...l.halo, inner: v } }) },
] as const;

const button = "rounded-[6px] border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-card-2";
const chosen = "rounded-[6px] border border-brass px-3 py-1.5 text-sm text-text bg-bg-card-2";

/** A number as the page writes it: whole, or to two places. */
const shown = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/**
 * The Tree colours section (FS-8RZ51 §Change: A lit node glows in its own colour, L13): its own canvas,
 * the sheet drawn at render scale 1 or 2, and live controls for each hue, the bronze mix, the lift and
 * the halo, each with its value. A preview lives in this page only: a reload shows the tokens again,
 * and a retune the owner settles on is an edit to `theme.ts`.
 */
export default function TreeColoursPanel() {
  const host = useRef<HTMLDivElement | null>(null);
  const scene = useRef<TreeColoursScene | null>(null);
  const [scale, setScale] = useState<Scale>(1);
  const [look, setLook] = useState<TreeLook>(TREE_LOOK);

  useEffect(() => {
    if (!host.current) return;
    // the sheet's own view; the page's is put back when it goes
    const before = viewport.current();
    viewport.set({ ...TREE_SHEET, renderScale: 1, cssScale: 1 });
    installCrispText();
    const sheet = new TreeColoursScene();
    scene.current = sheet;
    const backing = backingSize(viewport.current());
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      scale: { mode: Phaser.Scale.NONE, width: backing.width, height: backing.height, zoom: 1 },
      backgroundColor: BARROW.pitch,
      render: { roundPixels: true, antialias: true, pixelArt: false },
      scene: [sheet],
    });
    const unfit = fitGame(game);
    return () => {
      unfit();
      scene.current = null;
      game.destroy(true);
      viewport.set(before);
    };
  }, []);

  // the backing store, the camera and every knockout follow the render scale (ADR-0080, FS-ZAJMH)
  useEffect(() => {
    viewport.set({ ...TREE_SHEET, renderScale: scale, cssScale: 1 });
  }, [scale]);
  useEffect(() => {
    scene.current?.preview(look);
  }, [look]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
        <span>Render scale</span>
        {SCALES.map((s) => (
          <button key={s} type="button" className={s === scale ? chosen : button} onClick={() => setScale(s)}>
            {s}
          </button>
        ))}
        <button type="button" className={button} onClick={() => setLook(TREE_LOOK)}>
          Reset to the tokens
        </button>
        <span className="text-text-muted">A preview is never saved: a reload shows the tokens.</span>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="overflow-x-auto">
          <div ref={host} className="w-fit border border-border" />
        </div>
        <div className="flex flex-col gap-4 text-sm">
          <table className="border-separate border-spacing-x-2 border-spacing-y-1">
            <tbody>
              {HUES.map((hue) => {
                const value = look.hues[hue];
                const token = TREE_LOOK.hues[hue];
                return (
                  <tr key={hue}>
                    <td className="font-mono text-text-dim">palette.treeHue.{hue}</td>
                    <td>
                      <input
                        type="color"
                        aria-label={`treeHue.${hue}`}
                        value={toCss(value)}
                        onChange={(e) => {
                          const next = colourOf(e.target.value);
                          if (next !== undefined) setLook((l) => withHue(l, hue, next));
                        }}
                      />
                    </td>
                    <td className="font-mono text-text">
                      {toCss(value)}
                      {value !== token && <span className="text-text-muted"> (token {toCss(token)})</span>}
                    </td>
                    <td className="max-w-[18rem] text-xs text-text-muted">{NODES_OF[hue]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className="border-separate border-spacing-x-2 border-spacing-y-1">
            <tbody>
              {NUMBERS.map((n) => {
                const value = n.get(look);
                const token = n.get(TREE_LOOK);
                return (
                  <tr key={n.label}>
                    <td className="font-mono text-text-dim">{n.label}</td>
                    <td>
                      <input
                        type="range"
                        aria-label={n.label}
                        min={n.min}
                        max={n.max}
                        step={n.step}
                        value={value}
                        onChange={(e) => setLook((l) => n.set(l, Number(e.target.value)))}
                      />
                    </td>
                    <td className="font-mono text-text">
                      {shown(value)}
                      {value !== token && <span className="text-text-muted"> (token {shown(token)})</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
