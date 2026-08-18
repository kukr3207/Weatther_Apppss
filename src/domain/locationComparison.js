import { comfortSummary } from './comfort';
import { groupForecastByDay } from './dailyForecast';

function delta(first, second, selector) {
  const firstValue = selector(first);
  const secondValue = selector(second);
  return Number.isFinite(firstValue) && Number.isFinite(secondValue) ? firstValue - secondValue : null;
}

function locationKey(snapshot) {
  const location = snapshot?.current?.location ?? snapshot?.location;
  if (!location) return '';
  if (location.id) return String(location.id);
  return `${location.latitude},${location.longitude}`;
}

export function normalizeSnapshot(snapshot) {
  if (!snapshot?.current?.location) return null;
  const days = groupForecastByDay(snapshot.forecast, { limit: 3 });
  return {
    id: locationKey(snapshot),
    location: snapshot.current.location,
    current: snapshot.current,
    forecast: snapshot.forecast ?? null,
    airQuality: snapshot.airQuality ?? null,
    comfort: comfortSummary(snapshot.current),
    days,
    fetchedAt: snapshot.fetchedAt ?? snapshot.current.observedAt,
  };
}

export function compareSnapshots(firstInput, secondInput) {
  const first = normalizeSnapshot(firstInput);
  const second = normalizeSnapshot(secondInput);
  if (!first || !second) return null;

  const temperatureDeltaC = delta(first, second, (snapshot) => snapshot.current.temperatureC);
  const humidityDelta = delta(first, second, (snapshot) => snapshot.current.humidityPercent);
  const windDeltaMps = delta(first, second, (snapshot) => snapshot.current.wind.speedMps);
  const aqiDelta = delta(first, second, (snapshot) => snapshot.airQuality?.index);
  const warmer = temperatureDeltaC === 0 ? null : temperatureDeltaC > 0 ? first : second;
  const calmer = windDeltaMps === 0 ? null : windDeltaMps < 0 ? first : second;
  const drier = humidityDelta === 0 ? null : humidityDelta < 0 ? first : second;
  const cleaner = aqiDelta === null || aqiDelta === 0 ? null : aqiDelta < 0 ? first : second;

  return {
    first,
    second,
    temperatureDeltaC,
    humidityDelta,
    windDeltaMps,
    aqiDelta,
    highlights: [
      warmer ? `${warmer.location.name} is warmer right now.` : 'Temperatures are similar.',
      calmer ? `${calmer.location.name} has lighter wind.` : 'Wind speeds are similar.',
      drier ? `${drier.location.name} has drier air.` : 'Humidity levels are similar.',
      cleaner ? `${cleaner.location.name} has the better air-quality index.` : null,
    ].filter(Boolean),
  };
}

function scoreSnapshot(snapshot, preferences) {
  let score = 50;
  const temperature = snapshot.current.temperatureC;
  const [minimum, maximum] = preferences.temperatureRangeC ?? [10, 28];
  if (temperature >= minimum && temperature <= maximum) score += 20;
  else score -= Math.min(25, Math.min(Math.abs(temperature - minimum), Math.abs(temperature - maximum)) * 2);
  score -= Math.max(0, snapshot.current.wind.speedMps - (preferences.maximumWindMps ?? 10)) * 2;
  score -= Math.max(0, snapshot.current.humidityPercent - (preferences.maximumHumidityPercent ?? 75)) * 0.5;
  if (snapshot.airQuality?.index) score -= Math.max(0, snapshot.airQuality.index - 1) * 6;
  const precipitation = snapshot.days[0]?.precipitationProbability ?? 0;
  score -= precipitation * 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function rankLocations(snapshots, preferences = {}) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .map(normalizeSnapshot)
    .filter(Boolean)
    .map((snapshot) => ({ ...snapshot, score: scoreSnapshot(snapshot, preferences) }))
    .sort((first, second) => second.score - first.score || first.location.name.localeCompare(second.location.name));
}

export function comparisonSummary(snapshots, preferences = {}) {
  const ranked = rankLocations(snapshots, preferences);
  if (!ranked.length) return 'Add locations to compare their weather.';
  if (ranked.length === 1) return `${ranked[0].location.name} is ready to compare.`;
  return `${ranked[0].location.name} currently has the best match score at ${ranked[0].score}/100.`;
}
