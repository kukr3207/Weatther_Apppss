import { assertArray, assertInteger, assertObject, assertString, deepFreeze, parseTimestamp, stableStringify } from '../core/validation';

function operationIdentity(operation) {
  return `${operation.type}:${operation.entityType}:${operation.entityId}`;
}

function normalizeOperation(operation, index = 0) {
  assertObject(operation, `Offline operation ${index + 1}`);
  return deepFreeze({
    id: assertString(operation.id, `Offline operation ${index + 1} id`, { maximum: 200 }),
    type: assertString(operation.type, `Offline operation ${index + 1} type`, { maximum: 80 }),
    entityType: assertString(operation.entityType, `Offline operation ${index + 1} entity type`, { maximum: 80 }),
    entityId: assertString(operation.entityId, `Offline operation ${index + 1} entity id`, { maximum: 200 }),
    payload: operation.payload ?? null,
    queuedAt: new Date(parseTimestamp(operation.queuedAt ?? new Date().toISOString())).toISOString(),
    attempts: Number.isInteger(operation.attempts) ? operation.attempts : 0,
    lastAttemptAt: operation.lastAttemptAt ? new Date(parseTimestamp(operation.lastAttemptAt)).toISOString() : null,
    lastError: operation.lastError ?? null,
  });
}

export function enqueueOfflineOperation(queueInput, operationInput, options = {}) {
  const queue = assertArray(queueInput ?? [], 'Offline queue').map(normalizeOperation);
  const operation = normalizeOperation(operationInput);
  const duplicate = queue.find((entry) => entry.id === operation.id);
  if (duplicate) {
    if (stableStringify(duplicate) !== stableStringify(operation)) throw new TypeError(`Offline operation ${operation.id} conflicts.`);
    return queue;
  }
  const sameEntityIndex = queue.findIndex((entry) => operationIdentity(entry) === operationIdentity(operation));
  if (sameEntityIndex >= 0 && options.coalesce !== false) {
    return queue.map((entry, index) => index === sameEntityIndex ? operation : entry);
  }
  const maximum = assertInteger(options.maximum ?? 500, 'Offline queue capacity', { minimum: 1, maximum: 10000 });
  if (queue.length >= maximum) throw new TypeError('Offline queue capacity was reached.');
  return [...queue, operation];
}

export async function replayOfflineQueue(queueInput, handler, options = {}) {
  const queue = assertArray(queueInput, 'Offline queue').map(normalizeOperation);
  const completed = [];
  const failed = [];
  const remaining = [];
  const maximumAttempts = assertInteger(options.maximumAttempts ?? 5, 'Maximum attempts', { minimum: 1, maximum: 100 });
  for (const operation of queue) {
    if (operation.attempts >= maximumAttempts) {
      failed.push(operation);
      continue;
    }
    const attemptedAt = options.now ?? new Date().toISOString();
    try {
      const result = await handler(operation);
      completed.push(deepFreeze({ operation, result }));
    } catch (error) {
      const updated = normalizeOperation({
        ...operation,
        attempts: operation.attempts + 1,
        lastAttemptAt: attemptedAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      if (updated.attempts >= maximumAttempts) failed.push(updated);
      else remaining.push(updated);
      if (options.stopOnFailure) remaining.push(...queue.slice(queue.indexOf(operation) + 1));
      if (options.stopOnFailure) break;
    }
  }
  return deepFreeze({ completed, failed, remaining });
}

export function offlineQueueSummary(queueInput) {
  const queue = assertArray(queueInput, 'Offline queue').map(normalizeOperation);
  return deepFreeze({
    count: queue.length,
    oldestAt: [...queue].sort((first, second) => parseTimestamp(first.queuedAt) - parseTimestamp(second.queuedAt))[0]?.queuedAt ?? null,
    byType: Object.fromEntries([...new Set(queue.map((entry) => entry.type))]
      .map((type) => [type, queue.filter((entry) => entry.type === type).length])),
    failedAttempts: queue.reduce((total, entry) => total + entry.attempts, 0),
  });
}
