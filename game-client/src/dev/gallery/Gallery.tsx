"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { FAMILIES, type Family } from "./families";
import ItemIconGrid from "./ItemIconGrid";

// Phaser loads with SSR off and in its own chunk, never the gallery route's (FS-1819Q R5).
const EffectsPanel = dynamic(() => import("./EffectsPanel"), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted">Loading effects...</p>,
});

// One section per tracked family. Keyed by Family, so a family listed in families.ts with no
// section here fails the typecheck.
const SECTIONS: Record<Family, { title: string; Body: ComponentType }> = {
  effects: { title: "Effects", Body: EffectsPanel },
  "item-icons": { title: "Item icons", Body: ItemIconGrid },
};

export default function Gallery() {
  return (
    <main className="min-h-screen bg-bg-dark p-6 text-text">
      <h1 className="mb-6 text-xl uppercase tracking-[0.15em] text-text-dim">
        Dev gallery
      </h1>
      {FAMILIES.map((family) => {
        const { title, Body } = SECTIONS[family];
        return (
          <section key={family} className="mb-8">
            <h2 className="mb-3 text-sm uppercase tracking-[0.12em] text-text-dim">
              {title}
            </h2>
            <Body />
          </section>
        );
      })}
    </main>
  );
}
