import { describe, expect, test } from 'vitest';
import { homeComfortSummary, homeEnergyLoad, planOutdoorDrying, planVentilation } from './homeComfort';

function item(overrides = {}) {
  return {
    forecastAt: '2024-03-15T12:00:00.000Z',
    temperatureC: 20,
    humidityPercent: 50,
    precipitationProbability: 0.05,
    rainMm: 0,
    windSpeedMps: 4,
    ...overrides,
  };
}

function forecast(items) {
  return { location: { timezoneOffsetSeconds: 0 }, items };
}

describe('home-comfort planning', () => {
  test('detects heating, cooling, and neutral loads', () => {
    expect(homeEnergyLoad({ temperatureC: 4, humidityPercent: 50 }).mode).toBe('heating');
    expect(homeEnergyLoad({ temperatureC: 33, humidityPercent: 80 }).mode).toBe('cooling');
    expect(homeEnergyLoad({ temperatureC: 22, humidityPercent: 50 }).mode).toBe('neutral');
  });

  test('increases cooling load in high humidity', () => {
    const dry = homeEnergyLoad({ temperatureC: 30, humidityPercent: 40 });
    const humid = homeEnergyLoad({ temperatureC: 30, humidityPercent: 80 });
    expect(humid.load).toBeGreaterThan(dry.load);
  });

  test('finds good ventilation periods', () => {
    const result = planVentilation(forecast([
      item({ forecastAt: '2024-03-15T09:00:00Z', humidityPercent: 90, precipitationProbability: 0.8 }),
      item({ forecastAt: '2024-03-15T12:00:00Z' }),
    ]), { index: 1 });
    expect(result.best.label).toBe('12:00 PM');
  });

  test('blocks ventilation when air quality is very poor', () => {
    const result = planVentilation(forecast([item()]), { index: 5 });
    expect(result.recommended).toHaveLength(0);
    expect(result.message).toContain('Keep windows closed');
  });

  test('scores warm dry breezy periods for outdoor drying', () => {
    const good = planOutdoorDrying(forecast([item({ temperatureC: 27, humidityPercent: 35, windSpeedMps: 6 })]));
    const wet = planOutdoorDrying(forecast([item({ precipitationProbability: 1, rainMm: 8 })]));
    expect(good.best.score).toBeGreaterThan(wet.best.score);
  });

  test('builds combined household actions', () => {
    const result = homeComfortSummary(
      { temperatureC: 34, humidityPercent: 80 },
      forecast([item({ temperatureC: 30 })]),
      { index: 4 },
    );
    expect(result.actions.some((action) => action.includes('filtered indoor air'))).toBe(true);
    expect(result.energy.mode).toBe('cooling');
  });
});
