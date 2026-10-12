import { describe, expect, it } from 'vitest';
import { buildForecastConsensus, compareProviderToConsensus } from './consensus';
import { createPrecipitationNowcast, nowcastHeadline } from './nowcast';
import { calculateRefreshDecision, createRefreshSchedule, updateRefreshState } from './refreshPolicy';
import { rankProviders, reliabilityFromVerification, verifyForecastRuns } from './verification';

const BASE_TIME = Date.parse('2026-06-01T00:00:00Z');

function forecastItem(index, changes = {}) {
  return {
    forecastAt: new Date(BASE_TIME + index * 3_600_000).toISOString(),
    temperatureC: 20 + index,
    feelsLikeC: 20 + index,
    minimumC: 18 + index,
    maximumC: 22 + index,
    humidityPercent: 60,
    precipitationProbability: 0.2,
    rainMm: 0,
    windSpeedMps: 4,
    windDirectionDegrees: 180,
    pressureHpa: 1015,
    visibilityMeters: 10000,
    cloudPercent: 40,
    condition: { iconCode: '02d', description: 'few clouds' },
    ...changes,
  };
}

function provider(id, offset = 0, reliability = 0.9) {
  return {
    id,
    reliability,
    issuedAt: new Date(BASE_TIME - 3_600_000).toISOString(),
    items: [0, 1, 2].map((index) => forecastItem(index, { temperatureC: 20 + index + offset })),
  };
}

describe('forecast consensus', () => {
  it('combines multiple providers', () => {
    const result = buildForecastConsensus([provider('a', 0), provider('b', 2)]);
    expect(result.providerCount).toBe(2);
    expect(result.items).toHaveLength(3);
    expect(result.items[0].temperatureC).toBeGreaterThan(20);
    expect(result.items[0].temperatureC).toBeLessThan(22);
  });

  it('weights reliable providers more heavily', () => {
    const result = buildForecastConsensus([provider('a', 0, 1), provider('b', 10, 0.1)]);
    expect(result.items[0].temperatureC).toBeLessThan(25);
  });

  it('supports weighted medians', () => {
    const result = buildForecastConsensus([
      provider('a', 0, 1),
      provider('b', 1, 1),
      provider('c', 20, 0.1),
    ], { numericReducer: 'weighted_median' });
    expect(result.items[0].temperatureC).toBeLessThan(22);
  });

  it('reports disagreement ranges', () => {
    const result = buildForecastConsensus([provider('a', 0), provider('b', 4)]);
    expect(result.items[0].ranges.temperatureC).toEqual({ minimum: 20, maximum: 24 });
    expect(result.items[0].disagreement.temperatureC).toBeGreaterThan(0);
  });

  it('uses circular means for wind direction', () => {
    const first = provider('a');
    const second = provider('b');
    first.items[0].windDirectionDegrees = 350;
    second.items[0].windDirectionDegrees = 10;
    const direction = buildForecastConsensus([first, second]).items[0].windDirectionDegrees;
    expect(direction < 20 || direction > 340).toBe(true);
  });

  it('chooses the dominant condition', () => {
    const result = buildForecastConsensus([provider('a'), provider('b')]);
    expect(result.items[0].condition.description).toBe('few clouds');
  });

  it('accepts explicit target times', () => {
    const target = forecastItem(1).forecastAt;
    expect(buildForecastConsensus([provider('a')], { targetTimes: [target] }).items).toHaveLength(1);
  });

  it('rejects duplicated provider identifiers', () => {
    expect(() => buildForecastConsensus([provider('a'), provider('a')])).toThrow('duplicated');
  });

  it('compares a provider with consensus', () => {
    const report = buildForecastConsensus([provider('a'), provider('b', 2)]);
    const comparison = compareProviderToConsensus(provider('a'), report);
    expect(comparison.comparisons).toHaveLength(3);
    expect(comparison.meanAbsoluteDifferences.temperatureC).toBeGreaterThan(0);
  });
});

describe('forecast verification', () => {
  const run = {
    id: 'run-1',
    providerId: 'provider-a',
    issuedAt: new Date(BASE_TIME - 6 * 3_600_000).toISOString(),
    items: [0, 1, 2].map((index) => forecastItem(index)),
  };
  const observations = [0, 1, 2].map((index) => ({
    observedAt: forecastItem(index).forecastAt,
    temperatureC: 21 + index,
    humidityPercent: 58,
    windSpeedMps: 5,
    pressureHpa: 1014,
    precipitationMm: index === 2 ? 1 : 0,
    condition: { iconCode: '02d' },
  }));

  it('matches forecasts to observations', () => {
    const result = verifyForecastRuns([run], observations);
    expect(result.matches).toHaveLength(3);
    expect(result.unmatchedForecasts).toHaveLength(0);
  });

  it('calculates field bias', () => {
    const result = verifyForecastRuns([run], observations);
    expect(result.overall.fields.temperatureC.bias).toBe(-1);
  });

  it('calculates mean absolute error', () => {
    const result = verifyForecastRuns([run], observations);
    expect(result.overall.fields.temperatureC.meanAbsoluteError).toBe(1);
  });

  it('calculates categorical accuracy', () => {
    const result = verifyForecastRuns([run], observations);
    expect(result.overall.conditionAccuracy).toBe(1);
  });

  it('calculates precipitation Brier scores', () => {
    const result = verifyForecastRuns([run], observations);
    expect(result.overall.precipitationBrierScore).toBeGreaterThan(0);
  });

  it('reports unmatched forecasts', () => {
    const result = verifyForecastRuns([run], observations.slice(0, 1), { toleranceMinutes: 10 });
    expect(result.unmatchedForecasts).toHaveLength(2);
  });

  it('groups results by provider', () => {
    const second = { ...run, id: 'run-2', providerId: 'provider-b' };
    const result = verifyForecastRuns([run, second], observations);
    expect(Object.keys(result.byProvider)).toEqual(['provider-a', 'provider-b']);
  });

  it('derives provider reliability', () => {
    const result = verifyForecastRuns([run], observations);
    expect(reliabilityFromVerification(result)).toBeGreaterThan(0);
  });

  it('ranks provider verification reports', () => {
    const second = { ...run, id: 'run-2', providerId: 'provider-b', items: run.items.map((item) => ({ ...item, temperatureC: 40 })) };
    const result = verifyForecastRuns([run, second], observations);
    expect(rankProviders(result)[0].providerId).toBe('provider-a');
  });
});

