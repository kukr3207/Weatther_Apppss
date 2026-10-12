import { assertArray, assertObject, deepFreeze, parseTimestamp, round } from '../core/validation';
import { mean } from '../core/statistics';

const PROFILES = Object.freeze({
  walking: { temperature: [5, 28], wind: 12, rain: 1, humidity: 90, daylight: true },
  running: { temperature: [2, 22], wind: 10, rain: 0.5, humidity: 80, daylight: true },
  cycling: { temperature: [5, 27], wind: 8, rain: 0.2, humidity: 85, daylight: true },
  hiking: { temperature: [0, 25], wind: 12, rain: 1, humidity: 90, daylight: true },
  picnic: { temperature: [15, 30], wind: 8, rain: 0, humidity: 85, daylight: true },
  gardening: { temperature: [8, 28], wind: 10, rain: 2, humidity: 90, daylight: true },
  photography: { temperature: [-5, 32], wind: 15, rain: 1, humidity: 95, daylight: false },
  stargazing: { temperature: [-10, 30], wind: 10, rain: 0, humidity: 80, daylight: false, maximumCloud: 30 },
  boating: { temperature: [10, 35], wind: 9, rain: 0.5, humidity: 100, daylight: true },
  skiing: { temperature: [-20, 5], wind: 15, rain: 2, humidity: 100, daylight: true },
  beach: { temperature: [22, 36], wind: 10, rain: 0.2, humidity: 90, daylight: true },
  commute: { temperature: [-20, 40], wind: 18, rain: 4, humidity: 100, daylight: false },
});

function penaltyOutside(value, range, maximumPenalty) {
  if (!Number.isFinite(value)) return maximumPenalty * 0.25;
  if (value >= range[0] && value <= range[1]) return 0;
  const distance = value < range[0] ? range[0] - value : value - range[1];
  return Math.min(maximumPenalty, distance * maximumPenalty / 15);
}

function scorePeriod(period, profile, preferences) {
  const reasons = [];
  let score = 100;
  const temperature = period.feelsLikeC ?? period.temperatureC;
  const temperaturePenalty = penaltyOutside(temperature, preferences.temperature ?? profile.temperature, 35);
  score -= temperaturePenalty;
  if (temperaturePenalty > 0) reasons.push('Temperature is outside the preferred range.');
  const wind = period.windSpeedMps ?? 0;
  if (wind > (preferences.maximumWindMps ?? profile.wind)) {
    score -= Math.min(35, (wind - (preferences.maximumWindMps ?? profile.wind)) * 5);
    reasons.push('Wind is stronger than preferred.');
  }
  const rain = period.rainMm ?? period.precipitationMm ?? 0;
  const probability = period.precipitationProbability ?? 0;
  if (rain > (preferences.maximumRainMm ?? profile.rain) || probability > (preferences.maximumPrecipitationProbability ?? 0.45)) {
    score -= Math.min(45, rain * 5 + probability * 25);
    reasons.push('Precipitation may disrupt the activity.');
  }
  const humidity = period.humidityPercent;
  if (Number.isFinite(humidity) && humidity > (preferences.maximumHumidityPercent ?? profile.humidity)) {
    score -= Math.min(20, (humidity - profile.humidity) * 0.8);
    reasons.push('Humidity may reduce comfort.');
  }
  if (Number.isFinite(profile.maximumCloud)
      && Number.isFinite(period.cloudPercent)
      && period.cloudPercent > profile.maximumCloud) {
    score -= Math.min(60, period.cloudPercent - profile.maximumCloud);
    reasons.push('Cloud cover is too high.');
  }
  if (preferences.requireDaylight ?? profile.daylight) {
    const at = parseTimestamp(period.forecastAt);
    const sunrise = period.sunriseAt ? parseTimestamp(period.sunriseAt) : null;
    const sunset = period.sunsetAt ? parseTimestamp(period.sunsetAt) : null;
    if (sunrise && sunset && (at < sunrise || at >= sunset)) {
      score -= 50;
      reasons.push('This period is outside daylight hours.');
    }
  }
  if (Number.isFinite(period.airQualityIndex) && period.airQualityIndex >= 4) {
    score -= period.airQualityIndex >= 5 ? 45 : 25;
    reasons.push('Air quality may affect outdoor exertion.');
  }
  if (Number.isFinite(period.uvIndex) && period.uvIndex >= 8) {
    score -= 15;
    reasons.push('UV exposure is high.');
  }
  return { score: Math.max(0, round(score, 1)), reasons };
}

export function rankActivityWindows(forecastItems, activity, preferences = {}) {
  const items = assertArray(forecastItems, 'Forecast periods', { nonEmpty: true });
  assertObject(preferences, 'Activity preferences');
  const profile = PROFILES[activity];
  if (!profile) throw new TypeError(`Unknown activity: ${activity}`);
  const durationHours = Number.isFinite(preferences.durationHours) ? Math.max(1, Math.trunc(preferences.durationHours)) : 1;
  const sorted = [...items].sort((first, second) => parseTimestamp(first.forecastAt) - parseTimestamp(second.forecastAt));
  const windows = [];
  for (let index = 0; index <= sorted.length - durationHours; index += 1) {
    const periods = sorted.slice(index, index + durationHours);
    const scores = periods.map((period) => scorePeriod(period, profile, preferences));
    const reasons = [...new Set(scores.flatMap((entry) => entry.reasons))];
    const averageScore = mean(scores.map((entry) => entry.score));
    windows.push(deepFreeze({
      startsAt: periods[0].forecastAt,
      endsAt: periods.at(-1).forecastAt,
      durationPeriods: periods.length,
      score: round(averageScore, 1),
      rating: averageScore >= 85 ? 'excellent' : averageScore >= 70 ? 'good' : averageScore >= 50 ? 'fair' : 'poor',
      reasons,
      periods,
    }));
  }
  return windows.sort((first, second) => second.score - first.score || first.startsAt.localeCompare(second.startsAt));
}

export function bestActivityPlan(forecastItems, activities, preferencesByActivity = {}) {
  const selected = assertArray(activities, 'Activities', { nonEmpty: true });
  const plans = selected.map((activity) => {
    const windows = rankActivityWindows(forecastItems, activity, preferencesByActivity[activity] ?? {});
    return deepFreeze({ activity, best: windows[0] ?? null, alternatives: windows.slice(1, 4) });
  });
  return deepFreeze({
    plans,
    bestOverall: [...plans].filter((plan) => plan.best).sort((first, second) => second.best.score - first.best.score)[0] ?? null,
  });
}

export const ACTIVITY_PROFILES = PROFILES;
