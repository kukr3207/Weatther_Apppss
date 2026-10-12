import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  backupChecksum,
  createWorkspaceBackup,
  parseWorkspaceBackup,
  planBackupRestore,
  serializeWorkspaceBackup,
  validateWorkspaceBackup,
} from './backup';
import {
  csvDataUri,
  downloadFilename,
  incidentsToCsv,
  recordsToCsv,
  weatherPeriodsToCsv,
} from './csvExport';
import {
  compareOperationalReports,
  createOperationalWeatherReport,
  reportDigest,
} from './operationalReport';

const LOCATION = {
  id: 'blr',
  name: 'Bengaluru',
  country: 'IN',
  latitude: 12.9716,
  longitude: 77.5946,
  timezone: 'Asia/Kolkata',
};

const GENERATED_AT = '2026-10-11T12:00:00Z';

function input(changes = {}) {
  return {
    id: 'report-1',
    generatedAt: GENERATED_AT,
    location: LOCATION,
    currentConditions: { temperatureC: 28, condition: { description: 'Partly cloudy' } },
    forecast: [
      {
        forecastAt: '2026-10-11T13:00:00Z',
        temperatureC: 29,
        minimumC: 24,
        maximumC: 30,
        precipitationProbability: 0.3,
        precipitationMm: 0.5,
        windSpeedMps: 4,
        confidence: 80,
        condition: { description: 'Cloudy' },
      },
      {
        forecastAt: '2026-10-11T14:00:00Z',
        temperatureC: 30,
        minimumC: 25,
        maximumC: 31,
        precipitationProbability: 0.7,
        precipitationMm: 4,
        windSpeedMps: 8,
        confidence: 70,
        condition: { description: 'Rain' },
      },
    ],
    hazards: [{
      id: 'rain-1',
      title: 'Heavy rain',
      type: 'rain',
      severity: 'moderate',
      instruction: 'Allow extra travel time.',
      startsAt: '2026-10-11T13:00:00Z',
    }],
    recommendations: [
      { id: 'umbrella', text: 'Carry an umbrella.', category: 'travel', severity: 'minor' },
      { id: 'roads', text: 'Avoid flooded roads.', category: 'safety', severity: 'severe' },
    ],
    services: [
      { id: 'provider-a', status: 'healthy', latencyMs: 100, checkedAt: GENERATED_AT },
      { id: 'provider-b', status: 'degraded', latencyMs: 300, checkedAt: GENERATED_AT },
    ],
    ...changes,
  };
}

