const RECENT_SEARCHES_KEY = 'recent-searches.v1';
const DEFAULT_LIMIT = 6;

function validEntry(value) {
  return value
    && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.country === 'string'
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && typeof value.searchedAt === 'string';
}

export function createRecentSearchesRepository(store, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const now = options.now ?? (() => new Date());

  function list() {
    const stored = store.get(RECENT_SEARCHES_KEY, []);
    return Array.isArray(stored) ? stored.filter(validEntry).slice(0, limit) : [];
  }

  return {
    list,

    record(location) {
      if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) {
        throw new TypeError('A location with coordinates is required.');
      }
      const id = `${location.latitude},${location.longitude}`;
      const entry = {
        id,
        name: String(location.name).trim(),
        country: String(location.country).trim(),
        state: typeof location.state === 'string' && location.state.trim() ? location.state.trim() : null,
        latitude: location.latitude,
        longitude: location.longitude,
        searchedAt: now().toISOString(),
      };
      const next = [entry, ...list().filter((item) => item.id !== id)].slice(0, limit);
      store.set(RECENT_SEARCHES_KEY, next);
      return next;
    },

    clear() {
      store.remove(RECENT_SEARCHES_KEY);
      return [];
    },

    replace(entries) {
      const next = (Array.isArray(entries) ? entries : [])
        .filter(validEntry)
        .filter((entry, index, all) => all.findIndex((item) => item.id === entry.id) === index)
        .slice(0, limit);
      store.set(RECENT_SEARCHES_KEY, next);
      return next;
    },
  };
}
