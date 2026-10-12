import { assertArray, assertObject, assertString, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, minimum, quantile, sum } from '../core/statistics';

function generateId(prefix, sequence) {
  return `${prefix}-${sequence.toString(36).padStart(8, '0')}`;
}

function normalizeStatus(status) {
  return ['unset', 'ok', 'error', 'cancelled'].includes(status) ? status : 'unset';
}

export function createTraceCollector(options = {}) {
  const clock = options.clock ?? (() => Date.now());
  let sequence = 0;
  const spans = new Map();
  const roots = [];

  function begin(name, input = {}) {
    const spanName = assertString(name, 'Span name', { maximum: 240 });
    sequence += 1;
    const startedAtMs = parseTimestamp(input.startedAt ?? clock());
    const span = {
      id: input.id ?? generateId('span', sequence),
      traceId: input.traceId ?? input.parent?.traceId ?? generateId('trace', sequence),
      parentId: input.parent?.id ?? input.parentId ?? null,
      name: spanName,
      kind: input.kind ?? 'internal',
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      endedAt: null,
      durationMs: null,
      status: 'unset',
      attributes: { ...(input.attributes ?? {}) },
      events: [],
      links: [...(input.links ?? [])],
    };
    spans.set(span.id, span);
    if (!span.parentId) roots.push(span.id);
    let ended = false;
    return Object.freeze({
      get id() { return span.id; },
      get traceId() { return span.traceId; },
      setAttribute(key, value) {
        if (!ended) span.attributes[String(key)] = value;
        return this;
      },
      setAttributes(attributes) {
        if (!ended) Object.assign(span.attributes, attributes);
        return this;
      },
      addEvent(eventName, attributes = {}, occurredAt = clock()) {
        if (ended) return this;
        span.events.push({
          name: assertString(eventName, 'Event name', { maximum: 240 }),
          occurredAt: new Date(parseTimestamp(occurredAt)).toISOString(),
          attributes: { ...attributes },
        });
        return this;
      },
      recordError(error, occurredAt = clock()) {
        if (ended) return this;
        span.status = 'error';
        span.events.push({
          name: 'exception',
          occurredAt: new Date(parseTimestamp(occurredAt)).toISOString(),
          attributes: {
            'exception.type': error?.name ?? 'Error',
            'exception.message': error?.message ?? String(error),
            'exception.stack': error?.stack ?? null,
          },
        });
        return this;
      },
      end(status = 'ok', endedAt = clock()) {
        if (ended) return deepFreeze({ ...span });
        ended = true;
        const endedAtMs = parseTimestamp(endedAt);
        span.endedAt = new Date(endedAtMs).toISOString();
        span.durationMs = Math.max(0, endedAtMs - startedAtMs);
        if (span.status !== 'error') span.status = normalizeStatus(status);
        return deepFreeze({
          ...span,
          attributes: { ...span.attributes },
          events: span.events.map((event) => ({ ...event, attributes: { ...event.attributes } })),
        });
      },
      child(childName, childInput = {}) {
        return begin(childName, { ...childInput, parent: { id: span.id, traceId: span.traceId } });
      },
    });
  }

  return Object.freeze({
    begin,
    async trace(name, operation, input = {}) {
      const span = begin(name, input);
      try {
        const result = await operation(span);
        span.end('ok');
        return result;
      } catch (error) {
        span.recordError(error);
        span.end('error');
        throw error;
      }
    },
    snapshot() {
      return deepFreeze({
        spans: [...spans.values()].map((span) => deepFreeze({
          ...span,
          attributes: { ...span.attributes },
          events: span.events.map((event) => ({ ...event, attributes: { ...event.attributes } })),
        })),
        roots: [...roots],
      });
    },
    clear() {
      spans.clear();
      roots.splice(0);
    },
  });
}

export function summarizeTraces(inputSpans) {
  const spans = assertArray(inputSpans, 'Trace spans').map((span, index) => {
    assertObject(span, `Trace span ${index + 1}`);
    return span;
  });
  const completed = spans.filter((span) => Number.isFinite(span.durationMs));
  const durations = completed.map((span) => span.durationMs);
  const statuses = spans.reduce((counts, span) => {
    counts[span.status ?? 'unset'] = (counts[span.status ?? 'unset'] ?? 0) + 1;
    return counts;
  }, {});
  const byName = {};
  completed.forEach((span) => {
    if (!byName[span.name]) byName[span.name] = [];
    byName[span.name].push(span.durationMs);
  });
  return deepFreeze({
    spanCount: spans.length,
    completedCount: completed.length,
    openCount: spans.length - completed.length,
    traceCount: new Set(spans.map((span) => span.traceId)).size,
    statuses,
    duration: {
      minimumMs: round(minimum(durations), 2),
      maximumMs: round(maximum(durations), 2),
      meanMs: round(mean(durations), 2),
      totalMs: round(sum(durations), 2),
      p50Ms: round(quantile(durations, 0.5), 2),
      p95Ms: round(quantile(durations, 0.95), 2),
    },
    operations: Object.fromEntries(Object.entries(byName).map(([name, values]) => [name, {
      count: values.length,
      meanMs: round(mean(values), 2),
      p95Ms: round(quantile(values, 0.95), 2),
      maximumMs: round(maximum(values), 2),
    }])),
  });
}

export function traceWaterfall(inputSpans, traceId) {
  const selected = assertArray(inputSpans, 'Trace spans')
    .filter((span) => span.traceId === traceId)
    .sort((first, second) => parseTimestamp(first.startedAt) - parseTimestamp(second.startedAt));
  if (!selected.length) return deepFreeze({ traceId, startsAt: null, endsAt: null, durationMs: 0, spans: [] });
  const startsAtMs = minimum(selected.map((span) => parseTimestamp(span.startedAt)));
  const endsAtMs = maximum(selected.map((span) => span.endedAt ? parseTimestamp(span.endedAt) : parseTimestamp(span.startedAt)));
  const depthFor = (span, seen = new Set()) => {
    if (!span.parentId || seen.has(span.id)) return 0;
    const parent = selected.find((candidate) => candidate.id === span.parentId);
    return parent ? 1 + depthFor(parent, new Set([...seen, span.id])) : 0;
  };
  return deepFreeze({
    traceId,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    durationMs: Math.max(0, endsAtMs - startsAtMs),
    spans: selected.map((span) => ({
      ...span,
      depth: depthFor(span),
      offsetMs: parseTimestamp(span.startedAt) - startsAtMs,
    })),
  });
}
