import { assertFiniteNumber, assertObject, deepFreeze, parseTimestamp, stableStringify } from '../core/validation';

function keyHash(value) {
  const text = stableStringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

export function createWeatherCacheKey(resource, location, parameters = {}) {
  return `${resource}:${location.id ?? `${location.latitude},${location.longitude}`}:${keyHash(parameters)}`;
}

export function evaluateCacheEntry(entry, inputPolicy = {}, nowInput = new Date().toISOString()) {
  if (!entry) return deepFreeze({ status: 'miss', usable: false, revalidate: true, ageSeconds: null });
  assertObject(entry, 'Cache entry');
  const now = parseTimestamp(nowInput);
  const storedAt = parseTimestamp(entry.storedAt);
  const ageSeconds = Math.max(0, now - storedAt) / 1000;
  const freshSeconds = assertFiniteNumber(inputPolicy.freshSeconds ?? 600, 'Fresh cache lifetime', { minimum: 0 });
  const staleSeconds = assertFiniteNumber(inputPolicy.staleSeconds ?? 3600, 'Stale cache lifetime', { minimum: freshSeconds });
  const offlineSeconds = assertFiniteNumber(inputPolicy.offlineSeconds ?? 86_400, 'Offline cache lifetime', { minimum: staleSeconds });
  const online = inputPolicy.online !== false;
  if (ageSeconds <= freshSeconds) return deepFreeze({ status: 'fresh', usable: true, revalidate: false, ageSeconds });
  if (ageSeconds <= staleSeconds) return deepFreeze({ status: 'stale', usable: true, revalidate: online, ageSeconds });
  if (!online && ageSeconds <= offlineSeconds) return deepFreeze({ status: 'offline_stale', usable: true, revalidate: false, ageSeconds });
  return deepFreeze({ status: 'expired', usable: false, revalidate: online, ageSeconds });
}

export function createCacheEntry(value, metadata = {}, now = new Date().toISOString()) {
  return deepFreeze({
    value,
    storedAt: new Date(parseTimestamp(now)).toISOString(),
    providerId: metadata.providerId ?? null,
    etag: metadata.etag ?? null,
    lastModified: metadata.lastModified ?? null,
    requestKey: metadata.requestKey ?? null,
    schemaVersion: metadata.schemaVersion ?? 1,
  });
}

export function conditionalRequestHeaders(entry) {
  if (!entry) return {};
  const headers = {};
  if (entry.etag) headers['If-None-Match'] = entry.etag;
  if (entry.lastModified) headers['If-Modified-Since'] = entry.lastModified;
  return headers;
}

export function refreshCacheEntry(entry, metadata = {}, now = new Date().toISOString()) {
  assertObject(entry, 'Cache entry');
  return createCacheEntry(entry.value, {
    providerId: metadata.providerId ?? entry.providerId,
    etag: metadata.etag ?? entry.etag,
    lastModified: metadata.lastModified ?? entry.lastModified,
    requestKey: entry.requestKey,
    schemaVersion: entry.schemaVersion,
  }, now);
}

export function enforceCacheCapacity(entries, options = {}) {
  const maximumEntries = options.maximumEntries ?? 100;
  const maximumBytes = options.maximumBytes ?? Infinity;
  const normalized = Object.entries(entries ?? {}).map(([key, entry]) => ({
    key,
    entry,
    size: stableStringify(entry).length,
    storedAt: parseTimestamp(entry.storedAt),
  })).sort((first, second) => second.storedAt - first.storedAt);
  const retained = {};
  const evicted = [];
  let bytes = 0;
  normalized.forEach((item) => {
    if (Object.keys(retained).length >= maximumEntries || bytes + item.size > maximumBytes) {
      evicted.push(item.key);
      return;
    }
    retained[item.key] = item.entry;
    bytes += item.size;
  });
  return deepFreeze({ retained, evicted, bytes, count: Object.keys(retained).length });
}
