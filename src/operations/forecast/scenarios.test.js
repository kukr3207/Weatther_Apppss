import { describe, expect, it } from 'vitest';
import {
  applyForecastScenario,
  buildScenarioEnvelope,
  compareForecastScenarios,
  createForecastScenario,
  FORECAST_SCENARIO_FIELDS,
  scenarioDecisionMatrix,
} from './scenarios';

const START = Date.parse('2026-10-11T00:00:00Z');
const baseline = Array.from({ length: 4 }, (_, index) => ({
  forecastAt: new Date(START + index * 3_600_000).toISOString(),
  temperatureC: 20 + index,
  rainMm: index,
  windSpeedMps: 5,
  precipitationProbability: 0.2,
  humidityPercent: 60,
}));

function scenario(id, adjustments, probability = 0.5) {
  return createForecastScenario({ id, name: id, probability, adjustments });
}

describe('forecast scenarios', () => {
  it('creates validated scenarios', () => {
    const result = scenario('warmer', [{ field: 'temperatureC', operation: 'add', value: 3 }]);
    expect(result.adjustments[0]).toMatchObject({ field: 'temperatureC', operation: 'add', value: 3 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects unsupported fields and probabilities', () => {
    expect(() => scenario('bad', [{ field: 'secret', value: 1 }])).toThrow('cannot be adjusted');
    expect(() => createForecastScenario({ id: 'bad', name: 'Bad', probability: 2, adjustments: [{ field: 'rainMm', value: 1 }] })).toThrow('no more');
  });

  it('adds values across forecast periods', () => {
    const result = applyForecastScenario(baseline, scenario('warmer', [{ field: 'temperatureC', operation: 'add', value: 4 }]));
    expect(result.periods.map((period) => period.temperatureC)).toEqual([24, 25, 26, 27]);
    expect(result.summary.maximumTemperatureC).toBe(27);
  });

  it('supports multiply, set, minimum, and maximum operations', () => {
    const result = applyForecastScenario(baseline, scenario('operations', [
      { field: 'rainMm', operation: 'multiply', value: 2 },
      { field: 'windSpeedMps', operation: 'set', value: 10 },
      { field: 'temperatureC', operation: 'minimum', value: 22 },
      { field: 'humidityPercent', operation: 'maximum', value: 55 },
    ]));
    expect(result.periods[0]).toMatchObject({ rainMm: 0, windSpeedMps: 10, temperatureC: 22, humidityPercent: 55 });
  });

  it('constrains probabilities and percentages', () => {
    const result = applyForecastScenario(baseline, scenario('wet', [
      { field: 'precipitationProbability', operation: 'add', value: 2 },
      { field: 'humidityPercent', operation: 'add', value: 100 },
    ]));
    expect(result.periods[0].precipitationProbability).toBe(1);
    expect(result.periods[0].humidityPercent).toBe(100);
  });

  it('applies changes only inside time windows', () => {
    const result = applyForecastScenario(baseline, scenario('window', [{
      field: 'temperatureC', value: 10,
      startsAt: baseline[1].forecastAt,
      endsAt: baseline[3].forecastAt,
    }]));
    expect(result.periods.map((period) => period.temperatureC)).toEqual([20, 31, 32, 23]);
  });

  it('applies changes to selected UTC hours', () => {
    const result = applyForecastScenario(baseline, scenario('hours', [{ field: 'rainMm', value: 5, hours: [1, 3] }]));
    expect(result.periods.map((period) => period.rainMm)).toEqual([0, 6, 2, 8]);
  });

  it('compares scenarios with the baseline', () => {
    const warm = applyForecastScenario(baseline, scenario('warm', [{ field: 'temperatureC', value: 5 }]));
    const wet = applyForecastScenario(baseline, scenario('wet', [{ field: 'rainMm', value: 3 }]));
    const comparison = compareForecastScenarios(baseline, [warm, wet]);
    expect(comparison.scenarios[0].maximumTemperatureChangeC).toBe(5);
    expect(comparison.scenarios[1].totalRainChangeMm).toBe(12);
  });

  it('builds weighted scenario envelopes', () => {
    const cool = applyForecastScenario(baseline, scenario('cool', [{ field: 'temperatureC', value: -2 }], 0.25));
    const warm = applyForecastScenario(baseline, scenario('warm', [{ field: 'temperatureC', value: 4 }], 0.75));
    const envelope = buildScenarioEnvelope([cool, warm], 'temperatureC');
    expect(envelope.scenarioCount).toBe(2);
    expect(envelope.periods[0]).toMatchObject({ minimum: 18, maximum: 24, mean: 22.5 });
  });

  it('ranks decisions by expected utility', () => {
    const dry = applyForecastScenario(baseline, scenario('dry', [{ field: 'rainMm', operation: 'set', value: 0 }], 0.7));
    const wet = applyForecastScenario(baseline, scenario('wet', [{ field: 'rainMm', value: 20 }], 0.3));
    const matrix = scenarioDecisionMatrix([dry, wet], [
      { id: 'outdoor', label: 'Outdoor event', evaluate: (result) => 100 - result.summary.totalRainMm },
      { id: 'indoor', label: 'Indoor event', evaluate: () => 75 },
    ]);
    expect(matrix.ranking[0].id).toBe('indoor');
  });

  it('supports maximin decision strategy', () => {
    const dry = applyForecastScenario(baseline, scenario('dry', [{ field: 'rainMm', operation: 'set', value: 0 }]));
    const wet = applyForecastScenario(baseline, scenario('wet', [{ field: 'rainMm', value: 20 }]));
    const matrix = scenarioDecisionMatrix([dry, wet], [
      { id: 'risky', label: 'Risky', evaluate: (result) => result.scenario.id === 'dry' ? 100 : 0 },
      { id: 'safe', label: 'Safe', evaluate: () => 60 },
    ], { strategy: 'maximin' });
    expect(matrix.ranking[0].id).toBe('safe');
  });

  it('publishes adjustable field names', () => {
    expect(FORECAST_SCENARIO_FIELDS).toContain('temperatureC');
    expect(FORECAST_SCENARIO_FIELDS).toContain('visibilityMeters');
  });
});
