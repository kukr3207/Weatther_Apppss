import { describe, expect, it } from 'vitest';
import {
  AIR_QUALITY_CATEGORIES,
  airQualityGuidance,
  calculateAirQualityIndex,
  calculateExposureDose,
  summarizeAirQualityForecast,
} from './airQuality';
import {
  assessPollenReading,
  pollenCalendar,
  POLLEN_PLANT_PROFILES,
  summarizePollenForecast,
} from './pollen';
import {
  AGRICULTURAL_CROP_PROFILES,
  cropWeatherRisks,
  growingDegreeDays,
  irrigationSchedule,
  referenceEvapotranspiration,
} from './agriculture';
import {
  degreeDays,
  estimateBuildingEnergy,
  estimateSolarGeneration,
  estimateWindGeneration,
  netEnergyForecast,
} from './energy';
import {
  calculateClimateNormals,
  compareWithClimateNormal,
  countThresholdEvents,
  detectClimateTrend,
  findClimateRecords,
} from './climate';
import {
  apparentTemperature,
  coldHealthRisk,
  dewPointCelsius,
  heatHealthRisk,
  heatIndexCelsius,
  summarizeThermalRisk,
  wetBulbTemperatureC,
  windChillCelsius,
} from './heatHealth';
import {
  BEAUFORT_SCALE,
  beaufortScale,
  calculateTideWindows,
  coastalFloodRisk,
  rankMarineWindows,
  summarizeMarineForecast,
  waveRisk,
} from './marine';
import { flashFloodRisk, rainfallRunoff, reservoirBalance } from './hydrology';

const AT = '2026-06-01T00:00:00Z';

describe('air-quality intelligence', () => {
  it('calculates a good index for low particles', () => {
    const result = calculateAirQualityIndex({ pm2_5: 8, pm10: 20, o3: 30 });
    expect(result.aqi).toBeLessThanOrEqual(50);
    expect(result.category.id).toBe('good');
  });

  it('identifies the dominant pollutant', () => {
    const result = calculateAirQualityIndex({ pm2_5: 80, pm10: 20 });
    expect(result.dominantPollutants).toEqual(['pm2_5']);
  });

  it('caps extreme concentrations', () => {
    expect(calculateAirQualityIndex({ pm2_5: 1000 }).aqi).toBe(500);
  });

  it('exposes standard categories', () => {
    expect(AIR_QUALITY_CATEGORIES).toHaveLength(6);
    expect(AIR_QUALITY_CATEGORIES.at(-1).id).toBe('hazardous');
  });

  it('adjusts guidance for vulnerable profiles', () => {
    const result = calculateAirQualityIndex({ pm2_5: 36 });
    const normal = airQualityGuidance(result);
    const asthma = airQualityGuidance(result, { asthma: true });
    expect(asthma.adjustedAqi).toBeGreaterThan(normal.adjustedAqi);
  });

  it('adjusts guidance for strenuous activity', () => {
    const result = calculateAirQualityIndex({ pm2_5: 36 });
    expect(airQualityGuidance(result, {}, { exertion: 'high' }).adjustedAqi).toBeGreaterThan(result.aqi);
  });

  it('estimates inhaled particulate dose', () => {
    const dose = calculateExposureDose([
      { observedAt: AT, components: { pm2_5: 10, pm10: 20 } },
      { observedAt: '2026-06-01T01:00:00Z', components: { pm2_5: 20, pm10: 30 } },
    ]);
    expect(dose.pm25DoseMicrograms).toBeGreaterThan(0);
    expect(dose.durationMinutes).toBe(60);
  });

  it('summarizes air-quality forecasts', () => {
    const result = summarizeAirQualityForecast([
      { forecastAt: AT, components: { pm2_5: 8 } },
      { forecastAt: '2026-06-01T01:00:00Z', components: { pm2_5: 80 } },
    ]);
    expect(result.maximumAqi).toBeGreaterThan(result.minimumAqi);
    expect(result.worstAt).toContain('01:00:00');
  });
});

