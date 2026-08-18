const BACKUP_FORMAT = 'weather-workspace-backup';
const BACKUP_VERSION = 1;

const SECTIONS = Object.freeze([
  'settings',
  'favorites',
  'recentSearches',
  'dashboards',
  'notes',
  'alertPreferences',
  'healthProfile',
  'plannerPreferences',
]);

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeSection(value) {
  if (value === undefined) return null;
  return jsonClone(value);
}

export function createWorkspaceBackup(data, options = {}) {
  const now = options.now ?? new Date();
  const sections = SECTIONS.reduce((result, key) => {
    if (data[key] !== undefined) result[key] = safeSection(data[key]);
    return result;
  }, {});
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    application: 'Weather Workspace',
    sections,
  };
}

export function serializeWorkspaceBackup(data, options = {}) {
  return JSON.stringify(createWorkspaceBackup(data, options), null, 2);
}

export function parseWorkspaceBackup(input) {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new TypeError('The selected file is not valid JSON.');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The backup must contain a JSON object.');
  }
  if (value.format !== BACKUP_FORMAT) throw new TypeError('This file is not a Weather Workspace backup.');
  if (value.version !== BACKUP_VERSION) throw new RangeError(`Backup version ${value.version} is not supported.`);
  if (!value.sections || typeof value.sections !== 'object' || Array.isArray(value.sections)) {
    throw new TypeError('The backup has no data sections.');
  }
  const sections = SECTIONS.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(value.sections, key)) {
      result[key] = safeSection(value.sections[key]);
    }
    return result;
  }, {});
  if (!Object.keys(sections).length) throw new TypeError('The backup has no recognized data.');
  return {
    format: value.format,
    version: value.version,
    exportedAt: Number.isNaN(Date.parse(value.exportedAt)) ? null : value.exportedAt,
    sections,
  };
}

export function backupFileName(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return `weather-workspace-${date}.json`;
}

export function downloadTextFile(text, fileName, options = {}) {
  const documentRef = options.document ?? globalThis.document;
  const urlApi = options.urlApi ?? globalThis.URL;
  const BlobType = options.BlobType ?? globalThis.Blob;
  if (!documentRef || !urlApi || !BlobType) return false;
  const blob = new BlobType([text], { type: 'application/json;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  urlApi.revokeObjectURL(url);
  return true;
}

export async function readTextFile(file) {
  if (!file || typeof file.text !== 'function') throw new TypeError('Choose a backup file to import.');
  if (Number.isFinite(file.size) && file.size > 2_000_000) throw new RangeError('Backup files must be smaller than 2 MB.');
  return file.text();
}
