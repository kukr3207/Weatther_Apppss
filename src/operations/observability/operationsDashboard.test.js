import { describe, expect, it } from 'vitest';
import {
  buildOperationsDashboard,
  compareOperationsDashboards,
  dashboardUptimeBudget,
  estimateRequestCost,
  groupRequestsByProvider,
} from './operationsDashboard';

const NOW = '2026-10-11T12:00:00Z';
const requests = [
  { id: '1', providerId: 'a', operation: 'forecast', success: true, cached: true, latencyMs: 100, occurredAt: '2026-10-11T11:50:00Z' },
  { id: '2', providerId: 'a', operation: 'current', success: true, cached: false, latencyMs: 300, occurredAt: '2026-10-11T11:55:00Z' },
  { id: '3', providerId: 'b', operation: 'forecast', success: false, cached: false, latencyMs: 1000, occurredAt: '2026-10-11T11:56:00Z', errorCode: 'timeout' },
];

describe('operations dashboard', () => {
  it('summarizes services, requests, and incidents', () => {
    const dashboard = buildOperationsDashboard({
      services: [{ id: 'a', status: 'healthy', score: 95 }, { id: 'b', status: 'degraded', score: 70 }],
      requests,
      incidents: [{ id: 'i', title: 'Provider delay', state: 'open', severity: 'major' }],
    }, { generatedAt: NOW, objectives: { minimumSuccessRate: 0.5 } });
    expect(dashboard.status).toBe('degraded');
    expect(dashboard.requests.count).toBe(3);
    expect(dashboard.requests.failureCount).toBe(1);
    expect(dashboard.incidentSummary.open).toBe(1);
  });

  it('filters requests outside the dashboard window', () => {
    const dashboard = buildOperationsDashboard({ requests: [...requests, { ...requests[0], id: 'old', occurredAt: '2026-10-11T08:00:00Z' }] }, { generatedAt: NOW, windowMinutes: 60 });
    expect(dashboard.requests.count).toBe(3);
  });

  it('produces alerts for unhealthy services and major incidents', () => {
    const dashboard = buildOperationsDashboard({
      services: [{ id: 'a', name: 'Provider A', status: 'unavailable' }],
      incidents: [{ id: 'i', title: 'Outage', state: 'open', severity: 'critical' }],
    }, { generatedAt: NOW });
    expect(dashboard.alerts.map((alert) => alert.id)).toEqual(['service:a', 'incident:i']);
  });

  it('compares successive dashboards', () => {
    const previous = buildOperationsDashboard({ services: [{ id: 'a', status: 'healthy' }], requests: requests.slice(0, 2) }, { generatedAt: NOW });
    const current = buildOperationsDashboard({ services: [{ id: 'a', status: 'degraded' }], requests }, { generatedAt: NOW, objectives: { minimumSuccessRate: 0.5 } });
    const comparison = compareOperationsDashboards(previous, current);
    expect(comparison.statusChanged).toBe(true);
    expect(comparison.serviceChanges[0]).toMatchObject({ serviceId: 'a', from: 'healthy', to: 'degraded' });
  });

  it('tracks availability budget consumption', () => {
    const result = dashboardUptimeBudget([
      { status: 'healthy' }, { status: 'healthy' }, { status: 'unhealthy' },
    ], { intervalMinutes: 5, periodMinutes: 1000, errorBudgetPercent: 1 });
    expect(result.unavailableMinutes).toBe(5);
    expect(result.remainingBudgetMinutes).toBe(5);
  });

  it('groups request quality by provider', () => {
    const groups = groupRequestsByProvider(requests);
    expect(groups.a.count).toBe(2);
    expect(groups.a.operations).toEqual({ forecast: 1, current: 1 });
    expect(groups.b.errorCodes.timeout).toBe(1);
  });

  it('estimates provider request cost', () => {
    const result = estimateRequestCost(requests, {
      currency: 'USD', a: { forecast: 0.01, current: 0.005 }, b: { default: 0.02 },
    });
    expect(result.total).toBe(0.035);
    expect(result.byProvider).toEqual({ a: 0.015, b: 0.02 });
  });
});
