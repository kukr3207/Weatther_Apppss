import { describe, expect, test } from 'vitest';
import { describeForecastDay, forecastTemperatureRange, groupForecastByDay } from './dailyForecast';

function item(forecastAt, overrides = {}) {
  return {
    forecastAt,
    temperatureC: 15,
    feelsLikeC: 14,
    minimumC: 13,
    maximumC: 17,
    humidityPercent: 60,
    precipitationProbability: 0.1,
    rainMm: 0,
    windSpeedMps: 4,
    condition: { iconCode: '02d', description: 'few clouds' },
    ...overrides,
  };
}

function forecast(items, offset = 0) {
  return { location: { timezoneOffsetSeconds: offset }, items };
}

describe('daily forecast aggregation', () => {
  test('groups periods by the local calendar date', () => {
    const result = groupForecastByDay(forecast([
      item('2024-03-15T21:00:00.000Z'),
      item('2024-03-16T00:00:00.000Z'),
    ], 10_800));
    expect(result).toHaveLength(1);
    expect(result[0].dateKey).toBe('2024-03-16');
  });

  test('calculates daily lows, highs, averages, and rain totals', () => {
    const [day] = groupForecastByDay(forecast([
      item('2024-03-15T06:00:00.000Z', { minimumC: 6, maximumC: 11, temperatureC: 8, rainMm: 1 }),
      item('2024-03-15T09:00:00.000Z', { minimumC: 8, maximumC: 17, temperatureC: 14, rainMm: 2 }),
    ]));
    expect(day.minimumC).toBe(6);
    expect(day.maximumC).toBe(17);
    expect(day.averageC).toBe(11);
    expect(day.rainTotalMm).toBe(3);
  });

  test('selects the most frequent condition', () => {
    const [day] = groupForecastByDay(forecast([
      item('2024-03-15T06:00:00.000Z', { condition: { iconCode: '10d', description: 'rain' } }),
      item('2024-03-15T09:00:00.000Z', { condition: { iconCode: '10d', description: 'rain' } }),
      item('2024-03-15T12:00:00.000Z'),
    ]));
    expect(day.condition.description).toBe('rain');
  });

  test('limits the number of returned days', () => {
    const items = Array.from({ length: 5 }, (_, index) => item(`2024-03-${String(index + 10).padStart(2, '0')}T12:00:00.000Z`));
    expect(groupForecastByDay(forecast(items), { limit: 3 })).toHaveLength(3);
  });

  test('finds the range across all periods', () => {
    const range = forecastTemperatureRange(forecast([
      item('2024-03-15T06:00:00.000Z', { minimumC: -2, maximumC: 4 }),
      item('2024-03-15T09:00:00.000Z', { minimumC: 3, maximumC: 12 }),
    ]));
    expect(range).toEqual({ minimumC: -2, maximumC: 12 });
  });

  test('describes precipitation and wind when notable', () => {
    const description = describeForecastDay({
      condition: { description: 'light rain' },
      precipitationProbability: 0.7,
      maximumWindMps: 12,
    });
    expect(description).toContain('70%');
    expect(description).toContain('breezy');
  });
});