describe('precipitation nowcast', () => {
  function reading(minutes, rate, changes = {}) {
    return {
      observedAt: new Date(BASE_TIME + minutes * 60_000).toISOString(),
      precipitationRateMmPerHour: rate,
      precipitationProbability: rate > 0 ? 0.8 : 0.1,
      temperatureC: 10,
      cloudPercent: 80,
      ...changes,
    };
  }

  it('creates future periods', () => {
    const result = createPrecipitationNowcast([reading(0, 0), reading(10, 1), reading(20, 2)]);
    expect(result.periods.length).toBeGreaterThan(10);
    expect(result.validUntil).toBe(result.periods.at(-1).forecastAt);
  });

  it('projects an increasing rain rate', () => {
    const result = createPrecipitationNowcast([reading(0, 0), reading(10, 1), reading(20, 2)]);
    expect(result.periods.at(-1).precipitationRateMmPerHour).toBeGreaterThan(result.periods[0].precipitationRateMmPerHour);
  });

  it('does not project negative rates', () => {
    const result = createPrecipitationNowcast([reading(0, 2), reading(10, 1), reading(20, 0)]);
    expect(Math.min(...result.periods.map((period) => period.precipitationRateMmPerHour))).toBe(0);
  });

  it('changes rain to snow below freezing', () => {
    const result = createPrecipitationNowcast([reading(0, 1, { temperatureC: -3 }), reading(10, 2, { temperatureC: -3 })]);
    expect(result.periods[0].precipitationType).toBe('snow');
  });

  it('summarizes total precipitation', () => {
    const result = createPrecipitationNowcast([reading(0, 1), reading(10, 1), reading(20, 1)]);
    expect(result.summary.totalPrecipitationMm).toBeGreaterThan(0);
  });

  it('creates a readable headline', () => {
    const result = createPrecipitationNowcast([reading(0, 1), reading(10, 1)]);
    expect(nowcastHeadline(result)).toContain('expected');
  });
});

describe('adaptive refresh decisions', () => {
  const now = '2026-01-01T12:00:00Z';

  it('pauses while offline', () => {
    const result = calculateRefreshDecision({ now, online: false });
    expect(result.shouldRefresh).toBe(false);
    expect(result.pauseReason).toBe('offline');
  });

  it('pauses hidden workspaces', () => {
    const result = calculateRefreshDecision({ now, visible: false });
    expect(result.pauseReason).toBe('hidden');
  });

  it('refreshes when no success exists', () => {
    expect(calculateRefreshDecision({ now }).shouldRefresh).toBe(true);
  });

  it('waits for a normal interval', () => {
    const result = calculateRefreshDecision({ now, lastSuccessAt: '2026-01-01T11:55:00Z', lastAttemptAt: '2026-01-01T11:55:00Z' });
    expect(result.shouldRefresh).toBe(false);
  });

  it('shortens stale forecast intervals', () => {
    const result = calculateRefreshDecision({ now, lastSuccessAt: '2026-01-01T10:00:00Z' });
    expect(result.intervalMinutes).toBeLessThanOrEqual(15);
  });

  it('backs off after failures', () => {
    const result = calculateRefreshDecision({ now, lastAttemptAt: now, lastSuccessAt: now, consecutiveFailures: 2 });
    expect(result.intervalMinutes).toBe(60);
  });

  it('pauses after too many failures', () => {
    const result = calculateRefreshDecision({ now, consecutiveFailures: 6 });
    expect(result.pauseReason).toBe('failure_limit');
  });

  it('honors manual refresh', () => {
    const result = calculateRefreshDecision({ now, lastSuccessAt: now, lastAttemptAt: now, userRequested: true });
    expect(result.shouldRefresh).toBe(true);
  });

  it('records successful refresh state', () => {
    const result = updateRefreshState({ consecutiveFailures: 2 }, { success: true }, { now });
    expect(result.consecutiveFailures).toBe(0);
    expect(result.lastSuccessAt).toBe(now.replace('Z', '.000Z'));
  });

  it('records failed refresh state', () => {
    const result = updateRefreshState({ consecutiveFailures: 2 }, { success: false, error: 'Timeout' }, { now });
    expect(result.consecutiveFailures).toBe(3);
    expect(result.lastError).toBe('Timeout');
  });

  it('creates future schedules', () => {
    const result = createRefreshSchedule({ now, lastAttemptAt: now, lastSuccessAt: now }, {}, 3);
    expect(result).toHaveLength(3);
  });
});
