import { WEATHER_ERROR_CODES } from './errors';

function cacheResult(entry, type) {
  return {
    data: entry.value,
    source: entry.state === 'fresh' ? 'cache' : 'stale-cache',
    cachedAt: entry.savedAt,
    type,
  };
}

export function createWeatherGateway(options) {
  const client = options.client;
  const cache = options.cache;
  if (!client) throw new TypeError('A weather client is required.');
  if (!cache) throw new TypeError('A weather cache is required.');

  async function read(type, location, loader, requestOptions = {}) {
    const cached = cache.read(type, location, { allowStale: true });
    if (cached?.state === 'fresh' && requestOptions.force !== true) return cacheResult(cached, type);

    try {
      const data = await loader();
      cache.write(type, location, data);
      return { data, source: 'network', cachedAt: null, type };
    } catch (error) {
      const canUseStale = requestOptions.allowStale !== false
        && cached
        && error?.code !== WEATHER_ERROR_CODES.aborted
        && error?.code !== WEATHER_ERROR_CODES.configuration;
      if (canUseStale) return cacheResult(cached, type);
      throw error;
    }
  }

  return {
    getCurrent(location, requestOptions = {}) {
      return read(
        'current',
        location,
        () => client.getCurrent(location, { signal: requestOptions.signal }),
        requestOptions,
      );
    },
    getForecast(location, requestOptions = {}) {
      return read(
        'forecast',
        location,
        () => client.getForecast(location, { signal: requestOptions.signal }),
        requestOptions,
      );
    },
    getAirQuality(location, requestOptions = {}) {
      if (typeof client.getAirQuality !== 'function') return Promise.resolve(null);
      return read(
        'airQuality',
        location,
        () => client.getAirQuality(location, { signal: requestOptions.signal }),
        requestOptions,
      );
    },
    async getBundle(location, requestOptions = {}) {
      const [current, forecast, airQuality] = await Promise.all([
        this.getCurrent(location, requestOptions),
        this.getForecast(location, requestOptions),
        this.getAirQuality(location, requestOptions),
      ]);
      const sources = [current, forecast, airQuality].filter(Boolean).map((result) => result.source);
      return {
        current: current.data,
        forecast: forecast.data,
        airQuality: airQuality?.data?.current ?? null,
        airQualityForecast: airQuality?.data?.readings ?? [],
        source: sources.includes('network') ? 'network' : sources.includes('stale-cache') ? 'stale-cache' : 'cache',
      };
    },
    clearLocation(location) {
      cache.removeLocation(location);
    },
  };
}