describe('pollen intelligence', () => {
  it('includes tree, grass, and weed profiles', () => {
    const categories = new Set(Object.values(POLLEN_PLANT_PROFILES).map((profile) => profile.category));
    expect(categories).toEqual(new Set(['tree', 'grass', 'weed']));
  });

  it('assesses low readings', () => {
    const result = assessPollenReading({ observedAt: AT, components: { grass: 1 } });
    expect(result.risk).toBeLessThanOrEqual(1);
  });

  it('assesses high readings', () => {
    const result = assessPollenReading({ observedAt: AT, components: { grass: 100 } });
    expect(result.risk).toBeGreaterThanOrEqual(4);
  });

  it('applies profile sensitivities', () => {
    const result = assessPollenReading({ observedAt: AT, components: { grass: 100, birch: 100 } }, { sensitivities: ['birch'] });
    expect(result.dominant).toContain('birch');
  });

  it('reduces pollen impact during rain', () => {
    const dry = assessPollenReading({ components: { grass: 50 } }, {}, {});
    const wet = assessPollenReading({ components: { grass: 50 } }, {}, { rainMm: 4 });
    expect(wet.risk).toBeLessThanOrEqual(dry.risk);
  });

  it('shifts calendars in the southern hemisphere', () => {
    const northern = pollenCalendar(50).find((entry) => entry.name === 'grass');
    const southern = pollenCalendar(-30).find((entry) => entry.name === 'grass');
    expect(southern.startsInMonth).not.toBe(northern.startsInMonth);
  });

  it('summarizes pollen forecasts', () => {
    const result = summarizePollenForecast([
      { forecastAt: AT, components: { grass: 1 } },
      { forecastAt: '2026-06-01T01:00:00Z', components: { grass: 100 } },
    ]);
    expect(result.peakRisk).toBeGreaterThan(0);
    expect(result.dominant).toContain('grass');
  });
});

describe('agricultural weather', () => {
  const days = [
    { dateKey: '2026-06-01', minimumC: 10, maximumC: 20, rainTotalMm: 0, averageHumidityPercent: 60 },
    { dateKey: '2026-06-02', minimumC: 12, maximumC: 24, rainTotalMm: 5, averageHumidityPercent: 70 },
  ];

  it('defines crop-specific profiles', () => {
    expect(AGRICULTURAL_CROP_PROFILES.tomato.baseC).toBe(10);
    expect(AGRICULTURAL_CROP_PROFILES.wheat.baseC).toBe(0);
  });

  it('calculates growing degree days', () => {
    expect(growingDegreeDays(days, 'tomato').total).toBe(13);
  });

  it('caps growing temperatures at the upper threshold', () => {
    const result = growingDegreeDays([{ minimumC: 40, maximumC: 50 }], 'tomato');
    expect(result.total).toBe(25);
  });

  it('estimates reference evapotranspiration', () => {
    expect(referenceEvapotranspiration({ minimumC: 10, maximumC: 25, daylightHours: 14 })).toBeGreaterThan(0);
  });

  it('builds irrigation schedules', () => {
    const result = irrigationSchedule(days, 'tomato', { currentMoisture: 0.13 });
    expect(result.schedule).toHaveLength(2);
    expect(result.totalIrrigationMm).toBeGreaterThan(0);
  });

  it('detects crop frost risk', () => {
    const result = cropWeatherRisks([{ dateKey: '2026-01-01', minimumC: -5, maximumC: 3 }], 'tomato');
    expect(result.risks[0].type).toBe('frost');
  });

  it('detects crop heat risk', () => {
    const result = cropWeatherRisks([{ dateKey: '2026-06-01', minimumC: 25, maximumC: 40 }], 'tomato');
    expect(result.risks[0].type).toBe('heat');
  });

  it('detects fungal-disease conditions', () => {
    const result = cropWeatherRisks([{ dateKey: '2026-06-01', minimumC: 15, maximumC: 25, averageHumidityPercent: 95 }], 'tomato');
    expect(result.risks.some((risk) => risk.type === 'fungal_disease')).toBe(true);
  });
});

