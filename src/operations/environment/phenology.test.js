import { describe, expect, it } from 'vitest';
import {
  PHENOLOGY_PROFILES,
  assessPhenologyFrostRisk,
  calculateChillAccumulation,
  calculatePhenologyThermalTime,
  comparePhenologySeasons,
  estimatePhenologyStages,
  floweringWeatherWindows,
  phenologySeasonSummary,
  projectStageDate,
} from './phenology';

function days(start, count, minimumC = 5, maximumC = 15) {
  const first = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      minimumC: minimumC + index * 0.1,
      maximumC: maximumC + index * 0.1,
      windSpeedMps: 3,
      rainMm: 0,
    };
  });
}

describe('phenology thermal time', () => {
  it('accumulates bounded degree days', () => {
    const result = calculatePhenologyThermalTime(days('2026-03-01', 5), 'apple');
    expect(result.series).toHaveLength(5);
    expect(result.totalDegreeDays).toBeGreaterThan(0);
    expect(result.series.at(-1).cumulativeDegreeDays).toBe(result.totalDegreeDays);
  });

  it('rejects reversed daily temperatures and thermal bounds', () => {
    expect(() => calculatePhenologyThermalTime([
      { date: '2026-01-01', minimumC: 10, maximumC: 5 },
    ], 'apple')).toThrow('below its minimum');
    expect(() => calculatePhenologyThermalTime(days('2026-01-01', 1), 'apple', {
      baseTemperatureC: 20,
      upperTemperatureC: 10,
    })).toThrow('must exceed');
  });

  it('accumulates estimated hourly chill', () => {
    const result = calculateChillAccumulation(days('2026-01-01', 10, 0, 8));
    expect(result.totalChillHours).toBeGreaterThan(0);
    expect(result.series.at(-1).cumulativeChillHours).toBe(result.totalChillHours);
  });

  it('supports warm-hour penalties in marginal winters', () => {
    const withoutPenalty = calculateChillAccumulation(days('2026-01-01', 3, 2, 20));
    const withPenalty = calculateChillAccumulation(days('2026-01-01', 3, 2, 20), { warmPenalty: true });
    expect(withPenalty.totalChillHours).toBeLessThanOrEqual(withoutPenalty.totalChillHours);
  });
});

describe('phenology stages and risk', () => {
  it('marks reached stages and the next threshold', () => {
    const result = estimatePhenologyStages(days('2026-03-01', 30, 8, 20), 'apple');
    expect(result.currentStage).not.toBe('dormant');
    expect(result.stages.some((stage) => stage.reached)).toBe(true);
    expect(result.stages.every((stage) => stage.remainingDegreeDays >= 0)).toBe(true);
  });

  it('identifies frost events using stage thresholds', () => {
    const result = assessPhenologyFrostRisk([
      { date: '2026-04-01', minimumC: -3, maximumC: 8 },
      { date: '2026-04-02', minimumC: 2, maximumC: 12 },
    ], 'apple', 'flowering');
    expect(result.risk).toBe(true);
    expect(result.eventCount).toBe(1);
    expect(result.events[0].date).toBe('2026-04-01');
  });

  it('projects a pending stage from recent accumulation', () => {
    const result = projectStageDate(days('2026-03-01', 7, 5, 15), 'apple', 'flowering');
    expect(result.reached).toBe(false);
    expect(result.daysRemaining).toBeGreaterThan(0);
    expect(result.projectedDate).toMatch(/^2026-/);
  });

  it('returns the historical reach date for completed stages', () => {
    const result = projectStageDate(days('2026-03-01', 40, 10, 24), 'apple', 'green_tip');
    expect(result.reached).toBe(true);
    expect(result.daysRemaining).toBe(0);
  });

  it('compares stage timing between seasons', () => {
    const current = days('2026-03-01', 30, 8, 20);
    const baseline = days('2025-03-01', 30, 4, 14).map((day) => ({
      ...day,
      date: day.date.replace('2025', '2026'),
    }));
    const result = comparePhenologySeasons(current, baseline, 'apple');
    expect(result.thermalTimeDifference).toBeGreaterThan(0);
    expect(result.stageComparisons).toHaveLength(PHENOLOGY_PROFILES.apple.stages.length);
  });

  it('finds suitable flowering weather', () => {
    const weather = days('2026-04-01', 5, 14, 24);
    const estimate = {
      stages: [{ id: 'flowering', reachedAt: '2026-04-02' }],
    };
    const result = floweringWeatherWindows(weather, estimate);
    expect(result.suitableDayCount).toBe(4);
    expect(result.bestDate).toBeTruthy();
  });

  it('explains unsuitable flowering days', () => {
    const weather = [{
      date: '2026-04-01', minimumC: 0, maximumC: 8, windSpeedMps: 12, rainMm: 5,
    }];
    const result = floweringWeatherWindows(weather, {
      stages: [{ id: 'flowering', reachedAt: '2026-04-01' }],
    });
    expect(result.windows[0].suitable).toBe(false);
    expect(result.windows[0].constraints).toEqual(['cold', 'wind', 'rain']);
  });
});

describe('phenology summaries', () => {
  it('combines heat, chill, and frost state', () => {
    const result = phenologySeasonSummary(days('2026-02-01', 30, 0, 12), 'apple');
    expect(result.profile).toBe('Apple');
    expect(result.chillCompletionPercent).toBeGreaterThanOrEqual(0);
    expect(result.averageTemperatureC).toBeGreaterThan(0);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('publishes crop, fruit, and allergen profiles', () => {
    expect(Object.keys(PHENOLOGY_PROFILES)).toEqual(expect.arrayContaining([
      'apple', 'grape', 'wheat', 'maize', 'ragweed',
    ]));
    expect(PHENOLOGY_PROFILES.ragweed.stages.some((stage) => stage.id === 'pollen_peak')).toBe(true);
  });

  it('rejects unknown profiles and stages', () => {
    expect(() => calculatePhenologyThermalTime(days('2026-01-01', 2), 'unknown')).toThrow('Unknown phenology profile');
    expect(() => projectStageDate(days('2026-01-01', 2), 'apple', 'unknown')).toThrow('Unknown Apple stage');
  });
});
