import { describe, expect, it } from 'vitest';
import {
  assessDroughtRisk,
  calculateStandardizedPrecipitationIndex,
  precipitationPercentiles,
  summarizeDroughtEpisodes,
} from './drought';
import {
  availableSoilWater,
  estimateInfiltration,
  modelSoilMoisture,
  planIrrigation,
  soilTemperatureSuitability,
} from './soil';

function precipitationSeries(count = 80, amount = (index) => 5 + Math.sin(index / 5) * 3) {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, index) => ({
    observedAt: new Date(start + index * 86_400_000).toISOString(),
    precipitationMm: Math.max(0, amount(index)),
  }));
}

describe('drought intelligence', () => {
  it('calculates rolling standardized precipitation', () => {
    const result = calculateStandardizedPrecipitationIndex(precipitationSeries(), { windowDays: 30 });
    expect(result.series).toHaveLength(51);
    expect(result.latest).toHaveProperty('classification');
    expect(result.baselineSampleCount).toBe(51);
  });

  it('requires enough history for the selected window', () => {
    expect(() => calculateStandardizedPrecipitationIndex(precipitationSeries(40), { windowDays: 30 })).toThrow('at least 60');
  });

  it('classifies sustained dry periods', () => {
    const records = precipitationSeries(100, (index) => index < 70 ? 8 + index % 3 : 0);
    const result = calculateStandardizedPrecipitationIndex(records, { windowDays: 15 });
    expect(result.latest.index).toBeLessThan(0);
    expect(['moderate', 'severe', 'extreme', 'exceptional']).toContain(result.latest.classification);
  });

  it('calculates precipitation percentile landmarks', () => {
    const result = precipitationPercentiles(precipitationSeries(10, (index) => index), { currentMm: 4 });
    expect(result.percentile).toBe(50);
    expect(result.median).toBe(4.5);
    expect(result.sampleCount).toBe(10);
  });

  it('assesses combined drought risk', () => {
    const result = assessDroughtRisk({ spi: -2, soilMoisturePercent: 15, reservoirPercent: 25, vegetationHealth: 30 });
    expect(result.level).toMatch(/high|extreme/);
    expect(result.actions.length).toBeGreaterThan(1);
  });

  it('reduces risk for substantial forecast rain', () => {
    const dry = assessDroughtRisk({ spi: -1.5, soilMoisturePercent: 20, forecastRainMm: 0 });
    const wet = assessDroughtRisk({ spi: -1.5, soilMoisturePercent: 20, forecastRainMm: 60 });
    expect(wet.score).toBeLessThan(dry.score);
  });

  it('summarizes distinct drought episodes', () => {
    const series = [
      { observedAt: '2026-01-01', index: -1.2, classification: 'severe' },
      { observedAt: '2026-01-02', index: -1.5, classification: 'extreme' },
      { observedAt: '2026-01-03', index: 0, classification: 'normal' },
      { observedAt: '2026-01-04', index: -1.1, classification: 'severe' },
    ];
    const episodes = summarizeDroughtEpisodes(series);
    expect(episodes).toHaveLength(2);
    expect(episodes[0].duration).toBe(2);
    expect(episodes[0].minimumIndex).toBe(-1.5);
  });
});

