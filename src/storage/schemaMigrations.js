const SCHEMA_KEY = 'schema-version';
export const CURRENT_SCHEMA_VERSION = 3;

function migrateSettingsV1ToV2(store) {
  const settings = store.get('settings.v1', null);
  if (!settings || typeof settings !== 'object') return;
  if (settings.colorScheme && !settings.theme) {
    store.set('settings.v1', { ...settings, theme: settings.colorScheme });
  }
}

function migrateFavoritesV1ToV2(store) {
  const favorites = store.get('favorites.v1', null);
  if (!Array.isArray(favorites)) return;
  const migrated = favorites.map((favorite) => {
    if (!favorite || typeof favorite !== 'object') return favorite;
    if (favorite.id) return favorite;
    if (!Number.isFinite(favorite.latitude) || !Number.isFinite(favorite.longitude)) return favorite;
    return { ...favorite, id: `${favorite.latitude},${favorite.longitude}` };
  });
  store.set('favorites.v1', migrated);
}

function migrateRecentSearchesV1ToV2(store) {
  const searches = store.get('recent-searches.v1', null);
  if (!Array.isArray(searches)) return;
  const migrated = searches.map((search) => {
    if (!search || typeof search !== 'object') return search;
    return {
      ...search,
      searchedAt: search.searchedAt ?? search.updatedAt ?? new Date(0).toISOString(),
    };
  });
  store.set('recent-searches.v1', migrated);
}

const MIGRATIONS = Object.freeze({
  1: [migrateSettingsV1ToV2, migrateFavoritesV1ToV2],
  2: [migrateRecentSearchesV1ToV2],
});

export function readSchemaVersion(store) {
  const version = store.get(SCHEMA_KEY, 1);
  return Number.isInteger(version) && version >= 1 ? version : 1;
}

export function migrateStoredData(store, options = {}) {
  const target = options.targetVersion ?? CURRENT_SCHEMA_VERSION;
  let current = readSchemaVersion(store);
  const applied = [];
  while (current < target) {
    const migrations = MIGRATIONS[current] ?? [];
    migrations.forEach((migration) => migration(store));
    current += 1;
    store.set(SCHEMA_KEY, current);
    applied.push(current);
  }
  return { version: current, applied };
}

export function resetStoredData(store, keys = []) {
  const knownKeys = [
    'settings.v1',
    'favorites.v1',
    'recent-searches.v1',
    'weather-cache.v2',
    'dashboards.v1',
    'location-notes.v1',
    'alert-preferences.v1',
    'health-profile.v1',
    'weather-snapshots.v1',
    'planner-preferences.v1',
  ];
  const selected = keys.length ? keys.filter((key) => knownKeys.includes(key)) : knownKeys;
  selected.forEach((key) => store.remove(key));
  store.set(SCHEMA_KEY, CURRENT_SCHEMA_VERSION);
  return selected;
}
