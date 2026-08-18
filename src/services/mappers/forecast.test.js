import { describe, expect, test } from 'vitest';
import { WeatherServiceError } from '../errors';
import { mapForecast } from './forecast';

const item = {
  dt: 1_700_000_000,
  main: { temp: 12, feels_like: 11, temp_min: 10, temp_max: 13, humidity: 77 },
  pop: 0.35,
  rain: { '3h': 1.4 },
  wind: { speed: 4.2 },
  weather: [{ icon: '10d', description: 'light rain' }],
};

const response = {
  city: { name: 'London', country: 'GB', coord: { lat: 51.5, lon: -0.12 }, timezone: 0 },
  list: [item, { ...item, dt: item.dt + 10_800, pop: 2 }],
};

describe('forecast mapper', () => {
  test('maps location and forecast slots', () => {
    const forecast = mapForecast(response);
    expect(forecast.location).toEqual({
      name: 'London',
      country: 'GB',
      latitude: 51.5,
      longitude: -0.12,
      timezoneOffsetSeconds: 0,
    });
    expect(forecast.items[0]).toMatchObject({
      temperatureC: 12,
      minimumC: 10,
      maximumC: 13,
      precipitationProbability: 0.35,
      rainMm: 1.4,
      condition: { iconCode: '10d', description: 'light rain' },
    });
  });

  test('clamps precipitation probability and defaults missing rainfall', () => {
    const forecast = mapForecast({ ...response, list: [{ ...item, pop: -1, rain: undefined }, response.list[1]] });
    expect(forecast.items[0].precipitationProbability).toBe(0);
    expect(forecast.items[0].rainMm).toBe(0);
    expect(forecast.items[1].precipitationProbability).toBe(1);
  });

  test('rejects malformed forecast slots', () => {
    expect(() => mapForecast({ ...response, list: [{ ...item, wind: {} }] }))
      .toThrow(WeatherServiceError);
  });
});
