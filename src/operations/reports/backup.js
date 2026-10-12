import { assertArray, assertObject, assertString, deepFreeze, parseTimestamp } from '../core/validation';

export const BACKUP_FORMAT = 'weather-workspace-backup';
export const BACKUP_VERSION = 1;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function backupChecksum(value) {
  return fnv1a(JSON.stringify(stable(value)));
}

function normalizeCollection(collection, index) {
  assertObject(collection, `Backup collection ${index + 1}`);
  const name = assertString(collection.name, `Backup collection ${index + 1} name`, { maximum: 120 });
  const records = assertArray(collection.records, `Backup collection ${name} records`)
    .map((record) => stable(record));
  return deepFreeze({
    name,
    version: Number.isInteger(collection.version) && collection.version >= 0 ? collection.version : 0,
    records,
    recordCount: records.length,
    checksum: backupChecksum(records),
  });
}

export function createWorkspaceBackup(input, options = {}) {
  assertObject(input, 'Workspace backup input');
  const exportedAt = new Date(parseTimestamp(options.exportedAt ?? Date.now())).toISOString();
  const collections = assertArray(input.collections ?? [], 'Backup collections').map(normalizeCollection)
    .sort((first, second) => first.name.localeCompare(second.name));
  const names = new Set();
  collections.forEach((collection) => {
    if (names.has(collection.name)) throw new TypeError(`Backup collection ${collection.name} is duplicated.`);
    names.add(collection.name);
  });
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    workspaceId: String(input.workspaceId ?? 'default'),
    applicationVersion: String(options.applicationVersion ?? input.applicationVersion ?? '1.0.0'),
    locale: input.locale ?? null,
    collectionCount: collections.length,
    recordCount: collections.reduce((total, collection) => total + collection.recordCount, 0),
    collections: collections.map(({ name, version, recordCount, checksum }) => ({
      name,
      version,
      recordCount,
      checksum,
    })),
  };
  return deepFreeze({
    manifest: deepFreeze({ ...manifest, checksum: backupChecksum(manifest) }),
    collections,
  });
}

export function serializeWorkspaceBackup(backup, options = {}) {
  const validation = validateWorkspaceBackup(backup);
  if (!validation.valid) throw new TypeError(`Cannot serialize invalid backup: ${validation.errors.join('; ')}`);
  return JSON.stringify(backup, null, options.pretty === false ? 0 : 2);
}

export function parseWorkspaceBackup(serialized) {
  let backup;
  try {
    backup = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  } catch (error) {
    throw new TypeError(`Workspace backup is not valid JSON: ${error.message}`);
  }
  const validation = validateWorkspaceBackup(backup);
  if (!validation.valid) throw new TypeError(`Workspace backup is invalid: ${validation.errors.join('; ')}`);
  return deepFreeze({
    manifest: deepFreeze({ ...backup.manifest }),
    collections: backup.collections.map((collection) => deepFreeze({
      ...collection,
      records: collection.records.map((record) => deepFreeze(record)),
    })),
  });
}

export function validateWorkspaceBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return deepFreeze({ valid: false, errors: ['Backup must be an object.'] });
  }
  if (backup.manifest?.format !== BACKUP_FORMAT) errors.push('Backup format is not supported.');
  if (backup.manifest?.version !== BACKUP_VERSION) errors.push('Backup version is not supported.');
  if (!Array.isArray(backup.collections)) errors.push('Backup collections are missing.');
  const collections = Array.isArray(backup.collections) ? backup.collections : [];
  const names = new Set();
  collections.forEach((collection, index) => {
    if (!collection?.name) errors.push(`Collection ${index + 1} has no name.`);
    if (names.has(collection?.name)) errors.push(`Collection ${collection.name} is duplicated.`);
    names.add(collection?.name);
    if (!Array.isArray(collection?.records)) errors.push(`Collection ${collection?.name ?? index + 1} has no records.`);
    else if (collection.checksum !== backupChecksum(collection.records)) {
      errors.push(`Collection ${collection.name ?? index + 1} failed its checksum.`);
    }
    if (Array.isArray(collection?.records) && collection.recordCount !== collection.records.length) {
      errors.push(`Collection ${collection.name ?? index + 1} has an incorrect record count.`);
    }
  });
  if (backup.manifest?.collectionCount !== collections.length) errors.push('Manifest collection count does not match.');
  const recordCount = collections.reduce((total, collection) => total + (collection.records?.length ?? 0), 0);
  if (backup.manifest?.recordCount !== recordCount) errors.push('Manifest record count does not match.');
  if (backup.manifest) {
    const { checksum, ...manifest } = backup.manifest;
    if (checksum !== backupChecksum(manifest)) errors.push('Manifest failed its checksum.');
  }
  return deepFreeze({ valid: errors.length === 0, errors });
}

export function planBackupRestore(backup, currentVersions = {}, options = {}) {
  const parsed = parseWorkspaceBackup(backup);
  const mode = ['replace', 'merge', 'skip_existing'].includes(options.mode) ? options.mode : 'merge';
  const operations = parsed.collections.map((collection) => {
    const currentVersion = Number.isInteger(currentVersions[collection.name]) ? currentVersions[collection.name] : null;
    const exists = currentVersion !== null;
    const action = mode === 'skip_existing' && exists ? 'skip' : mode === 'replace' ? 'replace' : 'merge';
    return deepFreeze({
      collection: collection.name,
      action,
      exists,
      currentVersion,
      backupVersion: collection.version,
      recordCount: collection.recordCount,
      conflict: exists && currentVersion > collection.version,
    });
  });
  return deepFreeze({
    mode,
    backupExportedAt: parsed.manifest.exportedAt,
    operations,
    conflicts: operations.filter((operation) => operation.conflict),
    recordsToProcess: operations.filter((operation) => operation.action !== 'skip')
      .reduce((total, operation) => total + operation.recordCount, 0),
  });
}
