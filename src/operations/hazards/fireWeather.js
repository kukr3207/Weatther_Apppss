import { assertArray, clamp, deepFreeze, round } from '../core/validation';
import { maximum, mean, sum } from '../core/statistics';

export function fineFuelMoisture(period) {
  const humidity = clamp(period.humidityPercent ?? 50, 1, 100);
  const temperature = period.temperatureC ?? 20;
  const rain = period.rainLast24HoursMm ?? period.rainMm ?? 0;
  const equilibrium = humidity < 10 ? 2.5
    : humidity < 30 ? 4 + humidity * 0.12
      : humidity < 60 ? 7 + (humidity - 30) * 0.2
        : 13 + (humidity - 60) * 0.35;
  const temperatureAdjustment = Math.max(-3, Math.min(3, (20 - temperature) * 0.1));
  const rainAdjustment = Math.min(20, rain * 2.5);
  return round(clamp(equilibrium + temperatureAdjustment + rainAdjustment, 1, 40), 1);
}

export function fireWeatherIndex(period, context = {}) {
  const moisture = fineFuelMoisture(period);
  const windKph = Math.max(0, period.windSpeedMps ?? 0) * 3.6;
  const drought = clamp(context.droughtIndex ?? period.droughtIndex ?? 0, 0, 800);
  const slope = clamp(context.slopeDegrees ?? 0, 0, 60);
  const fuelLoad = clamp(context.fuelLoadTonnesPerHectare ?? 8, 0, 60);
  const curing = clamp(context.grassCuringPercent ?? 50, 0, 100);
  const moistureFactor = Math.max(0, (30 - moisture) / 30);
  const windFactor = 1 + windKph / 35;
  const droughtFactor = 0.6 + drought / 800;
  const slopeFactor = 1 + slope / 45;
  const fuelFactor = 0.6 + Math.min(1.5, fuelLoad / 15);
  const curingFactor = 0.5 + curing / 100;
  const raw = moistureFactor * windFactor * droughtFactor * slopeFactor * fuelFactor * curingFactor * 35;
  const score = clamp(raw, 0, 100);
  return deepFreeze({
    score: round(score, 1),
    level: score >= 85 ? 'catastrophic' : score >= 70 ? 'extreme' : score >= 50 ? 'high' : score >= 25 ? 'moderate' : 'low',
    fineFuelMoisturePercent: moisture,
    windKph: round(windKph, 1),
    factors: { drought: droughtFactor, slope: slopeFactor, fuel: fuelFactor, curing: curingFactor },
  });
}

export function redFlagConditions(period, thresholds = {}) {
  const humidity = period.humidityPercent ?? 100;
  const wind = period.windSpeedMps ?? 0;
  const temperature = period.temperatureC ?? -100;
  const moisture = fineFuelMoisture(period);
  const matches = {
    lowHumidity: humidity <= (thresholds.maximumHumidityPercent ?? 20),
    strongWind: wind >= (thresholds.minimumWindMps ?? 10),
    highTemperature: temperature >= (thresholds.minimumTemperatureC ?? 30),
    dryFuel: moisture <= (thresholds.maximumFuelMoisturePercent ?? 10),
  };
  const matchedCount = Object.values(matches).filter(Boolean).length;
  return deepFreeze({ active: matchedCount >= (thresholds.requiredConditions ?? 3), matchedCount, matches });
}

export function summarizeFireWeather(periods, context = {}) {
  const assessments = assertArray(periods, 'Forecast periods', { nonEmpty: true }).map((period) => ({
    forecastAt: period.forecastAt,
    index: fireWeatherIndex(period, context),
    redFlag: redFlagConditions(period, context.thresholds),
  }));
  const maximumRisk = maximum(assessments.map((entry) => entry.index.score));
  return deepFreeze({
    assessments,
    maximumRisk,
    averageRisk: round(mean(assessments.map((entry) => entry.index.score)), 1),
    redFlagPeriodCount: sum(assessments.map((entry) => Number(entry.redFlag.active))),
    peakAt: assessments.find((entry) => entry.index.score === maximumRisk)?.forecastAt ?? null,
  });
}
