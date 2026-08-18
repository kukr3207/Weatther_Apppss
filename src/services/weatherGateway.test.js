import { describe, expect, test, vi } from 'vitest';
import { createWeatherGateway } from './weatherGateway';
import { WeatherServiceError, WEATHER_ERROR_CODES } from './errors';

const location = { latitude: 1, longitude: 2 };

function cache(entry = null) {
  return {
    read: vi.fn(() => entry),
    write: vi.fn(),
    removeLocation: vi.fn(),
  };
}

describe('weather gateway', () => {
  test('uses fresh cached current weather without a network call', async () => {
    const client = { getCurrent: vi.fn() };
    const gateway = createWeatherGateway({ client, cache: cache({ state: 'fresh', value: { temperatureC: 20 }, savedAt: 'now' }) });
    await expect(gateway.getCurrent(location)).resolves.toMatchObject({ source: 'cache', data: { temperatureC: 20 } });
    expect(client.getCurrent).not.toHaveBeenCalled();
  });

  test('loads and caches current weather when no fresh entry exists', async () => {
    const weatherCache = cache(null);
    const client = { getCurrent: vi.fn().mockResolvedValue({ temperatureC: 22 }) };
    const gateway = createWeatherGateway({ client, cache: weatherCache });
    await expect(gateway.getCurrent(location)).resolves.toMatchObject({ source: 'network', data: { temperatureC: 22 } });
    expect(weatherCache.write).toHaveBeenCalledWith('current', location, { temperatureC: 22 });
  });

  test('falls back to stale cache after a retryable failure', async () => {
    const client = { getForecast: vi.fn().mockRejectedValue(new WeatherServiceError(WEATHER_ERROR_CODES.network, 'offline')) };
    const gateway = createWeatherGateway({ client, cache: cache({ state: 'stale', value: { items: [1] }, savedAt: 'before' }) });
    await expect(gateway.getForecast(location)).resolves.toMatchObject({ source: 'stale-cache', data: { items: [1] } });
  });

  test('does not hide cancellation behind stale data', async () => {
    const error = new WeatherServiceError(WEATHER_ERROR_CODES.aborted, 'cancelled');
    const client = { getForecast: vi.fn().mockRejectedValue(error) };
    const gateway = createWeatherGateway({ client, cache: cache({ state: 'stale', value: {}, savedAt: 'before' }) });
    await expect(gateway.getForecast(location)).rejects.toBe(error);
  });

  test('loads a complete network bundle', async () => {
    const client = {
      getCurrent: vi.fn().mockResolvedValue({ temperatureC: 20 }),
      getForecast: vi.fn().mockResolvedValue({ items: [] }),
      getAirQuality: vi.fn().mockResolvedValue({ current: { index: 1 }, readings: [{ index: 1 }] }),
    };
    const gateway = createWeatherGateway({ client, cache: cache(null) });
    const bundle = await gateway.getBundle(location);
    expect(bundle).toMatchObject({
      current: { temperatureC: 20 },
      forecast: { items: [] },
      airQuality: { index: 1 },
      source: 'network',
    });
  });
});
