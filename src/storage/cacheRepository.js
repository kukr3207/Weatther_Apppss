const CACHE_KEY = 'weather-cache.v2';
const MAX_ENTRIES = 24;

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string' || !entry.key.trim()) return null;
  const savedAt = timestamp(entry.savedAt);
  const expiresAt = timestamp(entry.expiresAt);
  const staleAt = timestamp(entry.staleAt);
  if ([savedAt, expiresAt, staleAt].some((value) => value === null)) return null;
  if (expiresAt < savedAt || staleAt < expiresAt) return null;
  return {
    key: entry.key.trim(),
    value: entry.value,
    savedAt: new Date(savedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    staleAt: new Date(staleAt).toISOString(),
  };
}

function normalizeEntries(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeEntry)
    .filter((entry) => {
      if (!entry || seen.has(entry.key)) return false;
      seen.add(entry.key);
      return true;
    })
    .sort((first, second) => Date.parse(second.savedAt) - Date.parse(first.savedAt))
    .slice(0, MAX_ENTRIES);
}

export function createCacheRepository(store, options = {}) {
  const now = options.now ?? (() => new Date());

  function list() {
    return normalizeEntries(store.get(CACHE_KEY, []));
  }

  function write(entries) {
    const normalized = normalizeEntries(entries);
    store.set(CACHE_KEY, normalized);
    return normalized;
  }

  return {
    list,
    get(key, readOptions = {}) {
      const entry = list().find((candidate) => candidate.key === key) ?? null;
      if (!entry) return null;
      const current = now().getTime();
      const expires = Date.parse(entry.expiresAt);
      const stale = Date.parse(entry.staleAt);
      if (current > stale) {
        write(list().filter((candidate) => candidate.key !== key));
        return null;
      }
      const state = current <= expires ? 'fresh' : 'stale';
      if (state === 'stale' && readOptions.allowStale === false) return null;
      return { ...entry, state };
    },
    put(key, value, entryOptions = {}) {
      const savedAt = now();
      const freshMinutes = Number.isFinite(entryOptions.freshMinutes)
        ? Math.max(1, entryOptions.freshMinutes)
        : 10;
      const staleMinutes = Number.isFinite(entryOptions.staleMinutes)
        ? Math.max(freshMinutes, entryOptions.staleMinutes)
        : 180;
      const entry = {
        key,
        value,
        savedAt: savedAt.toISOString(),
        expiresAt: new Date(savedAt.getTime() + freshMinutes * 60_000).toISOString(),
        staleAt: new Date(savedAt.getTime() + staleMinutes * 60_000).toISOString(),
      };
      write([entry, ...list().filter((candidate) => candidate.key !== key)]);
      return normalizeEntry(entry);
    },
    remove(key) {
      return write(list().filter((entry) => entry.key !== key));
    },
    clearExpired() {
      const current = now().getTime();
      return write(list().filter((entry) => Date.parse(entry.staleAt) >= current));
    },
    clear() {
      store.remove(CACHE_KEY);
      return [];
    },
    stats() {
      const entries = list();
      const current = now().getTime();
      return entries.reduce((result, entry) => {
        result.total += 1;
        if (current <= Date.parse(entry.expiresAt)) result.fresh += 1;
        else if (current <= Date.parse(entry.staleAt)) result.stale += 1;
        else result.expired += 1;
        return result;
      }, { total: 0, fresh: 0, stale: 0, expired: 0 });
    },
  };
}
