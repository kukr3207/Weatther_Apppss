import { assertArray, assertFiniteNumber, deepFreeze, round } from '../core/validation';
import { maximum, mean, sum } from '../core/statistics';

export function degreeDays(days, options = {}) {
  const heatingBaseC = assertFiniteNumber(options.heatingBaseC ?? 18, 'Heating base temperature');
  const coolingBaseC = assertFiniteNumber(options.coolingBaseC ?? 22, 'Cooling base temperature');
  const entries = assertArray(days, 'Weather days', { nonEmpty: true }).map((day) => {
    const averageC = Number.isFinite(day.averageC)
      ? day.averageC
      : mean([day.minimumC, day.maximumC].filter(Number.isFinite));
    const heating = Number.isFinite(averageC) ? Math.max(0, heatingBaseC - averageC) : null;
    const cooling = Number.isFinite(averageC) ? Math.max(0, averageC - coolingBaseC) : null;
    return deepFreeze({
      date: day.date ?? day.dateKey ?? null,
      averageC: round(averageC, 2),
      heatingDegreeDays: round(heating, 2),
      coolingDegreeDays: round(cooling, 2),
    });
  });
  return deepFreeze({
    heatingBaseC,
    coolingBaseC,
    entries,
    totalHeatingDegreeDays: round(sum(entries.map((entry) => entry.heatingDegreeDays)), 2),
    totalCoolingDegreeDays: round(sum(entries.map((entry) => entry.coolingDegreeDays)), 2),
  });
}

export function estimateBuildingEnergy(days, building = {}) {
  const degreeDayReport = degreeDays(days, building);
  const floorAreaSquareMeters = assertFiniteNumber(building.floorAreaSquareMeters ?? 100, 'Floor area', { minimum: 1 });
  const heatingKwhPerDegreeDaySquareMeter = assertFiniteNumber(
    building.heatingKwhPerDegreeDaySquareMeter ?? 0.12,
    'Heating intensity',
    { minimum: 0 },
  );
  const coolingKwhPerDegreeDaySquareMeter = assertFiniteNumber(
    building.coolingKwhPerDegreeDaySquareMeter ?? 0.08,
    'Cooling intensity',
    { minimum: 0 },
  );
  const baseLoadKwhPerDay = assertFiniteNumber(building.baseLoadKwhPerDay ?? 8, 'Base load', { minimum: 0 });
  const efficiency = assertFiniteNumber(building.systemEfficiency ?? 0.9, 'System efficiency', { minimum: 0.1, maximum: 2 });
  const entries = degreeDayReport.entries.map((entry) => {
    const heatingKwh = entry.heatingDegreeDays * floorAreaSquareMeters * heatingKwhPerDegreeDaySquareMeter / efficiency;
    const coolingKwh = entry.coolingDegreeDays * floorAreaSquareMeters * coolingKwhPerDegreeDaySquareMeter / efficiency;
    return deepFreeze({
      ...entry,
      baseLoadKwh: baseLoadKwhPerDay,
      heatingKwh: round(heatingKwh, 2),
      coolingKwh: round(coolingKwh, 2),
      totalKwh: round(baseLoadKwhPerDay + heatingKwh + coolingKwh, 2),
    });
  });
  return deepFreeze({
    entries,
    totalKwh: round(sum(entries.map((entry) => entry.totalKwh)), 2),
    heatingKwh: round(sum(entries.map((entry) => entry.heatingKwh)), 2),
    coolingKwh: round(sum(entries.map((entry) => entry.coolingKwh)), 2),
    baseLoadKwh: round(sum(entries.map((entry) => entry.baseLoadKwh)), 2),
    peakDailyKwh: round(maximum(entries.map((entry) => entry.totalKwh)), 2),
  });
}

