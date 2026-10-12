import { assertArray, assertFiniteNumber, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, minimum, sum } from '../core/statistics';

const TEXTURE_COEFFICIENTS = Object.freeze({
  sand: { fieldCapacity: 0.12, wiltingPoint: 0.05, infiltrationMmHour: 25 },
  loamy_sand: { fieldCapacity: 0.16, wiltingPoint: 0.07, infiltrationMmHour: 20 },
  sandy_loam: { fieldCapacity: 0.22, wiltingPoint: 0.1, infiltrationMmHour: 15 },
  loam: { fieldCapacity: 0.29, wiltingPoint: 0.14, infiltrationMmHour: 10 },
  silt_loam: { fieldCapacity: 0.34, wiltingPoint: 0.16, infiltrationMmHour: 7.5 },
  clay_loam: { fieldCapacity: 0.36, wiltingPoint: 0.22, infiltrationMmHour: 5 },
  clay: { fieldCapacity: 0.42, wiltingPoint: 0.27, infiltrationMmHour: 2.5 },
});

function texture(value) {
  const key = String(value ?? 'loam').toLowerCase().replace(/[ -]+/g, '_');
  if (!TEXTURE_COEFFICIENTS[key]) throw new TypeError(`Unsupported soil texture: ${value}.`);
  return { key, ...TEXTURE_COEFFICIENTS[key] };
}

export function availableSoilWater(input) {
  const profile = texture(input.texture);
  const depthMm = assertFiniteNumber(input.depthMm ?? 300, 'Soil depth', { minimum: 1, maximum: 5000 });
  const volumetricWater = assertFiniteNumber(input.volumetricWater, 'Volumetric water', { minimum: 0, maximum: 1 });
  const availableFraction = Math.max(0, volumetricWater - profile.wiltingPoint);
  const capacityFraction = profile.fieldCapacity - profile.wiltingPoint;
  const availableMm = availableFraction * depthMm;
  const capacityMm = capacityFraction * depthMm;
  return deepFreeze({
    texture: profile.key,
    depthMm,
    volumetricWater,
    fieldCapacity: profile.fieldCapacity,
    wiltingPoint: profile.wiltingPoint,
    availableMm: round(availableMm, 2),
    capacityMm: round(capacityMm, 2),
    availablePercent: round(capacityMm > 0 ? availableMm / capacityMm * 100 : 0, 1),
    deficitMm: round(Math.max(0, capacityMm - availableMm), 2),
  });
}

export function estimateInfiltration(input) {
  const profile = texture(input.texture);
  const precipitationMm = assertFiniteNumber(input.precipitationMm, 'Precipitation', { minimum: 0 });
  const durationHours = assertFiniteNumber(input.durationHours ?? 1, 'Precipitation duration', { minimum: 0.01 });
  const slopePercent = assertFiniteNumber(input.slopePercent ?? 0, 'Slope', { minimum: 0, maximum: 100 });
  const coverPercent = assertFiniteNumber(input.coverPercent ?? 50, 'Ground cover', { minimum: 0, maximum: 100 });
  const saturation = assertFiniteNumber(input.saturation ?? 0.5, 'Initial saturation', { minimum: 0, maximum: 1 });
  const slopeFactor = Math.max(0.35, 1 - slopePercent / 100);
  const coverFactor = 0.6 + coverPercent / 250;
  const saturationFactor = 1 - saturation * 0.65;
  const capacity = profile.infiltrationMmHour * durationHours * slopeFactor * coverFactor * saturationFactor;
  const infiltratedMm = Math.min(precipitationMm, capacity);
  return deepFreeze({
    texture: profile.key,
    precipitationMm,
    capacityMm: round(capacity, 2),
    infiltratedMm: round(infiltratedMm, 2),
    runoffMm: round(Math.max(0, precipitationMm - infiltratedMm), 2),
    infiltrationRatio: precipitationMm > 0 ? round(infiltratedMm / precipitationMm, 4) : 1,
  });
}

