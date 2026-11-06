import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/utils/apiError";
import {
  PURSE_UNKNOWN,
  PurseReader,
  purseView,
  type PurseApi,
  type PurseView,
} from "./purse";

const account = (gold: number, heldGold = 0) => ({
  gold,
  heldGold,
  availableGold: gold - heldGold,
});

/** A promise the test settles by hand, so a read in flight can be overtaken. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function reader(api: PurseApi) {
  const shown: PurseView[] = [];
  const purse = new PurseReader(api, { setPurse: (v) => shown.push(v) });
  return { purse, shown, last: () => shown[shown.length - 1] };
}

const notFound = () =>
  new ApiError({ code: "NOT_FOUND", status: 404, detail: "", errors: [] });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("purseView (FS-7TGZ3 §A R3, §B R5, R7)", () => {
  it.each([
    ["zero", account(0), "0", "Available 0 · Held in bids 0"],
    ["a small purse", account(50), "50", "Available 50 · Held in bids 0"],
    [
      "a purse with gold held in bids",
      account(1234567, 4500),
      "1,234,567",
      "Available 1,230,067 · Held in bids 4,500",
    ],
    [
      "every coin held",
      account(800, 800),
      "800",
      "Available 0 · Held in bids 800",
    ],
    [
      "the largest safe integer",
      account(Number.MAX_SAFE_INTEGER),
      "9,007,199,254,740,991",
      "Available 9,007,199,254,740,991 · Held in bids 0",
    ],
  ])(
    "should show the total of %s, grouped, with the split in its tip",
    (_l, a, amount, tip) => {
      expect(purseView(a)).toEqual({ amount, tip });
    },
  );

  it("should show the dash and no tip without an account", () => {
    expect(purseView(undefined)).toEqual({ amount: PURSE_UNKNOWN });
    expect(PURSE_UNKNOWN).toBe("—");
  });

  it("should show the dash for an answer that carries no total", () => {
    expect(purseView({} as never)).toEqual({ amount: PURSE_UNKNOWN });
  });
});

describe("PurseReader (FS-7TGZ3 §C R10–11, §D R12–13)", () => {
  it("should read the wallet once and show its total", async () => {
    const api = { getWalletAccount: vi.fn(async () => account(1500, 200)) };
    const { purse, last } = reader(api);

    await purse.refresh();

    expect(api.getWalletAccount).toHaveBeenCalledTimes(1);
    expect(last()).toEqual({
      amount: "1,500",
      tip: "Available 1,300 · Held in bids 200",
    });
  });

  it("should show the dash, quietly, while the wallet is not made yet (404)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { purse, last } = reader({
      getWalletAccount: async () => {
        throw notFound();
      },
    });

    await purse.refresh();

    expect(last()).toEqual({ amount: PURSE_UNKNOWN });
    expect(warn).not.toHaveBeenCalled();
  });

  it("should log a 404 that is not NOT_FOUND (a missed route), still showing the dash", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { purse, last } = reader({
      getWalletAccount: async () => {
        throw new ApiError({
          code: "UNKNOWN_ERROR",
          status: 404,
          detail: "",
          errors: [],
        });
      },
    });

    await purse.refresh();

    expect(last()).toEqual({ amount: PURSE_UNKNOWN });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("should show the dash on any other failure, with one warning and no notice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { purse, shown } = reader({
      getWalletAccount: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    await purse.refresh();

    expect(shown).toEqual([{ amount: PURSE_UNKNOWN }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("should show the dash for a failed read after an earlier success (R13)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let fail = false;
    const { purse, last } = reader({
      getWalletAccount: async () => {
        if (fail) throw new Error("down");
        return account(70);
      },
    });

    await purse.refresh();
    expect(last().amount).toBe("70");
    fail = true;
    await purse.refresh();
    expect(last()).toEqual({ amount: PURSE_UNKNOWN });
  });

  it("should show nothing until an answer lands, so the last total stays meanwhile (R10)", async () => {
    const answer = deferred<ReturnType<typeof account>>();
    const { purse, shown } = reader({ getWalletAccount: () => answer.promise });

    const read = purse.refresh();
    expect(shown).toEqual([]);
    answer.resolve(account(9));
    await read;
    expect(shown).toEqual([
      { amount: "9", tip: "Available 9 · Held in bids 0" },
    ]);
  });

  it("should drop an answer that a later read overtook (R11)", async () => {
    const first = deferred<ReturnType<typeof account>>();
    const second = deferred<ReturnType<typeof account>>();
    const answers = [first.promise, second.promise];
    const { purse, shown } = reader({
      getWalletAccount: () => answers.shift()!,
    });

    const a = purse.refresh();
    const b = purse.refresh();
    second.resolve(account(200));
    await b;
    first.resolve(account(100));
    await a;

    expect(shown.map((v) => v.amount)).toEqual(["200"]);
  });

  it("should drop a failure that a later read overtook", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = deferred<ReturnType<typeof account>>();
    const answers = [first.promise, Promise.resolve(account(5))];
    const { purse, shown } = reader({
      getWalletAccount: () => answers.shift()!,
    });

    const a = purse.refresh();
    await purse.refresh();
    first.reject(new Error("late"));
    await a;

    expect(shown.map((v) => v.amount)).toEqual(["5"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("PurseReader.forget (FS-7TGZ3: an answer outliving its world)", () => {
  it("should drop an answer that lands after forget, the shelf untouched", async () => {
    const answer = deferred<ReturnType<typeof account>>();
    const { purse, shown } = reader({ getWalletAccount: () => answer.promise });

    const read = purse.refresh();
    purse.forget();
    answer.resolve(account(300));
    await read;

    expect(shown).toEqual([]);
  });

  it("should drop a failure that lands after forget, logging nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = deferred<ReturnType<typeof account>>();
    const { purse, shown } = reader({ getWalletAccount: () => answer.promise });

    const read = purse.refresh();
    purse.forget();
    answer.reject(new Error("gone"));
    await read;

    expect(shown).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("should still read after forget, when asked again", async () => {
    const { purse, last } = reader({ getWalletAccount: async () => account(4) });
    purse.forget();
    await purse.refresh();
    expect(last().amount).toBe("4");
  });
});
