import { assertArray, clamp, deepFreeze, round } from '../core/validation';
import { maximum, sum } from '../core/statistics';

export function precipitationPhase(period) {
  const surface = period.temperatureC;
  const wetBulb = period.wetBulbC ?? surface;
  const aloft = period.temperatureAloftC;
  if (!Number.isFinite(surface)) return 'unknown';
  if (surface <= -1 && (!Number.isFinite(aloft) || aloft <= 0)) return 'snow';
  if (surface <= 0 && Number.isFinite(aloft) && aloft > 1) return 'freezing_rain';
  if (surface <= 2 && wetBulb <= 1) return 'mixed';
  return 'rain';
}

export function roadIceRisk(period, road = {}) {
  const air = period.temperatureC ?? 10;
  const roadTemperature = period.roadTemperatureC ?? air + (period.isDaylight ? 1.5 : -1);
  const precipitation = period.precipitationProbability ?? 0;
  const rain = period.rainMm ?? period.precipitationMm ?? 0;
  const humidity = period.humidityPercent ?? 50;
  const residualMoisture = road.residualMoisture === true || rain > 0;
  let score = 0;
  if (roadTemperature <= 0 && residualMoisture) score += 70;
  if (roadTemperature > 0 && roadTemperature <= 2 && residualMoisture) score += 40;
  if (air <= 0 && precipitation >= 0.5) score += 30;
  if (humidity >= 90 && roadTemperature <= 0) score += 20;
  if (road.salted) score -= 20;
  score = clamp(score, 0, 100);
  return deepFreeze({
    score: round(score, 1),
    level: score >= 80 ? 'extreme' : score >= 60 ? 'high' : score >= 35 ? 'moderate' : 'low',
    roadTemperatureC: round(roadTemperature, 1),
    phase: precipitationPhase(period),
    blackIcePossible: roadTemperature <= 0 && residualMoisture && rain < 0.5,
  });
}

export function snowfallAccumulation(periods, surface = {}) {
  let depth = Math.max(0, surface.existingSnowDepthCm ?? 0);
  const entries = assertArray(periods, 'Winter forecast periods', { nonEmpty: true }).map((period) => {
    const phase = precipitationPhase(period);
    const liquid = Math.max(0, period.precipitationMm ?? period.snowMm ?? 0);
    const ratio = Number.isFinite(period.snowRatio)
      ? period.snowRatio
      : (period.temperatureC ?? 0) <= -8 ? 15 : (period.temperatureC ?? 0) <= -2 ? 12 : 8;
    const newSnowCm = phase === 'snow' ? liquid * ratio / 10 : phase === 'mixed' ? liquid * ratio / 20 : 0;
    const meltCm = (period.temperatureC ?? 0) > 0
      ? Math.min(depth + newSnowCm, (period.temperatureC ?? 0) * (period.durationHours ?? 1) * 0.12)
      : 0;
    const compaction = depth * 0.015 * (period.durationHours ?? 1);
    depth = Math.max(0, depth + newSnowCm - meltCm - compaction);
    return deepFreeze({
      forecastAt: period.forecastAt,
      phase,
      newSnowCm: round(newSnowCm, 1),
      meltCm: round(meltCm, 1),
      compactionCm: round(compaction, 1),
      snowDepthCm: round(depth, 1),
    });
  });
  return deepFreeze({
    entries,
    totalNewSnowCm: round(sum(entries.map((entry) => entry.newSnowCm)), 1),
    maximumSnowDepthCm: maximum(entries.map((entry) => entry.snowDepthCm)),
    finalSnowDepthCm: entries.at(-1).snowDepthCm,
  });
}

export function summarizeWinterHazards(periods, road = {}) {
  const ice = assertArray(periods, 'Winter forecast periods', { nonEmpty: true }).map((period) => ({
    forecastAt: period.forecastAt,
    risk: roadIceRisk(period, road),
  }));
  const snow = snowfallAccumulation(periods, road);
  return deepFreeze({
    ice,
    snow,
    maximumIceRisk: maximum(ice.map((entry) => entry.risk.score)),
    firstIceRiskAt: ice.find((entry) => entry.risk.score >= 35)?.forecastAt ?? null,
  });
}
