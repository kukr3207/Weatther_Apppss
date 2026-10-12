import { assertArray, assertInteger, assertObject, assertString, deepFreeze, parseTimestamp } from '../core/validation';

function escapeIcs(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
}

function icsDate(value) {
  return new Date(parseTimestamp(value)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function foldLine(line) {
  const chunks = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  chunks.push(remaining);
  return chunks.join('\r\n');
}

function normalizeReminder(reminder, index) {
  assertObject(reminder, `Reminder ${index + 1}`);
  const startsAt = new Date(parseTimestamp(reminder.startsAt, `Reminder ${index + 1} start`)).toISOString();
  const endsAt = new Date(parseTimestamp(reminder.endsAt ?? parseTimestamp(startsAt) + 60 * 60_000)).toISOString();
  if (parseTimestamp(endsAt) <= parseTimestamp(startsAt)) throw new TypeError('Reminder end must be after its start.');
  return deepFreeze({
    id: assertString(reminder.id, `Reminder ${index + 1} id`, { maximum: 200 }),
    title: assertString(reminder.title, `Reminder ${index + 1} title`, { maximum: 240 }),
    description: typeof reminder.description === 'string' ? reminder.description : '',
    location: typeof reminder.location === 'string' ? reminder.location : reminder.location?.name ?? '',
    startsAt,
    endsAt,
    alertMinutesBefore: assertInteger(reminder.alertMinutesBefore ?? 30, 'Reminder lead time', { minimum: 0, maximum: 43_200 }),
    categories: Array.isArray(reminder.categories) ? reminder.categories : ['Weather'],
    url: reminder.url ?? null,
  });
}

export function createWeatherReminder(input, options = {}) {
  return normalizeReminder({
    ...input,
    id: input.id ?? `weather-${Date.now()}`,
    alertMinutesBefore: input.alertMinutesBefore ?? options.alertMinutesBefore,
  }, 0);
}

export function remindersFromActivityWindows(activity, windows, options = {}) {
  const limit = assertInteger(options.limit ?? 3, 'Reminder limit', { minimum: 1, maximum: 20 });
  return assertArray(windows, 'Activity windows').slice(0, limit).map((window, index) => createWeatherReminder({
    id: `${activity}-${String(window.startsAt).replace(/\W/g, '')}`,
    title: `${activity[0].toUpperCase()}${activity.slice(1)} weather window`,
    description: `${window.rating ?? 'Suitable'} conditions with a score of ${window.score ?? 'unknown'}. ${window.reasons?.join(' ') ?? ''}`,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    location: options.location,
    categories: ['Weather', 'Activity'],
    alertMinutesBefore: options.alertMinutesBefore ?? 60,
  }, options));
}

export function exportRemindersIcs(inputReminders, options = {}) {
  const reminders = assertArray(inputReminders, 'Weather reminders').map(normalizeReminder);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Weather Workspace//Weather Reminders//EN',
    `X-WR-CALNAME:${escapeIcs(options.calendarName ?? 'Weather plans')}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  reminders.forEach((reminder) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(reminder.id)}@weather-workspace`,
      `DTSTAMP:${icsDate(options.generatedAt ?? new Date().toISOString())}`,
      `DTSTART:${icsDate(reminder.startsAt)}`,
      `DTEND:${icsDate(reminder.endsAt)}`,
      `SUMMARY:${escapeIcs(reminder.title)}`,
      `DESCRIPTION:${escapeIcs(reminder.description)}`,
      `LOCATION:${escapeIcs(reminder.location)}`,
      `CATEGORIES:${reminder.categories.map(escapeIcs).join(',')}`,
    );
    if (reminder.url) lines.push(`URL:${escapeIcs(reminder.url)}`);
    if (reminder.alertMinutesBefore > 0) lines.push(
      'BEGIN:VALARM',
      `TRIGGER:-PT${reminder.alertMinutesBefore}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(reminder.title)}`,
      'END:VALARM',
    );
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

export function reminderConflicts(remindersInput) {
  const reminders = assertArray(remindersInput, 'Weather reminders').map(normalizeReminder)
    .sort((first, second) => parseTimestamp(first.startsAt) - parseTimestamp(second.startsAt));
  const conflicts = [];
  for (let first = 0; first < reminders.length; first += 1) {
    for (let second = first + 1; second < reminders.length; second += 1) {
      if (parseTimestamp(reminders[second].startsAt) >= parseTimestamp(reminders[first].endsAt)) break;
      conflicts.push(deepFreeze({ first: reminders[first], second: reminders[second] }));
    }
  }
  return conflicts;
}
