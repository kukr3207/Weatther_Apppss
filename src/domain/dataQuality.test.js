import { describe, expect, test } from 'vitest';
import { assessWeatherData } from './dataQuality';

const NOW = new Date('2024-03-15T12:00:00.000Z');

function current(overrides = {}) {
  return {
    observedAt: '2024-03-15T11:50:00.000Z',
    location: { latitude: 51.5, longitude: -0.1 },
    ...overrides,
  };
}

function forecast(overrides = {}) {
  return {
    location: { latitude: 51.5, longitude: -0.1 },
    items: Array.from({ length: 8 }, (_, index) => ({
      forecastAt: new Date(NOW.getTime() + (index + 1) * 10_800_000).toISOString(),
    })),
    ...overrides,
  };
}

describe('weather data quality', () => {
  test('gives complete recent consistent data an excellent score', () => {
    const result = assessWeatherData(current(), forecast(), {
      observedAt: '2024-03-15T11:45:00.000Z',
    }, { now: NOW });
    expect(result.grade).toBe('excellent');
    expect(result.issues).toHaveLength(0);
  });

  test('reports missing current conditions', () => {
    const result = assessWeatherData(null, forecast(), null, { now: NOW });
    expect(result.issues.some((item) => item.id === 'current-missing')).toBe(true);
    expect(result.score).toBeLessThan(60);
  });

  test('reports stale current and air-quality readings', () => {
    const result = assessWeatherData(
      current({ observedAt: '2024-03-15T06:00:00Z' }),
      forecast(),
      { observedAt: '2024-03-15T01:00:00Z' },
      { now: NOW },
    );
    expect(result.issues.map((item) => item.id)).toEqual(expect.arrayContaining(['current-stale', 'air-stale']));
  });

  test('reports short or out-of-order forecast coverage', () => {
    const result = assessWeatherData(current(), forecast({
      items: [
        { forecastAt: '2024-03-15T15:00:00Z' },
        { forecastAt: '2024-03-15T12:00:00Z' },
      ],
    }), { observedAt: '2024-03-15T11:45:00Z' }, { now: NOW });
    expect(result.issues.map((item) => item.id)).toEqual(expect.arrayContaining(['forecast-short', 'forecast-order']));
  });

  test('reports coordinate mismatches', () => {
    const result = assessWeatherData(current(), forecast({
      location: { latitude: 40.7, longitude: -74 },
    }), { observedAt: '2024-03-15T11:45:00Z' }, { now: NOW });
    expect(result.issues.some((item) => item.id === 'location-mismatch')).toBe(true);
  });
});
