import { describe, expect, test } from 'vitest';
import { activityRecommendation, planActivity, rankActivities, scoreActivityPeriod } from './activityPlanner';

function item(overrides = {}) {
  return {
    forecastAt: '2024-03-15T12:00:00.000Z',
    temperatureC: 20,
    precipitationProbability: 0.05,
    windSpeedMps: 3,
    condition: { description: 'clear sky' },
    ...overrides,
  };
}

function forecast(items) {
  return { location: { timezoneOffsetSeconds: 0 }, items };
}

describe('activity planner', () => {
  test('scores comfortable dry periods highly', () => {
    const result = scoreActivityPeriod(item(), 'walk');
    expect(result.score).toBeGreaterThan(80);
    expect(result.rating).toBe('excellent');
  });

  test('penalizes thunderstorms and likely rain', () => {
    const result = scoreActivityPeriod(item({
      precipitationProbability: 0.95,
      condition: { description: 'thunderstorm' },
    }), 'picnic');
    expect(result.score).toBeLessThan(40);
    expect(result.reasons).toContain('Rain is likely');
  });

  test('penalizes wind beyond the activity threshold', () => {
    const result = scoreActivityPeriod(item({ windSpeedMps: 20 }), 'cycle');
    expect(result.reasons).toContain('Wind may be disruptive');
  });

  test('sorts best periods ahead of poor periods', () => {
    const result = planActivity(forecast([
      item({ forecastAt: '2024-03-15T09:00:00Z', precipitationProbability: 0.9 }),
      item({ forecastAt: '2024-03-15T12:00:00Z', precipitationProbability: 0 }),
    ]), 'walk');
    expect(result.periods[0].forecastAt).toContain('12:00');
  });

  test('ranks activities using their best period', () => {
    const result = rankActivities(forecast([item()]), { limit: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].best.score).toBeGreaterThanOrEqual(result[1].best.score);
  });

  test('creates a plain-language recommendation', () => {
    expect(activityRecommendation(forecast([item()]))).toMatch(/looks (excellent|good)/);
    expect(activityRecommendation(forecast([]))).toContain('needs forecast');
  });
});
