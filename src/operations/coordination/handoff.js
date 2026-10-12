import { assertArray, assertObject, assertString, deepFreeze, parseTimestamp } from '../core/validation';

const HANDOFF_STATES = Object.freeze(['draft', 'ready', 'accepted', 'superseded', 'expired']);

function normalizeOwner(owner, label) {
  if (typeof owner === 'string') return Object.freeze({ id: owner, name: owner });
  assertObject(owner, label);
  return Object.freeze({
    id: assertString(owner.id, `${label} id`, { maximum: 160 }),
    name: assertString(owner.name ?? owner.id, `${label} name`, { maximum: 160 }),
    channel: typeof owner.channel === 'string' ? owner.channel : null,
  });
}

function normalizeHandoff(handoff) {
  assertObject(handoff, 'Forecast handoff');
  const id = assertString(handoff.id, 'Handoff id', { maximum: 200 });
  return deepFreeze({
    ...handoff,
    id,
    state: HANDOFF_STATES.includes(handoff.state) ? handoff.state : 'draft',
    from: normalizeOwner(handoff.from, 'Handoff sender'),
    to: normalizeOwner(handoff.to, 'Handoff recipient'),
    createdAt: new Date(parseTimestamp(handoff.createdAt)).toISOString(),
    validFrom: new Date(parseTimestamp(handoff.validFrom ?? handoff.createdAt)).toISOString(),
    validUntil: handoff.validUntil ? new Date(parseTimestamp(handoff.validUntil)).toISOString() : null,
    acceptedAt: handoff.acceptedAt ? new Date(parseTimestamp(handoff.acceptedAt)).toISOString() : null,
    summary: assertString(handoff.summary, 'Handoff summary', { maximum: 4000 }),
    decisions: Array.isArray(handoff.decisions) ? handoff.decisions : [],
    openQuestions: Array.isArray(handoff.openQuestions) ? handoff.openQuestions : [],
    watchIds: Array.isArray(handoff.watchIds) ? handoff.watchIds : [],
    alertIds: Array.isArray(handoff.alertIds) ? handoff.alertIds : [],
    attachments: Array.isArray(handoff.attachments) ? handoff.attachments : [],
    history: Array.isArray(handoff.history) ? handoff.history : [],
  });
}

function history(type, at, actor, details = {}) {
  return deepFreeze({ type, at: new Date(parseTimestamp(at)).toISOString(), actor: normalizeOwner(actor, 'History actor'), details });
}

export function createForecastHandoff(input, options = {}) {
  const createdAt = input.createdAt ?? options.now ?? new Date().toISOString();
  const handoff = normalizeHandoff({
    ...input,
    state: 'draft',
    createdAt,
    history: [],
  });
  return deepFreeze({
    ...handoff,
    history: [history('created', createdAt, handoff.from)],
  });
}

export function updateForecastHandoff(inputHandoff, changes, options = {}) {
  const handoff = normalizeHandoff(inputHandoff);
  if (handoff.state !== 'draft') throw new TypeError('Only draft handoffs can be edited.');
  assertObject(changes, 'Handoff changes');
  const at = options.at ?? new Date().toISOString();
  return normalizeHandoff({
    ...handoff,
    ...changes,
    id: handoff.id,
    from: handoff.from,
    to: changes.to ?? handoff.to,
    createdAt: handoff.createdAt,
    history: [...handoff.history, history('updated', at, options.actor ?? handoff.from, { fields: Object.keys(changes) })],
  });
}

export function publishForecastHandoff(inputHandoff, options = {}) {
  const handoff = normalizeHandoff(inputHandoff);
  if (handoff.state !== 'draft') throw new TypeError('Only a draft handoff can be published.');
  if (!handoff.summary.trim()) throw new TypeError('A handoff needs a summary.');
  const at = options.at ?? new Date().toISOString();
  return deepFreeze({
    ...handoff,
    state: 'ready',
    publishedAt: new Date(parseTimestamp(at)).toISOString(),
    history: [...handoff.history, history('published', at, options.actor ?? handoff.from)],
  });
}

export function acceptForecastHandoff(inputHandoff, options = {}) {
  const handoff = normalizeHandoff(inputHandoff);
  if (handoff.state !== 'ready') throw new TypeError('Only a ready handoff can be accepted.');
  const actor = normalizeOwner(options.actor ?? handoff.to, 'Acceptance actor');
  if (actor.id !== handoff.to.id && options.allowDelegate !== true) {
    throw new TypeError('The handoff recipient must accept it.');
  }
  const at = options.at ?? new Date().toISOString();
  if (handoff.validUntil && parseTimestamp(at) >= parseTimestamp(handoff.validUntil)) {
    return expireForecastHandoff(handoff, { at, actor });
  }
  return deepFreeze({
    ...handoff,
    state: 'accepted',
    acceptedAt: new Date(parseTimestamp(at)).toISOString(),
    acceptedBy: actor,
    acknowledgement: options.acknowledgement ?? null,
    history: [...handoff.history, history('accepted', at, actor, { acknowledgement: options.acknowledgement ?? null })],
  });
}

export function expireForecastHandoff(inputHandoff, options = {}) {
  const handoff = normalizeHandoff(inputHandoff);
  if (['accepted', 'superseded', 'expired'].includes(handoff.state)) return handoff;
  const at = options.at ?? new Date().toISOString();
  return deepFreeze({
    ...handoff,
    state: 'expired',
    expiredAt: new Date(parseTimestamp(at)).toISOString(),
    history: [...handoff.history, history('expired', at, options.actor ?? { id: 'system' })],
  });
}

export function supersedeForecastHandoff(inputHandoff, replacementId, options = {}) {
  const handoff = normalizeHandoff(inputHandoff);
  if (handoff.state === 'expired') throw new TypeError('An expired handoff cannot be superseded.');
  const id = assertString(replacementId, 'Replacement handoff id', { maximum: 200 });
  const at = options.at ?? new Date().toISOString();
  return deepFreeze({
    ...handoff,
    state: 'superseded',
    supersededBy: id,
    history: [...handoff.history, history('superseded', at, options.actor ?? handoff.from, { replacementId: id })],
  });
}

export function processHandoffClock(inputHandoffs, now = new Date().toISOString()) {
  return assertArray(inputHandoffs, 'Forecast handoffs').map((handoff) => {
    const normalized = normalizeHandoff(handoff);
    return normalized.validUntil
      && parseTimestamp(now) >= parseTimestamp(normalized.validUntil)
      && ['draft', 'ready'].includes(normalized.state)
      ? expireForecastHandoff(normalized, { at: now })
      : normalized;
  });
}

export function handoffInbox(handoffs, ownerId, options = {}) {
  const id = assertString(ownerId, 'Owner id');
  const processed = processHandoffClock(handoffs, options.now);
  return processed.filter((handoff) => handoff.to.id === id && (options.includeClosed || ['draft', 'ready'].includes(handoff.state)))
    .sort((first, second) => parseTimestamp(second.createdAt) - parseTimestamp(first.createdAt));
}

export const FORECAST_HANDOFF_STATES = HANDOFF_STATES;
