const FAVORITES_KEY = 'favorites.v1';
const DEFAULT_LIMIT = 8;

function isLocation(value) {
  return value
    && typeof value === 'object'
    && typeof value.name === 'string'
    && typeof value.country === 'string'
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude);
}

function normalizedLocation(location) {
  if (!isLocation(location)) throw new TypeError('A valid location is required.');
  return {
    id: `${location.latitude},${location.longitude}`,
    name: location.name.trim(),
    country: location.country.trim(),
    state: typeof location.state === 'string' && location.state.trim() ? location.state.trim() : null,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export function createFavoritesRepository(store, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;

  function list() {
    const stored = store.get(FAVORITES_KEY, []);
    return Array.isArray(stored) ? stored.filter(isLocation).slice(0, limit) : [];
  }

  return {
    list,

    has(location) {
      const candidate = normalizedLocation(location);
      return list().some((favorite) => favorite.id === candidate.id);
    },

    add(location) {
      const candidate = normalizedLocation(location);
      const favorites = list();
      if (favorites.some((favorite) => favorite.id === candidate.id)) return favorites;
      const next = [candidate, ...favorites].slice(0, limit);
      store.set(FAVORITES_KEY, next);
      return next;
    },

    remove(locationId) {
      const next = list().filter((favorite) => favorite.id !== locationId);
      store.set(FAVORITES_KEY, next);
      return next;
    },

    replace(locations) {
      const next = (Array.isArray(locations) ? locations : [])
        .map((location) => {
          try { return normalizedLocation(location); } catch { return null; }
        })
        .filter(Boolean)
        .filter((location, index, all) => all.findIndex((item) => item.id === location.id) === index)
        .slice(0, limit);
      store.set(FAVORITES_KEY, next);
      return next;
    },
  };
}
