import { createVersionedCollectionRepository } from './versionedCollectionRepository';

function normalizeTrip(input, existing) {
  if (typeof input.name !== 'string' || !input.name.trim()) throw new TypeError('Trip name is required.');
  if (!input.location?.id) throw new TypeError('Trip location is required.');
  const startsAt = new Date(input.startsAt).toISOString();
  const endsAt = new Date(input.endsAt).toISOString();
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new TypeError('Trip end must be after its start.');
  return {
    ...existing,
    ...input,
    name: input.name.trim(),
    location: structuredClone(input.location),
    startsAt,
    endsAt,
    travelers: Array.isArray(input.travelers) ? structuredClone(input.travelers) : [],
    items: Array.isArray(input.items) ? structuredClone(input.items) : [],
    notes: typeof input.notes === 'string' ? input.notes.trim() : '',
  };
}

export function createPackingTripRepository(store, options = {}) {
  const repository = createVersionedCollectionRepository(store, {
    key: options.key ?? 'operations-packing-trips',
    schemaVersion: 1,
    capacity: options.capacity ?? 30,
    clock: options.clock,
    normalize: normalizeTrip,
    sort: (first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt),
  });
  return Object.freeze({
    ...repository,
    upcoming(now = new Date().toISOString()) {
      return repository.list({ filter: (trip) => Date.parse(trip.endsAt) >= Date.parse(now) });
    },
    setItemPacked(tripId, itemId, packed) {
      const trip = repository.get(tripId);
      if (!trip) throw new TypeError(`Trip ${tripId} does not exist.`);
      if (!trip.items.some((item) => item.id === itemId)) throw new TypeError(`Packing item ${itemId} does not exist.`);
      return repository.save({
        ...trip,
        items: trip.items.map((item) => item.id === itemId ? { ...item, packed: Boolean(packed) } : item),
      }, { expectedRevision: trip.revision });
    },
  });
}
