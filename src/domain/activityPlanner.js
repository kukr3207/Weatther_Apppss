import { compareIsoDates, formatLocationClock, locationHour } from './time';

export const ACTIVITIES = Object.freeze([
  Object.freeze({ id: 'walk', name: 'Walking', icon: '🚶', preferredTemperature: [8, 28], maxWindMps: 12, daylight: true }),
  Object.freeze({ id: 'run', name: 'Running', icon: '🏃', preferredTemperature: [5, 22], maxWindMps: 10, daylight: false }),
  Object.freeze({ id: 'cycle', name: 'Cycling', icon: '🚲', preferredTemperature: [10, 27], maxWindMps: 8, daylight: true }),
  Object.freeze({ id: 'picnic', name: 'Picnic', icon: '🧺', preferredTemperature: [16, 30], maxWindMps: 7, daylight: true }),
  Object.freeze({ id: 'garden', name: 'Gardening', icon: '🌱', preferredTemperature: [8, 29], maxWindMps: 10, daylight: true }),
  Object.freeze({ id: 'photography', name: 'Photography', icon: '📷', preferredTemperature: [-5, 32], maxWindMps: 15, daylight: false }),
  Object.freeze({ id: 'stargazing', name: 'Stargazing', icon: '🔭', preferredTemperature: [-5, 28], maxWindMps: 10, daylight: false, nighttime: true }),
  Object.freeze({ id: 'commute', name: 'Commute', icon: '🚌', preferredTemperature: [-20, 40], maxWindMps: 18, daylight: false }),
]);

function activityById(id) {
  return ACTIVITIES.find((activity) => activity.id === id) ?? ACTIVITIES[0];
}

function temperatureScore(temperatureC, [minimum, maximum]) {
  if (!Number.isFinite(temperatureC)) return 0;
  if (temperatureC >= minimum && temperatureC <= maximum) return 100;
  const distance = temperatureC < minimum ? minimum - temperatureC : temperatureC - maximum;
  return Math.max(0, 100 - distance * 8);
}

function daylightScore(item, activity, timezoneOffsetSeconds) {
  const hour = locationHour(item.forecastAt, timezoneOffsetSeconds);
  if (hour === null) return 50;
  const daylight = hour >= 6 && hour < 20;
  if (activity.nighttime) return daylight ? 15 : 100;
  if (activity.daylight) return daylight ? 100 : 20;
  return 100;
}

function conditionPenalty(item) {
  const description = item.condition?.description?.toLowerCase() ?? '';
  if (description.includes('thunder')) return 100;
  if (description.includes('snow')) return 65;
  if (description.includes('rain')) return 45;
  if (description.includes('fog') || description.includes('mist')) return 25;
  return 0;
}

export function scoreActivityPeriod(item, activityInput, timezoneOffsetSeconds = 0) {
  const activity = typeof activityInput === 'string' ? activityById(activityInput) : activityInput;
  if (!item || !activity) return { score: 0, rating: 'poor', reasons: ['Forecast unavailable'] };
  const reasons = [];
  let score = temperatureScore(item.temperatureC, activity.preferredTemperature) * 0.35;

  const precipitation = Number.isFinite(item.precipitationProbability) ? item.precipitationProbability : 0;
  score += Math.max(0, 100 - precipitation * 120) * 0.3;
  if (precipitation >= 0.5) reasons.push('Rain is likely');
  else if (precipitation >= 0.25) reasons.push('A shower is possible');

  const windSpeed = Number.isFinite(item.windSpeedMps) ? item.windSpeedMps : 0;
  const windScore = Math.max(0, 100 - Math.max(0, windSpeed - activity.maxWindMps) * 12);
  score += windScore * 0.2;
  if (windSpeed > activity.maxWindMps) reasons.push('Wind may be disruptive');

  score += daylightScore(item, activity, timezoneOffsetSeconds) * 0.15;
  score -= conditionPenalty(item) * 0.35;
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (item.temperatureC < activity.preferredTemperature[0]) reasons.push('Cooler than preferred');
  if (item.temperatureC > activity.preferredTemperature[1]) reasons.push('Warmer than preferred');
  if (!reasons.length) reasons.push('Comfortable weather expected');

  return {
    score,
    rating: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
    reasons,
  };
}

export function planActivity(forecast, activityId, options = {}) {
  const activity = activityById(activityId);
  const offset = forecast?.location?.timezoneOffsetSeconds ?? 0;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 5;
  const periods = (Array.isArray(forecast?.items) ? forecast.items : []).map((item) => ({
    ...scoreActivityPeriod(item, activity, offset),
    forecastAt: item.forecastAt,
    label: formatLocationClock(item.forecastAt, offset),
    temperatureC: item.temperatureC,
    precipitationProbability: item.precipitationProbability,
    windSpeedMps: item.windSpeedMps,
    condition: item.condition,
  }));

  return {
    activity,
    periods: periods
      .sort((first, second) => second.score - first.score || compareIsoDates(first.forecastAt, second.forecastAt))
      .slice(0, limit),
  };
}

export function rankActivities(forecast, options = {}) {
  return ACTIVITIES.map((activity) => {
    const plan = planActivity(forecast, activity.id, { limit: 1 });
    return { activity, best: plan.periods[0] ?? null };
  })
    .filter((entry) => entry.best)
    .sort((first, second) => second.best.score - first.best.score)
    .slice(0, options.limit ?? ACTIVITIES.length);
}

export function activityRecommendation(forecast) {
  const ranked = rankActivities(forecast, { limit: 3 });
  if (!ranked.length) return 'Activity planning needs forecast data.';
  const [best] = ranked;
  return `${best.activity.name} looks ${best.best.rating} around ${best.best.label}.`;
}
