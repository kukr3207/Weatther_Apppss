import { describe, expect, test } from 'vitest';
import {
  WeatherConfigurationError,
  readWeatherConfig,
  requireWeatherConfig,
} from './weather';

describe('weather configuration', () => {
  test('normalizes keys and base URLs', () => {
    expect(readWeatherConfig({
      VITE_OPENWEATHER_API_KEY: ' key ',
      VITE_OPENWEATHER_BASE_URL: 'https://weather.example.test///',
    })).toEqual({
      apiKey: 'key',
      baseUrl: 'https://weather.example.test',
      isConfigured: true,
    });
  });

  test('uses the public service URL by default', () => {
    expect(readWeatherConfig({}).baseUrl).toBe('https://api.openweathermap.org');
  });

  test('rejects a missing API key when configuration is required', () => {
    expect(() => requireWeatherConfig({ VITE_OPENWEATHER_API_KEY: ' ' }))
      .toThrow(WeatherConfigurationError);
  });
});
