import { describe, expect, test } from 'vitest';
import { alertCounts, deriveWeatherAlerts, filterAlerts } from './weatherAlerts';

function current(overrides = {}) {
  return {
    observedAt: '2024-03-15T09:00:00.000Z',
    visibilityMeters: 10_000,
    wind: { speedMps: 5, gustMps: null },
    ...overrides,
  };
}

function forecastItem(overrides = {}) {
  return {
    forecastAt: '2024-03-15T12:00:00.000Z',
    minimumC: 10,
    maximumC: 20,
    windSpeedMps: 5,
    precipitationProbability: 0.1,
    rainMm: 0,
    condition: { description: 'few clouds' },
    ...overrides,
  };
}

describe('derived weather alerts', () => {
  test('creates a heat alert from an extreme forecast', () => {
    const alerts = deriveWeatherAlerts(current(), { items: [forecastItem({ maximumC: 44 })] });
    expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'extreme-heat', severity: 'warning' })]));
  });

  test('creates a hard-freeze alert', () => {
    const alerts = deriveWeatherAlerts(current(), { items: [forecastItem({ minimumC: -8 })] });
    expect(alerts[0].type).toBe('hard-freeze');
  });

  test('creates current visibility and gust alerts', () => {
    const alerts = deriveWeatherAlerts(current({ visibilityMeters: 200, wind: { speedMps: 10, gustMps: 30 } }), { items: [] });
    expect(alerts.map((alert) => alert.type)).toEqual(expect.arrayContaining(['low-visibility', 'wind-gusts']));
  });

  test('creates thunderstorm, snow, rain, and wind alerts', () => {
    const alerts = deriveWeatherAlerts(current(), { items: [forecastItem({
      condition: { description: 'thunder snow' },
      precipitationProbability: 0.9,
      rainMm: 20,
      windSpeedMps: 20,
    })] });
    expect(alerts.map((alert) => alert.type)).toEqual(expect.arrayContaining(['thunderstorm', 'snow', 'heavy-rain', 'strong-wind']));
  });

  test('deduplicates alerts of one type and keeps the worse severity', () => {
    const alerts = deriveWeatherAlerts(current(), { items: [
      forecastItem({ maximumC: 39 }),
      forecastItem({ forecastAt: '2024-03-15T15:00:00.000Z', maximumC: 45 }),
    ] });
    const heat = alerts.filter((alert) => alert.type === 'extreme-heat');
    expect(heat).toHaveLength(1);
    expect(heat[0].severity).toBe('warning');
  });

  test('filters disabled types and low severities', () => {
    const alerts = [
      { type: 'snow', severity: 'watch' },
      { type: 'thunderstorm', severity: 'warning' },
    ];
    expect(filterAlerts(alerts, { minimumSeverity: 'warning', disabledTypes: [] })).toHaveLength(1);
    expect(filterAlerts(alerts, { minimumSeverity: 'info', disabledTypes: ['snow'] })).toHaveLength(1);
  });

  test('counts alerts by severity', () => {
    expect(alertCounts([{ severity: 'watch' }, { severity: 'watch' }, { severity: 'warning' }])).toMatchObject({
      total: 3,
      watch: 2,
      warning: 1,
    });
  });
});
