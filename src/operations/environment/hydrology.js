import { assertArray, assertFiniteNumber, clamp, deepFreeze, round } from '../core/validation';
import { maximum, sum } from '../core/statistics';

export function rainfallRunoff(periods, catchment = {}) {
  const areaSquareKm = assertFiniteNumber(catchment.areaSquareKm ?? 1, 'Catchment area', { minimum: 0.001 });
  const runoffCoefficient = assertFiniteNumber(catchment.runoffCoefficient ?? 0.45, 'Runoff coefficient', {
    minimum: 0,
    maximum: 1,
  });
  const initialLossMm = assertFiniteNumber(catchment.initialLossMm ?? 2, 'Initial rainfall loss', { minimum: 0 });
  const infiltrationMmPerHour = assertFiniteNumber(
    catchment.infiltrationMmPerHour ?? 3,
    'Infiltration rate',
    { minimum: 0 },
  );
  let remainingLoss = initialLossMm;
  const entries = assertArray(periods, 'Rainfall periods', { nonEmpty: true }).map((period) => {
    const durationHours = Number.isFinite(period.durationHours) ? Math.max(0, period.durationHours) : 1;
    const rain = Math.max(0, period.rainMm ?? period.precipitationMm ?? 0);
    const loss = Math.min(rain, remainingLoss + infiltrationMmPerHour * durationHours);
    remainingLoss = Math.max(0, remainingLoss - rain) + Math.max(0, infiltrationMmPerHour * durationHours - rain);
    const effectiveRain = Math.max(0, rain - loss);
    const runoffMm = effectiveRain * runoffCoefficient;
    const volumeCubicMeters = runoffMm / 1000 * areaSquareKm * 1_000_000;
    return deepFreeze({
      at: period.forecastAt ?? period.observedAt,
      durationHours,
      rainMm: rain,
      lossMm: round(loss, 2),
      effectiveRainMm: round(effectiveRain, 2),
      runoffMm: round(runoffMm, 2),
      runoffVolumeCubicMeters: round(volumeCubicMeters, 0),
    });
  });
  return deepFreeze({
    areaSquareKm,
    runoffCoefficient,
    entries,
    totalRainMm: round(sum(entries.map((entry) => entry.rainMm)), 2),
    totalRunoffMm: round(sum(entries.map((entry) => entry.runoffMm)), 2),
    totalRunoffVolumeCubicMeters: round(sum(entries.map((entry) => entry.runoffVolumeCubicMeters)), 0),
  });
}

export function flashFloodRisk(periods, catchment = {}) {
  const runoff = rainfallRunoff(periods, catchment);
  const timeOfConcentrationHours = assertFiniteNumber(
    catchment.timeOfConcentrationHours ?? 2,
    'Time of concentration',
    { minimum: 0.1 },
  );
  const capacityMmPerHour = assertFiniteNumber(
    catchment.channelCapacityMmPerHour ?? 10,
    'Channel capacity',
    { minimum: 0.1 },
  );
  const peakRates = runoff.entries.map((entry) => entry.runoffMm / Math.max(0.01, entry.durationHours));
  const peak = maximum(peakRates) ?? 0;
  const rolling = runoff.entries.map((_, index) => {
    let duration = 0;
    let amount = 0;
    for (let cursor = index; cursor >= 0 && duration < timeOfConcentrationHours; cursor -= 1) {
      const entry = runoff.entries[cursor];
      duration += entry.durationHours;
      amount += entry.runoffMm;
    }
    return amount / Math.max(0.01, Math.min(duration, timeOfConcentrationHours));
  });
  const concentratedPeak = maximum(rolling) ?? 0;
  const saturation = clamp(catchment.soilSaturationPercent ?? 50, 0, 100);
  const saturationFactor = 0.5 + saturation / 100;
  const score = clamp(Math.max(peak, concentratedPeak) / capacityMmPerHour * 60 * saturationFactor, 0, 100);
  return deepFreeze({
    score: round(score, 1),
    level: score >= 85 ? 'extreme' : score >= 65 ? 'high' : score >= 40 ? 'moderate' : 'low',
    peakRunoffRateMmPerHour: round(peak, 2),
    concentratedRateMmPerHour: round(concentratedPeak, 2),
    channelCapacityMmPerHour: capacityMmPerHour,
    soilSaturationPercent: saturation,
    runoff,
  });
}

export function reservoirBalance(periods, reservoir = {}) {
  const capacity = assertFiniteNumber(reservoir.capacityCubicMeters, 'Reservoir capacity', { minimum: 1 });
  let storage = assertFiniteNumber(reservoir.currentStorageCubicMeters ?? capacity * 0.5, 'Current storage', {
    minimum: 0,
    maximum: capacity,
  });
  const surfaceArea = assertFiniteNumber(reservoir.surfaceAreaSquareMeters ?? 100_000, 'Surface area', { minimum: 1 });
  const entries = assertArray(periods, 'Reservoir periods', { nonEmpty: true }).map((period) => {
    const inflow = Math.max(0, period.inflowCubicMeters ?? 0);
    const release = Math.max(0, period.releaseCubicMeters ?? reservoir.defaultReleaseCubicMeters ?? 0);
    const evaporation = Math.max(0, period.evaporationMm ?? 0) / 1000 * surfaceArea;
    const rainfall = Math.max(0, period.rainMm ?? 0) / 1000 * surfaceArea;
    const before = storage;
    const rawAfter = before + inflow + rainfall - release - evaporation;
    const spill = Math.max(0, rawAfter - capacity);
    const shortage = Math.max(0, -rawAfter);
    storage = clamp(rawAfter, 0, capacity);
    return deepFreeze({
      at: period.forecastAt ?? period.observedAt,
      storageBeforeCubicMeters: round(before, 0),
      inflowCubicMeters: round(inflow, 0),
      rainfallCubicMeters: round(rainfall, 0),
      releaseCubicMeters: round(release, 0),
      evaporationCubicMeters: round(evaporation, 0),
      spillCubicMeters: round(spill, 0),
      shortageCubicMeters: round(shortage, 0),
      storageAfterCubicMeters: round(storage, 0),
      storagePercent: round(storage / capacity * 100, 1),
    });
  });
  return deepFreeze({
    capacityCubicMeters: capacity,
    entries,
    finalStorageCubicMeters: round(storage, 0),
    finalStoragePercent: round(storage / capacity * 100, 1),
    totalSpillCubicMeters: round(sum(entries.map((entry) => entry.spillCubicMeters)), 0),
    totalShortageCubicMeters: round(sum(entries.map((entry) => entry.shortageCubicMeters)), 0),
  });
}
