import { assertArray, assertFiniteNumber, deepFreeze, parseTimestamp, round } from '../core/validation';

function normalizeFrame(frame, index) {
  const validAt = new Date(parseTimestamp(frame.validAt ?? frame.timestamp, `Radar frame ${index + 1} time`)).toISOString();
  return deepFreeze({
    id: String(frame.id ?? `radar-frame-${validAt}`),
    validAt,
    tileUrl: frame.tileUrl ?? frame.url ?? null,
    kind: frame.kind === 'forecast' ? 'forecast' : 'observation',
    opacity: Number.isFinite(frame.opacity) ? Math.max(0, Math.min(1, frame.opacity)) : 1,
    metadata: deepFreeze({ ...(frame.metadata ?? {}) }),
  });
}

export function createRadarTimeline(inputFrames, options = {}) {
  const frames = assertArray(inputFrames, 'Radar frames', { nonEmpty: true }).map(normalizeFrame)
    .sort((first, second) => parseTimestamp(first.validAt) - parseTimestamp(second.validAt));
  const identifiers = new Set();
  frames.forEach((frame) => {
    if (identifiers.has(frame.id)) throw new TypeError(`Radar frame id ${frame.id} is duplicated.`);
    identifiers.add(frame.id);
  });
  const intervalMs = assertFiniteNumber(options.intervalMs ?? 600, 'Radar interval', { minimum: 50 });
  const holdLastMs = assertFiniteNumber(options.holdLastMs ?? intervalMs * 2, 'Final frame hold', { minimum: 0 });
  const observed = frames.filter((frame) => frame.kind === 'observation').length;
  const forecast = frames.length - observed;
  return deepFreeze({
    id: String(options.id ?? `radar:${frames[0].validAt}:${frames.at(-1).validAt}`),
    frames,
    intervalMs,
    holdLastMs,
    loop: options.loop !== false,
    direction: options.direction === 'reverse' ? 'reverse' : 'forward',
    startsAt: frames[0].validAt,
    endsAt: frames.at(-1).validAt,
    durationMs: intervalMs * Math.max(0, frames.length - 1) + holdLastMs,
    frameCount: frames.length,
    observedFrameCount: observed,
    forecastFrameCount: forecast,
  });
}

export function radarFrameAt(timeline, elapsedMs) {
  const duration = timeline.durationMs;
  if (!timeline.frames.length) return null;
  let elapsed = Math.max(0, elapsedMs);
  if (timeline.loop && duration > 0) elapsed %= duration;
  else elapsed = Math.min(elapsed, duration);
  let index = Math.min(timeline.frames.length - 1, Math.floor(elapsed / timeline.intervalMs));
  if (timeline.direction === 'reverse') index = timeline.frames.length - 1 - index;
  return deepFreeze({
    frame: timeline.frames[index],
    index,
    progress: duration ? round(elapsed / duration, 4) : 1,
    elapsedMs: elapsed,
    atEnd: !timeline.loop && elapsed >= duration,
  });
}

export function nearestRadarFrame(timeline, target, options = {}) {
  const targetMs = parseTimestamp(target);
  const allowedKind = options.kind;
  let match = null;
  let distanceMs = Number.POSITIVE_INFINITY;
  timeline.frames.forEach((frame, index) => {
    if (allowedKind && frame.kind !== allowedKind) return;
    const distance = Math.abs(parseTimestamp(frame.validAt) - targetMs);
    if (distance < distanceMs) {
      match = { frame, index };
      distanceMs = distance;
    }
  });
  if (Number.isFinite(options.maximumDistanceMs) && distanceMs > options.maximumDistanceMs) return null;
  return match ? deepFreeze({ ...match, distanceMs }) : null;
}

export function mergeRadarTimelines(inputTimelines, options = {}) {
  const timelines = assertArray(inputTimelines, 'Radar timelines', { nonEmpty: true });
  const frames = new Map();
  timelines.flatMap((timeline) => timeline.frames ?? []).forEach((frame) => {
    const key = `${frame.kind}:${frame.validAt}`;
    if (!frames.has(key) || options.prefer === 'last') frames.set(key, frame);
  });
  return createRadarTimeline([...frames.values()], {
    id: options.id,
    intervalMs: options.intervalMs ?? timelines[0].intervalMs,
    holdLastMs: options.holdLastMs ?? timelines[0].holdLastMs,
    loop: options.loop ?? timelines[0].loop,
    direction: options.direction ?? timelines[0].direction,
  });
}

export function radarPlaybackMarkers(timeline, options = {}) {
  const labelEvery = Math.max(1, Math.trunc(options.labelEvery ?? 1));
  return timeline.frames.map((frame, index) => deepFreeze({
    index,
    frameId: frame.id,
    validAt: frame.validAt,
    offsetMs: timeline.direction === 'reverse'
      ? (timeline.frames.length - 1 - index) * timeline.intervalMs
      : index * timeline.intervalMs,
    label: index % labelEvery === 0
      ? new Intl.DateTimeFormat(options.locale ?? 'en', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: options.timezone ?? 'UTC',
      }).format(new Date(frame.validAt))
      : null,
    kind: frame.kind,
  }));
}

export function radarAvailability(timeline, start, end) {
  const startMs = parseTimestamp(start);
  const endMs = parseTimestamp(end);
  if (endMs <= startMs) throw new TypeError('Radar availability window must end after it starts.');
  const included = timeline.frames.filter((frame) => {
    const timestamp = parseTimestamp(frame.validAt);
    return timestamp >= startMs && timestamp < endMs;
  });
  const expected = Math.max(1, Math.ceil((endMs - startMs) / (timeline.frames.length > 1
    ? (parseTimestamp(timeline.frames[1].validAt) - parseTimestamp(timeline.frames[0].validAt))
    : endMs - startMs)));
  return deepFreeze({
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    availableFrames: included.length,
    expectedFrames: expected,
    coverage: round(Math.min(1, included.length / expected), 4),
    gaps: expected - included.length,
  });
}
