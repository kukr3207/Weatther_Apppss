import { describe, expect, test, vi } from 'vitest';
import { createOpenWeatherClient } from './openWeatherClient';
import { WeatherServiceError, WEATHER_ERROR_CODES } from './errors';

const config = { apiKey: 'test-key', baseUrl: 'https://weather.example.test' };

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

describe('OpenWeather client', () => {
  test('searches normalized location text', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([
      { name: 'Paris', country: 'FR', lat: 48.86, lon: 2.35 },
    ]));
    const client = createOpenWeatherClient({ config, fetcher });

    const locations = await client.searchLocations('  Paris  ', { limit: 3 });

    expect(locations[0].label).toBe('Paris, FR');
    const [url, options] = fetcher.mock.calls[0];
    expect(url.pathname).toBe('/geo/1.0/direct');
    expect(url.searchParams.get('q')).toBe('Paris');
    expect(url.searchParams.get('limit')).toBe('3');
    expect(url.searchParams.get('appid')).toBe('test-key');
    expect(options.headers.Accept).toBe('application/json');
  });

  test('does not request an empty location query', async () => {
    const fetcher = vi.fn();
    const client = createOpenWeatherClient({ config, fetcher });
    await expect(client.searchLocations('   ')).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('maps HTTP failures to weather errors', async () => {
    const client = createOpenWeatherClient({
      config,
      fetcher: vi.fn().mockResolvedValue(response({}, 429)),
    });
    await expect(client.searchLocations('Paris')).rejects.toMatchObject({
      code: WEATHER_ERROR_CODES.rateLimited,
      retryable: true,
      status: 429,
    });
  });

  test('maps network and cancellation failures', async () => {
    const networkClient = createOpenWeatherClient({
      config,
      fetcher: vi.fn().mockRejectedValue(new TypeError('offline')),
    });
    await expect(networkClient.searchLocations('Paris')).rejects.toMatchObject({
      code: WEATHER_ERROR_CODES.network,
      retryable: true,
    });

    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    const abortClient = createOpenWeatherClient({ config, fetcher: vi.fn().mockRejectedValue(abort) });
    await expect(abortClient.searchLocations('Paris')).rejects.toMatchObject({
      code: WEATHER_ERROR_CODES.aborted,
    });
  });

  test('rejects missing configuration and coordinates', async () => {
    const missingConfig = createOpenWeatherClient({ config: { ...config, apiKey: '' }, fetcher: vi.fn() });
    await expect(missingConfig.searchLocations('Paris')).rejects.toBeInstanceOf(WeatherServiceError);

    const client = createOpenWeatherClient({ config, fetcher: vi.fn() });
    await expect(client.getCurrent({ name: 'Paris' })).rejects.toBeInstanceOf(TypeError);
  });
});
