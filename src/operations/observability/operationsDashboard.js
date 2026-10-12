import { assertArray, assertFiniteNumber, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, minimum, quantile, sum } from '../core/statistics';

const STATUS_WEIGHT = Object.freeze({
  healthy: 0,
  operational: 0,
  degraded: 1,
  unhealthy: 2,
  unavailable: 3,
  unknown: 1,
});

function normalizeService(service, index) {
  return deepFreeze({
    id: String(service.id ?? service.name ?? `service-${index + 1}`),
    name: String(service.name ?? service.id ?? `Service ${index + 1}`),
    status: String(service.status ?? 'unknown').toLowerCase(),
    score: Number.isFinite(service.score) ? service.score : null,
    successRate: Number.isFinite(service.successRate) ? service.successRate : null,
    latencyMs: Number.isFinite(service.latencyMs ?? service.averageLatencyMs)
      ? service.latencyMs ?? service.averageLatencyMs
      : null,
    checkedAt: service.checkedAt ? new Date(parseTimestamp(service.checkedAt)).toISOString() : null,
    message: service.message ?? null,
  });
}

function normalizeIncident(incident, index) {
  return deepFreeze({
    id: String(incident.id ?? `incident-${index + 1}`),
    title: String(incident.title ?? 'Operational incident'),
    state: String(incident.state ?? 'open'),
    severity: String(incident.severity ?? 'moderate'),
    createdAt: incident.createdAt ? new Date(parseTimestamp(incident.createdAt)).toISOString() : null,
    updatedAt: incident.updatedAt ? new Date(parseTimestamp(incident.updatedAt)).toISOString() : null,
  });
}

function normalizeRequest(request, index) {
  return deepFreeze({
    id: String(request.id ?? `request-${index + 1}`),
    providerId: String(request.providerId ?? 'unknown'),
    operation: String(request.operation ?? 'unknown'),
    success: request.success !== false,
    cached: request.cached === true,
    latencyMs: Number.isFinite(request.latencyMs) ? request.latencyMs : null,
    occurredAt: new Date(parseTimestamp(request.occurredAt ?? request.startedAt, `Request ${index + 1} time`)).toISOString(),
    errorCode: request.errorCode ?? null,
  });
}

function requestSummary(requests) {
  const latencies = requests.map((request) => request.latencyMs).filter(Number.isFinite);
  const successes = requests.filter((request) => request.success).length;
  const cached = requests.filter((request) => request.cached).length;
  const errorCodes = {};
  requests.filter((request) => !request.success).forEach((request) => {
    const code = request.errorCode ?? 'unknown';
    errorCodes[code] = (errorCodes[code] ?? 0) + 1;
  });
  return deepFreeze({
    count: requests.length,
    successCount: successes,
    failureCount: requests.length - successes,
    successRate: requests.length ? round(successes / requests.length, 4) : null,
    cacheHitRate: requests.length ? round(cached / requests.length, 4) : null,
    latency: {
      minimumMs: round(minimum(latencies), 1),
      maximumMs: round(maximum(latencies), 1),
      meanMs: round(mean(latencies), 1),
      p50Ms: round(quantile(latencies, 0.5), 1),
      p95Ms: round(quantile(latencies, 0.95), 1),
      p99Ms: round(quantile(latencies, 0.99), 1),
    },
    errorCodes,
  });
}