describe('operational weather reports', () => {
  it('creates a complete immutable report', () => {
    const report = createOperationalWeatherReport(input());
    expect(report.location.name).toBe('Bengaluru');
    expect(report.headline).toContain('Partly cloudy');
    expect(report.forecastSummary.periodCount).toBe(2);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it('summarizes forecast ranges', () => {
    const summary = createOperationalWeatherReport(input()).forecastSummary;
    expect(summary.minimumTemperatureC).toBe(24);
    expect(summary.maximumTemperatureC).toBe(31);
    expect(summary.totalPrecipitationMm).toBe(4.5);
    expect(summary.maximumWindMps).toBe(8);
  });

  it('sorts recommendations by operational priority', () => {
    const report = createOperationalWeatherReport(input());
    expect(report.recommendations[0].id).toBe('roads');
  });

  it('sorts hazards by severity', () => {
    const report = createOperationalWeatherReport(input({
      hazards: [
        { id: 'minor', title: 'Minor', severity: 'minor' },
        { id: 'extreme', title: 'Extreme', severity: 'extreme' },
      ],
    }));
    expect(report.hazards.map((hazard) => hazard.id)).toEqual(['extreme', 'minor']);
    expect(report.riskLevel).toBe('extreme');
  });

  it('uses severe hazards in the headline', () => {
    const report = createOperationalWeatherReport(input({
      hazards: [{ id: 'storm', title: 'Severe storm', severity: 'severe', instruction: 'Stay indoors.' }],
    }));
    expect(report.headline).toBe('Severe storm: Stay indoors.');
  });

  it('reports provider availability and latency', () => {
    const operations = createOperationalWeatherReport(input()).operations;
    expect(operations.availability).toBe(1);
    expect(operations.averageLatencyMs).toBe(200);
  });

  it('omits empty sections by default', () => {
    const report = createOperationalWeatherReport(input({ forecast: [], hazards: [], recommendations: [] }));
    expect(report.sections.some((section) => section.id === 'hazards')).toBe(false);
  });

  it('can include empty sections', () => {
    const report = createOperationalWeatherReport(input({ forecast: [], hazards: [] }), {
      includeEmptySections: true,
    });
    expect(report.sections.some((section) => section.id === 'hazards')).toBe(true);
  });

  it('compares hazard additions and removals', () => {
    const previous = createOperationalWeatherReport(input());
    const current = createOperationalWeatherReport(input({ hazards: [{ id: 'wind', title: 'Wind', severity: 'severe' }] }), {
      generatedAt: '2026-10-11T13:00:00Z',
    });
    const comparison = compareOperationalReports(previous, current);
    expect(comparison.addedHazards[0].id).toBe('wind');
    expect(comparison.clearedHazards[0].id).toBe('rain-1');
    expect(comparison.riskChanged).toBe(true);
  });

  it('compares temperature changes', () => {
    const previous = createOperationalWeatherReport(input());
    const current = createOperationalWeatherReport(input({
      currentConditions: { temperatureC: 31, condition: 'Clear' },
    }));
    expect(compareOperationalReports(previous, current).temperatureChangeC).toBe(3);
  });

  it('rejects comparisons across locations', () => {
    const previous = createOperationalWeatherReport(input());
    const current = createOperationalWeatherReport(input({ location: { ...LOCATION, id: 'del', name: 'Delhi' } }));
    expect(() => compareOperationalReports(previous, current)).toThrow('same location');
  });

  it('creates compact digests', () => {
    const digest = reportDigest(createOperationalWeatherReport(input()));
    expect(digest).toMatchObject({ id: 'report-1', hazardCount: 1, recommendationCount: 2 });
  });
});

describe('CSV exports', () => {
  it('writes headers and rows', () => {
    const csv = recordsToCsv([{ city: 'Bengaluru', temperature: 28 }]);
    expect(csv).toBe('city,temperature\nBengaluru,28\n');
  });

  it('quotes delimiters, quotes, and newlines', () => {
    const csv = recordsToCsv([{ note: 'Rain, "heavy"\nsoon' }]);
    expect(csv).toContain('"Rain, ""heavy""\nsoon"');
  });

  it('flattens nested values', () => {
    const csv = recordsToCsv([{ location: { name: 'Pune', coordinate: { latitude: 18.5 } } }]);
    expect(csv).toContain('location.name,location.coordinate.latitude');
    expect(csv).toContain('Pune,18.5');
  });

  it('can preserve requested column ordering', () => {
    const csv = recordsToCsv([{ second: 2, first: 1 }], { columns: ['first', 'second'] });
    expect(csv.startsWith('first,second')).toBe(true);
  });

  it('supports semicolon exports', () => {
    expect(recordsToCsv([{ a: 1, b: 2 }], { delimiter: ';' })).toBe('a;b\n1;2\n');
  });

  it('returns export metadata', () => {
    const result = recordsToCsv([{ a: 1 }, { a: 2 }], { withMetadata: true });
    expect(result.rowCount).toBe(2);
    expect(result.columns).toEqual(['a']);
  });

  it('exports weather periods with stable columns', () => {
    const csv = weatherPeriodsToCsv([{ forecastAt: GENERATED_AT, temperatureC: 28, rainMm: 2 }], {
      locationName: 'Bengaluru',
    });
    expect(csv).toContain('forecastAt,location');
    expect(csv).toContain('Bengaluru');
  });

  it('exports operational incidents', () => {
    const csv = incidentsToCsv([{ id: 'i-1', title: 'Provider down', status: 'open', labels: ['api', 'urgent'] }]);
    expect(csv).toContain('Provider down');
    expect(csv).toContain('api|urgent');
  });

  it('builds safe filenames', () => {
    expect(downloadFilename(' Bengaluru Forecast ', { date: GENERATED_AT })).toBe('bengaluru-forecast-2026-10-11.csv');
  });

  it('builds downloadable data URIs', () => {
    expect(csvDataUri('a,b\n1,2')).toMatch(/^data:text\/csv;charset=utf-8,/);
  });
});

describe('workspace backup', () => {
  function backup() {
    return createWorkspaceBackup({
      workspaceId: 'home',
      locale: 'en-IN',
      collections: [
        { name: 'saved-places', version: 2, records: [{ id: 'blr', name: 'Bengaluru' }] },
        { name: 'watches', version: 4, records: [{ id: 'watch-1', state: 'active' }] },
      ],
    }, { exportedAt: GENERATED_AT, applicationVersion: '2.0.0' });
  }

  it('creates a versioned manifest', () => {
    const result = backup();
    expect(result.manifest.format).toBe(BACKUP_FORMAT);
    expect(result.manifest.collectionCount).toBe(2);
    expect(result.manifest.recordCount).toBe(2);
  });

  it('orders collections consistently', () => {
    expect(backup().collections.map((collection) => collection.name)).toEqual(['saved-places', 'watches']);
  });

  it('produces stable checksums', () => {
    expect(backupChecksum({ b: 2, a: 1 })).toBe(backupChecksum({ a: 1, b: 2 }));
  });

  it('round-trips through JSON', () => {
    const parsed = parseWorkspaceBackup(serializeWorkspaceBackup(backup()));
    expect(parsed.collections[0].records[0].id).toBe('blr');
  });

  it('detects changed records', () => {
    const changed = JSON.parse(JSON.stringify(backup()));
    changed.collections[0].records[0].name = 'Changed';
    expect(validateWorkspaceBackup(changed).valid).toBe(false);
    expect(validateWorkspaceBackup(changed).errors.join(' ')).toContain('checksum');
  });

  it('detects manifest count changes', () => {
    const changed = JSON.parse(JSON.stringify(backup()));
    changed.manifest.recordCount = 3;
    expect(validateWorkspaceBackup(changed).valid).toBe(false);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseWorkspaceBackup('{broken')).toThrow('valid JSON');
  });

  it('plans merge restores', () => {
    const plan = planBackupRestore(backup(), { watches: 2 });
    expect(plan.mode).toBe('merge');
    expect(plan.recordsToProcess).toBe(2);
    expect(plan.operations.find((operation) => operation.collection === 'watches').exists).toBe(true);
  });

  it('identifies newer local collections as conflicts', () => {
    const plan = planBackupRestore(backup(), { watches: 10 });
    expect(plan.conflicts.map((conflict) => conflict.collection)).toEqual(['watches']);
  });

  it('can skip existing collections', () => {
    const plan = planBackupRestore(backup(), { watches: 2 }, { mode: 'skip_existing' });
    expect(plan.operations.find((operation) => operation.collection === 'watches').action).toBe('skip');
    expect(plan.recordsToProcess).toBe(1);
  });
});
