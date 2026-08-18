const COLUMNS = Object.freeze([
  ['recordedAt', 'Recorded at'],
  ['locationName', 'Location'],
  ['country', 'Country'],
  ['temperatureC', 'Temperature C'],
  ['feelsLikeC', 'Feels like C'],
  ['humidityPercent', 'Humidity percent'],
  ['pressureHpa', 'Pressure hPa'],
  ['windSpeedMps', 'Wind m/s'],
  ['visibilityMeters', 'Visibility metres'],
  ['airQualityIndex', 'Air quality index'],
  ['condition', 'Condition'],
]);

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function flatten(snapshot) {
  return {
    recordedAt: snapshot.recordedAt,
    locationName: snapshot.location?.name,
    country: snapshot.location?.country,
    temperatureC: snapshot.temperatureC,
    feelsLikeC: snapshot.feelsLikeC,
    humidityPercent: snapshot.humidityPercent,
    pressureHpa: snapshot.pressureHpa,
    windSpeedMps: snapshot.windSpeedMps,
    visibilityMeters: snapshot.visibilityMeters,
    airQualityIndex: snapshot.airQualityIndex,
    condition: snapshot.condition,
  };
}

export function snapshotsToCsv(snapshots) {
  const rows = Array.isArray(snapshots) ? snapshots.map(flatten) : [];
  return [
    COLUMNS.map(([, label]) => escapeCsv(label)).join(','),
    ...rows.map((row) => COLUMNS.map(([key]) => escapeCsv(row[key])).join(',')),
  ].join('\r\n');
}

export function snapshotCsvFileName(location, now = new Date()) {
  const locationName = location?.name ?? 'weather';
  const slug = locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'weather';
  return `${slug}-observations-${now.toISOString().slice(0, 10)}.csv`;
}

export function downloadCsv(csv, fileName, options = {}) {
  const documentRef = options.document ?? globalThis.document;
  const urlApi = options.urlApi ?? globalThis.URL;
  const BlobType = options.BlobType ?? globalThis.Blob;
  if (!documentRef || !urlApi || !BlobType || typeof urlApi.createObjectURL !== 'function') return false;
  const blob = new BlobType([csv], { type: 'text/csv;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  documentRef.body.append(link);
  link.click();
  link.remove();
  urlApi.revokeObjectURL(url);
  return true;
}
