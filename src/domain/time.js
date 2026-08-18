const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 86_400_000;

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function clampTimezoneOffset(offsetSeconds) {
  if (!Number.isFinite(offsetSeconds)) return 0;
  return Math.max(-43_200, Math.min(50_400, Math.trunc(offsetSeconds)));
}

export function shiftToLocationTime(value, offsetSeconds = 0) {
  const date = validDate(value);
  if (!date) return null;
  return new Date(date.getTime() + clampTimezoneOffset(offsetSeconds) * 1000);
}

export function locationDateKey(value, offsetSeconds = 0) {
  const shifted = shiftToLocationTime(value, offsetSeconds);
  return shifted ? shifted.toISOString().slice(0, 10) : '';
}

export function locationHour(value, offsetSeconds = 0) {
  const shifted = shiftToLocationTime(value, offsetSeconds);
  return shifted ? shifted.getUTCHours() : null;
}

export function startOfLocationDay(value, offsetSeconds = 0) {
  const dateKey = locationDateKey(value, offsetSeconds);
  if (!dateKey) return null;
  const utcMidnight = Date.parse(`${dateKey}T00:00:00.000Z`);
  return new Date(utcMidnight - clampTimezoneOffset(offsetSeconds) * 1000);
}

export function endOfLocationDay(value, offsetSeconds = 0) {
  const start = startOfLocationDay(value, offsetSeconds);
  return start ? new Date(start.getTime() + MILLISECONDS_PER_DAY - 1) : null;
}

export function isSameLocationDay(first, second, offsetSeconds = 0) {
  const firstKey = locationDateKey(first, offsetSeconds);
  return Boolean(firstKey && firstKey === locationDateKey(second, offsetSeconds));
}

export function minutesBetween(first, second) {
  const start = validDate(first);
  const end = validDate(second);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / MILLISECONDS_PER_MINUTE);
}

export function hoursBetween(first, second) {
  const minutes = minutesBetween(first, second);
  return minutes === null ? null : minutes / 60;
}

export function addHours(value, hours) {
  const date = validDate(value);
  if (!date || !Number.isFinite(hours)) return null;
  return new Date(date.getTime() + hours * MILLISECONDS_PER_HOUR);
}

export function compareIsoDates(first, second) {
  const firstDate = validDate(first);
  const secondDate = validDate(second);
  if (!firstDate && !secondDate) return 0;
  if (!firstDate) return 1;
  if (!secondDate) return -1;
  return firstDate.getTime() - secondDate.getTime();
}

export function formatLocationDate(value, offsetSeconds = 0, options = {}) {
  const shifted = shiftToLocationTime(value, offsetSeconds);
  if (!shifted) return 'Unknown date';
  return new Intl.DateTimeFormat(options.locale ?? 'en', {
    weekday: options.weekday ?? 'short',
    month: options.month ?? 'short',
    day: options.day ?? 'numeric',
    timeZone: 'UTC',
  }).format(shifted);
}

export function formatLocationClock(value, offsetSeconds = 0, options = {}) {
  const shifted = shiftToLocationTime(value, offsetSeconds);
  if (!shifted) return 'Unknown time';
  return new Intl.DateTimeFormat(options.locale ?? 'en', {
    hour: 'numeric',
    minute: options.includeMinutes === false ? undefined : '2-digit',
    hour12: options.hour12,
    timeZone: 'UTC',
  }).format(shifted);
}

export function nearestFuture(items, now = new Date(), selector = (item) => item) {
  const nowTime = validDate(now)?.getTime();
  if (nowTime === undefined || nowTime === null) return null;
  return items
    .map((item) => ({ item, date: validDate(selector(item)) }))
    .filter(({ date }) => date && date.getTime() >= nowTime)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.item ?? null;
}

export const TIME_CONSTANTS = Object.freeze({
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_DAY,
});
