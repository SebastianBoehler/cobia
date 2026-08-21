export interface AsyncCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
}

export function createTtlAsyncCache<T>({
  ttlMs,
  maxEntries,
  now = Date.now,
}: {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}): AsyncCache<T> {
  const entries = new Map<string, { expiresAt: number; value: Promise<T> }>();

  return {
    get(key, load) {
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now()) return cached.value;
      if (cached) entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      const value = load();
      entries.set(key, { expiresAt: now() + ttlMs, value });
      void value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      return value;
    },
  };
}
