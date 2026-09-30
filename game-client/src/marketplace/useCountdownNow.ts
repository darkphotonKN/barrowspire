"use client";

import { useEffect, useState } from "react";
import { nextTickIn } from "./browse";

/**
 * The `now` a set of countdowns renders against (FS-8EGFA req 22). It advances exactly when
 * one of them would read differently: each minute, each second in a last minute, and never
 * again once every one has ended.
 */
export function useCountdownNow(endsAts: readonly string[]): number {
  const [now, setNow] = useState(() => Date.now());
  const key = endsAts.join("|");

  // New rows render against the clock as it is, not as it was at the last tick.
  useEffect(() => setNow(Date.now()), [key]);

  useEffect(() => {
    const delay = nextTickIn(key ? key.split("|") : [], Date.now());
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [key, now]);

  return now;
}
