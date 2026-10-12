import { assertArray, assertObject, deepFreeze, parseTimestamp, round } from '../core/validation';

function escapeMarkdown(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replace(/([*_`[\]<>])/g, '\\$1')
    .replaceAll('|', '\\|');
}

function formatValue(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value}${suffix}`;
}

function heading(level, value) {
  return `${'#'.repeat(Math.max(1, Math.min(6, level)))} ${escapeMarkdown(value)}`;
}

function table(headers, rows) {
  if (!rows.length) return '_No records._';
  const header = `| ${headers.map(escapeMarkdown).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((value) => escapeMarkdown(value)).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

function formatTime(value, options) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(options.locale ?? 'en', {
    dateStyle: options.dateStyle ?? 'medium',
    timeStyle: options.timeStyle ?? 'short',
    timeZone: options.timezone ?? 'UTC',
  }).format(new Date(parseTimestamp(value)));
}

function hazardSection(hazards, options) {
  if (!hazards.length) return ['No active hazards were included in this report.'];
  const lines = [table(
    ['Severity', 'Hazard', 'Starts', 'Ends'],
    hazards.map((hazard) => [
      String(hazard.severity ?? 'information').toUpperCase(),
      hazard.title ?? hazard.type,
      formatTime(hazard.startsAt, options),
      formatTime(hazard.endsAt, options),
    ]),
  )];
  hazards.forEach((hazard) => {
    if (hazard.instruction) lines.push(`- **${escapeMarkdown(hazard.title ?? hazard.type)}:** ${escapeMarkdown(hazard.instruction)}`);
  });
  return lines;
}

function forecastSection(periods, options) {
  const limit = options.forecastLimit ?? 12;
  return [table(
    ['Time', 'Conditions', 'Temperature', 'Rain', 'Wind', 'Confidence'],
    periods.slice(0, limit).map((period) => [
      formatTime(period.forecastAt, options),
      period.condition?.description ?? period.condition ?? '—',
      formatValue(round(period.temperatureC, 1), ' °C'),
      Number.isFinite(period.precipitationProbability)
        ? `${Math.round(period.precipitationProbability * 100)}%`
        : formatValue(period.precipitationMm, ' mm'),
      formatValue(round(period.windSpeedMps, 1), ' m/s'),
      formatValue(round(period.confidence, 0), '%'),
    ]),
  )];
}

function currentConditionsLines(current) {
  if (!current) return ['Current conditions were unavailable.'];
  const entries = [
    ['Conditions', current.condition?.description ?? current.condition],
    ['Temperature', Number.isFinite(current.temperatureC) ? `${round(current.temperatureC, 1)} °C` : null],
    ['Feels like', Number.isFinite(current.feelsLikeC) ? `${round(current.feelsLikeC, 1)} °C` : null],
    ['Humidity', Number.isFinite(current.humidityPercent) ? `${round(current.humidityPercent, 0)}%` : null],
    ['Wind', Number.isFinite(current.windSpeedMps) ? `${round(current.windSpeedMps, 1)} m/s` : null],
    ['Pressure', Number.isFinite(current.pressureHpa) ? `${round(current.pressureHpa, 0)} hPa` : null],
    ['Visibility', Number.isFinite(current.visibilityMeters) ? `${round(current.visibilityMeters / 1000, 1)} km` : null],
  ].filter(([, value]) => value !== null && value !== undefined);
  return entries.map(([label, value]) => `- **${label}:** ${escapeMarkdown(value)}`);
}

export function operationalReportToMarkdown(report, options = {}) {
  assertObject(report, 'Operational report');
  const title = options.title ?? `Weather operations report — ${report.location?.name ?? 'Unknown location'}`;
  const lines = [
    heading(1, title),
    '',
    `> ${escapeMarkdown(report.headline ?? 'Weather operations summary')}`,
    '',
    `Generated ${escapeMarkdown(formatTime(report.generatedAt, options))}`,
    '',
    heading(2, 'Current conditions'),
    '',
    ...currentConditionsLines(report.currentConditions),
    '',
    heading(2, 'Hazards'),
    '',
    ...hazardSection(report.hazards ?? [], options),
    '',
    heading(2, 'Forecast'),
    '',
    ...forecastSection(report.periods ?? [], options),
  ];
  if (report.airQuality) lines.push(
    '',
    heading(2, 'Air quality'),
    '',
    `- **Index:** ${escapeMarkdown(formatValue(report.airQuality.index ?? report.airQuality.aqi))}`,
    `- **Category:** ${escapeMarkdown(report.airQuality.category ?? '—')}`,
  );
  if (report.recommendations?.length) lines.push(
    '',
    heading(2, 'Recommendations'),
    '',
    ...report.recommendations.map((recommendation) => `- ${escapeMarkdown(recommendation.text ?? recommendation)}`),
  );
  if (report.operations?.services?.length) lines.push(
    '',
    heading(2, 'Provider status'),
    '',
    table(
      ['Provider', 'Status', 'Latency', 'Checked'],
      report.operations.services.map((service) => [
        service.name,
        service.status,
        formatValue(service.latencyMs, ' ms'),
        formatTime(service.checkedAt, options),
      ]),
    ),
  );
  if (report.sources?.length) lines.push(
    '',
    heading(2, 'Sources'),
    '',
    ...report.sources.map((source) => `- ${escapeMarkdown(source.name ?? source.id)}${source.url ? ` — ${source.url}` : ''}`),
  );
  if (options.footer !== false) lines.push(
    '',
    '---',
    '',
    '_Forecasts contain uncertainty. Follow official emergency instructions when conditions become dangerous._',
  );
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function incidentPostmortemToMarkdown(incident, options = {}) {
  assertObject(incident, 'Weather incident');
  const timeline = assertArray(incident.timeline ?? [], 'Incident timeline')
    .sort((first, second) => parseTimestamp(first.at) - parseTimestamp(second.at));
  const actions = assertArray(incident.actions ?? [], 'Incident actions');
  const lines = [
    heading(1, `Incident report — ${incident.title}`),
    '',
    `- **Incident ID:** ${escapeMarkdown(incident.id)}`,
    `- **State:** ${escapeMarkdown(incident.state)}`,
    `- **Severity:** ${escapeMarkdown(incident.severity)}`,
    `- **Commander:** ${escapeMarkdown(incident.commander?.name ?? incident.commander?.id)}`,
    `- **Opened:** ${escapeMarkdown(formatTime(incident.createdAt, options))}`,
    `- **Resolved:** ${escapeMarkdown(formatTime(incident.resolvedAt, options))}`,
    '',
    heading(2, 'Timeline'),
    '',
    ...timeline.map((entry) => (
      `- **${escapeMarkdown(formatTime(entry.at, options))}** — ${escapeMarkdown(entry.message)} _(${escapeMarkdown(entry.author?.name ?? entry.author?.id)})_`
    )),
    '',
    heading(2, 'Actions'),
    '',
    table(
      ['Action', 'Owner', 'State', 'Due', 'Completed'],
      actions.map((action) => [
        action.title,
        action.owner?.name ?? action.owner?.id,
        action.state,
        formatTime(action.dueAt, options),
        formatTime(action.completedAt, options),
      ]),
    ),
  ];
  if (options.lessons?.length) lines.push(
    '',
    heading(2, 'Lessons and follow-ups'),
    '',
    ...options.lessons.map((lesson) => `- ${escapeMarkdown(lesson)}`),
  );
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function markdownReportMetadata(content) {
  const text = String(content ?? '');
  const lines = text.split(/\r?\n/);
  return deepFreeze({
    characterCount: text.length,
    lineCount: lines.length,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    headingCount: lines.filter((line) => /^#{1,6}\s/.test(line)).length,
    tableCount: lines.filter((line) => /^\|.*\|$/.test(line)).length > 1
      ? lines.filter((line) => /^\|\s*---/.test(line)).length
      : 0,
    linkCount: (text.match(/\[[^\]]+\]\([^)]+\)/g) ?? []).length,
  });
}
