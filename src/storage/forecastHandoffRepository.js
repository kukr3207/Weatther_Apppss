import { createVersionedCollectionRepository } from './versionedCollectionRepository';

function normalizeHandoff(input, existing) {
  if (!input.from?.id || !input.to?.id) throw new TypeError('Handoff sender and recipient are required.');
  if (typeof input.summary !== 'string' || !input.summary.trim()) throw new TypeError('Handoff summary is required.');
  return {
    ...existing,
    ...input,
    summary: input.summary.trim(),
    state: ['draft', 'ready', 'accepted', 'superseded', 'expired'].includes(input.state) ? input.state : 'draft',
    from: structuredClone(input.from),
    to: structuredClone(input.to),
    decisions: Array.isArray(input.decisions) ? structuredClone(input.decisions) : [],
    openQuestions: Array.isArray(input.openQuestions) ? structuredClone(input.openQuestions) : [],
    watchIds: Array.isArray(input.watchIds) ? [...new Set(input.watchIds)] : [],
    alertIds: Array.isArray(input.alertIds) ? [...new Set(input.alertIds)] : [],
    history: Array.isArray(input.history) ? structuredClone(input.history) : [],
  };
}

export function createForecastHandoffRepository(store, options = {}) {
  const repository = createVersionedCollectionRepository(store, {
    key: options.key ?? 'operations-forecast-handoffs',
    schemaVersion: 1,
    capacity: options.capacity ?? 100,
    clock: options.clock,
    normalize: normalizeHandoff,
    sort: (first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt),
  });
  return Object.freeze({
    ...repository,
    inbox(ownerId, includeClosed = false) {
      return repository.list({
        filter: (handoff) => handoff.to.id === ownerId
          && (includeClosed || ['draft', 'ready'].includes(handoff.state)),
      });
    },
    outbox(ownerId, includeClosed = false) {
      return repository.list({
        filter: (handoff) => handoff.from.id === ownerId
          && (includeClosed || ['draft', 'ready'].includes(handoff.state)),
      });
    },
  });
}