describe('soil and irrigation planning', () => {
  it('calculates available soil water by texture and depth', () => {
    const result = availableSoilWater({ texture: 'loam', depthMm: 500, volumetricWater: 0.22 });
    expect(result.capacityMm).toBe(75);
    expect(result.availableMm).toBe(40);
    expect(result.availablePercent).toBeCloseTo(53.3, 1);
  });

  it('reports zero available water below wilting point', () => {
    const result = availableSoilWater({ texture: 'sand', depthMm: 300, volumetricWater: 0.03 });
    expect(result.availableMm).toBe(0);
  });

  it('rejects unsupported soil textures', () => {
    expect(() => availableSoilWater({ texture: 'moon dust', volumetricWater: 0.2 })).toThrow('Unsupported');
  });

  it('estimates infiltration and runoff', () => {
    const result = estimateInfiltration({
      texture: 'clay', precipitationMm: 50, durationHours: 1, slopePercent: 20, coverPercent: 20, saturation: 0.8,
    });
    expect(result.infiltratedMm).toBeLessThan(5);
    expect(result.runoffMm).toBeGreaterThan(45);
  });

  it('infiltrates all light rain into dry sandy soil', () => {
    const result = estimateInfiltration({ texture: 'sand', precipitationMm: 2, durationHours: 1, saturation: 0.1 });
    expect(result.infiltratedMm).toBe(2);
    expect(result.runoffMm).toBe(0);
  });

  it('models daily moisture balance', () => {
    const model = modelSoilMoisture([
      { date: '2026-06-01', precipitationMm: 10, evapotranspirationMm: 4 },
      { date: '2026-06-02', precipitationMm: 0, evapotranspirationMm: 5 },
      { date: '2026-06-03', precipitationMm: 0, evapotranspirationMm: 5 },
    ], { texture: 'loam', depthMm: 500, initialAvailableMm: 30 });
    expect(model.series).toHaveLength(3);
    expect(model.latest.availableMm).toBeLessThan(model.series[0].availableMm);
    expect(model.summary.totalRainMm).toBe(10);
  });

  it('limits soil storage to field capacity and records drainage', () => {
    const model = modelSoilMoisture([
      { date: '2026-06-01', precipitationMm: 100, precipitationDurationHours: 24, evapotranspirationMm: 0 },
    ], { texture: 'loam', depthMm: 300, initialAvailableMm: 40, coverPercent: 100 });
    expect(model.latest.availableMm).toBeLessThanOrEqual(model.capacityMm);
    expect(model.latest.drainageMm).toBeGreaterThanOrEqual(0);
  });

  it('counts moisture stress days', () => {
    const model = modelSoilMoisture(Array.from({ length: 10 }, (_, index) => ({
      date: new Date(Date.parse('2026-06-01') + index * 86_400_000).toISOString(),
      precipitationMm: 0,
      evapotranspirationMm: 8,
    })), { texture: 'loam', depthMm: 300, initialAvailableMm: 20 });
    expect(model.summary.stressDays).toBeGreaterThan(0);
  });

  it('plans irrigation only after moisture crosses a trigger', () => {
    const model = modelSoilMoisture([{ date: '2026-06-01', precipitationMm: 0, evapotranspirationMm: 2 }], {
      texture: 'loam', depthMm: 300, initialAvailableMm: 10,
    });
    const plan = planIrrigation(model, [
      { date: '2026-06-02', rainMm: 0, et0Mm: 6 },
      { date: '2026-06-03', rainMm: 20, et0Mm: 2 },
    ]);
    expect(plan.schedule[0].applicationMm).toBeGreaterThan(0);
    expect(plan.totalApplicationMm).toBeGreaterThan(0);
  });

  it('accounts for irrigation efficiency', () => {
    const model = { capacityMm: 100, latest: { availableMm: 20 } };
    const efficient = planIrrigation(model, [{ date: '2026-06-01', et0Mm: 0 }], { efficiency: 1 });
    const inefficient = planIrrigation(model, [{ date: '2026-06-01', et0Mm: 0 }], { efficiency: 0.5 });
    expect(inefficient.totalApplicationMm).toBeGreaterThan(efficient.totalApplicationMm);
  });

  it('scores soil temperature suitability', () => {
    const result = soilTemperatureSuitability([18, 20, 22], { minimumC: 10, optimumC: 20, maximumC: 35 });
    expect(result.suitable).toBe(true);
    expect(result.score).toBeGreaterThan(90);
  });

  it('rejects temperatures outside the crop range', () => {
    const result = soilTemperatureSuitability([5, 6, 7], { minimumC: 10, optimumC: 20, maximumC: 35 });
    expect(result.suitable).toBe(false);
    expect(result.score).toBe(0);
  });
});
