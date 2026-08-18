import { describe, expect, test } from 'vitest';
import { WeatherServiceError, WEATHER_ERROR_CODES } from '../errors';
import { mapCurrentWeather } from './currentWeather';

const response = {
  name: 'Paris',
  coord: { lat: 48.86, lon: 2.35 },
  sys: { country: 'FR', sunrise: 1_700_000_000, sunset: 1_700_040_000 },
  dt: 1_700_020_000,
  timezone: 3600,
  main: { temp: 17.4, feels_like: 16.8, humidity: 71, pressure: 1014 },
  visibility: 9000,
  wind: { speed: 3.26, deg: 240, gust: 5.1 },
  weather: [{ id: 500, description: 'light rain', icon: '10d' }],
};

describe('current weather mapper', () => {
  test('maps service fields to the app model', () => {
    expect(mapCurrentWeather(response)).toMatchObject({
      location: { name: 'Paris', country: 'FR', latitude: 48.86, longitude: 2.35 },
      temperatureC: 17.4,
      feelsLikeC: 16.8,
      humidityPercent: 71,
      pressureHpa: 1014,
      wind: { speedMps: 3.26, directionDegrees: 240, gustMps: 5.1 },
      condition: { id: 500, description: 'light rain', iconCode: '10d' },
    });
  });

  test('converts service timestamps to ISO strings', () => {
    const mapped = mapCurrentWeather(response);
    expect(mapped.observedAt).toBe(new Date(response.dt * 1000).toISOString());
    expect(mapped.sunriseAt).toBe(new Date(response.sys.sunrise * 1000).toISOString());
  });

  test('keeps optional readings nullable', () => {
    const mapped = mapCurrentWeather({
      ...response,
      visibility: undefined,
      wind: { speed: 3.26 },
    });
    expect(mapped.visibilityMeters).toBeNull();
    expect(mapped.wind.directionDegrees).toBeNull();
    expect(mapped.wind.gustMps).toBeNull();
  });

  test('rejects incomplete service responses', () => {
    expect(() => mapCurrentWeather({ ...response, main: {} })).toThrow(WeatherServiceError);
    try {
      mapCurrentWeather({ ...response, name: '' });
    } catch (error) {
      expect(error.code).toBe(WEATHER_ERROR_CODES.invalidResponse);
    }
  });
});
