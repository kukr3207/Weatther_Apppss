const SNAPSHOTS_KEY = 'weather-snapshots.v1';
const MAX_SNAPSHOTS = 48;
const MAX_PER_LOCATION = 12;

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') return null;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const name = typeof location.name === 'string' ? location.name.trim() : '';
  if (!name) return null;
  return {
    id: typeof location.id === 'string' && location.id.trim()
      ? location.id.trim()
      : `${location.latitude},${location.longitude}`,
    name,
    country: typeof location.country === 'string' ? location.country.trim() : '',
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const location = normalizeLocation(snapshot.location);
  const recordedAt = Date.parse(snapshot.recordedAt);
  if (!location || Number.isNaN(recordedAt)) return null;
  const numericFields = [
    'temperatureC',
    'feelsLikeC',
    'humidityPercent',
    'pressureHpa',
    'windSpeedMps',
    'visibilityMeters',
  ];
  const result = {
    id: typeof snapshot.id === 'string' && snapshot.id.trim()
      ? snapshot.id.trim()
      : `${location.id}:${recordedAt}`,
    location,
    recordedAt: new Date(recordedAt).toISOString(),
    condition: typeof snapshot.condition === 'string' ? snapshot.condition.trim().slice(0, 120) : '',
    airQualityIndex: Number.isInteger(snapshot.airQualityIndex) ? snapshot.airQualityIndex : null,
  };
  numericFields.forEach((field) => {
    result[field] = Number.isFinite(snapshot[field]) ? snapshot[field] : null;
  });
  return result;
}

function snapshotFromWeather(current, airQuality, recordedAt) {
  if (!current?.location) return null;
  return normalizeSnapshot({
    id: `${current.location.latitude},${current.location.longitude}:${recordedAt.getTime()}`,
    location: current.location,
    recordedAt: recordedAt.toISOString(),
    temperatureC: current.temperatureC,
    feelsLikeC: current.feelsLikeC,
    humidityPercent: current.humidityPercent,
    pressureHpa: current.pressureHpa,
    windSpeedMps: current.wind?.speedMps,
    visibilityMeters: current.visibilityMeters,
    condition: current.condition?.description,
    airQualityIndex: airQuality?.index,
  });
}

export function createSnapshotRepository(store, options = {}) {
  const now = options.now ?? (() => new Date());

  function list() {
    const source = store.get(SNAPSHOTS_KEY, []);
    if (!Array.isArray(source)) return [];
    const seen = new Set();
    return source
      .map(normalizeSnapshot)
      .filter((snapshot) => {
        if (!snapshot || seen.has(snapshot.id)) return false;
        seen.add(snapshot.id);
        return true;
      })
      .sort((first, second) => Date.parse(second.recordedAt) - Date.parse(first.recordedAt))
      .slice(0, MAX_SNAPSHOTS);
  }

  function write(items) {
    const counts = new Map();
    const limited = items
      .map(normalizeSnapshot)
      .filter(Boolean)
      .sort((first, second) => Date.parse(second.recordedAt) - Date.parse(first.recordedAt))
      .filter((snapshot) => {
        const count = counts.get(snapshot.location.id) ?? 0;
        if (count >= MAX_PER_LOCATION) return false;
        counts.set(snapshot.location.id, count + 1);
        return true;
      })
      .slice(0, MAX_SNAPSHOTS);
    store.set(SNAPSHOTS_KEY, limited);
    return limited;
  }

  return {
    list,
    forLocation(locationId) {
      return list().filter((snapshot) => snapshot.location.id === locationId);
    },
    record(current, airQuality = null) {
      const snapshot = snapshotFromWeather(current, airQuality, now());
      if (!snapshot) throw new TypeError('Current weather is required to record a snapshot.');
      write([snapshot, ...list()]);
      return snapshot;
    },
    remove(id) {
      return write(list().filter((snapshot) => snapshot.id !== id));
    },
    clearLocation(locationId) {
      return write(list().filter((snapshot) => snapshot.location.id !== locationId));
    },
    clear() {
      store.remove(SNAPSHOTS_KEY);
      return [];
    },
    latest(locationId) {
      return this.forLocation(locationId)[0] ?? null;
    },
  };
}
