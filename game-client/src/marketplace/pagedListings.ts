/**
 * Paging a listing read (FS-8EGFA req 21–23), free of React so its ordering is testable. The
 * Bazaar and Mine differ only in the fetcher.
 *
 * Two counters keep a slow old response from overwriting a newer one:
 * - `epoch` retires every read in flight on a reload or when the view goes away;
 * - `seq` orders first-page reads (a reload's, and the poll's re-reads), so one that started
 *   before a first page already shown is dropped when it lands.
 */

import {
  browseFailureMessage,
  canShowMore,
  type BrowseAction,
  type BrowsePage,
  type BrowseState,
} from "./browse";

export type FetchPage<L> = (cursor?: string) => Promise<BrowsePage<L>>;

export interface PagedLoader<L> {
  /** Starts over from the first page. */
  reload: () => void;
  /** Appends the next page, when there is one and none is on its way. */
  showMore: (state: BrowseState<L>) => void;
  /**
   * Reads the first page again and merges it in front of the rows shown, unless a newer
   * first-page read has already landed. Resolves with the page read either way, and rejects
   * when the read fails, touching nothing.
   */
  refreshFirstPage: () => Promise<BrowsePage<L>>;
  /** Drops every read in flight: the view has gone. */
  retire: () => void;
}

export function pagedLoader<L>(
  fetchPage: FetchPage<L>,
  dispatch: (action: BrowseAction<L>) => void,
): PagedLoader<L> {
  let epoch = 0;
  let seq = 0;
  let shownSeq = 0;

  /** Whether a first-page read stamped (e, s) may still land; if so it becomes the one shown. */
  const lands = (e: number, s: number) => {
    if (e !== epoch || s < shownSeq) return false;
    shownSeq = s;
    return true;
  };

  return {
    reload() {
      const e = ++epoch;
      const s = ++seq;
      dispatch({ type: "reload" });
      fetchPage().then(
        (page) => lands(e, s) && dispatch({ type: "loaded", page }),
        (err) => lands(e, s) && dispatch({ type: "failed", message: browseFailureMessage(err) }),
      );
    },

    showMore(state) {
      if (!canShowMore(state)) return;
      const e = epoch;
      dispatch({ type: "more" });
      fetchPage(state.nextCursor).then(
        (page) => e === epoch && dispatch({ type: "moreLoaded", page }),
        (err) =>
          e === epoch && dispatch({ type: "failed", message: browseFailureMessage(err) }),
      );
    },

    async refreshFirstPage() {
      const e = epoch;
      const s = ++seq;
      const page = await fetchPage();
      if (lands(e, s)) dispatch({ type: "refreshed", page });
      return page;
    },

    retire() {
      epoch++;
    },
  };
}