export function estimateSolarGeneration(periods, system = {}) {
  const capacityKw = assertFiniteNumber(system.capacityKw ?? 5, 'Solar capacity', { minimum: 0.1 });
  const performanceRatio = assertFiniteNumber(system.performanceRatio ?? 0.78, 'Performance ratio', { minimum: 0.1, maximum: 1 });
  const tiltFactor = assertFiniteNumber(system.tiltFactor ?? 0.95, 'Panel tilt factor', { minimum: 0.1, maximum: 1.2 });
  const entries = assertArray(periods, 'Forecast periods', { nonEmpty: true }).map((period) => {
    const cloud = Math.max(0, Math.min(100, period.cloudPercent ?? 50));
    const daylight = period.isDaylight !== false;
    const solarElevation = Number.isFinite(period.solarElevationDegrees)
      ? Math.max(0, Math.sin(period.solarElevationDegrees * Math.PI / 180))
      : daylight ? 0.55 : 0;
    const cloudFactor = Math.max(0.08, 1 - cloud / 100 * 0.82);
    const snowFactor = (period.snowMm ?? 0) > 2 && (period.temperatureC ?? 5) <= 1 ? 0.55 : 1;
    const temperatureFactor = Number.isFinite(period.temperatureC) && period.temperatureC > 25
      ? Math.max(0.8, 1 - (period.temperatureC - 25) * 0.004)
      : 1;
    const durationHours = Number.isFinite(period.durationHours) ? period.durationHours : 1;
    const generationKwh = capacityKw * performanceRatio * tiltFactor * solarElevation
      * cloudFactor * snowFactor * temperatureFactor * durationHours;
    return deepFreeze({
      forecastAt: period.forecastAt,
      generationKwh: round(generationKwh, 3),
      capacityFactor: round(generationKwh / (capacityKw * durationHours), 3),
      cloudFactor: round(cloudFactor, 3),
      temperatureFactor: round(temperatureFactor, 3),
    });
  });
  return deepFreeze({
    capacityKw,
    entries,
    totalGenerationKwh: round(sum(entries.map((entry) => entry.generationKwh)), 2),
    peakGenerationKwh: round(maximum(entries.map((entry) => entry.generationKwh)), 2),
    averageCapacityFactor: round(mean(entries.map((entry) => entry.capacityFactor)), 3),
  });
}

export function estimateWindGeneration(periods, turbine = {}) {
  const ratedPowerKw = assertFiniteNumber(turbine.ratedPowerKw ?? 3, 'Rated wind power', { minimum: 0.1 });
  const cutInMps = assertFiniteNumber(turbine.cutInMps ?? 3, 'Cut-in wind speed', { minimum: 0 });
  const ratedMps = assertFiniteNumber(turbine.ratedMps ?? 12, 'Rated wind speed', { minimum: cutInMps + 0.1 });
  const cutOutMps = assertFiniteNumber(turbine.cutOutMps ?? 25, 'Cut-out wind speed', { minimum: ratedMps });
  const entries = assertArray(periods, 'Forecast periods', { nonEmpty: true }).map((period) => {
    const wind = Math.max(0, period.windSpeedMps ?? 0);
    let powerKw = 0;
    if (wind >= cutInMps && wind < ratedMps) powerKw = ratedPowerKw * ((wind - cutInMps) / (ratedMps - cutInMps)) ** 3;
    else if (wind >= ratedMps && wind < cutOutMps) powerKw = ratedPowerKw;
    const durationHours = Number.isFinite(period.durationHours) ? period.durationHours : 1;
    return deepFreeze({
      forecastAt: period.forecastAt,
      windSpeedMps: wind,
      powerKw: round(powerKw, 3),
      generationKwh: round(powerKw * durationHours, 3),
      operating: powerKw > 0,
      curtailed: wind >= cutOutMps,
    });
  });
  return deepFreeze({
    ratedPowerKw,
    entries,
    totalGenerationKwh: round(sum(entries.map((entry) => entry.generationKwh)), 2),
    operatingHours: entries.filter((entry) => entry.operating).length,
    curtailedHours: entries.filter((entry) => entry.curtailed).length,
  });
}

export function netEnergyForecast(demandReport, generationReports) {
  const demand = demandReport.entries ?? [];
  const generation = assertArray(generationReports, 'Generation reports');
  const totalGeneration = sum(generation.map((report) => report.totalGenerationKwh));
  const totalDemand = demandReport.totalKwh ?? sum(demand.map((entry) => entry.totalKwh));
  return deepFreeze({
    totalDemandKwh: round(totalDemand, 2),
    totalGenerationKwh: round(totalGeneration, 2),
    netGridKwh: round(totalDemand - totalGeneration, 2),
    renewableCoveragePercent: totalDemand > 0 ? round(Math.min(100, totalGeneration / totalDemand * 100), 1) : 100,
  });
}
