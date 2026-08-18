import { addHours, compareIsoDates } from './time';

export function precipitationIntensity(rainMm, hours = 3) {
  if (!Number.isFinite(rainMm) || rainMm <= 0) {
    return { level: 'none', label: 'Dry', rateMmPerHour: 0 };
  }
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 3;
  const rate = rainMm / safeHours;
  if (rate < 0.5) return { level: 'light', label: 'Light', rateMmPerHour: rate };
  if (rate < 4) return { level: 'moderate', label: 'Moderate', rateMmPerHour: rate };
  if (rate < 8) return { level: 'heavy', label: 'Heavy', rateMmPerHour: rate };
  return { level: 'extreme', label: 'Very heavy', rateMmPerHour: rate };
}

export function precipitationSummary(forecast) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const rainy = items.filter((item) => (
    Number.isFinite(item.rainMm) && item.rainMm > 0
  ) || (
    Number.isFinite(item.precipitationProbability) && item.precipitationProbability >= 0.3
  ));
  const totalMm = items.reduce(
    (total, item) => total + (Number.isFinite(item.rainMm) ? Math.max(0, item.rainMm) : 0),
    0,
  );
  const peak = items.reduce((selected, item) => {
    const probability = Number.isFinite(item.precipitationProbability)
      ? item.precipitationProbability
      : 0;
    return !selected || probability > selected.precipitationProbability
      ? { forecastAt: item.forecastAt, precipitationProbability: probability, rainMm: item.rainMm ?? 0 }
      : selected;
  }, null);

  return {
    totalMm,
    rainyPeriods: rainy.length,
    firstRainAt: [...rainy].sort((a, b) => compareIsoDates(a.forecastAt, b.forecastAt))[0]?.forecastAt ?? null,
    peak,
    likely: rainy.length > 0,
  };
}

export function findDryWindows(forecast, options = {}) {
  const minimumHours = Number.isFinite(options.minimumHours) ? Math.max(1, options.minimumHours) : 3;
  const maximumProbability = Number.isFinite(options.maximumProbability)
    ? Math.max(0, Math.min(1, options.maximumProbability))
    : 0.2;
  const items = [...(Array.isArray(forecast?.items) ? forecast.items : [])]
    .sort((first, second) => compareIsoDates(first.forecastAt, second.forecastAt));
  const windows = [];
  let current = [];

  function commit() {
    if (!current.length) return;
    const periodHours = current.length * 3;
    if (periodHours >= minimumHours) {
      windows.push({
        startsAt: current[0].forecastAt,
        endsAt: addHours(current.at(-1).forecastAt, 3)?.toISOString() ?? current.at(-1).forecastAt,
        hours: periodHours,
        averageTemperatureC: current.reduce((total, item) => total + item.temperatureC, 0) / current.length,
        maximumWindMps: Math.max(...current.map((item) => item.windSpeedMps ?? 0)),
      });
    }
    current = [];
  }

  items.forEach((item) => {
    const probability = Number.isFinite(item.precipitationProbability)
      ? item.precipitationProbability
      : 0;
    const dry = probability <= maximumProbability && !(Number.isFinite(item.rainMm) && item.rainMm > 0.1);
    if (dry) current.push(item);
    else commit();
  });
  commit();

  return windows.sort((first, second) => second.hours - first.hours || compareIsoDates(first.startsAt, second.startsAt));
}

export function umbrellaAdvice(forecast) {
  const summary = precipitationSummary(forecast);
  if (!summary.likely) return { level: 'none', message: 'No umbrella needed in the current forecast.' };
  if (summary.peak?.precipitationProbability >= 0.7 || summary.totalMm >= 5) {
    return { level: 'recommended', message: 'Take an umbrella; rain is likely or could be substantial.' };
  }
  return { level: 'optional', message: 'A compact umbrella may be useful for a passing shower.' };
}
