import { describe, expect, test } from 'vitest';
import { createDashboardRepository } from './dashboardRepository';
import { createLocationNotesRepository } from './locationNotesRepository';
import { createSnapshotRepository } from './snapshotRepository';

function memoryStore() {
  const data = {};
  return {
    get(key, fallback) { return key in data ? data[key] : fallback; },
    set(key, value) { data[key] = value; return true; },
    remove(key) { delete data[key]; return true; },
  };
}

const location = { id: '1,2', name: 'Test City', country: 'TC', latitude: 1, longitude: 2 };

describe('workspace repositories', () => {
  test('creates, renames, and removes saved dashboards', () => {
    const repository = createDashboardRepository(memoryStore(), { now: () => new Date('2024-03-15T12:00:00Z') });
    const dashboard = repository.create(' Travel ', [location]);
    expect(dashboard.name).toBe('Travel');
    expect(dashboard.locations).toHaveLength(1);
    expect(repository.rename(dashboard.id, 'Work').name).toBe('Work');
    expect(repository.remove(dashboard.id)).toEqual([]);
  });

  test('prevents duplicate dashboard names', () => {
    const repository = createDashboardRepository(memoryStore());
    repository.create('Travel');
    expect(() => repository.create(' travel ')).toThrow('already exists');
  });

  test('adds and removes dashboard locations', () => {
    const repository = createDashboardRepository(memoryStore());
    const dashboard = repository.create('Places');
    expect(repository.addLocation(dashboard.id, location).locations).toHaveLength(1);
    expect(repository.removeLocation(dashboard.id, location.id).locations).toHaveLength(0);
  });

  test('saves one trimmed note per location', () => {
    const repository = createLocationNotesRepository(memoryStore(), { now: () => new Date('2024-03-15T12:00:00Z') });
    repository.save(location.id, '  Pack   a jacket.  ');
    expect(repository.get(location.id).text).toBe('Pack a jacket.');
    repository.save(location.id, 'Updated');
    expect(repository.list()).toHaveLength(1);
    expect(repository.remove(location.id)).toEqual([]);
  });

  test('records normalized current-weather snapshots', () => {
    const repository = createSnapshotRepository(memoryStore(), { now: () => new Date('2024-03-15T12:00:00Z') });
    const snapshot = repository.record({
      location,
      temperatureC: 21,
      feelsLikeC: 20,
      humidityPercent: 60,
      pressureHpa: 1012,
      visibilityMeters: 10_000,
      wind: { speedMps: 4 },
      condition: { description: 'cloudy' },
    }, { index: 2 });
    expect(snapshot).toMatchObject({ temperatureC: 21, airQualityIndex: 2, condition: 'cloudy' });
    expect(repository.latest(location.id).id).toBe(snapshot.id);
  });

  test('replaces imported dashboard and note collections', () => {
    const dashboards = createDashboardRepository(memoryStore());
    const notes = createLocationNotesRepository(memoryStore());
    expect(dashboards.replace([{ id: 'd1', name: 'Imported', locations: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }])).toHaveLength(1);
    expect(notes.replace([{ locationId: '1,2', text: 'Imported note', updatedAt: '2024-01-01T00:00:00Z' }])).toHaveLength(1);
  });
});
