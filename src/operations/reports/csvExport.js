import { assertArray, assertObject, deepFreeze } from '../core/validation';

function flatten(value, prefix = '', target = {}, options = {}) {
  if (value === null || value === undefined) {
    if (prefix) target[prefix] = null;
    return target;
  }
  if (Array.isArray(value)) {
    if (options.expandArrays) {
      value.forEach((entry, index) => flatten(entry, `${prefix}${prefix ? '.' : ''}${index}`, target, options));
    } else if (prefix) {
      target[prefix] = value.map((entry) => (
        entry && typeof entry === 'object' ? JSON.stringify(entry) : entry
      )).join(options.arraySeparator ?? '|');
    }
    return target;
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    Object.entries(value).forEach(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      flatten(entry, path, target, options);
    });
    return target;
  }
  if (prefix) target[prefix] = value instanceof Date ? value.toISOString() : value;
  return target;
}

function quote(value, delimiter) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function columnOrder(rows, requested) {
  const found = new Set();
  const discovered = [];
  rows.forEach((row) => Object.keys(row).forEach((key) => {
    if (found.has(key)) return;
    found.add(key);
    discovered.push(key);
  }));
  if (!requested?.length) return discovered;
  const columns = [];
  requested.forEach((column) => {
    if (!columns.includes(column)) columns.push(column);
  });
  discovered.forEach((column) => {
    if (!columns.includes(column)) columns.push(column);
  });
  return columns;
}

export function recordsToCsv(inputRecords, options = {}) {
  const records = assertArray(inputRecords, 'CSV records');
  const delimiter = options.delimiter === '\t' ? '\t' : options.delimiter === ';' ? ';' : ',';
  const rows = records.map((record, index) => {
    assertObject(record, `CSV record ${index + 1}`);
    return options.flatten === false ? { ...record } : flatten(record, '', {}, options);
  });
  const columns = columnOrder(rows, options.columns);
  const lines = [];
  if (options.includeHeader !== false) {
    lines.push(columns.map((column) => quote(options.labels?.[column] ?? column, delimiter)).join(delimiter));
  }
  rows.forEach((row) => {
    lines.push(columns.map((column) => quote(row[column], delimiter)).join(delimiter));
  });
  const newline = options.newline === 'crlf' ? '\r\n' : '\n';
  const content = `${options.bom ? '\uFEFF' : ''}${lines.join(newline)}${options.trailingNewline === false ? '' : newline}`;
  return options.withMetadata
    ? deepFreeze({ content, columns, rowCount: rows.length, delimiter })
    : content;
}

export function weatherPeriodsToCsv(periods, options = {}) {
  return recordsToCsv(assertArray(periods, 'Weather periods').map((period) => ({
    forecastAt: period.forecastAt ?? period.observedAt,
    location: period.location?.name ?? options.locationName ?? null,
    latitude: period.location?.latitude ?? options.latitude ?? null,
    longitude: period.location?.longitude ?? options.longitude ?? null,
    temperatureC: period.temperatureC ?? null,
    feelsLikeC: period.feelsLikeC ?? null,
    minimumC: period.minimumC ?? null,
    maximumC: period.maximumC ?? null,
    humidityPercent: period.humidityPercent ?? null,
    precipitationProbability: period.precipitationProbability ?? null,
    precipitationMm: period.precipitationMm ?? period.rainMm ?? null,
    windSpeedMps: period.windSpeedMps ?? null,
    windDirectionDegrees: period.windDirectionDegrees ?? null,
    pressureHpa: period.pressureHpa ?? null,
    visibilityMeters: period.visibilityMeters ?? null,
    condition: period.condition?.description ?? period.condition ?? null,
    source: period.source ?? null,
  })), {
    ...options,
    flatten: false,
  });
}

export function incidentsToCsv(incidents, options = {}) {
  return recordsToCsv(assertArray(incidents, 'Incidents').map((incident) => ({
    id: incident.id,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    openedAt: incident.openedAt,
    acknowledgedAt: incident.acknowledgedAt,
    resolvedAt: incident.resolvedAt,
    owner: incident.owner,
    affectedLocations: incident.affectedLocations?.map((location) => location.name ?? location.id).join('|') ?? '',
    labels: incident.labels?.join('|') ?? '',
    timelineEntries: incident.timeline?.length ?? 0,
  })), { ...options, flatten: false });
}

export function csvDataUri(content, options = {}) {
  const mime = options.delimiter === '\t' ? 'text/tab-separated-values' : 'text/csv';
  return `data:${mime};charset=utf-8,${encodeURIComponent(String(content))}`;
}

export function downloadFilename(baseName, options = {}) {
  const safe = String(baseName ?? 'weather-export')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'weather-export';
  const date = options.date ? new Date(options.date).toISOString().slice(0, 10) : null;
  const extension = options.extension ?? 'csv';
  return `${safe}${date ? `-${date}` : ''}.${extension.replace(/^\./, '')}`;
}
