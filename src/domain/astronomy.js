import { clampTimezoneOffset, formatLocationClock, shiftToLocationTime } from './time';

const SYNODIC_MONTH_DAYS = 29.53058867;
const KNOWN_NEW_MOON = Date.parse('2000-01-06T18:14:00.000Z');

function validTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function daylightDuration(sunriseAt, sunsetAt) {
  const sunrise = validTimestamp(sunriseAt);
  const sunset = validTimestamp(sunsetAt);
  if (sunrise === null || sunset === null || sunset <= sunrise) return null;
  const minutes = Math.round((sunset - sunrise) / 60_000);
  return { minutes, hours: Math.floor(minutes / 60), remainingMinutes: minutes % 60 };
}

export function daylightProgress(weather, now = new Date()) {
  const sunrise = validTimestamp(weather?.sunriseAt);
  const sunset = validTimestamp(weather?.sunsetAt);
  const current = now instanceof Date ? now.getTime() : validTimestamp(now);
  if ([sunrise, sunset, current].some((value) => value === null)) return null;
  if (current < sunrise) return { phase: 'before-sunrise', progress: 0, nextEvent: 'sunrise', nextAt: weather.sunriseAt };
  if (current >= sunset) return { phase: 'after-sunset', progress: 1, nextEvent: null, nextAt: null };
  return {
    phase: 'daylight',
    progress: (current - sunrise) / (sunset - sunrise),
    nextEvent: 'sunset',
    nextAt: weather.sunsetAt,
  };
}

export function goldenHourWindows(weather) {
  const sunrise = validTimestamp(weather?.sunriseAt);
  const sunset = validTimestamp(weather?.sunsetAt);
  if (sunrise === null || sunset === null) return [];
  return [
    {
      id: 'morning',
      label: 'Morning golden hour',
      startsAt: new Date(sunrise - 30 * 60_000).toISOString(),
      endsAt: new Date(sunrise + 60 * 60_000).toISOString(),
    },
    {
      id: 'evening',
      label: 'Evening golden hour',
      startsAt: new Date(sunset - 60 * 60_000).toISOString(),
      endsAt: new Date(sunset + 20 * 60_000).toISOString(),
    },
  ];
}

export function moonPhase(value = new Date()) {
  const timestamp = value instanceof Date ? value.getTime() : validTimestamp(value);
  if (timestamp === null) return null;
  const daysSince = (timestamp - KNOWN_NEW_MOON) / 86_400_000;
  const ageDays = ((daysSince % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const fraction = ageDays / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  const phases = [
    { maximum: 0.03, name: 'New moon', symbol: '🌑' },
    { maximum: 0.22, name: 'Waxing crescent', symbol: '🌒' },
    { maximum: 0.28, name: 'First quarter', symbol: '🌓' },
    { maximum: 0.47, name: 'Waxing gibbous', symbol: '🌔' },
    { maximum: 0.53, name: 'Full moon', symbol: '🌕' },
    { maximum: 0.72, name: 'Waning gibbous', symbol: '🌖' },
    { maximum: 0.78, name: 'Last quarter', symbol: '🌗' },
    { maximum: 0.97, name: 'Waning crescent', symbol: '🌘' },
    { maximum: 1.01, name: 'New moon', symbol: '🌑' },
  ];
  const phase = phases.find((candidate) => fraction < candidate.maximum) ?? phases.at(-1);
  return {
    ...phase,
    ageDays,
    fraction,
    illumination,
    waxing: fraction > 0 && fraction < 0.5,
  };
}

export function solarSummary(weather, now = new Date()) {
  if (!weather) return null;
  const offset = clampTimezoneOffset(weather.timezoneOffsetSeconds);
  const duration = daylightDuration(weather.sunriseAt, weather.sunsetAt);
  const progress = daylightProgress(weather, now);
  const moon = moonPhase(shiftToLocationTime(now, offset) ?? now);
  return {
    sunriseLabel: formatLocationClock(weather.sunriseAt, offset),
    sunsetLabel: formatLocationClock(weather.sunsetAt, offset),
    duration,
    progress,
    moon,
    goldenHours: goldenHourWindows(weather).map((window) => ({
      ...window,
      startLabel: formatLocationClock(window.startsAt, offset),
      endLabel: formatLocationClock(window.endsAt, offset),
    })),
  };
}