export function buildOperationsDashboard(input, options = {}) {
  const generatedAt = new Date(parseTimestamp(options.generatedAt ?? Date.now())).toISOString();
  const windowMinutes = assertFiniteNumber(options.windowMinutes ?? 60, 'Dashboard window', { minimum: 1 });
  const windowStart = parseTimestamp(generatedAt) - windowMinutes * 60_000;
  const services = assertArray(input.services ?? [], 'Dashboard services').map(normalizeService)
    .sort((first, second) => (STATUS_WEIGHT[second.status] ?? 1) - (STATUS_WEIGHT[first.status] ?? 1));
  const requests = assertArray(input.requests ?? [], 'Dashboard requests').map(normalizeRequest)
    .filter((request) => parseTimestamp(request.occurredAt) >= windowStart && parseTimestamp(request.occurredAt) <= parseTimestamp(generatedAt));
  const incidents = assertArray(input.incidents ?? [], 'Dashboard incidents').map(normalizeIncident);
  const openIncidents = incidents.filter((incident) => !['resolved', 'closed'].includes(incident.state));
  const unhealthy = services.filter((service) => (STATUS_WEIGHT[service.status] ?? 1) >= 2);
  const degraded = services.filter((service) => service.status === 'degraded');
  const requestStats = requestSummary(requests);
  const objectives = evaluateServiceObjectives(requestStats, options.objectives);
  const overallStatus = unhealthy.length ? 'unhealthy'
    : degraded.length || !objectives.passed ? 'degraded'
      : services.length ? 'healthy' : 'unknown';
  return deepFreeze({
    generatedAt,
    window: { startsAt: new Date(windowStart).toISOString(), endsAt: generatedAt, minutes: windowMinutes },
    status: overallStatus,
    services,
    serviceSummary: {
      total: services.length,
      healthy: services.filter((service) => ['healthy', 'operational'].includes(service.status)).length,
      degraded: degraded.length,
      unhealthy: unhealthy.length,
      averageScore: round(mean(services.map((service) => service.score).filter(Number.isFinite)), 1),
    },
    requests: requestStats,
    incidents: openIncidents,
    incidentSummary: {
      open: openIncidents.length,
      critical: openIncidents.filter((incident) => incident.severity === 'critical').length,
      major: openIncidents.filter((incident) => incident.severity === 'major').length,
    },
    objectives,
    alerts: buildDashboardAlerts({ services, requestStats, openIncidents, objectives }),
  });
}

export function evaluateServiceObjectives(requestStats, inputObjectives = {}) {
  const objectives = {
    minimumSuccessRate: inputObjectives?.minimumSuccessRate ?? 0.99,
    maximumP95LatencyMs: inputObjectives?.maximumP95LatencyMs ?? 2000,
    minimumCacheHitRate: inputObjectives?.minimumCacheHitRate ?? 0,
  };
  const evaluations = [
    {
      id: 'success_rate',
      target: objectives.minimumSuccessRate,
      actual: requestStats.successRate,
      passed: requestStats.successRate === null || requestStats.successRate >= objectives.minimumSuccessRate,
    },
    {
      id: 'p95_latency',
      target: objectives.maximumP95LatencyMs,
      actual: requestStats.latency.p95Ms,
      passed: requestStats.latency.p95Ms === null || requestStats.latency.p95Ms <= objectives.maximumP95LatencyMs,
    },
    {
      id: 'cache_hit_rate',
      target: objectives.minimumCacheHitRate,
      actual: requestStats.cacheHitRate,
      passed: requestStats.cacheHitRate === null || requestStats.cacheHitRate >= objectives.minimumCacheHitRate,
    },
  ];
  return deepFreeze({ passed: evaluations.every((evaluation) => evaluation.passed), evaluations });
}

function buildDashboardAlerts({ services, requestStats, openIncidents, objectives }) {
  const alerts = [];
  services.filter((service) => ['unhealthy', 'unavailable'].includes(service.status)).forEach((service) => {
    alerts.push({ id: `service:${service.id}`, severity: 'critical', message: `${service.name} is ${service.status}.` });
  });
  services.filter((service) => service.status === 'degraded').forEach((service) => {
    alerts.push({ id: `service:${service.id}`, severity: 'warning', message: `${service.name} is degraded.` });
  });
  objectives.evaluations.filter((evaluation) => !evaluation.passed).forEach((evaluation) => {
    alerts.push({ id: `objective:${evaluation.id}`, severity: 'warning', message: `${evaluation.id.replaceAll('_', ' ')} missed its target.` });
  });
  openIncidents.filter((incident) => ['critical', 'major'].includes(incident.severity)).forEach((incident) => {
    alerts.push({ id: `incident:${incident.id}`, severity: incident.severity === 'critical' ? 'critical' : 'warning', message: incident.title });
  });
  if (requestStats.failureCount > 0 && !alerts.some((alert) => alert.id === 'objective:success_rate')) {
    alerts.push({ id: 'requests:failures', severity: 'information', message: `${requestStats.failureCount} requests failed in the dashboard window.` });
  }
  return deepFreeze(alerts);
}

