import { describe, expect, it } from 'vitest';
import { ACTIVITY_PROFILES, bestActivityPlan, rankActivityWindows } from './activityWindows';
import { createPackingPlan, updatePackingProgress, WEATHER_PACKING_CATALOG } from './packing';
import { buildRouteForecast, compareDepartureTimes } from './routeForecast';

const START = Date.parse('2026-10-11T06:00:00Z');

function periods(count = 6, changes = {}) {
  return Array.from({ length: count }, (_, index) => ({
    forecastAt: new Date(START + index * 3_600_000).toISOString(),
    temperatureC: 20,
    feelsLikeC: 20,
    windSpeedMps: 3,
    rainMm: 0,
    precipitationProbability: 0.1,
    humidityPercent: 60,
    cloudPercent: 10,
    visibilityMeters: 10000,
    sunriseAt: new Date(START - 3_600_000).toISOString(),
    sunsetAt: new Date(START + 12 * 3_600_000).toISOString(),
    ...changes,
  }));
}

describe('activity windows', () => {
  it('ranks calm periods as excellent', () => {
    const result = rankActivityWindows(periods(), 'walking');
    expect(result[0].rating).toBe('excellent');
    expect(result[0].score).toBe(100);
  });

  it('penalizes heavy rain and wind', () => {
    const calm = rankActivityWindows(periods(), 'cycling')[0];
    const stormy = rankActivityWindows(periods(6, { rainMm: 10, windSpeedMps: 18 }), 'cycling')[0];
    expect(stormy.score).toBeLessThan(calm.score);
    expect(stormy.reasons).toContain('Wind is stronger than preferred.');
    expect(stormy.reasons).toContain('Precipitation may disrupt the activity.');
  });

  it('penalizes night windows for daylight activities', () => {
    const items = periods(2, { sunriseAt: new Date(START + 5 * 3_600_000).toISOString() });
    expect(rankActivityWindows(items, 'walking')[0].reasons).toContain('This period is outside daylight hours.');
  });

  it('uses cloud cover for stargazing', () => {
    expect(rankActivityWindows(periods(2, { cloudPercent: 90 }), 'stargazing')[0].score).toBeLessThan(50);
  });

  it('combines consecutive periods for longer activities', () => {
    const result = rankActivityWindows(periods(5), 'hiking', { durationHours: 3 });
    expect(result).toHaveLength(3);
    expect(result[0].durationPeriods).toBe(3);
  });

  it('chooses a best overall activity', () => {
    const result = bestActivityPlan(periods(), ['walking', 'running', 'picnic']);
    expect(result.plans).toHaveLength(3);
    expect(result.bestOverall.best).toBeTruthy();
  });

  it('publishes built-in activity profiles', () => {
    expect(ACTIVITY_PROFILES).toHaveProperty('boating');
    expect(ACTIVITY_PROFILES).toHaveProperty('skiing');
  });

  it('rejects unknown activities', () => {
    expect(() => rankActivityWindows(periods(), 'spacewalk')).toThrow('Unknown activity');
  });
});

