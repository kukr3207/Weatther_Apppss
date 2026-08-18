import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_CURRENT_WEATHER, DEFAULT_FORECAST } from '../data/defaultWeather';
import { WeatherServiceError, WEATHER_ERROR_CODES } from '../services/errors';
import { useWeatherDashboard } from './useWeatherDashboard';

function repository(initial = []) {
  let value = initial;
  return {
    list: vi.fn(() => value),
    has: vi.fn((location) => value.some((item) => item.id === location.id)),
    add: vi.fn((location) => { value = [{ ...location }]; return value; }),
    remove: vi.fn(() => { value = []; return value; }),
  };
}

function dependencies(overrides = {}) {
  const favorites = repository();
  const recent = { list: vi.fn(() => []), record: vi.fn(() => []), clear: vi.fn(() => []) };
  const settings = {
    read: vi.fn(() => ({ unitSystem: 'metric', theme: 'system', refreshMinutes: 10 })),
    update: vi.fn((changes) => ({ unitSystem: changes.unitSystem, theme: 'system', refreshMinutes: 10 })),
  };
  const client = {
    searchLocations: vi.fn().mockResolvedValue([DEFAULT_CURRENT_WEATHER.location]),
    getCurrent: vi.fn().mockResolvedValue(DEFAULT_CURRENT_WEATHER),
    getForecast: vi.fn().mockResolvedValue(DEFAULT_FORECAST),
  };
  return { favorites, recent, settings, client, ...overrides };
}

describe('weather dashboard hook', () => {
  test('searches, loads both feeds, and records the result', async () => {
    const options = dependencies();
    const { result } = renderHook(() => useWeatherDashboard(options));
    await act(() => result.current.search('London'));
    expect(options.client.searchLocations).toHaveBeenCalledWith('London');
    expect(options.client.getCurrent).toHaveBeenCalled();
    expect(options.client.getForecast).toHaveBeenCalled();
    expect(options.recent.record).toHaveBeenCalled();
    expect(result.current.status).toEqual({ type: 'success', message: 'Weather updated for London.' });
  });

  test('preserves current data after a request failure', async () => {
    const options = dependencies({
      client: {
        searchLocations: vi.fn().mockRejectedValue(
          new WeatherServiceError(WEATHER_ERROR_CODES.network, 'Network unavailable.'),
        ),
      },
    });
    const { result } = renderHook(() => useWeatherDashboard(options));
    await act(() => result.current.search('Paris'));
    expect(result.current.current).toBe(DEFAULT_CURRENT_WEATHER);
    expect(result.current.status).toEqual({ type: 'error', message: 'Network unavailable.' });
  });

  test('updates favorites and unit settings', () => {
    const options = dependencies();
    const { result } = renderHook(() => useWeatherDashboard(options));
    act(() => result.current.toggleFavorite());
    expect(result.current.favorites).toHaveLength(1);
    act(() => result.current.setUnitSystem('imperial'));
    expect(result.current.settings.unitSystem).toBe('imperial');
  });
});