export function compareOperationsDashboards(previous, current) {
  const previousServices = new Map((previous.services ?? []).map((service) => [service.id, service]));
  const serviceChanges = (current.services ?? []).filter((service) => previousServices.get(service.id)?.status !== service.status).map((service) => ({
    serviceId: service.id,
    name: service.name,
    from: previousServices.get(service.id)?.status ?? null,
    to: service.status,
  }));
  return deepFreeze({
    from: previous.generatedAt,
    to: current.generatedAt,
    statusChanged: previous.status !== current.status,
    serviceChanges,
    requestCountChange: (current.requests?.count ?? 0) - (previous.requests?.count ?? 0),
    successRateChange: Number.isFinite(previous.requests?.successRate) && Number.isFinite(current.requests?.successRate)
      ? round(current.requests.successRate - previous.requests.successRate, 4)
      : null,
    latencyChangeMs: Number.isFinite(previous.requests?.latency?.p95Ms) && Number.isFinite(current.requests?.latency?.p95Ms)
      ? round(current.requests.latency.p95Ms - previous.requests.latency.p95Ms, 1)
      : null,
    incidentCountChange: (current.incidentSummary?.open ?? 0) - (previous.incidentSummary?.open ?? 0),
  });
}

export function dashboardUptimeBudget(dashboards, options = {}) {
  const intervalMinutes = options.intervalMinutes ?? 5;
  const values = assertArray(dashboards, 'Operations dashboards', { nonEmpty: true });
  const healthy = values.filter((dashboard) => dashboard.status === 'healthy').length;
  const degraded = values.filter((dashboard) => dashboard.status === 'degraded').length;
  const unavailable = values.length - healthy - degraded;
  const allowedUnavailableMinutes = (options.errorBudgetPercent ?? 0.1) / 100 * (options.periodMinutes ?? 43_200);
  const consumedMinutes = unavailable * intervalMinutes;
  return deepFreeze({
    sampleCount: values.length,
    healthyMinutes: healthy * intervalMinutes,
    degradedMinutes: degraded * intervalMinutes,
    unavailableMinutes: consumedMinutes,
    measuredAvailability: round(healthy / values.length, 6),
    allowedUnavailableMinutes: round(allowedUnavailableMinutes, 2),
    remainingBudgetMinutes: round(Math.max(0, allowedUnavailableMinutes - consumedMinutes), 2),
    consumedPercent: allowedUnavailableMinutes > 0 ? round(consumedMinutes / allowedUnavailableMinutes * 100, 1) : null,
    exhausted: consumedMinutes > allowedUnavailableMinutes,
  });
}

export function groupRequestsByProvider(requests) {
  const groups = {};
  assertArray(requests, 'Requests').map(normalizeRequest).forEach((request) => {
    if (!groups[request.providerId]) groups[request.providerId] = [];
    groups[request.providerId].push(request);
  });
  return deepFreeze(Object.fromEntries(Object.entries(groups).map(([providerId, values]) => [providerId, {
    providerId,
    ...requestSummary(values),
    operations: Object.fromEntries([...new Set(values.map((value) => value.operation))].map((operation) => [
      operation,
      values.filter((value) => value.operation === operation).length,
    ])),
  }])));
}

export function estimateRequestCost(requests, priceTable = {}) {
  const costs = assertArray(requests, 'Requests').map(normalizeRequest).map((request) => {
    const providerPrices = priceTable[request.providerId] ?? {};
    const unitCost = providerPrices[request.operation] ?? providerPrices.default ?? 0;
    return { ...request, unitCost, cost: unitCost };
  });
  return deepFreeze({
    currency: priceTable.currency ?? 'USD',
    requestCount: costs.length,
    total: round(sum(costs.map((request) => request.cost)), 6),
    byProvider: Object.fromEntries([...new Set(costs.map((request) => request.providerId))].map((providerId) => [
      providerId,
      round(sum(costs.filter((request) => request.providerId === providerId).map((request) => request.cost)), 6),
    ])),
  });
}
