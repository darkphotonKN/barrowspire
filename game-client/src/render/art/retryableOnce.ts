/**
 * A load shared by every caller: once it succeeds, its value is served for the life of the page.
 * A failure answers null to the callers already waiting on it and is then forgotten, so the next
 * call tries again. One failed fetch never blanks every caller for good.
 */
export function retryableOnce<T>(load: () => Promise<T>): () => Promise<T | null> {
  let pending: Promise<T | null> | undefined;
  return () => {
    pending ??= load().catch(() => {
      pending = undefined;
      return null;
    });
    return pending;
  };
}
