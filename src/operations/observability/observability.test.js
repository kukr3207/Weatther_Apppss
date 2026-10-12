import { describe, expect, it, vi } from 'vitest';
import { compareMetricsSnapshots, createMetricsRegistry, metricsToPrometheus } from './metrics';
import {
  compareProviderQuality,
  evaluateObservationQuality,
  evaluateProviderQuality,
  qualityGate,
} from './qualityMonitor';
import { createTraceCollector, summarizeTraces, traceWaterfall } from './tracing';

describe('metrics registry', () => {
  it('increments labelled counters', () => {
    const registry = createMetricsRegistry({ now: () => '2026-10-11T12:00:00Z' });
    expect(registry.increment('requests_total', 2, { provider: 'primary' })).toBe(2);
    expect(registry.increment('requests_total', 1, { provider: 'primary' })).toBe(3);
    const metric = registry.snapshot().counters[0];
    expect(metric.value).toBe(3);
    expect(metric.labels.provider).toBe('primary');
  });

  it('keeps label combinations separate', () => {
    const registry = createMetricsRegistry();
    registry.increment('requests', 1, { status: 'ok' });
    registry.increment('requests', 1, { status: 'error' });
    expect(registry.size).toBe(2);
  });

  it('sets gauges to negative and positive values', () => {
    const registry = createMetricsRegistry();
    registry.setGauge('temperature_celsius', -5, { station: 'north' });
    expect(registry.snapshot().gauges[0].value).toBe(-5);
  });

  it('summarizes histogram observations', () => {
    const registry = createMetricsRegistry();
    [10, 20, 30, 40, 50].forEach((value) => registry.observe('provider_latency_ms', value));
    const metric = registry.snapshot().histograms[0];
    expect(metric.count).toBe(5);
    expect(metric.mean).toBe(30);
    expect(metric.p50).toBe(30);
    expect(metric.maximum).toBe(50);
  });

  it('limits retained histogram samples', () => {
    const registry = createMetricsRegistry({ histogramCapacity: 3 });
    [1, 2, 3, 4].forEach((value) => registry.observe('duration', value));
    expect(registry.snapshot().histograms[0]).toMatchObject({ count: 3, minimum: 2, maximum: 4 });
  });

  it('rejects incompatible metric types', () => {
    const registry = createMetricsRegistry();
    registry.increment('load');
    expect(() => registry.setGauge('load', 2)).toThrow('counter');
  });

  it('rejects negative counter increments', () => {
    expect(() => createMetricsRegistry().increment('requests', -1)).toThrow('at least');
  });

  it('resets individual series', () => {
    const registry = createMetricsRegistry();
    registry.increment('requests', 1, { provider: 'a' });
    expect(registry.reset('requests', { provider: 'a' })).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('clears all series', () => {
    const registry = createMetricsRegistry();
    registry.increment('a');
    registry.setGauge('b', 2);
    registry.clear();
    expect(registry.snapshot().metricCount).toBe(0);
  });

  it('renders Prometheus counters and summaries', () => {
    const registry = createMetricsRegistry();
    registry.increment('requests_total', 3, { provider: 'a' });
    registry.observe('latency_ms', 25);
    const output = metricsToPrometheus(registry.snapshot(), { prefix: 'weather' });
    expect(output).toContain('# TYPE weather_requests_total counter');
    expect(output).toContain('provider="a"');
    expect(output).toContain('weather_latency_ms_count 1');
  });

  it('escapes Prometheus label values', () => {
    const registry = createMetricsRegistry();
    registry.increment('requests', 1, { provider: 'a"b' });
    expect(metricsToPrometheus(registry.snapshot())).toContain('a\\"b');
  });

  it('compares metric changes', () => {
    const registry = createMetricsRegistry();
    registry.increment('requests', 2);
    const previous = registry.snapshot();
    registry.increment('requests', 3);
    const current = registry.snapshot();
    expect(compareMetricsSnapshots(previous, current)[0]).toMatchObject({ change: 3, rate: 3 });
  });
});

describe('trace collection', () => {
  it('collects root spans', () => {
    let time = Date.parse('2026-10-11T12:00:00Z');
    const collector = createTraceCollector({ clock: () => time });
    const span = collector.begin('load forecast', { attributes: { provider: 'a' } });
    time += 150;
    const result = span.end();
    expect(result.durationMs).toBe(150);
    expect(result.status).toBe('ok');
    expect(collector.snapshot().roots).toEqual([span.id]);
  });

  it('collects nested spans under one trace', () => {
    let time = 1000;
    const collector = createTraceCollector({ clock: () => time });
    const parent = collector.begin('request');
    time += 10;
    const child = parent.child('decode');
    time += 20;
    child.end();
    time += 5;
    parent.end();
    const spans = collector.snapshot().spans;
    expect(spans).toHaveLength(2);
    expect(spans[1].traceId).toBe(spans[0].traceId);
    expect(spans[1].parentId).toBe(spans[0].id);
  });

  it('adds timestamped span events', () => {
    const collector = createTraceCollector({ clock: () => 1000 });
    const span = collector.begin('fetch');
    span.addEvent('retry', { attempt: 2 });
    span.end();
    expect(collector.snapshot().spans[0].events[0]).toMatchObject({ name: 'retry', attributes: { attempt: 2 } });
  });

  it('records exception details', () => {
    const collector = createTraceCollector({ clock: () => 1000 });
    const span = collector.begin('fetch');
    span.recordError(new Error('network unavailable'));
    const ended = span.end();
    expect(ended.status).toBe('error');
    expect(ended.events[0].attributes['exception.message']).toBe('network unavailable');
  });

  it('wraps successful async operations', async () => {
    const collector = createTraceCollector({ clock: () => 1000 });
    await expect(collector.trace('operation', async () => 42)).resolves.toBe(42);
    expect(collector.snapshot().spans[0].status).toBe('ok');
  });

  it('wraps failed async operations', async () => {
    const collector = createTraceCollector({ clock: () => 1000 });
    await expect(collector.trace('operation', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(collector.snapshot().spans[0].status).toBe('error');
  });

  it('summarizes trace duration and status', () => {
    let time = 1000;
    const collector = createTraceCollector({ clock: () => time });
    const first = collector.begin('request');
    time += 100;
    first.end();
    const second = collector.begin('request');
    time += 300;
    second.end('error');
    const summary = summarizeTraces(collector.snapshot().spans);
    expect(summary.spanCount).toBe(2);
    expect(summary.statuses).toEqual({ ok: 1, error: 1 });
    expect(summary.duration.meanMs).toBe(200);
    expect(summary.operations.request.count).toBe(2);
  });

  it('builds trace waterfalls', () => {
    let time = 1000;
    const collector = createTraceCollector({ clock: () => time });
    const parent = collector.begin('parent');
    time += 10;
    const child = parent.child('child');
    time += 20;
    child.end();
    time += 10;
    parent.end();
    const snapshot = collector.snapshot();
    const waterfall = traceWaterfall(snapshot.spans, snapshot.spans[0].traceId);
    expect(waterfall.durationMs).toBe(40);
    expect(waterfall.spans[1]).toMatchObject({ depth: 1, offsetMs: 10 });
  });

  it('returns an empty waterfall for unknown traces', () => {
    expect(traceWaterfall([], 'missing').spans).toEqual([]);
  });

  it('clears all collected spans', () => {
    const collector = createTraceCollector();
    collector.begin('open');
    collector.clear();
    expect(collector.snapshot().spans).toEqual([]);
  });
});

describe('weather data quality', () => {
  const NOW = '2026-10-11T12:00:00Z';

  function observation(changes = {}) {
    return {
      observedAt: '2026-10-11T11:30:00Z',
      temperatureC: 28,
      humidityPercent: 65,
      windSpeedMps: 4,
      pressureHpa: 1012,
      precipitationProbability: 0.3,
      latencyMs: 200,
      ...changes,
    };
  }

  it('accepts complete current observations', () => {
    const result = evaluateObservationQuality(observation(), { now: NOW });
    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
  });

  it('rejects stale observations', () => {
    const result = evaluateObservationQuality(observation({ observedAt: '2026-10-11T08:00:00Z' }), { now: NOW });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('stale');
  });

  it('warns about future timestamps', () => {
    const result = evaluateObservationQuality(observation({ observedAt: '2026-10-11T13:00:00Z' }), { now: NOW });
    expect(result.issues.some((issue) => issue.code === 'future_timestamp')).toBe(true);
  });

  it('reports missing required fields', () => {
    const value = observation();
    delete value.pressureHpa;
    delete value.windSpeedMps;
    const result = evaluateObservationQuality(value, { now: NOW });
    expect(result.valid).toBe(false);
    expect(result.completeness).toBe(0.5);
  });

  it('rejects physically impossible values', () => {
    const result = evaluateObservationQuality(observation({ humidityPercent: 150 }), { now: NOW });
    expect(result.issues.some((issue) => issue.code === 'out_of_range' && issue.field === 'humidityPercent')).toBe(true);
  });

  it('detects sudden changes', () => {
    const result = evaluateObservationQuality(observation({ temperatureC: 45 }), {
      now: NOW,
      previous: observation({ temperatureC: 20 }),
    });
    expect(result.issues.some((issue) => issue.code === 'sudden_change')).toBe(true);
  });

  it('warns on excessive provider latency', () => {
    const result = evaluateObservationQuality(observation({ latencyMs: 7000 }), { now: NOW });
    expect(result.issues.some((issue) => issue.code === 'high_latency')).toBe(true);
  });

  it('summarizes provider samples', () => {
    const report = evaluateProviderQuality([observation(), observation({ humidityPercent: 101 })], { now: NOW });
    expect(report.sampleCount).toBe(2);
    expect(report.invalidCount).toBe(1);
    expect(report.issueCounts.out_of_range).toBe(1);
  });

  it('calculates latency percentiles', () => {
    const report = evaluateProviderQuality([observation({ latencyMs: 100 }), observation({ latencyMs: 300 })], { now: NOW });
    expect(report.latency.meanMs).toBe(200);
  });

  it('passes healthy quality gates', () => {
    const report = evaluateProviderQuality([observation(), observation()], { now: NOW });
    expect(qualityGate(report).passed).toBe(true);
  });

  it('fails quality gates with explicit reasons', () => {
    const report = evaluateProviderQuality([observation({ humidityPercent: 200 })], { now: NOW });
    const result = qualityGate(report);
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('ranks providers by valid ratio then score', () => {
    const first = { providerId: 'a', sampleCount: 10, validRatio: 0.9, averageScore: 90, latency: { p95Ms: 100 } };
    const second = { providerId: 'b', sampleCount: 10, validRatio: 1, averageScore: 80, latency: { p95Ms: 200 } };
    expect(compareProviderQuality([first, second]).map((entry) => entry.providerId)).toEqual(['b', 'a']);
  });
});