describe('weather and energy', () => {
  const days = [
    { dateKey: 'one', averageC: 10 },
    { dateKey: 'two', averageC: 25 },
  ];

  it('calculates heating and cooling degree days', () => {
    const result = degreeDays(days);
    expect(result.totalHeatingDegreeDays).toBe(8);
    expect(result.totalCoolingDegreeDays).toBe(3);
  });

  it('estimates building demand', () => {
    const result = estimateBuildingEnergy(days, { floorAreaSquareMeters: 100 });
    expect(result.totalKwh).toBeGreaterThan(result.baseLoadKwh);
  });

  it('estimates solar generation', () => {
    const result = estimateSolarGeneration([{ forecastAt: AT, isDaylight: true, cloudPercent: 0, durationHours: 1 }]);
    expect(result.totalGenerationKwh).toBeGreaterThan(0);
  });

  it('reduces solar generation under clouds', () => {
    const clear = estimateSolarGeneration([{ forecastAt: AT, isDaylight: true, cloudPercent: 0 }]);
    const cloudy = estimateSolarGeneration([{ forecastAt: AT, isDaylight: true, cloudPercent: 100 }]);
    expect(cloudy.totalGenerationKwh).toBeLessThan(clear.totalGenerationKwh);
  });

  it('estimates wind generation above cut-in speed', () => {
    const result = estimateWindGeneration([{ forecastAt: AT, windSpeedMps: 8 }]);
    expect(result.totalGenerationKwh).toBeGreaterThan(0);
  });

  it('curtails wind turbines above cut-out speed', () => {
    const result = estimateWindGeneration([{ forecastAt: AT, windSpeedMps: 30 }]);
    expect(result.curtailedHours).toBe(1);
    expect(result.totalGenerationKwh).toBe(0);
  });

  it('calculates a net energy forecast', () => {
    const demand = estimateBuildingEnergy(days);
    const solar = estimateSolarGeneration([{ forecastAt: AT, isDaylight: true, cloudPercent: 0 }]);
    expect(netEnergyForecast(demand, [solar]).netGridKwh).toBeLessThan(demand.totalKwh);
  });
});

describe('climate analysis', () => {
  const records = [
    { date: '2020-01-01', temperatureC: 10, minimumC: 5, maximumC: 15, precipitationMm: 0 },
    { date: '2021-01-01', temperatureC: 11, minimumC: 6, maximumC: 16, precipitationMm: 2 },
    { date: '2022-01-01', temperatureC: 12, minimumC: 7, maximumC: 17, precipitationMm: 4 },
    { date: '2022-02-01', temperatureC: 15, minimumC: 10, maximumC: 20, precipitationMm: 0 },
  ];

  it('calculates monthly climate normals', () => {
    const result = calculateClimateNormals(records);
    expect(result.normals['01'].sampleCount).toBe(3);
    expect(result.normals['01'].temperatureC.mean).toBe(11);
  });

  it('calculates daily climate normals', () => {
    const result = calculateClimateNormals(records, { period: 'month_day' });
    expect(result.normals['01-01'].sampleCount).toBe(3);
  });

  it('compares an observation with normal', () => {
    const normals = calculateClimateNormals(records);
    const result = compareWithClimateNormal({ date: '2026-01-05', temperatureC: 15 }, normals);
    expect(result.anomalies.temperatureC).toBe(4);
  });

  it('detects increasing climate trends', () => {
    const result = detectClimateTrend(records, 'temperatureC');
    expect(result.direction).toBe('increasing');
    expect(result.slopePerYear).toBeGreaterThan(0);
  });

  it('finds record maxima', () => {
    expect(findClimateRecords(records, 'maximumC', { count: 1 })[0].value).toBe(20);
  });

  it('finds record minima', () => {
    expect(findClimateRecords(records, 'minimumC', { mode: 'minimum', count: 1 })[0].value).toBe(5);
  });

  it('counts consecutive threshold events', () => {
    const events = countThresholdEvents(records, (record) => record.temperatureC >= 11, { minimumLength: 2 });
    expect(events).toHaveLength(1);
  });
});

describe('thermal health', () => {
  it('calculates dew point', () => {
    expect(dewPointCelsius(20, 50)).toBeCloseTo(9.3, 0);
  });

  it('calculates heat index', () => {
    expect(heatIndexCelsius(35, 70)).toBeGreaterThan(35);
  });

  it('returns air temperature in mild heat', () => {
    expect(heatIndexCelsius(20, 50)).toBe(20);
  });

  it('calculates wind chill', () => {
    expect(windChillCelsius(-10, 10)).toBeLessThan(-10);
  });

  it('calculates wet-bulb temperature', () => {
    expect(wetBulbTemperatureC(30, 50)).toBeLessThan(30);
  });

  it('summarizes apparent temperature', () => {
    const result = apparentTemperature({ temperatureC: 35, humidityPercent: 70, windSpeedMps: 2 });
    expect(result.apparentC).toBeGreaterThan(35);
  });

  it('raises heat risk for vulnerable people', () => {
    const normal = heatHealthRisk({ temperatureC: 35, humidityPercent: 70 });
    const vulnerable = heatHealthRisk({ temperatureC: 35, humidityPercent: 70 }, { ageGroup: 'older_adult' });
    expect(vulnerable.score).toBeGreaterThanOrEqual(normal.score);
  });

  it('rates severe cold', () => {
    expect(coldHealthRisk({ temperatureC: -30, windSpeedMps: 10 }).level).toMatch(/high|extreme/);
  });

  it('summarizes thermal forecast risk', () => {
    const result = summarizeThermalRisk([
      { forecastAt: AT, temperatureC: 35, humidityPercent: 70, windSpeedMps: 2 },
      { forecastAt: '2026-06-01T01:00:00Z', temperatureC: 20, humidityPercent: 50, windSpeedMps: 2 },
    ]);
    expect(result.maximumHeatRisk).toBeGreaterThan(result.averageHeatRisk);
  });
});

