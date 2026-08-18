const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function shiftedDate(isoString, timezoneOffsetSeconds = 0) {
  const instant = new Date(isoString);
  if (Number.isNaN(instant.getTime())) return null;
  return new Date(instant.getTime() + timezoneOffsetSeconds * 1000);
}

export function formatLocationTime(isoString, timezoneOffsetSeconds = 0, locale = 'en') {
  const date = shiftedDate(isoString, timezoneOffsetSeconds);
  if (!date) return 'Time unavailable';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function formatForecastTime(isoString, timezoneOffsetSeconds = 0, locale = 'en') {
  const date = shiftedDate(isoString, timezoneOffsetSeconds);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatVisibility(meters, unitSystem = 'metric') {
  if (!Number.isFinite(meters)) return '—';
  if (unitSystem === 'imperial') return `${(meters / 1609.344).toFixed(1)} mi`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatPressure(hectopascals) {
  return Number.isFinite(hectopascals) ? `${Math.round(hectopascals)} hPa` : '—';
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}

export function windDirection(degrees) {
  if (!Number.isFinite(degrees)) return 'Variable';
  const normalized = ((degrees % 360) + 360) % 360;
  return WIND_DIRECTIONS[Math.round(normalized / 45) % WIND_DIRECTIONS.length];
}
