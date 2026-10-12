import { describe, expect, it } from 'vitest';
import { createOperationalWeatherReport } from './operationalReport';
import { incidentPostmortemToMarkdown, markdownReportMetadata, operationalReportToMarkdown } from './markdownReport';

describe('Markdown operations exports', () => {
  const report = createOperationalWeatherReport({
    generatedAt: '2026-10-11T12:00:00Z',
    location: { id: 'blr', name: 'Bengaluru', country: 'IN', latitude: 12.97, longitude: 77.59 },
    currentConditions: { temperatureC: 28, humidityPercent: 60, condition: { description: 'Cloudy' } },
    forecast: [{ forecastAt: '2026-10-11T13:00:00Z', temperatureC: 29, windSpeedMps: 4, precipitationProbability: 0.5, condition: 'Rain' }],
    hazards: [{ id: 'rain', title: 'Heavy rain', severity: 'moderate', startsAt: '2026-10-11T13:00:00Z', instruction: 'Allow extra time.' }],
    recommendations: ['Carry an umbrella.'],
    services: [{ id: 'primary', name: 'Primary', status: 'healthy', latencyMs: 100, checkedAt: '2026-10-11T12:00:00Z' }],
  });

  it('exports a readable report with tables and guidance', () => {
    const markdown = operationalReportToMarkdown(report, { timezone: 'UTC' });
    expect(markdown).toContain('# Weather operations report — Bengaluru');
    expect(markdown).toContain('## Hazards');
    expect(markdown).toContain('| Time | Conditions | Temperature');
    expect(markdown).toContain('Carry an umbrella');
  });

  it('escapes Markdown control characters', () => {
    const changed = { ...report, headline: 'Rain *and* [wind] | expected' };
    expect(operationalReportToMarkdown(changed)).toContain('Rain \\*and\\* \\[wind\\] \\| expected');
  });

  it('can omit the safety footer', () => {
    expect(operationalReportToMarkdown(report, { footer: false })).not.toContain('Forecasts contain uncertainty');
  });

  it('exports incident timelines and actions', () => {
    const markdown = incidentPostmortemToMarkdown({
      id: 'incident-1', title: 'Provider outage', state: 'resolved', severity: 'major',
      commander: { id: 'lead', name: 'Lead' }, createdAt: '2026-10-11T10:00:00Z', resolvedAt: '2026-10-11T11:00:00Z',
      timeline: [{ at: '2026-10-11T10:05:00Z', message: 'Fallback enabled.', author: { id: 'lead', name: 'Lead' } }],
      actions: [{ title: 'Check provider', owner: { name: 'Analyst' }, state: 'completed', dueAt: '2026-10-11T10:30:00Z', completedAt: '2026-10-11T10:20:00Z' }],
    }, { lessons: ['Add a second provider.'] });
    expect(markdown).toContain('Fallback enabled');
    expect(markdown).toContain('Add a second provider');
  });

  it('summarizes Markdown structure', () => {
    const metadata = markdownReportMetadata(operationalReportToMarkdown(report));
    expect(metadata.wordCount).toBeGreaterThan(20);
    expect(metadata.headingCount).toBeGreaterThan(3);
    expect(metadata.tableCount).toBeGreaterThan(1);
  });
});
