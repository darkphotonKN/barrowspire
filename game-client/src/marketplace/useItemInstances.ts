"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/utils/api";
import { browseFailureMessage } from "./browse";
import type { PickerInstance } from "./listRelic";
import { loadPickerRelics } from "./pickerRelics";

export type InstancesState =
  | { phase: "loading"; items: PickerInstance[] }
  | { phase: "ready"; items: PickerInstance[] }
  | { phase: "failed"; items: PickerInstance[]; error: string };

/**
 * The stash relics with their status and location, for the List-a-relic picker (FS-8EGFA req 25,
 * FS-3R77D R16, FS-50MTX R38). Loads when `enabled` turns on, so every opening of the drawer
 * re-reads them; `reload` re-reads, keeping the cards shown until the new ones land. The read is
 * {@link loadPickerRelics}.
 */
export function useItemInstances(enabled: boolean): {
  state: InstancesState;
  reload: () => void;
} {
  const [state, setState] = useState<InstancesState>({ phase: "loading", items: [] });
  const generation = useRef(0);

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setState((s) => (s.phase === "ready" ? s : { phase: "loading", items: s.items }));
    loadPickerRelics(apiClient).then(
      (items) => gen === generation.current && setState({ phase: "ready", items }),
      (err) =>
        gen === generation.current &&
        setState((s) => ({
          phase: "failed",
          items: s.items,
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
