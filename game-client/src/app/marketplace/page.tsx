"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import BazaarFilters from "@/components/bazaar/BazaarFilters";
import ListRelicDrawer from "@/components/bazaar/ListRelicDrawer";
import ListingTable from "@/components/bazaar/ListingTable";
import MyListingsTable from "@/components/bazaar/MyListingsTable";
import {
  SIGN_IN_TO_MARKETPLACE,
  canShowMore,
  toggleSort,
  typeChips,
  type BrowseState,
} from "@/marketplace/browse";
import type { Listing } from "@/marketplace/listing";
import { NOTHING_LISTED } from "@/marketplace/listRelic";
import { DEFAULT_SORT, filterRows, sortRows, type RowSort } from "@/marketplace/rows";
import { useCountdownNow } from "@/marketplace/useCountdownNow";
import { useListRelic } from "@/marketplace/useListRelic";
import { usePagedListings } from "@/marketplace/usePagedListings";
import { useAuthStore } from "@/stores/authStore";
import { apiClient, publicApi } from "@/utils/api";

const EMPTY = "The coffers are bare — no relics are up for auction.";
const NONE_MATCH = "No relics loaded so far match these filters.";

// The two reads the page pages through: the Bazaar signed in or out, and the delver's own.
const browsePage = (cursor?: string) => publicApi.browseListings(cursor);
const minePage = (cursor?: string) => apiClient.listMyListings(cursor);

type View = "all" | "mine";

/**
 * The Bazaar (FS-8EGFA req 20–23, 25): every active auction, readable signed in or out. Sorting
 * and filtering apply to the rows loaded so far; "Show more" loads the next page. A signed-in
 * delver can also switch to Mine, their own listings in every status, and list a relic.
 */
export default function MarketplacePage() {
  const { isAuthenticated, memberInfo } = useAuthStore();
  const memberId = isAuthenticated ? memberInfo?.id : undefined;

  const [view, setView] = useState<View>("all");
  const showingMine = isAuthenticated && view === "mine";

  const browse = usePagedListings(browsePage);
  const mine = usePagedListings(minePage, showingMine);

  const [sort, setSort] = useState<RowSort>(DEFAULT_SORT);
  const [rarities, setRarities] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);

  const visible = useMemo(
    () => sortRows(filterRows(browse.state.rows, { rarities, types }), sort),
    [browse.state.rows, rarities, types, sort],
  );
  const shownRows = showingMine ? mine.state.rows : browse.state.rows;
  const endsAts = useMemo(() => shownRows.map((r) => r.endsAt), [shownRows]);
  const now = useCountdownNow(endsAts);

  const showMine = useCallback(() => setView("mine"), []);
  const listing = useListRelic({ onPosted: showMine, refreshMine: mine.refreshFirstPage });

  return (
    <main className="relative z-[1] mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[40px] leading-none text-primary">The Bazaar</h1>
          <p className="text-vellum-dim">Relics carried out of the Spire, sold to the highest bid.</p>
        </div>
        {isAuthenticated ? (
          <div className="flex flex-wrap items-center gap-4">
            <ViewToggle view={view} onView={setView} />
            <button
              type="button"
              onClick={listing.open}
              className="btn-primary inline-flex min-h-[40px] items-center"
            >
              List a relic
            </button>
          </div>
        ) : (
          <Link href={SIGN_IN_TO_MARKETPLACE} className="btn-primary inline-flex min-h-[40px] items-center">
            Sign in to list
          </Link>
        )}
      </div>

      <p aria-live="polite" className="text-brass-bright empty:hidden">
        {isAuthenticated ? listing.notice : undefined}
      </p>

      {showingMine ? (
        <MineView
          state={mine.state}
          memberId={memberId}
          now={now}
          onRetry={mine.reload}
          onShowMore={mine.showMore}
          onList={listing.open}
        />
      ) : browse.state.phase === "failed" ? (
        <Notice message={browse.state.error}>
          <button type="button" onClick={browse.reload} className="btn-secondary min-h-[40px]">
            Try again
          </button>
        </Notice>
      ) : browse.state.phase === "ready" && browse.state.rows.length === 0 ? (
        <Notice message={EMPTY}>
          {isAuthenticated && <ListARelicAction onList={listing.open} />}
        </Notice>
      ) : (
        <>
          <BazaarFilters
            rarities={rarities}
            types={types}
            typeOptions={typeChips(browse.state.rows)}
            onRarities={setRarities}
            onTypes={setTypes}
          />
          <ListingTable
            rows={visible}
            loading={browse.state.phase === "loading"}
            sort={sort}
            onSort={(key) => setSort((current) => toggleSort(current, key))}
            memberId={memberId}
            now={now}
          />
          {browse.state.phase === "ready" && visible.length === 0 && (
            <p className="text-center text-vellum-dim">{NONE_MATCH}</p>
          )}
          <ShowMore state={browse.state} onShowMore={browse.showMore} />
        </>
      )}

      {isAuthenticated && listing.isOpen && (
        <ListRelicDrawer
          instances={listing.instances}
          onSubmit={listing.submit}
          onClose={listing.close}
          returnFocus={listing.trigger}
        />
      )}
    </main>
  );
}

