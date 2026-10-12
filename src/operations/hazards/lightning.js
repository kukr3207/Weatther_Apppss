import { assertArray, deepFreeze, normalizeCoordinates, parseTimestamp, round } from '../core/validation';
import { haversineDistance } from '../core/geo';

function normalizeStrike(strike, index) {
  return deepFreeze({
    id: String(strike.id ?? `strike-${index + 1}`),
    observedAt: new Date(parseTimestamp(strike.observedAt ?? strike.timestamp, `Lightning strike ${index + 1} time`)).toISOString(),
    ...normalizeCoordinates(strike, `Lightning strike ${index + 1}`),
    polarity: Number.isFinite(strike.polarity) ? strike.polarity : null,
    peakCurrentKa: Number.isFinite(strike.peakCurrentKa) ? strike.peakCurrentKa : null,
    quality: Number.isFinite(strike.quality) ? strike.quality : null,
  });
}

export function analyzeLightningThreat(location, inputStrikes, options = {}) {
  const target = normalizeCoordinates(location);
  const now = parseTimestamp(options.now ?? Date.now());
  const radiusKm = options.radiusKm ?? 30;
  const windowMinutes = options.windowMinutes ?? 30;
  const recent = assertArray(inputStrikes, 'Lightning strikes').map(normalizeStrike).map((strike) => ({
    ...strike,
    distanceKm: haversineDistance(target, strike),
    ageMinutes: (now - parseTimestamp(strike.observedAt)) / 60_000,
  })).filter((strike) => strike.ageMinutes >= 0 && strike.ageMinutes <= windowMinutes && strike.distanceKm <= radiusKm)
    .sort((first, second) => first.distanceKm - second.distanceKm);
  const closest = recent[0] ?? null;
  const latest = [...recent].sort((first, second) => parseTimestamp(second.observedAt) - parseTimestamp(first.observedAt))[0] ?? null;
  const score = Math.min(100,
    recent.length * 5
    + (closest ? Math.max(0, 50 - closest.distanceKm * 2) : 0)
    + (latest ? Math.max(0, 25 - latest.ageMinutes) : 0));
  const level = score >= 75 ? 'extreme' : score >= 50 ? 'high' : score >= 25 ? 'moderate' : score > 0 ? 'low' : 'none';
  return deepFreeze({
    location: target,
    level,
    score: round(score, 1),
    strikeCount: recent.length,
    closest: closest ? { ...closest, distanceKm: round(closest.distanceKm, 2), ageMinutes: round(closest.ageMinutes, 1) } : null,
    latest: latest ? { ...latest, distanceKm: round(latest.distanceKm, 2), ageMinutes: round(latest.ageMinutes, 1) } : null,
    strikes: recent.map((strike) => ({ ...strike, distanceKm: round(strike.distanceKm, 2), ageMinutes: round(strike.ageMinutes, 1) })),
    allClearAt: latest ? new Date(parseTimestamp(latest.observedAt) + (options.allClearMinutes ?? 30) * 60_000).toISOString() : null,
    instruction: level === 'extreme' || level === 'high'
      ? 'Move indoors immediately and avoid plumbing, windows, and corded equipment.'
      : level === 'moderate'
        ? 'Suspend exposed outdoor activities and monitor nearby strikes.'
        : level === 'low' ? 'Watch for developing thunderstorms.' : 'No nearby lightning detected.',
  });
}

export function lightningTrend(inputStrikes, location, options = {}) {
  const now = parseTimestamp(options.now ?? Date.now());
  const intervalMinutes = options.intervalMinutes ?? 10;
  const bucketCount = options.bucketCount ?? 6;
  const target = normalizeCoordinates(location);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    startsAt: now - (bucketCount - index) * intervalMinutes * 60_000,
    endsAt: now - (bucketCount - index - 1) * intervalMinutes * 60_000,
    count: 0,
    closestKm: null,
  }));
  assertArray(inputStrikes, 'Lightning strikes').map(normalizeStrike).forEach((strike) => {
    const timestamp = parseTimestamp(strike.observedAt);
    const bucket = buckets.find((entry) => timestamp >= entry.startsAt && timestamp < entry.endsAt);
    if (!bucket) return;
    const distance = haversineDistance(target, strike);
    if (distance > (options.radiusKm ?? 100)) return;
    bucket.count += 1;
    bucket.closestKm = bucket.closestKm === null ? distance : Math.min(bucket.closestKm, distance);
  });
  const firstHalf = buckets.slice(0, Math.floor(bucketCount / 2)).reduce((total, bucket) => total + bucket.count, 0);
  const secondHalf = buckets.slice(Math.floor(bucketCount / 2)).reduce((total, bucket) => total + bucket.count, 0);
  return deepFreeze({
    buckets: buckets.map((bucket) => ({
      startsAt: new Date(bucket.startsAt).toISOString(),
      endsAt: new Date(bucket.endsAt).toISOString(),
      count: bucket.count,
      closestKm: round(bucket.closestKm, 2),
    })),
    direction: secondHalf > firstHalf ? 'increasing' : secondHalf < firstHalf ? 'decreasing' : 'steady',
    change: secondHalf - firstHalf,
  });
}

export function lightningSafetyCountdown(threat, now = Date.now()) {
  if (!threat.allClearAt) return deepFreeze({ clear: true, remainingMinutes: 0, allClearAt: null });
  const remainingMs = Math.max(0, parseTimestamp(threat.allClearAt) - parseTimestamp(now));
  return deepFreeze({
    clear: remainingMs === 0,
    remainingMinutes: Math.ceil(remainingMs / 60_000),
    allClearAt: threat.allClearAt,
  });
}
