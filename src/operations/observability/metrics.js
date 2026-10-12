import { assertArray, assertFiniteNumber, assertString, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, minimum, quantile, sum } from '../core/statistics';

function labelsKey(labels = {}) {
  return Object.entries(labels)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',');
}

function normalizeMetricName(value) {
  return assertString(value, 'Metric name', { pattern: /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/, maximum: 200 });
}

function metricIdentity(name, labels) {
  const key = labelsKey(labels);
  return key ? `${name}{${key}}` : name;
}

export function createMetricsRegistry(options = {}) {
  const now = options.now ?? (() => Date.now());
  const series = new Map();
  const get = (name, labels, type, initial = 0) => {
    const normalizedName = normalizeMetricName(name);
    const normalizedLabels = deepFreeze({ ...(labels ?? {}) });
    const identity = metricIdentity(normalizedName, normalizedLabels);
    if (!series.has(identity)) {
      series.set(identity, {
        identity,
        name: normalizedName,
        labels: normalizedLabels,
        type,
        value: initial,
        samples: [],
        updatedAt: null,
      });
    }
    const metric = series.get(identity);
    if (metric.type !== type) throw new TypeError(`Metric ${identity} is already registered as ${metric.type}.`);
    return metric;
  };

  return Object.freeze({
    increment(name, amount = 1, labels = {}) {
      const value = assertFiniteNumber(amount, 'Counter increment', { minimum: 0 });
      const metric = get(name, labels, 'counter');
      metric.value += value;
      metric.updatedAt = new Date(parseTimestamp(now())).toISOString();
      return metric.value;
    },
    setGauge(name, value, labels = {}) {
      const metric = get(name, labels, 'gauge');
      metric.value = assertFiniteNumber(value, 'Gauge value');
      metric.updatedAt = new Date(parseTimestamp(now())).toISOString();
      return metric.value;
    },
    observe(name, value, labels = {}) {
      const metric = get(name, labels, 'histogram');
      const sample = assertFiniteNumber(value, 'Observation');
      metric.samples.push(sample);
      const capacity = Number.isInteger(options.histogramCapacity) ? Math.max(1, options.histogramCapacity) : 10_000;
      if (metric.samples.length > capacity) metric.samples.splice(0, metric.samples.length - capacity);
      metric.value = sample;
      metric.updatedAt = new Date(parseTimestamp(now())).toISOString();
      return sample;
    },
    reset(name, labels = {}) {
      const identity = metricIdentity(normalizeMetricName(name), labels);
      return series.delete(identity);
    },
    clear() {
      series.clear();
    },
    snapshot() {
      return metricsSnapshot([...series.values()]);
    },
    get size() {
      return series.size;
    },
  });
}

function summarizeMetric(metric) {
  const base = {
    identity: metric.identity ?? metricIdentity(metric.name, metric.labels),
    name: metric.name,
    labels: { ...(metric.labels ?? {}) },
    type: metric.type,
    value: metric.value,
    updatedAt: metric.updatedAt ?? null,
  };
  if (metric.type !== 'histogram') return deepFreeze(base);
  const samples = metric.samples ?? [];
  return deepFreeze({
    ...base,
    count: samples.length,
    sum: round(sum(samples), 6),
    minimum: round(minimum(samples), 6),
    maximum: round(maximum(samples), 6),
    mean: round(mean(samples), 6),
    p50: round(quantile(samples, 0.5), 6),
    p90: round(quantile(samples, 0.9), 6),
    p95: round(quantile(samples, 0.95), 6),
    p99: round(quantile(samples, 0.99), 6),
  });
}

export function metricsSnapshot(inputMetrics, options = {}) {
  const metrics = assertArray(inputMetrics, 'Metrics').map(summarizeMetric)
    .sort((first, second) => first.identity.localeCompare(second.identity));
  return deepFreeze({
    generatedAt: new Date(parseTimestamp(options.generatedAt ?? Date.now())).toISOString(),
    metricCount: metrics.length,
    metrics,
    counters: metrics.filter((metric) => metric.type === 'counter'),
    gauges: metrics.filter((metric) => metric.type === 'gauge'),
    histograms: metrics.filter((metric) => metric.type === 'histogram'),
  });
}

function prometheusLabels(labels) {
  const entries = Object.entries(labels ?? {}).sort(([first], [second]) => first.localeCompare(second));
  if (!entries.length) return '';
  return `{${entries.map(([key, value]) => `${key}="${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
}

export function metricsToPrometheus(snapshot, options = {}) {
  const prefix = String(options.prefix ?? 'weather_workspace').replace(/[^a-zA-Z0-9_:]/g, '_');
  const lines = [];
  snapshot.metrics.forEach((metric) => {
    const name = `${prefix}_${metric.name}`.replace(/[^a-zA-Z0-9_:]/g, '_');
    const labels = prometheusLabels(metric.labels);
    if (metric.type === 'histogram') {
      lines.push(`# TYPE ${name} summary`);
      ['0.5', '0.9', '0.95', '0.99'].forEach((quantileValue) => {
        const property = `p${Math.round(Number(quantileValue) * 100)}`;
        const quantileLabels = prometheusLabels({ ...metric.labels, quantile: quantileValue });
        lines.push(`${name}${quantileLabels} ${metric[property] ?? 'NaN'}`);
      });
      lines.push(`${name}_sum${labels} ${metric.sum ?? 0}`);
      lines.push(`${name}_count${labels} ${metric.count ?? 0}`);
    } else {
      lines.push(`# TYPE ${name} ${metric.type}`);
      lines.push(`${name}${labels} ${metric.value}`);
    }
  });
  return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

export function compareMetricsSnapshots(previous, current) {
  const before = new Map((previous?.metrics ?? []).map((metric) => [metric.identity, metric]));
  return deepFreeze((current?.metrics ?? []).map((metric) => {
    const prior = before.get(metric.identity);
    return {
      identity: metric.identity,
      type: metric.type,
      previous: prior?.value ?? null,
      current: metric.value,
      change: Number.isFinite(prior?.value) && Number.isFinite(metric.value) ? round(metric.value - prior.value, 6) : null,
      rate: prior?.type === 'counter' && Number.isFinite(prior.value) && Number.isFinite(metric.value)
        ? round(Math.max(0, metric.value - prior.value), 6)
        : null,
    };
  }));
}
