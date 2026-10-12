import { assertArray, assertEnum, assertInteger, assertString, deepFreeze, parseTimestamp } from '../core/validation';

const SORT_MODES = Object.freeze(['manual', 'name', 'country', 'recent', 'favorite', 'risk']);

function normalizePlace(place, index) {
  const id = assertString(place.id, `Place ${index + 1} id`, { maximum: 160 });
  return Object.freeze({
    ...place,
    id,
    name: assertString(place.name, `Place ${id} name`, { maximum: 160 }),
    position: Number.isFinite(place.position) ? place.position : index,
    favorite: place.favorite === true,
    updatedAt: place.updatedAt ?? place.lastViewedAt ?? null,
    riskScore: Number.isFinite(place.riskScore) ? place.riskScore : null,
  });
}

function compareNullable(first, second, fallback = 0) {
  if (first === null || first === undefined) return second === null || second === undefined ? fallback : 1;
  if (second === null || second === undefined) return -1;
  return fallback;
}

export function orderSavedPlaces(inputPlaces, inputOptions = {}) {
  const places = assertArray(inputPlaces, 'Saved places').map(normalizePlace);
  const mode = assertEnum(inputOptions.mode ?? 'manual', SORT_MODES, 'Place sort mode');
  const descending = inputOptions.descending === true;
  const direction = descending ? -1 : 1;
  return [...places].sort((first, second) => {
    let comparison = 0;
    if (mode === 'name') comparison = first.name.localeCompare(second.name);
    if (mode === 'country') comparison = String(first.country ?? '').localeCompare(String(second.country ?? ''))
      || first.name.localeCompare(second.name);
    if (mode === 'recent') {
      comparison = compareNullable(first.updatedAt, second.updatedAt);
      if (first.updatedAt && second.updatedAt) comparison = parseTimestamp(second.updatedAt) - parseTimestamp(first.updatedAt);
    }
    if (mode === 'favorite') comparison = Number(second.favorite) - Number(first.favorite) || first.name.localeCompare(second.name);
    if (mode === 'risk') {
      comparison = compareNullable(first.riskScore, second.riskScore);
      if (Number.isFinite(first.riskScore) && Number.isFinite(second.riskScore)) comparison = second.riskScore - first.riskScore;
    }
    if (mode === 'manual') comparison = first.position - second.position;
    return comparison * direction || first.id.localeCompare(second.id);
  });
}

export function moveSavedPlace(inputPlaces, placeId, targetIndex) {
  const places = orderSavedPlaces(inputPlaces, { mode: 'manual' });
  const id = assertString(placeId, 'Place id');
  const index = assertInteger(targetIndex, 'Target position', { minimum: 0, maximum: Math.max(0, places.length - 1) });
  const current = places.findIndex((place) => place.id === id);
  if (current < 0) throw new TypeError(`Saved place ${id} does not exist.`);
  const reordered = [...places];
  const [selected] = reordered.splice(current, 1);
  reordered.splice(index, 0, selected);
  return reordered.map((place, position) => deepFreeze({ ...place, position }));
}

export function insertSavedPlace(inputPlaces, place, targetIndex = inputPlaces.length) {
  const places = orderSavedPlaces(inputPlaces, { mode: 'manual' });
  const normalized = normalizePlace(place, places.length);
  if (places.some((entry) => entry.id === normalized.id)) throw new TypeError(`Saved place ${normalized.id} already exists.`);
  const index = Math.max(0, Math.min(places.length, Math.trunc(targetIndex)));
  places.splice(index, 0, normalized);
  return places.map((entry, position) => deepFreeze({ ...entry, position }));
}

export function removeSavedPlace(inputPlaces, placeId) {
  const id = assertString(placeId, 'Place id');
  return orderSavedPlaces(inputPlaces, { mode: 'manual' })
    .filter((place) => place.id !== id)
    .map((place, position) => deepFreeze({ ...place, position }));
}

export function reconcilePlaceOrder(localPlaces, remotePlaces, options = {}) {
  const local = assertArray(localPlaces, 'Local places').map(normalizePlace);
  const remote = assertArray(remotePlaces, 'Remote places').map(normalizePlace);
  const localMap = new Map(local.map((place) => [place.id, place]));
  const remoteMap = new Map(remote.map((place) => [place.id, place]));
  const ids = [...new Set([...localMap.keys(), ...remoteMap.keys()])];
  const merged = ids.map((id) => {
    const localPlace = localMap.get(id);
    const remotePlace = remoteMap.get(id);
    if (!localPlace) return remotePlace;
    if (!remotePlace) return localPlace;
    const localTime = localPlace.updatedAt ? parseTimestamp(localPlace.updatedAt) : 0;
    const remoteTime = remotePlace.updatedAt ? parseTimestamp(remotePlace.updatedAt) : 0;
    if (localTime === remoteTime && JSON.stringify(localPlace) !== JSON.stringify(remotePlace) && options.rejectConflicts) {
      throw new TypeError(`Saved place ${id} has conflicting versions.`);
    }
    return localTime >= remoteTime ? localPlace : remotePlace;
  });
  const localPositions = new Map(local.map((place) => [place.id, place.position]));
  const remotePositions = new Map(remote.map((place) => [place.id, place.position]));
  return merged.sort((first, second) => {
    const firstPosition = localPositions.get(first.id) ?? remotePositions.get(first.id) ?? Infinity;
    const secondPosition = localPositions.get(second.id) ?? remotePositions.get(second.id) ?? Infinity;
    return firstPosition - secondPosition || first.id.localeCompare(second.id);
  }).map((place, position) => deepFreeze({ ...place, position }));
}

export const SAVED_PLACE_SORT_MODES = SORT_MODES;
