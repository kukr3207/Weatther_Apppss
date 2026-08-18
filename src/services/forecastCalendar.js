import { groupForecastByDay } from '../domain/dailyForecast';

function escapeCalendarText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function calendarTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function allDayDate(dateKey) {
  return dateKey.replace(/-/g, '');
}

export function buildForecastCalendar(current, forecast, options = {}) {
  if (!current?.location || !forecast) throw new TypeError('Current weather and forecast are required.');
  const createdAt = options.now ?? new Date();
  const locationName = `${current.location.name}, ${current.location.country}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Weather Workspace//Forecast Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeCalendarText(`Weather – ${locationName}`)}`,
  ];

  groupForecastByDay(forecast, { limit: options.days ?? 5 }).forEach((day) => {
    const nextDate = new Date(`${day.dateKey}T12:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const summary = `${day.label}: ${day.condition.description}`;
    const description = [
      `Low ${Math.round(day.minimumC)}°C, high ${Math.round(day.maximumC)}°C.`,
      `${Math.round(day.precipitationProbability * 100)}% chance of precipitation.`,
      `Maximum wind ${Math.round(day.maximumWindMps)} m/s.`,
    ].join(' ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeCalendarText(`${day.dateKey}-${current.location.latitude}-${current.location.longitude}@weather-workspace`)}`,
      `DTSTAMP:${calendarTimestamp(createdAt)}`,
      `DTSTART;VALUE=DATE:${allDayDate(day.dateKey)}`,
      `DTEND;VALUE=DATE:${allDayDate(nextDate.toISOString().slice(0, 10))}`,
      `SUMMARY:${escapeCalendarText(summary)}`,
      `DESCRIPTION:${escapeCalendarText(description)}`,
      `LOCATION:${escapeCalendarText(locationName)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function forecastCalendarFileName(current) {
  const slug = current?.location?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'location';
  return `${slug}-weather.ics`;
}
