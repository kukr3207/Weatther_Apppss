function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function nowIso(clock) {
  const value = clock();
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError('Repository clock returned an invalid date.');
  return new Date(timestamp).toISOString();
}

function normalizeIdentifier(value, label = 'Record id') {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
  return value.trim();
}

export function createVersionedCollectionRepository(store, inputOptions = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new TypeError('A JSON store is required.');
  }
  const options = {
    key: normalizeIdentifier(inputOptions.key, 'Repository key'),
    schemaVersion: Number.isInteger(inputOptions.schemaVersion) ? inputOptions.schemaVersion : 1,
    capacity: Number.isInteger(inputOptions.capacity) && inputOptions.capacity > 0 ? inputOptions.capacity : 100,
    clock: typeof inputOptions.clock === 'function' ? inputOptions.clock : () => new Date(),
    normalize: typeof inputOptions.normalize === 'function' ? inputOptions.normalize : (value) => value,
    migrate: typeof inputOptions.migrate === 'function' ? inputOptions.migrate : (value) => value,
    sort: typeof inputOptions.sort === 'function' ? inputOptions.sort : (first, second) => (
      String(first.id).localeCompare(String(second.id))
    ),
  };

  function emptyEnvelope() {
    return { schemaVersion: options.schemaVersion, revision: 0, records: [], deleted: [] };
  }

  function readEnvelope() {
    const stored = store.get(options.key, emptyEnvelope());
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return emptyEnvelope();
    let envelope = clone(stored);
    if (envelope.schemaVersion !== options.schemaVersion) {
      envelope = options.migrate(envelope, options.schemaVersion);
    }
    const records = Array.isArray(envelope.records) ? envelope.records : [];
    const deleted = Array.isArray(envelope.deleted) ? envelope.deleted : [];
    return {
      schemaVersion: options.schemaVersion,
      revision: Number.isInteger(envelope.revision) ? envelope.revision : 0,
      records,
      deleted,
    };
  }

  function writeEnvelope(envelope) {
    if (!store.set(options.key, envelope)) throw new Error(`Unable to persist ${options.key}.`);
    return envelope;
  }

  function list(optionsInput = {}) {
    const envelope = readEnvelope();
    let records = envelope.records.map(clone);
    if (typeof optionsInput.filter === 'function') records = records.filter(optionsInput.filter);
    return records.sort(optionsInput.sort ?? options.sort);
  }

  function get(idInput) {
    const id = normalizeIdentifier(idInput);
    const found = readEnvelope().records.find((record) => record.id === id);
    return found ? clone(found) : null;
  }

  function save(input, saveOptions = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('A record is required.');
    const envelope = readEnvelope();
    const id = normalizeIdentifier(input.id);
    const existingIndex = envelope.records.findIndex((record) => record.id === id);
    const existing = existingIndex >= 0 ? envelope.records[existingIndex] : null;
    if (Number.isInteger(saveOptions.expectedRevision)
        && saveOptions.expectedRevision !== (existing?.revision ?? 0)) {
      throw new Error(`Record ${id} changed since it was read.`);
    }
    const timestamp = nowIso(options.clock);
    const normalized = options.normalize(clone(input), existing ? clone(existing) : null);
    const record = {
      ...normalized,
      id,
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const records = [...envelope.records];
    if (existingIndex >= 0) records[existingIndex] = record;
    else records.push(record);
    records.sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
    const retained = records.slice(0, options.capacity);
    const evicted = records.slice(options.capacity);
    const next = {
      ...envelope,
      revision: envelope.revision + 1,
      records: retained,
      deleted: [...envelope.deleted, ...evicted.map((item) => ({ id: item.id, deletedAt: timestamp, reason: 'capacity' }))]
        .slice(-options.capacity),
    };
    writeEnvelope(next);
    return clone(record);
  }

  function remove(idInput, removeOptions = {}) {
    const id = normalizeIdentifier(idInput);
    const envelope = readEnvelope();
    const existing = envelope.records.find((record) => record.id === id);
    if (!existing) return false;
    if (Number.isInteger(removeOptions.expectedRevision) && removeOptions.expectedRevision !== existing.revision) {
      throw new Error(`Record ${id} changed since it was read.`);
    }
    const timestamp = nowIso(options.clock);
    writeEnvelope({
      ...envelope,
      revision: envelope.revision + 1,
      records: envelope.records.filter((record) => record.id !== id),
      deleted: [...envelope.deleted, { id, deletedAt: timestamp, reason: removeOptions.reason ?? 'removed' }]
        .slice(-options.capacity),
    });
    return true;
  }

  function replace(recordsInput, replaceOptions = {}) {
    if (!Array.isArray(recordsInput)) throw new TypeError('Records must be an array.');
    const ids = new Set();
    const timestamp = nowIso(options.clock);
    const records = recordsInput.map((record) => {
      const id = normalizeIdentifier(record?.id);
      if (ids.has(id)) throw new TypeError(`Record ${id} is duplicated.`);
      ids.add(id);
      const normalized = options.normalize(clone(record), null);
      return {
        ...normalized,
        id,
        revision: Number.isInteger(record.revision) ? record.revision : 1,
        createdAt: record.createdAt ?? timestamp,
        updatedAt: record.updatedAt ?? timestamp,
      };
    });
    if (records.length > options.capacity) throw new TypeError(`At most ${options.capacity} records can be stored.`);
    const envelope = readEnvelope();
    writeEnvelope({
      schemaVersion: options.schemaVersion,
      revision: envelope.revision + 1,
      records,
      deleted: replaceOptions.keepTombstones ? envelope.deleted : [],
    });
    return list();
  }

  function clear(clearOptions = {}) {
    const envelope = readEnvelope();
    const timestamp = nowIso(options.clock);
    writeEnvelope({
      schemaVersion: options.schemaVersion,
      revision: envelope.revision + 1,
      records: [],
      deleted: clearOptions.keepTombstones
        ? [...envelope.deleted, ...envelope.records.map((record) => ({ id: record.id, deletedAt: timestamp, reason: 'cleared' }))]
          .slice(-options.capacity)
        : [],
    });
    return [];
  }

  function metadata() {
    const envelope = readEnvelope();
    return {
      schemaVersion: envelope.schemaVersion,
      revision: envelope.revision,
      recordCount: envelope.records.length,
      tombstoneCount: envelope.deleted.length,
      capacity: options.capacity,
    };
  }

  return Object.freeze({ list, get, save, remove, replace, clear, metadata });
}
