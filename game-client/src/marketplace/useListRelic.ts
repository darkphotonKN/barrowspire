"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/utils/api";
import { POSTED, type DurationId } from "./listRelic";
import { postListing } from "./listRelicFlow";
import { pollForPostedListing, sleep } from "./postedPoll";
import { useItemInstances } from "./useItemInstances";

/**
 * The List-a-relic flow's state (FS-8EGFA req 25): whether the drawer is open, the delver's
 * relics, the notice above the table, and the submit, whose steps are {@link postListing}.
 * `refreshMine` is the poll's read: it merges each page into Mine as it reads it.
 *
 * `trigger` is the control that opened the drawer; the drawer returns focus to it on close.
 */
export function useListRelic({
  onPosted,
  refreshMine,
}: {
  onPosted: () => void;
  refreshMine: () => Promise<{ listings: { itemId: string; status: string }[] }>;
}) {
  const [isOpen, setOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const instances = useItemInstances(isOpen);
  const trigger = useRef<HTMLElement | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const open = useCallback((e: React.MouseEvent<HTMLElement>) => {
    trigger.current = e.currentTarget;
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const { reload: reloadInstances } = instances;
  const submit = useCallback(
    (itemId: string, startPrice: number, duration: DurationId) =>
      postListing(
        { itemId, startPrice, duration },
        {
          createListing: (id, price, endsAt) => apiClient.createListing(id, price, endsAt),
          onPosted: () => {
            setOpen(false);
            setNotice(POSTED);
            onPosted();
          },
          poll: (id) =>
            pollForPostedListing(id, {
              fetchMine: refreshMine,
              sleep,
              cancelled: () => !alive.current,
            }),
          onSettled: (settled) => {
            setNotice(settled);
            reloadInstances();
          },
          cancelled: () => !alive.current,
          now: Date.now,
        },
      ),
    [onPosted, refreshMine, reloadInstances],
  );

  return { isOpen, open, close, submit, notice, trigger, instances: instances.state };
}