export function modelSoilMoisture(inputDays, options = {}) {
  const profile = texture(options.texture);
  const depthMm = assertFiniteNumber(options.depthMm ?? 300, 'Soil depth', { minimum: 1 });
  const capacityMm = (profile.fieldCapacity - profile.wiltingPoint) * depthMm;
  let storage = assertFiniteNumber(options.initialAvailableMm ?? capacityMm * 0.6, 'Initial soil water', {
    minimum: 0,
    maximum: capacityMm,
  });
  const days = assertArray(inputDays, 'Soil weather days', { nonEmpty: true }).map((day, index) => ({
    ...day,
    observedAt: new Date(parseTimestamp(day.observedAt ?? day.date, `Soil day ${index + 1} time`)).toISOString(),
  })).sort((first, second) => parseTimestamp(first.observedAt) - parseTimestamp(second.observedAt));
  const series = days.map((day) => {
    const precipitationMm = Math.max(0, day.precipitationMm ?? day.rainMm ?? 0);
    const irrigationMm = Math.max(0, day.irrigationMm ?? 0);
    const potentialEvapotranspirationMm = Math.max(0, day.evapotranspirationMm ?? day.et0Mm ?? 0);
    const cropCoefficient = Number.isFinite(day.cropCoefficient) ? day.cropCoefficient : options.cropCoefficient ?? 1;
    const demandMm = potentialEvapotranspirationMm * cropCoefficient;
    const saturation = capacityMm ? storage / capacityMm : 0;
    const infiltration = estimateInfiltration({
      texture: profile.key,
      precipitationMm: precipitationMm + irrigationMm,
      durationHours: day.precipitationDurationHours ?? 6,
      slopePercent: options.slopePercent ?? 0,
      coverPercent: options.coverPercent ?? 50,
      saturation,
    });
    const before = storage;
    storage += infiltration.infiltratedMm;
    const drainageMm = Math.max(0, storage - capacityMm);
    storage = Math.min(capacityMm, storage);
    const actualEvapotranspirationMm = Math.min(storage, demandMm);
    storage -= actualEvapotranspirationMm;
    return deepFreeze({
      observedAt: day.observedAt,
      startingAvailableMm: round(before, 2),
      precipitationMm,
      irrigationMm,
      infiltratedMm: infiltration.infiltratedMm,
      runoffMm: infiltration.runoffMm,
      drainageMm: round(drainageMm, 2),
      potentialEvapotranspirationMm: round(demandMm, 2),
      actualEvapotranspirationMm: round(actualEvapotranspirationMm, 2),
      availableMm: round(storage, 2),
      availablePercent: round(capacityMm ? storage / capacityMm * 100 : 0, 1),
      stress: capacityMm ? storage / capacityMm < (options.stressThreshold ?? 0.4) : false,
    });
  });
  return deepFreeze({
    texture: profile.key,
    depthMm,
    capacityMm: round(capacityMm, 2),
    series,
    latest: series.at(-1),
    summary: {
      totalRainMm: round(sum(series.map((day) => day.precipitationMm)), 2),
      totalIrrigationMm: round(sum(series.map((day) => day.irrigationMm)), 2),
      totalRunoffMm: round(sum(series.map((day) => day.runoffMm)), 2),
      totalDrainageMm: round(sum(series.map((day) => day.drainageMm)), 2),
      stressDays: series.filter((day) => day.stress).length,
      minimumAvailablePercent: round(minimum(series.map((day) => day.availablePercent)), 1),
      maximumAvailablePercent: round(maximum(series.map((day) => day.availablePercent)), 1),
      averageAvailablePercent: round(mean(series.map((day) => day.availablePercent)), 1),
    },
  });
}

export function planIrrigation(soilModel, forecastDays, options = {}) {
  const targetPercent = assertFiniteNumber(options.targetPercent ?? 75, 'Target soil moisture', { minimum: 0, maximum: 100 });
  const triggerPercent = assertFiniteNumber(options.triggerPercent ?? 40, 'Irrigation trigger', { minimum: 0, maximum: 100 });
  const efficiency = assertFiniteNumber(options.efficiency ?? 0.8, 'Irrigation efficiency', { minimum: 0.01, maximum: 1 });
  let availableMm = soilModel.latest?.availableMm ?? soilModel.capacityMm * 0.5;
  const schedule = [];
  assertArray(forecastDays, 'Irrigation forecast').forEach((day, index) => {
    const rainMm = Math.max(0, day.precipitationMm ?? day.rainMm ?? 0);
    const demandMm = Math.max(0, (day.evapotranspirationMm ?? day.et0Mm ?? 0) * (options.cropCoefficient ?? 1));
    availableMm = Math.max(0, Math.min(soilModel.capacityMm, availableMm + rainMm - demandMm));
    const percent = soilModel.capacityMm ? availableMm / soilModel.capacityMm * 100 : 0;
    let applicationMm = 0;
    if (percent < triggerPercent) {
      const needed = soilModel.capacityMm * targetPercent / 100 - availableMm;
      applicationMm = Math.max(0, needed / efficiency);
      availableMm = Math.min(soilModel.capacityMm, availableMm + applicationMm * efficiency);
    }
    schedule.push(deepFreeze({
      date: new Date(parseTimestamp(day.observedAt ?? day.date ?? Date.now() + index * 86_400_000)).toISOString(),
      forecastRainMm: rainMm,
      demandMm: round(demandMm, 2),
      applicationMm: round(applicationMm, 2),
      projectedAvailablePercent: round(soilModel.capacityMm ? availableMm / soilModel.capacityMm * 100 : 0, 1),
    }));
  });
  return deepFreeze({ targetPercent, triggerPercent, efficiency, schedule, totalApplicationMm: round(sum(schedule.map((day) => day.applicationMm)), 2) });
}

export function soilTemperatureSuitability(temperatures, crop) {
  const minimumC = assertFiniteNumber(crop.minimumC, 'Crop minimum soil temperature');
  const optimumC = assertFiniteNumber(crop.optimumC, 'Crop optimum soil temperature');
  const maximumC = assertFiniteNumber(crop.maximumC, 'Crop maximum soil temperature');
  const values = assertArray(temperatures, 'Soil temperatures', { nonEmpty: true }).filter(Number.isFinite);
  const average = mean(values);
  const score = average <= minimumC || average >= maximumC ? 0
    : average <= optimumC
      ? (average - minimumC) / (optimumC - minimumC) * 100
      : (maximumC - average) / (maximumC - optimumC) * 100;
  return deepFreeze({
    averageC: round(average, 1),
    minimumObservedC: round(minimum(values), 1),
    maximumObservedC: round(maximum(values), 1),
    suitable: score >= 50,
    score: round(Math.max(0, Math.min(100, score)), 1),
  });
}
