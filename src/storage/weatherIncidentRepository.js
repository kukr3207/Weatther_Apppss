import { createVersionedCollectionRepository } from './versionedCollectionRepository';

function normalizeIncident(input, existing) {
  if (typeof input.title !== 'string' || !input.title.trim()) throw new TypeError('Incident title is required.');
  if (!input.commander?.id) throw new TypeError('Incident commander is required.');
  return {
    ...existing,
    ...input,
    title: input.title.trim(),
    state: ['open', 'monitoring', 'resolved', 'closed'].includes(input.state) ? input.state : 'open',
    severity: ['minor', 'moderate', 'major', 'critical'].includes(input.severity) ? input.severity : 'moderate',
    commander: structuredClone(input.commander),
    affectedLocations: Array.isArray(input.affectedLocations) ? structuredClone(input.affectedLocations) : [],
    alertIds: Array.isArray(input.alertIds) ? [...new Set(input.alertIds)] : [],
    timeline: Array.isArray(input.timeline) ? structuredClone(input.timeline) : [],
    actions: Array.isArray(input.actions) ? structuredClone(input.actions) : [],
  };
}

export function createWeatherIncidentRepository(store, options = {}) {
  const repository = createVersionedCollectionRepository(store, {
    key: options.key ?? 'operations-weather-incidents',
    schemaVersion: 1,
    capacity: options.capacity ?? 100,
    clock: options.clock,
    normalize: normalizeIncident,
    sort: (first, second) => {
      const stateOrder = { open: 0, monitoring: 1, resolved: 2, closed: 3 };
      const severityOrder = { critical: 0, major: 1, moderate: 2, minor: 3 };
      return stateOrder[first.state] - stateOrder[second.state]
        || severityOrder[first.severity] - severityOrder[second.severity]
        || Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
    },
  });
  return Object.freeze({
    ...repository,
    active() {
      return repository.list({ filter: (incident) => ['open', 'monitoring'].includes(incident.state) });
    },
    forAlert(alertId) {
      return repository.list({ filter: (incident) => incident.alertIds.includes(alertId) });
    },
    forLocation(locationId) {
      return repository.list({
        filter: (incident) => incident.affectedLocations.some((location) => (location.id ?? location) === locationId),
      });
    },
  });
}
