"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/utils/api";
import { browseFailureMessage } from "./browse";
import type { PickerInstance } from "./listRelic";

export type InstancesState =
  | { phase: "loading"; items: PickerInstance[] }
  | { phase: "ready"; items: PickerInstance[] }
  | { phase: "failed"; items: PickerInstance[]; error: string };

/**
 * The delver's relics with their status, for the List-a-relic picker (FS-8EGFA req 25). Loads
 * when `enabled` turns on; `reload` re-reads, keeping the cards shown until the new ones land.
 * `list-item-instances` answers a `{statusCode, message, result:{items}}` envelope in snake_case.
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
    apiClient.getItemInstances().then(
      (res) =>
        gen === generation.current &&
        setState({ phase: "ready", items: res.result?.items ?? [] }),
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
