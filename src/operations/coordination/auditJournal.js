import { assertArray, assertObject, assertString, deepFreeze, parseTimestamp, stableStringify } from '../core/validation';

function digest(text, seed = 2166136261) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function eventContent(event) {
  return stableStringify({
    id: event.id,
    type: event.type,
    actor: event.actor,
    occurredAt: event.occurredAt,
    subject: event.subject,
    data: event.data,
    previousHash: event.previousHash,
    sequence: event.sequence,
  });
}

function logicalEventContent(event) {
  return stableStringify({
    id: event.id,
    type: event.type,
    actor: event.actor,
    occurredAt: event.occurredAt,
    subject: event.subject,
    data: event.data,
  });
}

function normalizeActor(actor) {
  if (typeof actor === 'string') return Object.freeze({ id: actor, type: 'user' });
  assertObject(actor, 'Audit actor');
  return Object.freeze({
    id: assertString(actor.id, 'Audit actor id', { maximum: 160 }),
    type: typeof actor.type === 'string' ? actor.type : 'user',
    displayName: typeof actor.displayName === 'string' ? actor.displayName : null,
  });
}

function normalizeSubject(subject) {
  assertObject(subject, 'Audit subject');
  return Object.freeze({
    type: assertString(subject.type, 'Audit subject type', { maximum: 100 }),
    id: assertString(subject.id, 'Audit subject id', { maximum: 200 }),
  });
}

export function appendAuditEvent(existingEvents, input, options = {}) {
  const existing = verifyAuditJournal(existingEvents).events;
  assertObject(input, 'Audit event');
  const previous = existing.at(-1);
  const occurredAt = new Date(parseTimestamp(input.occurredAt ?? options.now ?? new Date().toISOString())).toISOString();
  if (previous && parseTimestamp(occurredAt) < parseTimestamp(previous.occurredAt)) {
    throw new TypeError('Audit events cannot move backward in time.');
  }
  const sequence = (previous?.sequence ?? 0) + 1;
  const event = {
    id: assertString(input.id ?? `${occurredAt}:${sequence}`, 'Audit event id', { maximum: 240 }),
    type: assertString(input.type, 'Audit event type', { maximum: 120 }),
    actor: normalizeActor(input.actor ?? options.actor ?? 'system'),
    occurredAt,
    subject: normalizeSubject(input.subject),
    data: input.data === undefined ? null : structuredClone(input.data),
    previousHash: previous?.hash ?? null,
    sequence,
  };
  if (existing.some((entry) => entry.id === event.id)) {
    const duplicate = existing.find((entry) => entry.id === event.id);
    if (logicalEventContent(duplicate) !== logicalEventContent(event)) {
      throw new TypeError(`Audit event ${event.id} conflicts with stored content.`);
    }
    return deepFreeze({ events: existing, appended: false, event: duplicate });
  }
  event.hash = digest(eventContent(event));
  const immutable = deepFreeze(event);
  return deepFreeze({ events: [...existing, immutable], appended: true, event: immutable });
}

export function appendAuditBatch(existingEvents, inputs, options = {}) {
  let events = verifyAuditJournal(existingEvents).events;
  const appended = [];
  assertArray(inputs, 'Audit batch', { nonEmpty: true }).forEach((input) => {
    const result = appendAuditEvent(events, input, options);
    events = result.events;
    if (result.appended) appended.push(result.event);
  });
  return deepFreeze({ events, appended, appendedCount: appended.length });
}

export function verifyAuditJournal(inputEvents) {
  const events = assertArray(inputEvents ?? [], 'Audit journal');
  const ids = new Set();
  const normalized = events.map((input, index) => {
    assertObject(input, `Audit event ${index + 1}`);
    const event = deepFreeze({
      ...input,
      id: assertString(input.id, `Audit event ${index + 1} id`),
      type: assertString(input.type, `Audit event ${index + 1} type`),
      actor: normalizeActor(input.actor),
      subject: normalizeSubject(input.subject),
      occurredAt: new Date(parseTimestamp(input.occurredAt)).toISOString(),
      sequence: input.sequence,
    });
    if (!Number.isInteger(event.sequence) || event.sequence !== index + 1) {
      throw new TypeError(`Audit sequence must be ${index + 1}.`);
    }
    if (ids.has(event.id)) throw new TypeError(`Audit event ${event.id} is duplicated.`);
    ids.add(event.id);
    const previous = index > 0 ? events[index - 1] : null;
    const expectedPreviousHash = previous?.hash ?? null;
    if (event.previousHash !== expectedPreviousHash) throw new TypeError(`Audit chain is broken at ${event.id}.`);
    const expectedHash = digest(eventContent(event));
    if (event.hash !== expectedHash) throw new TypeError(`Audit event ${event.id} has an invalid hash.`);
    if (previous && parseTimestamp(event.occurredAt) < parseTimestamp(previous.occurredAt)) {
      throw new TypeError(`Audit event ${event.id} moves backward in time.`);
    }
    return event;
  });
  return deepFreeze({
    valid: true,
    events: normalized,
    count: normalized.length,
    headHash: normalized.at(-1)?.hash ?? null,
  });
}

export function queryAuditJournal(events, filters = {}) {
  const verified = verifyAuditJournal(events).events;
  const startsAt = filters.startsAt ? parseTimestamp(filters.startsAt) : -Infinity;
  const endsAt = filters.endsAt ? parseTimestamp(filters.endsAt) : Infinity;
  return verified.filter((event) => {
    const at = parseTimestamp(event.occurredAt);
    if (at < startsAt || at >= endsAt) return false;
    if (filters.types && !filters.types.includes(event.type)) return false;
    if (filters.actorId && event.actor.id !== filters.actorId) return false;
    if (filters.subjectType && event.subject.type !== filters.subjectType) return false;
    if (filters.subjectId && event.subject.id !== filters.subjectId) return false;
    return true;
  });
}

export function exportAuditJournal(events, format = 'jsonl') {
  const verified = verifyAuditJournal(events).events;
  if (format === 'json') return JSON.stringify(verified, null, 2);
  if (format === 'csv') {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return [
      ['sequence', 'id', 'type', 'occurredAt', 'actorId', 'subjectType', 'subjectId', 'hash'].join(','),
      ...verified.map((event) => [
        event.sequence,
        escape(event.id),
        escape(event.type),
        escape(event.occurredAt),
        escape(event.actor.id),
        escape(event.subject.type),
        escape(event.subject.id),
        event.hash,
      ].join(',')),
    ].join('\n');
  }
  return verified.map((event) => JSON.stringify(event)).join('\n');
}

export function journalCheckpoint(events) {
  const result = verifyAuditJournal(events);
  return deepFreeze({
    sequence: result.events.at(-1)?.sequence ?? 0,
    headHash: result.headHash,
    createdAt: new Date().toISOString(),
  });
}
