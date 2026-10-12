import { assertArray, assertEnum, assertObject, assertString, deepFreeze, parseTimestamp } from '../core/validation';

const INCIDENT_STATES = Object.freeze(['open', 'monitoring', 'resolved', 'closed']);
const SEVERITIES = Object.freeze(['minor', 'moderate', 'major', 'critical']);

function actor(value) {
  if (typeof value === 'string') return Object.freeze({ id: value, name: value });
  assertObject(value, 'Incident actor');
  return Object.freeze({ id: assertString(value.id, 'Actor id'), name: value.name ?? value.id });
}

function entry(type, at, author, message, data = null) {
  return deepFreeze({
    id: `${type}:${new Date(parseTimestamp(at)).toISOString()}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    at: new Date(parseTimestamp(at)).toISOString(),
    author: actor(author),
    message: assertString(message, 'Timeline message', { maximum: 4000 }),
    data,
  });
}

function normalizeIncident(incident) {
  assertObject(incident, 'Incident');
  return deepFreeze({
    ...incident,
    id: assertString(incident.id, 'Incident id', { maximum: 200 }),
    title: assertString(incident.title, 'Incident title', { maximum: 240 }),
    state: assertEnum(incident.state ?? 'open', INCIDENT_STATES, 'Incident state'),
    severity: assertEnum(incident.severity ?? 'moderate', SEVERITIES, 'Incident severity'),
    commander: actor(incident.commander),
    createdAt: new Date(parseTimestamp(incident.createdAt)).toISOString(),
    updatedAt: new Date(parseTimestamp(incident.updatedAt ?? incident.createdAt)).toISOString(),
    resolvedAt: incident.resolvedAt ? new Date(parseTimestamp(incident.resolvedAt)).toISOString() : null,
    closedAt: incident.closedAt ? new Date(parseTimestamp(incident.closedAt)).toISOString() : null,
    affectedLocations: Array.isArray(incident.affectedLocations) ? incident.affectedLocations : [],
    alertIds: Array.isArray(incident.alertIds) ? incident.alertIds : [],
    timeline: Array.isArray(incident.timeline) ? incident.timeline : [],
    actions: Array.isArray(incident.actions) ? incident.actions : [],
  });
}

export function createWeatherIncident(input, options = {}) {
  const at = input.createdAt ?? options.now ?? new Date().toISOString();
  const incident = normalizeIncident({ ...input, state: 'open', createdAt: at, updatedAt: at, timeline: [], actions: [] });
  return deepFreeze({
    ...incident,
    timeline: [entry('created', at, incident.commander, `Incident opened: ${incident.title}`)],
  });
}

export function addIncidentUpdate(inputIncident, message, options = {}) {
  const incident = normalizeIncident(inputIncident);
  if (incident.state === 'closed') throw new TypeError('A closed incident cannot receive updates.');
  const at = options.at ?? new Date().toISOString();
  if (parseTimestamp(at) < parseTimestamp(incident.updatedAt)) throw new TypeError('Incident updates cannot move backward in time.');
  return deepFreeze({
    ...incident,
    updatedAt: new Date(parseTimestamp(at)).toISOString(),
    timeline: [...incident.timeline, entry(options.type ?? 'update', at, options.author ?? incident.commander, message, options.data)],
  });
}

export function assignIncidentAction(inputIncident, actionInput, options = {}) {
  const incident = normalizeIncident(inputIncident);
  assertObject(actionInput, 'Incident action');
  const at = options.at ?? new Date().toISOString();
  const action = deepFreeze({
    id: assertString(actionInput.id, 'Action id', { maximum: 200 }),
    title: assertString(actionInput.title, 'Action title', { maximum: 240 }),
    owner: actor(actionInput.owner),
    state: 'open',
    createdAt: new Date(parseTimestamp(at)).toISOString(),
    dueAt: actionInput.dueAt ? new Date(parseTimestamp(actionInput.dueAt)).toISOString() : null,
    completedAt: null,
  });
  if (incident.actions.some((existing) => existing.id === action.id)) throw new TypeError(`Action ${action.id} already exists.`);
  return deepFreeze({
    ...incident,
    updatedAt: action.createdAt,
    actions: [...incident.actions, action],
    timeline: [...incident.timeline, entry('action_assigned', at, options.author ?? incident.commander, `Assigned: ${action.title}`, { actionId: action.id })],
  });
}

export function completeIncidentAction(inputIncident, actionId, options = {}) {
  const incident = normalizeIncident(inputIncident);
  const id = assertString(actionId, 'Action id');
  const selected = incident.actions.find((action) => action.id === id);
  if (!selected) throw new TypeError(`Action ${id} does not exist.`);
  if (selected.state === 'completed') return incident;
  const at = options.at ?? new Date().toISOString();
  return deepFreeze({
    ...incident,
    updatedAt: new Date(parseTimestamp(at)).toISOString(),
    actions: incident.actions.map((action) => action.id === id
      ? { ...action, state: 'completed', completedAt: new Date(parseTimestamp(at)).toISOString() }
      : action),
    timeline: [...incident.timeline, entry('action_completed', at, options.author ?? selected.owner, `Completed: ${selected.title}`, { actionId: id })],
  });
}

export function transitionIncident(inputIncident, state, options = {}) {
  const incident = normalizeIncident(inputIncident);
  const target = assertEnum(state, INCIDENT_STATES, 'Incident state');
  const allowed = {
    open: ['monitoring', 'resolved'],
    monitoring: ['open', 'resolved'],
    resolved: ['open', 'closed'],
    closed: [],
  };
  if (!allowed[incident.state].includes(target)) throw new TypeError(`Cannot move an incident from ${incident.state} to ${target}.`);
  const at = options.at ?? new Date().toISOString();
  return deepFreeze({
    ...incident,
    state: target,
    updatedAt: new Date(parseTimestamp(at)).toISOString(),
    resolvedAt: target === 'resolved' ? new Date(parseTimestamp(at)).toISOString() : target === 'open' ? null : incident.resolvedAt,
    closedAt: target === 'closed' ? new Date(parseTimestamp(at)).toISOString() : null,
    timeline: [...incident.timeline, entry('state_changed', at, options.author ?? incident.commander, options.message ?? `Incident moved to ${target}.`, { from: incident.state, to: target })],
  });
}

export function incidentSummary(incidentInput) {
  const incident = normalizeIncident(incidentInput);
  return deepFreeze({
    id: incident.id,
    title: incident.title,
    state: incident.state,
    severity: incident.severity,
    commander: incident.commander,
    durationMinutes: (parseTimestamp(incident.closedAt ?? incident.updatedAt) - parseTimestamp(incident.createdAt)) / 60_000,
    updateCount: incident.timeline.length,
    openActionCount: incident.actions.filter((action) => action.state !== 'completed').length,
    completedActionCount: incident.actions.filter((action) => action.state === 'completed').length,
    affectedLocationCount: incident.affectedLocations.length,
    alertCount: incident.alertIds.length,
  });
}

export const WEATHER_INCIDENT_STATES = INCIDENT_STATES;
export const WEATHER_INCIDENT_SEVERITIES = SEVERITIES;
