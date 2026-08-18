import { compareIsoDates, formatLocationDate, locationDateKey } from './time';

function finiteValues(items, selector) {
  return items.map(selector).filter(Number.isFinite);
}

function minimum(values) {
  return values.length ? Math.min(...values) : null;
}

function maximum(values) {
  return values.length ? Math.max(...values) : null;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function dominantCondition(items) {
  const counts = new Map();
  items.forEach((item) => {
    const condition = item?.condition;
    if (!condition?.iconCode) return;
    const key = condition.iconCode.replace(/[dn]$/, '');
    const current = counts.get(key) ?? {
      count: 0,
      condition,
      precipitation: 0,
    };
    current.count += 1;
    current.precipitation += Number.isFinite(item.precipitationProbability)
      ? item.precipitationProbability
      : 0;
    counts.set(key, current);
  });

  return [...counts.values()].sort((first, second) => (
    second.count - first.count
    || second.precipitation - first.precipitation
  ))[0]?.condition ?? { iconCode: '01d', description: 'clear sky' };
}

function periodExtremum(items, selector, mode) {
  const candidates = items.filter((item) => Number.isFinite(selector(item)));
  if (!candidates.length) return null;
  return candidates.reduce((selected, item) => {
    const value = selector(item);
    const selectedValue = selector(selected);
    return mode === 'minimum'
      ? (value < selectedValue ? item : selected)
      : (value > selectedValue ? item : selected);
  });
}

function summarizeDay(dateKey, items, offsetSeconds) {
  const sorted = [...items].sort((first, second) => compareIsoDates(first.forecastAt, second.forecastAt));
  const minimums = finiteValues(sorted, (item) => item.minimumC);
  const maximums = finiteValues(sorted, (item) => item.maximumC);
  const temperatures = finiteValues(sorted, (item) => item.temperatureC);
  const humidities = finiteValues(sorted, (item) => item.humidityPercent);
  const windSpeeds = finiteValues(sorted, (item) => item.windSpeedMps);
  const rainAmounts = finiteValues(sorted, (item) => item.rainMm);
  const precipitation = finiteValues(sorted, (item) => item.precipitationProbability);
  const coldest = periodExtremum(sorted, (item) => item.temperatureC, 'minimum');
  const warmest = periodExtremum(sorted, (item) => item.temperatureC, 'maximum');

  return {
    dateKey,
    label: formatLocationDate(sorted[0]?.forecastAt ?? `${dateKey}T12:00:00.000Z`, offsetSeconds, {
      weekday: 'long',
    }),
    items: sorted,
    startsAt: sorted[0]?.forecastAt ?? null,
    endsAt: sorted.at(-1)?.forecastAt ?? null,
    minimumC: minimum(minimums.length ? minimums : temperatures),
    maximumC: maximum(maximums.length ? maximums : temperatures),
    averageC: average(temperatures),
    averageHumidityPercent: average(humidities),
    maximumWindMps: maximum(windSpeeds),
    precipitationProbability: maximum(precipitation) ?? 0,
    rainTotalMm: sum(rainAmounts),
    condition: dominantCondition(sorted),
    coldestAt: coldest?.forecastAt ?? null,
    warmestAt: warmest?.forecastAt ?? null,
  };
}

export function groupForecastByDay(forecast, options = {}) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const offsetSeconds = Number.isFinite(forecast?.location?.timezoneOffsetSeconds)
    ? forecast.location.timezoneOffsetSeconds
    : 0;
  const groups = new Map();

  items.forEach((item) => {
    const dateKey = locationDateKey(item?.forecastAt, offsetSeconds);
    if (!dateKey) return;
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(item);
  });

  const days = [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([dateKey, dayItems]) => summarizeDay(dateKey, dayItems, offsetSeconds));

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 7;
  return days.slice(0, limit);
}

export function forecastTemperatureRange(forecast) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const lows = finiteValues(items, (item) => item.minimumC);
  const highs = finiteValues(items, (item) => item.maximumC);
  return {
    minimumC: minimum(lows),
    maximumC: maximum(highs),
  };
}

export function describeForecastDay(day) {
  if (!day) return 'Forecast unavailable.';
  const phrases = [];
  if (day.condition?.description) phrases.push(day.condition.description);
  if (Number.isFinite(day.precipitationProbability) && day.precipitationProbability >= 0.2) {
    phrases.push(`${Math.round(day.precipitationProbability * 100)}% chance of precipitation`);
  }
  if (Number.isFinite(day.maximumWindMps) && day.maximumWindMps >= 10) {
    phrases.push('breezy at times');
  }
  return phrases.length ? `${phrases.join(', ')}.` : 'No notable conditions expected.';
}

export function findDay(forecast, dateKey) {
  return groupForecastByDay(forecast).find((day) => day.dateKey === dateKey) ?? null;
}
