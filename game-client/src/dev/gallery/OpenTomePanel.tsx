"use client";

import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import { roundEveryObject, viewport } from "@/render/viewport";
import { SAMPLE_BOOK, TOME_SHEET, mountOpenTome, type OpenTomeScene } from "./openTomeSheet";

// Rounded as the game is (ADR-0057), whichever page loaded Phaser first.
roundEveryObject(Phaser.GameObjects);

const SCALES = [1, 1.5, 2] as const;
type Scale = (typeof SCALES)[number];

const button = "rounded-[6px] border border-border px-3 py-1.5 text-sm text-text hover:bg-bg-card-2";
const chosen = "rounded-[6px] border border-brass px-3 py-1.5 text-sm text-text bg-bg-card-2";

/**
 * The Open tome section (FS-X2CMM §Change: Illuminated pages and the open tome C3–C5): the class book's
 * panel opened on a sample Spellbook at its place in a 1080 × 720 run, the HUD it stands clear of
 * outlined, with a row hovered or none, at render scale 1, 1.5 or 2. `npm run contact:tome` renders the
 * same card to docs/art/class-book-open-tome.png.
 */
export default function OpenTomePanel() {
  const host = useRef<HTMLDivElement | null>(null);
  const sheet = useRef<OpenTomeScene | null>(null);
  const [scale, setScale] = useState<Scale>(1);
  const [row, setRow] = useState(-1);

  useEffect(() => {
    if (!host.current) return;
    const mounted = mountOpenTome(host.current);
    sheet.current = mounted.sheet;
    return () => {
      sheet.current = null;
      mounted.unmount();
    };
  }, []);

  useEffect(() => {
    viewport.set({ ...TOME_SHEET, renderScale: scale, cssScale: 1 });
  }, [scale]);

  useEffect(() => {
    sheet.current?.hover(row);
  }, [row]);

  const pages = SAMPLE_BOOK.book?.pages ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-dim">
        The open tome: a level 12 mage at 30 mana. Witchlight ready, Far Hand recovering, Levitate short of its cost,
        Binding Glyph and Recall locked.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
        <span>Render scale</span>
        {SCALES.map((s) => (
          <button key={s} type="button" className={s === scale ? chosen : button} onClick={() => setScale(s)}>
            {s}
          </button>
        ))}
        <span className="ml-4">Hover</span>
        {[-1, ...pages.map((_, i) => i)].map((i) => (
          <button key={i} type="button" className={i === row ? chosen : button} onClick={() => setRow(i)}>
            {i < 0 ? "none" : pages[i].id}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div ref={host} className="w-fit border border-border" />
      </div>
    </div>
  );
}
