"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/utils/api";
import { browseFailureMessage } from "./browse";
import type { PickerInstance } from "./listRelic";
import { loadPickerRelics } from "./pickerRelics";

/** `worn` is the ids in the member's loadout; empty while unread or when it could not be read. */
export type InstancesState =
  | { phase: "loading"; items: PickerInstance[]; worn: ReadonlySet<string> }
  | { phase: "ready"; items: PickerInstance[]; worn: ReadonlySet<string> }
  | { phase: "failed"; items: PickerInstance[]; worn: ReadonlySet<string>; error: string };

const NONE_WORN: ReadonlySet<string> = new Set();

/**
 * The player's relics with their status, and which are worn, for the List-a-relic picker
 * (FS-8EGFA req 25, FS-HBXZN R14). Loads when `enabled` turns on, so every opening of the drawer
 * re-reads both; `reload` re-reads, keeping the cards shown until the new ones land. The reads
 * are {@link loadPickerRelics}: a failed loadout read marks nothing worn and is not a failure.
 */
export function useItemInstances(enabled: boolean): {
  state: InstancesState;
  reload: () => void;
} {
  const [state, setState] = useState<InstancesState>({
    phase: "loading",
    items: [],
    worn: NONE_WORN,
  });
  const generation = useRef(0);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setState((s) => (s.phase === "ready" ? s : { phase: "loading", items: s.items, worn: s.worn }));
    loadPickerRelics(apiClient).then(
      ({ items, worn }) => gen === generation.current && setState({ phase: "ready", items, worn }),
      (err) =>
        gen === generation.current &&
        setState((s) => ({
          phase: "failed",
          items: s.items,
          worn: s.worn,
          error: browseFailureMessage(err),
        })),
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const current = generation;
    reload();
    return () => {
      current.current++;
    };
  }, [enabled, reload]);

  return { state, reload };
}