/**
 * All / Mine (req 23; guideline Part II "Tabs / segmented control"): the active segment is
 * brass-bright text and underline, never amber, which "List a relic" already holds.
 */
function ViewToggle({ view, onView }: { view: View; onView: (view: View) => void }) {
  return (
    <div role="group" aria-label="Show listings" className="flex items-center gap-1">
      {(["all", "mine"] as const).map((v) => {
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onView(v)}
            className={`min-h-[40px] border-b-2 px-4 text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
              active
                ? "border-brass-bright text-brass-bright"
                : "border-transparent text-vellum-dim hover:text-vellum"
            }`}
          >
            {v === "all" ? "All" : "Mine"}
          </button>
        );
      })}
    </div>
  );
}

function MineView({
  state,
  memberId,
  now,
  onRetry,
  onShowMore,
  onList,
}: {
  state: BrowseState<Listing>;
  memberId: string | undefined;
  now: number;
  onRetry: () => void;
  onShowMore: () => void;
  onList: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  if (state.phase === "failed")
    return (
      <Notice message={state.error}>
        <button type="button" onClick={onRetry} className="btn-secondary min-h-[40px]">
          Try again
        </button>
      </Notice>
    );
  if (state.phase === "ready" && state.rows.length === 0)
    return (
      <Notice message={NOTHING_LISTED}>
        <ListARelicAction onList={onList} />
      </Notice>
    );
  return (
    <>
      <MyListingsTable
        rows={state.rows}
        loading={state.phase === "loading"}
        memberId={memberId}
        now={now}
      />
      <ShowMore state={state} onShowMore={onShowMore} />
    </>
  );
}

/** An empty state's one action. Secondary: the header's "List a relic" is the view's torch. */
function ListARelicAction({ onList }: { onList: (e: React.MouseEvent<HTMLElement>) => void }) {
  return (
    <button type="button" onClick={onList} className="btn-secondary min-h-[40px]">
      List a relic
    </button>
  );
}

function ShowMore({
  state,
  onShowMore,
}: {
  state: BrowseState<unknown>;
  onShowMore: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      {state.moreError && <p className="text-vellum-dim">{state.moreError}</p>}
      {(canShowMore(state) || state.loadingMore) && (
        <button
          type="button"
          onClick={onShowMore}
          disabled={state.loadingMore}
          className="btn-secondary min-h-[40px] disabled:opacity-50"
        >
          {state.loadingMore ? "Loading…" : "Show more"}
        </button>
      )}
    </div>
  );
}

function Notice({ message, children }: { message?: string; children?: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-[10px] border border-[color:var(--color-border)] bg-card px-6 py-16 text-center"
    >
      <p className="text-vellum-dim">{message}</p>
      {children}
    </div>
  );
}
