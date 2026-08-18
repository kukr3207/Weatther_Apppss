import { readWeatherConfig } from '../config/weather';
import { mapCurrentWeather } from './mappers/currentWeather';
import { mapForecast } from './mappers/forecast';
import { mapLocations } from './mappers/locations';
import { mapAirQuality, mapAirQualityForecast } from './mappers/airQuality';
import { WeatherServiceError, WEATHER_ERROR_CODES, weatherErrorFromStatus } from './errors';

function coordinates(location) {
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) {
    throw new TypeError('A location with numeric latitude and longitude is required.');
  }
  return { lat: String(location.latitude), lon: String(location.longitude) };
}

export function createOpenWeatherClient(options = {}) {
  const config = options.config ?? readWeatherConfig();
  const fetcher = options.fetcher ?? globalThis.fetch;

  async function request(path, parameters, signal) {
    if (!config.apiKey) {
      throw new WeatherServiceError(
        WEATHER_ERROR_CODES.configuration,
        'Weather service is not configured.',
      );
    }

    const url = new URL(path, `${config.baseUrl}/`);
    Object.entries({ ...parameters, appid: config.apiKey }).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    let response;
    try {
      response = await fetcher(url, { signal, headers: { Accept: 'application/json' } });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new WeatherServiceError(WEATHER_ERROR_CODES.aborted, 'Weather request was cancelled.');
      }
      throw new WeatherServiceError(
        WEATHER_ERROR_CODES.network,
        'Unable to reach the weather service.',
        { cause: error, retryable: true },
      );
    }

    if (!response.ok) throw weatherErrorFromStatus(response.status);
    return response.json();
  }

  return {
    async searchLocations(query, { limit = 5, signal } = {}) {
      const normalized = typeof query === 'string' ? query.trim() : '';
      if (!normalized) return [];
      const payload = await request('/geo/1.0/direct', { q: normalized, limit }, signal);
      return mapLocations(payload);
    },

    async getCurrent(location, { signal } = {}) {
      const payload = await request(
        '/data/2.5/weather',
        { ...coordinates(location), units: 'metric' },
        signal,
      );
      return mapCurrentWeather(payload);
    },

    async getForecast(location, { signal } = {}) {
      const payload = await request(
        '/data/2.5/forecast',
        { ...coordinates(location), units: 'metric' },
        signal,
      );
      return mapForecast(payload);
    },

    async getAirQuality(location, { signal } = {}) {
      const payload = await request(
        '/data/2.5/air_pollution',
        coordinates(location),
        signal,
      );
      return mapAirQuality(payload);
    },

    async getAirQualityForecast(location, { signal } = {}) {
      const payload = await request(
        '/data/2.5/air_pollution/forecast',
        coordinates(location),
        signal,
      );
      return mapAirQualityForecast(payload);
    },
  };
}
