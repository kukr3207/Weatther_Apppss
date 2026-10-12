import { assertArray, assertObject, assertString, deepFreeze, parseTimestamp, stableStringify } from '../core/validation';

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeMutation(mutation, index) {
  assertObject(mutation, `Mutation ${index + 1}`);
  const entityType = assertString(mutation.entityType, `Mutation ${index + 1} entity type`, { maximum: 80 });
  const entityId = assertString(mutation.entityId, `Mutation ${index + 1} entity id`, { maximum: 200 });
  const operation = ['upsert', 'delete'].includes(mutation.operation) ? mutation.operation : 'upsert';
  const changedAt = new Date(parseTimestamp(mutation.changedAt, `Mutation ${index + 1} changedAt`)).toISOString();
  return deepFreeze({
    id: mutation.id ?? `${entityType}:${entityId}:${hashText(`${changedAt}:${stableStringify(mutation.value)}`)}`,
    deviceId: assertString(mutation.deviceId, `Mutation ${index + 1} device`, { maximum: 160 }),
    entityType,
    entityId,
    operation,
    value: operation === 'delete' ? null : mutation.value,
    changedAt,
    revision: Number.isInteger(mutation.revision) && mutation.revision >= 0 ? mutation.revision : 0,
    baseRevision: Number.isInteger(mutation.baseRevision) && mutation.baseRevision >= 0 ? mutation.baseRevision : null,
  });
}

function sameMutation(first, second) {
  return first.operation === second.operation && stableStringify(first.value) === stableStringify(second.value);
}

function winnerFor(first, second, strategy) {
  if (first.revision !== second.revision) return first.revision > second.revision ? first : second;
  const firstTime = parseTimestamp(first.changedAt);
  const secondTime = parseTimestamp(second.changedAt);
  if (firstTime !== secondTime) return firstTime > secondTime ? first : second;
  if (sameMutation(first, second)) return first.id.localeCompare(second.id) <= 0 ? first : second;
  if (strategy === 'prefer_local') return first;
  if (strategy === 'prefer_remote') return second;
  return null;
}

export function reconcileWorkspaceMutations(localInput, remoteInput, options = {}) {
  const local = assertArray(localInput, 'Local mutations').map(normalizeMutation);
  const remote = assertArray(remoteInput, 'Remote mutations').map(normalizeMutation);
  const byIdentity = new Map();
  [...local, ...remote].forEach((mutation) => {
    const existing = byIdentity.get(mutation.id);
    if (existing && !sameMutation(existing, mutation)) throw new TypeError(`Mutation ${mutation.id} has conflicting content.`);
    byIdentity.set(mutation.id, existing ?? mutation);
  });
  const groups = new Map();
  byIdentity.forEach((mutation) => {
    const key = `${mutation.entityType}:${mutation.entityId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mutation);
  });
  const merged = [];
  const conflicts = [];
  groups.forEach((mutations, key) => {
    const sorted = [...mutations].sort((first, second) => (
      first.revision - second.revision
      || parseTimestamp(first.changedAt) - parseTimestamp(second.changedAt)
      || first.id.localeCompare(second.id)
    ));
    let selected = sorted[0];
    for (let index = 1; index < sorted.length; index += 1) {
      const candidate = sorted[index];
      const winner = winnerFor(selected, candidate, options.strategy ?? 'manual');
      if (!winner) {
        conflicts.push(deepFreeze({
          key,
          entityType: selected.entityType,
          entityId: selected.entityId,
          local: local.some((entry) => entry.id === selected.id) ? selected : candidate,
          remote: remote.some((entry) => entry.id === candidate.id) ? candidate : selected,
          reason: 'concurrent_change',
        }));
      } else {
        selected = winner;
      }
    }
    if (!conflicts.some((conflict) => conflict.key === key)) merged.push(selected);
  });
  return deepFreeze({
    merged: merged.sort((first, second) => first.entityType.localeCompare(second.entityType)
      || first.entityId.localeCompare(second.entityId)),
    conflicts,
    appliedCount: merged.length,
    conflictCount: conflicts.length,
    duplicateCount: local.length + remote.length - byIdentity.size,
  });
}

export function applyWorkspaceMutations(snapshotInput, mutationsInput) {
  assertObject(snapshotInput, 'Workspace snapshot');
  const snapshot = structuredClone(snapshotInput);
  const mutations = assertArray(mutationsInput, 'Workspace mutations').map(normalizeMutation)
    .sort((first, second) => first.revision - second.revision || parseTimestamp(first.changedAt) - parseTimestamp(second.changedAt));
  mutations.forEach((mutation) => {
    if (!snapshot[mutation.entityType]) snapshot[mutation.entityType] = {};
    if (mutation.operation === 'delete') delete snapshot[mutation.entityType][mutation.entityId];
    else snapshot[mutation.entityType][mutation.entityId] = structuredClone(mutation.value);
  });
  return deepFreeze(snapshot);
}

export function createWorkspaceMutation(input, options = {}) {
  const changedAt = options.changedAt ?? new Date().toISOString();
  return normalizeMutation({
    ...input,
    deviceId: options.deviceId ?? input.deviceId,
    changedAt,
    revision: options.revision ?? input.revision ?? 0,
    baseRevision: options.baseRevision ?? input.baseRevision ?? null,
  }, 0);
}

export function compactMutationLog(inputMutations, options = {}) {
  const mutations = assertArray(inputMutations, 'Mutation log').map(normalizeMutation);
  const keepAfter = options.keepAfter ? parseTimestamp(options.keepAfter) : null;
  const latest = new Map();
  const preserved = [];
  mutations.forEach((mutation) => {
    if (keepAfter !== null && parseTimestamp(mutation.changedAt) >= keepAfter) {
      preserved.push(mutation);
      return;
    }
    const key = `${mutation.entityType}:${mutation.entityId}`;
    const current = latest.get(key);
    if (!current || winnerFor(current, mutation, 'prefer_remote') === mutation) latest.set(key, mutation);
  });
  return [...latest.values(), ...preserved].sort((first, second) => (
    parseTimestamp(first.changedAt) - parseTimestamp(second.changedAt) || first.id.localeCompare(second.id)
  ));
}

export function syncCursor(mutations) {
  const selected = assertArray(mutations, 'Mutations').map(normalizeMutation);
  const latest = [...selected].sort((first, second) => (
    parseTimestamp(second.changedAt) - parseTimestamp(first.changedAt) || second.id.localeCompare(first.id)
  ))[0];
  return latest ? `${latest.changedAt}|${latest.id}` : null;
}
