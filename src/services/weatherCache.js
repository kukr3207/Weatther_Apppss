function coordinate(value) {
  return Number.isFinite(value) ? value.toFixed(4) : 'unknown';
}

export function weatherCacheKey(type, location) {
  return `${type}:${coordinate(location?.latitude)}:${coordinate(location?.longitude)}`;
}

export function createWeatherCache(repository, options = {}) {
  const policies = {
    current: { freshMinutes: 10, staleMinutes: 180 },
    forecast: { freshMinutes: 30, staleMinutes: 360 },
    airQuality: { freshMinutes: 30, staleMinutes: 360 },
    ...(options.policies ?? {}),
  };

  return {
    read(type, location, readOptions = {}) {
      const entry = repository.get(weatherCacheKey(type, location), readOptions);
      return entry ? { value: entry.value, state: entry.state, savedAt: entry.savedAt } : null;
    },
    write(type, location, value) {
      const policy = policies[type] ?? policies.current;
      return repository.put(weatherCacheKey(type, location), value, policy);
    },
    removeLocation(location) {
      Object.keys(policies).forEach((type) => repository.remove(weatherCacheKey(type, location)));
    },
    clear() {
      return repository.clear();
    },
    stats() {
      return repository.stats();
    },
  };
}
