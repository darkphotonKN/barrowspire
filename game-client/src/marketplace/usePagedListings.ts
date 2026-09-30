"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  INITIAL_BROWSE,
  browseReducer,
  type BrowsePage,
  type BrowseState,
} from "./browse";
import { pagedLoader, type FetchPage } from "./pagedListings";

/**
 * A listing read, page by page (FS-8EGFA req 21–23): the Bazaar through the public client, Mine
 * through the authed one. Loads the first page whenever `enabled` turns on, so a visitor who
 * never opens Mine never reads it; leaving (or unmounting) drops every read in flight.
 * `fetchPage` must be stable: a new one starts a new loader.
 *
 * `refreshFirstPage` re-reads the first page for the posted-listing poll and merges it in, so the
 * pages loaded after it stay and an older re-read never overwrites a newer one (see
 * {@link pagedLoader}).
 */
export function usePagedListings<L extends { id: string }>(
  fetchPage: FetchPage<L>,
  enabled = true,
): {
  state: BrowseState<L>;
  reload: () => void;
  showMore: () => void;
  refreshFirstPage: () => Promise<BrowsePage<L>>;
} {
  const [state, dispatch] = useReducer(browseReducer<L>, INITIAL_BROWSE as BrowseState<L>);
  const loader = useMemo(() => pagedLoader(fetchPage, dispatch), [fetchPage]);

  useEffect(() => {
    if (!enabled) return;
    loader.reload();
    return loader.retire;
  }, [enabled, loader]);

  const showMore = useCallback(() => loader.showMore(state), [loader, state]);

  return { state, reload: loader.reload, showMore, refreshFirstPage: loader.refreshFirstPage };
}