describe('weather-aware packing', () => {
  const mild = [{
    dateKey: '2026-10-11', minimumC: 18, maximumC: 26, rainTotalMm: 0,
    precipitationProbability: 0.1, maximumWindMps: 3, averageHumidityPercent: 60,
    maximumUvIndex: 5, daylightHours: 11,
  }];

  it('selects rain equipment for a wet trip', () => {
    const plan = createPackingPlan([{ ...mild[0], rainTotalMm: 20, precipitationProbability: 0.9 }]);
    expect(plan.signals).toContain('heavy_rain');
    expect(plan.items.some((item) => item.id === 'waterproof-shell')).toBe(true);
  });

  it('selects cold and snow equipment', () => {
    const plan = createPackingPlan([{ ...mild[0], minimumC: -5, maximumC: 0, snowTotalMm: 10 }]);
    expect(plan.signals).toContain('freezing');
    expect(plan.items.some((item) => item.id === 'snow-boots')).toBe(true);
  });

  it('accounts for trip contexts', () => {
    const plan = createPackingPlan(mild, { activity: true, remote: true, camping: true });
    expect(plan.items.some((item) => item.id === 'first-aid-kit')).toBe(true);
    expect(plan.items.some((item) => item.id === 'weather-radio')).toBe(true);
  });

  it('supports exclusions and owned items', () => {
    const plan = createPackingPlan([{ ...mild[0], rainTotalMm: 5 }], {
      excludedItems: ['compact-umbrella'], ownedItems: ['light-rain-jacket'],
    });
    expect(plan.items.some((item) => item.id === 'compact-umbrella')).toBe(false);
    expect(plan.items.find((item) => item.id === 'light-rain-jacket').packed).toBe(true);
  });

  it('supports custom catalog items', () => {
    const plan = createPackingPlan(mild, {
      activity: true,
      customItems: [{ id: 'camera', label: 'Camera', category: 'equipment', weightGrams: 500, triggers: ['activity'] }],
    });
    expect(plan.items.some((item) => item.id === 'camera')).toBe(true);
  });

  it('updates packed progress and category views', () => {
    const plan = createPackingPlan([{ ...mild[0], rainTotalMm: 5 }]);
    const updated = updatePackingProgress(plan, plan.items[0].id, true);
    expect(updated.summary.packedCount).toBe(1);
    expect(updated.summary.completionPercent).toBeGreaterThan(0);
  });

  it('publishes a substantial packing catalog', () => {
    expect(WEATHER_PACKING_CATALOG.length).toBeGreaterThan(30);
  });
});

describe('route weather forecasts', () => {
  const route = [
    { latitude: 12.9716, longitude: 77.5946 },
    { latitude: 13.0827, longitude: 80.2707 },
  ];

  function forecast(changes = {}) {
    return {
      location: { id: 'route', name: 'Route forecast', latitude: 13, longitude: 79, country: 'IN' },
      items: periods(12, { forecastAt: undefined }).map((item, index) => ({
        ...item,
        forecastAt: new Date(START + index * 3_600_000).toISOString(),
        condition: { id: 800, description: 'clear' },
        ...changes,
      })),
    };
  }

  it('samples a route and attaches forecast conditions', () => {
    const result = buildRouteForecast(route, [forecast()], { startsAt: new Date(START).toISOString(), spacingKm: 50, speedKph: 80, maximumForecastDistanceKm: 500 });
    expect(result.points.length).toBeGreaterThan(2);
    expect(result.summary.coveragePercent).toBe(100);
    expect(result.distanceKm).toBeGreaterThan(200);
  });

  it('detects weather risks along a route', () => {
    const result = buildRouteForecast(route, [forecast({
      windSpeedMps: 20, rainMm: 20, precipitationProbability: 0.9, visibilityMeters: 400,
      condition: { id: 202, description: 'thunderstorm' },
    })], { startsAt: new Date(START).toISOString(), spacingKm: 100, maximumForecastDistanceKm: 500 });
    expect(result.summary.riskScore).toBeGreaterThan(80);
    expect(result.points.some((point) => point.risks.some((risk) => risk.code === 'strong_wind'))).toBe(true);
  });

  it('reports uncovered route points', () => {
    const result = buildRouteForecast(route, [forecast()], {
      startsAt: new Date(START).toISOString(), maximumForecastDistanceKm: 1,
    });
    expect(result.summary.coveragePercent).toBeLessThan(100);
  });

  it('compares departure times by risk', () => {
    const results = compareDepartureTimes(route, [forecast()], [
      new Date(START).toISOString(), new Date(START + 3_600_000).toISOString(),
    ], { maximumForecastDistanceKm: 500 });
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('riskScore');
  });

  it('requires an origin and destination', () => {
    expect(() => buildRouteForecast([route[0]], [forecast()])).toThrow('origin and destination');
  });
});