describe('marine weather', () => {
  it('exposes all Beaufort forces', () => {
    expect(BEAUFORT_SCALE).toHaveLength(13);
  });

  it('classifies calm wind', () => {
    expect(beaufortScale(0).force).toBe(0);
  });

  it('classifies gale wind', () => {
    expect(beaufortScale(20).force).toBeGreaterThanOrEqual(8);
  });

  it('rates dangerous vessel conditions', () => {
    const result = waveRisk({ waveHeightMeters: 4, wavePeriodSeconds: 4, windSpeedMps: 20 }, { lengthMeters: 6 });
    expect(result.score).toBeGreaterThan(60);
  });

  it('ranks favorable marine windows first', () => {
    const result = rankMarineWindows([
      { forecastAt: 'bad', waveHeightMeters: 4, windSpeedMps: 20 },
      { forecastAt: 'good', waveHeightMeters: 0.5, windSpeedMps: 2 },
    ]);
    expect(result[0].forecastAt).toBe('good');
  });

  it('calculates suitable tide windows', () => {
    const result = calculateTideWindows([
      { at: '2026-01-01T00:00:00Z', heightMeters: 1 },
      { at: '2026-01-01T01:00:00Z', heightMeters: 1.5 },
      { at: '2026-01-01T02:00:00Z', heightMeters: 3 },
    ], { minimumHeightMeters: 0.5, maximumHeightMeters: 2 });
    expect(result).toHaveLength(1);
  });

  it('rates coastal flooding', () => {
    const result = coastalFloodRisk({ tideHeightMeters: 2, surgeMeters: 1, waveHeightMeters: 2 }, { floodThresholdMeters: 2.5 });
    expect(result.marginMeters).toBeGreaterThan(0);
  });

  it('summarizes marine forecasts', () => {
    const result = summarizeMarineForecast([{ forecastAt: AT, waveHeightMeters: 1, windSpeedMps: 4 }]);
    expect(result.bestAt).toBe(AT);
  });
});

describe('hydrology', () => {
  const periods = [
    { forecastAt: AT, rainMm: 10, durationHours: 1 },
    { forecastAt: '2026-06-01T01:00:00Z', rainMm: 20, durationHours: 1 },
  ];

  it('calculates rainfall runoff', () => {
    const result = rainfallRunoff(periods, { areaSquareKm: 2, runoffCoefficient: 0.5 });
    expect(result.totalRunoffMm).toBeGreaterThan(0);
    expect(result.totalRunoffVolumeCubicMeters).toBeGreaterThan(0);
  });

  it('increases runoff with impermeable surfaces', () => {
    const low = rainfallRunoff(periods, { runoffCoefficient: 0.2 });
    const high = rainfallRunoff(periods, { runoffCoefficient: 0.9 });
    expect(high.totalRunoffMm).toBeGreaterThan(low.totalRunoffMm);
  });

  it('rates flash-flood risk', () => {
    const result = flashFloodRisk(periods, { channelCapacityMmPerHour: 2, soilSaturationPercent: 100 });
    expect(result.score).toBeGreaterThan(40);
  });

  it('calculates reservoir balance', () => {
    const result = reservoirBalance([
      { forecastAt: AT, inflowCubicMeters: 1000, releaseCubicMeters: 100, rainMm: 10, evaporationMm: 2 },
    ], { capacityCubicMeters: 10_000, currentStorageCubicMeters: 5_000, surfaceAreaSquareMeters: 1_000 });
    expect(result.finalStorageCubicMeters).toBeGreaterThan(5_000);
  });

  it('reports reservoir spill', () => {
    const result = reservoirBalance([{ forecastAt: AT, inflowCubicMeters: 5_000 }], {
      capacityCubicMeters: 10_000,
      currentStorageCubicMeters: 9_000,
    });
    expect(result.totalSpillCubicMeters).toBe(4_000);
  });
});
