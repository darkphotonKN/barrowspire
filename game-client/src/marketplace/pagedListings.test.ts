import { describe, expect, it } from "vitest";
import {
  BROWSE_UNREACHABLE,
  INITIAL_BROWSE,
  browseReducer,
  type BrowseAction,
  type BrowsePage,
  type BrowseState,
} from "./browse";
import { pagedLoader } from "./pagedListings";

type Row = { id: string };
const page = (ids: string[], nextCursor?: string): BrowsePage<Row> => ({
  listings: ids.map((id) => ({ id })),
  nextCursor,
});

/** A loader over fetches the test answers by hand, applying its actions to real state. */
function setup() {
  let state = INITIAL_BROWSE as BrowseState<Row>;
  const calls: { cursor?: string; resolve: (p: BrowsePage<Row>) => void; reject: (e: unknown) => void }[] =
    [];
  const dispatch = (action: BrowseAction<Row>) => {
    state = browseReducer(state, action);
  };
  const loader = pagedLoader<Row>(
    (cursor) => new Promise((resolve, reject) => calls.push({ cursor, resolve, reject })),
    dispatch,
  );
  const ids = () => state.rows.map((r) => r.id);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { loader, calls, state: () => state, ids, settle };
}

describe("pagedLoader", () => {
  it("should load the first page, then append the next on Show more", async () => {
    const t = setup();
    t.loader.reload();
    expect(t.state().phase).toBe("loading");
    t.calls[0].resolve(page(["a"], "c1"));
    await t.settle();
    t.loader.showMore(t.state());
    expect(t.calls[1].cursor).toBe("c1");
    t.calls[1].resolve(page(["b"]));
    await t.settle();
    expect(t.ids()).toEqual(["a", "b"]);
  });

  it("should drop a first page that lands after a newer reload", async () => {
    const t = setup();
    t.loader.reload();
    t.loader.reload();
    t.calls[1].resolve(page(["new"]));
    await t.settle();
    t.calls[0].resolve(page(["old"]));
    await t.settle();
    expect(t.ids()).toEqual(["new"]);
  });

  it("should drop a Show more page that lands after a reload", async () => {
    const t = setup();
    t.loader.reload();
    t.calls[0].resolve(page(["a"], "c1"));
    await t.settle();
    t.loader.showMore(t.state());
    t.loader.reload();
    t.calls[1].resolve(page(["b"]));
    t.calls[2].resolve(page(["x"]));
    await t.settle();
    expect(t.ids()).toEqual(["x"]);
  });

  it("should drop every read in flight once retired", async () => {
    const t = setup();
    t.loader.reload();
    t.loader.retire();
    t.calls[0].resolve(page(["a"]));
    await t.settle();
    expect(t.state().phase).toBe("loading");
    expect(t.ids()).toEqual([]);
  });

  it("should merge a re-read first page without losing the pages loaded after it", async () => {
    const t = setup();
    t.loader.reload();
    t.calls[0].resolve(page(["b"], "c1"));
    await t.settle();
    t.loader.showMore(t.state());
    t.calls[1].resolve(page(["c"], "c2"));
    await t.settle();
    const read = t.loader.refreshFirstPage();
    t.calls[2].resolve(page(["a", "b"], "c-new"));
    expect(await read).toEqual(page(["a", "b"], "c-new"));
    expect(t.ids()).toEqual(["a", "b", "c"]);
    expect(t.state().nextCursor).toBe("c2");
  });

  it("should drop a re-read first page older than one already shown", async () => {
    const t = setup();
    t.loader.reload();
    t.calls[0].resolve(page(["a"]));
    await t.settle();
    // Two polls overlap: the second read lands first, then the first, older read arrives.
    const first = t.loader.refreshFirstPage();
    const second = t.loader.refreshFirstPage();
    t.calls[2].resolve(page(["new", "a"]));
    await second;
    t.calls[1].resolve(page(["old", "a"]));
    // The poll still hears its own page, so it can look for its listing in it.
    expect(await first).toEqual(page(["old", "a"]));
    expect(t.ids()).toEqual(["new", "a"]);
  });

  it("should not let a reload started earlier overwrite a re-read that landed after it", async () => {
    const t = setup();
    t.loader.reload();
    const read = t.loader.refreshFirstPage();
    t.calls[1].resolve(page(["posted", "a"]));
    await read;
    t.calls[0].resolve(page(["a"]));
    await t.settle();
    expect(t.ids()).toEqual(["posted", "a"]);
  });

  it("should hand a failed re-read back to its caller and leave the rows alone", async () => {
    const t = setup();
    t.loader.reload();
    t.calls[0].resolve(page(["a"]));
    await t.settle();
    const read = t.loader.refreshFirstPage();
    t.calls[1].reject(new Error("offline"));
    await expect(read).rejects.toThrow("offline");
    expect(t.ids()).toEqual(["a"]);
    expect(t.state().error).toBeUndefined();
  });

  it("should fail the table when the first page fails", async () => {
    const t = setup();
    t.loader.reload();
    t.calls[0].reject(new TypeError("Failed to fetch"));
    await t.settle();
    expect(t.state().phase).toBe("failed");
    expect(t.state().error).toBe(BROWSE_UNREACHABLE);
  });

  it("should not ask for more when there is no next page", () => {
    const t = setup();
    t.loader.showMore(t.state());
    expect(t.calls).toEqual([]);
  });
});
