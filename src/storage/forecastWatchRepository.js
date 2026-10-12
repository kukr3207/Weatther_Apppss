import { createVersionedCollectionRepository } from './versionedCollectionRepository';

function normalizeWatch(input, existing) {
  if (typeof input.name !== 'string' || !input.name.trim()) throw new TypeError('Watch name is required.');
  if (!input.location?.id) throw new TypeError('Watch location is required.');
  if (!Array.isArray(input.rules) || input.rules.length === 0) throw new TypeError('A watch needs at least one rule.');
  return {
    ...existing,
    ...input,
    name: input.name.trim(),
    location: structuredClone(input.location),
    rules: structuredClone(input.rules),
    state: ['active', 'paused', 'completed', 'expired'].includes(input.state) ? input.state : 'active',
    triggerCount: Number.isInteger(input.triggerCount) ? input.triggerCount : existing?.triggerCount ?? 0,
    lastEvaluatedAt: input.lastEvaluatedAt ?? existing?.lastEvaluatedAt ?? null,
    lastTriggeredAt: input.lastTriggeredAt ?? existing?.lastTriggeredAt ?? null,
  };
}

export function createForecastWatchRepository(store, options = {}) {
  const repository = createVersionedCollectionRepository(store, {
    key: options.key ?? 'operations-forecast-watches',
    schemaVersion: 1,
    capacity: options.capacity ?? 50,
    clock: options.clock,
    normalize: normalizeWatch,
    sort: (first, second) => Number(second.state === 'active') - Number(first.state === 'active')
      || first.name.localeCompare(second.name),
  });
  return Object.freeze({
    ...repository,
    active() {
      return repository.list({ filter: (watch) => watch.state === 'active' });
    },
    forLocation(locationId) {
      return repository.list({ filter: (watch) => watch.location.id === locationId });
    },
    recordEvaluation(id, evaluation) {
      const watch = repository.get(id);
      if (!watch) throw new TypeError(`Watch ${id} does not exist.`);
      return repository.save({
        ...watch,
        state: evaluation.watch?.state ?? watch.state,
        triggerCount: evaluation.watch?.triggerCount ?? watch.triggerCount,
        lastEvaluatedAt: evaluation.watch?.lastEvaluatedAt ?? new Date().toISOString(),
        lastTriggeredAt: evaluation.watch?.lastTriggeredAt ?? watch.lastTriggeredAt,
      }, { expectedRevision: watch.revision });
    },
  });
}
