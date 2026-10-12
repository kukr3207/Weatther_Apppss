import { describe, expect, it } from 'vitest';
import { commandGroups, createWeatherCommands, searchCommands } from './commandPalette';
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedTime,
  formatMeasurement,
  localeProfile,
  localizedWorkspaceSettings,
  resolveLocale,
  supportedLocales,
  translateWeather,
} from './localization';
import { applySearchBoosts, createRecentSearchBoost, groupSuggestions, rankLocationSuggestions } from './locationSearch';
import {
  insertSavedPlace,
  moveSavedPlace,
  orderSavedPlaces,
  reconcilePlaceOrder,
  removeSavedPlace,
} from './placeOrdering';
import {
  applyWorkspaceMutations,
  compactMutationLog,
  createWorkspaceMutation,
  reconcileWorkspaceMutations,
  syncCursor,
} from './sync';

const LOCATIONS = [
  { id: 'blr', name: 'Bengaluru', state: 'Karnataka', country: 'IN', latitude: 12.9716, longitude: 77.5946, population: 13_000_000, aliases: ['Bangalore'] },
  { id: 'hyd', name: 'Hyderabad', state: 'Telangana', country: 'IN', latitude: 17.385, longitude: 78.4867, population: 10_000_000 },
  { id: 'ber', name: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.405, population: 3_600_000 },
];

describe('location search', () => {
  it('ranks exact names ahead of fuzzy matches', () => {
    const results = rankLocationSuggestions('Bengaluru', LOCATIONS);
    expect(results[0].location.id).toBe('blr');
    expect(results[0].reasons).toContain('exact_name');
  });

  it('matches aliases and diacritic-normalized names', () => {
    expect(rankLocationSuggestions('Bangalore', LOCATIONS)[0].location.id).toBe('blr');
    const results = rankLocationSuggestions('Sao', [
      { id: 'sao', name: 'São Paulo', country: 'BR', latitude: -23.55, longitude: -46.63 },
    ]);
    expect(results[0].location.id).toBe('sao');
  });

  it('supports fuzzy misspellings', () => {
    expect(rankLocationSuggestions('Bengalru', LOCATIONS)[0].location.id).toBe('blr');
  });

  it('uses country preferences', () => {
    const locations = [
      { id: 'springfield-us', name: 'Springfield', country: 'US', latitude: 39.8, longitude: -89.6 },
      { id: 'springfield-ca', name: 'Springfield', country: 'CA', latitude: 45, longitude: -63 },
    ];
    expect(rankLocationSuggestions('Springfield', locations, { country: 'CA' })[0].location.id).toBe('springfield-ca');
  });

  it('adds proximity signals', () => {
    const results = rankLocationSuggestions('b', LOCATIONS, { near: LOCATIONS[0], minimumScore: 0 });
    expect(results.find((entry) => entry.location.id === 'blr').distanceKm).toBe(0);
  });

  it('groups suggestions by country', () => {
    const groups = groupSuggestions(rankLocationSuggestions('e', LOCATIONS, { minimumScore: 0 }));
    expect(groups.map((group) => group.country)).toEqual(['DE', 'IN']);
  });

  it('boosts recently used locations', () => {
    const suggestions = rankLocationSuggestions('ber', LOCATIONS, { minimumScore: 0 });
    const boosts = createRecentSearchBoost([{ id: 'ber', searchedAt: '2026-10-11T00:00:00Z' }], '2026-10-11T00:00:00Z');
    const boosted = applySearchBoosts(suggestions, boosts);
    expect(boosted.find((entry) => entry.location.id === 'ber').recentBoost).toBe(1);
  });
});

describe('saved place ordering', () => {
  const places = [
    { id: 'blr', name: 'Bengaluru', country: 'IN', position: 1, favorite: true, riskScore: 20, updatedAt: '2026-10-10T00:00:00Z' },
    { id: 'del', name: 'Delhi', country: 'IN', position: 0, favorite: false, riskScore: 80, updatedAt: '2026-10-11T00:00:00Z' },
    { id: 'ber', name: 'Berlin', country: 'DE', position: 2, favorite: false, riskScore: null },
  ];

  it('sorts manual positions', () => {
    expect(orderSavedPlaces(places).map((place) => place.id)).toEqual(['del', 'blr', 'ber']);
  });

  it('sorts names, countries, recency, favorites, and risk', () => {
    expect(orderSavedPlaces(places, { mode: 'name' }).map((place) => place.id)).toEqual(['blr', 'ber', 'del']);
    expect(orderSavedPlaces(places, { mode: 'country' })[0].id).toBe('ber');
    expect(orderSavedPlaces(places, { mode: 'recent' })[0].id).toBe('del');
    expect(orderSavedPlaces(places, { mode: 'favorite' })[0].id).toBe('blr');
    expect(orderSavedPlaces(places, { mode: 'risk' })[0].id).toBe('del');
  });

  it('moves places and rewrites positions', () => {
    expect(moveSavedPlace(places, 'ber', 0).map((place) => [place.id, place.position]))
      .toEqual([['ber', 0], ['del', 1], ['blr', 2]]);
  });

  it('inserts and removes places', () => {
    const inserted = insertSavedPlace(places, { id: 'mum', name: 'Mumbai' }, 1);
    expect(inserted[1].id).toBe('mum');
    expect(removeSavedPlace(inserted, 'del').some((place) => place.id === 'del')).toBe(false);
  });

  it('rejects duplicate insertions', () => {
    expect(() => insertSavedPlace(places, { id: 'blr', name: 'Duplicate' })).toThrow('already exists');
  });

  it('uses the newest place during reconciliation', () => {
    const result = reconcilePlaceOrder(
      [{ id: 'blr', name: 'Local', updatedAt: '2026-10-10T00:00:00Z' }],
      [{ id: 'blr', name: 'Remote', updatedAt: '2026-10-11T00:00:00Z' }],
    );
    expect(result[0].name).toBe('Remote');
  });
});

describe('workspace synchronization', () => {
  function mutation(id, changes = {}) {
    return createWorkspaceMutation({
      id,
      entityType: 'places',
      entityId: 'blr',
      operation: 'upsert',
      value: { name: 'Bengaluru' },
      deviceId: 'phone',
      ...changes,
    }, { changedAt: changes.changedAt ?? '2026-10-11T12:00:00Z', revision: changes.revision ?? 1 });
  }

  it('creates deterministic mutation metadata', () => {
    const result = createWorkspaceMutation({
      entityType: 'places', entityId: 'blr', operation: 'upsert', value: { name: 'Bengaluru' }, deviceId: 'phone',
    }, { changedAt: '2026-10-11T12:00:00Z', revision: 2 });
    expect(result.id).toContain('places:blr');
    expect(result.revision).toBe(2);
  });

  it('deduplicates shared mutation ids', () => {
    const shared = mutation('same');
    const result = reconcileWorkspaceMutations([shared], [shared]);
    expect(result.merged).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });

  it('uses higher revisions', () => {
    const result = reconcileWorkspaceMutations(
      [mutation('local', { revision: 1, value: { name: 'Local' } })],
      [mutation('remote', { revision: 2, value: { name: 'Remote' }, deviceId: 'laptop' })],
    );
    expect(result.merged[0].value.name).toBe('Remote');
  });

  it('reports simultaneous conflicts', () => {
    const local = mutation('local', { value: { name: 'Local' } });
    const remote = mutation('remote', { value: { name: 'Remote' }, deviceId: 'laptop' });
    expect(reconcileWorkspaceMutations([local], [remote]).conflictCount).toBe(1);
  });

  it('supports explicit conflict preference', () => {
    const local = mutation('local', { value: { name: 'Local' } });
    const remote = mutation('remote', { value: { name: 'Remote' }, deviceId: 'laptop' });
    expect(reconcileWorkspaceMutations([local], [remote], { strategy: 'prefer_local' }).merged[0].value.name).toBe('Local');
  });

  it('applies upserts and deletes to snapshots', () => {
    const result = applyWorkspaceMutations({ places: { old: { name: 'Old' } } }, [
      mutation('insert'),
      mutation('delete', { entityId: 'old', operation: 'delete', value: null, revision: 2 }),
    ]);
    expect(result.places.blr.name).toBe('Bengaluru');
    expect(result.places.old).toBeUndefined();
  });

  it('compacts older mutations per entity', () => {
    const mutations = [
      mutation('one', { revision: 1, changedAt: '2026-10-10T10:00:00Z' }),
      mutation('two', { revision: 2, changedAt: '2026-10-10T11:00:00Z', value: { name: 'New' } }),
    ];
    expect(compactMutationLog(mutations)).toHaveLength(1);
    expect(compactMutationLog(mutations)[0].id).toBe('two');
  });

  it('creates a latest mutation cursor', () => {
    expect(syncCursor([
      mutation('one', { changedAt: '2026-10-10T10:00:00Z' }),
      mutation('two', { changedAt: '2026-10-10T11:00:00Z' }),
    ])).toContain('2026-10-10T11:00:00.000Z|two');
  });
});

describe('localization and commands', () => {
  it('resolves supported locales and fallbacks', () => {
    expect(resolveLocale(['fr-CA', 'en-US'])).toBe('fr-FR');
    expect(supportedLocales().some((locale) => locale.locale === 'en-US')).toBe(true);
  });

  it('exposes locale defaults', () => {
    expect(localeProfile('en-IN')).toMatchObject({ locale: 'en-US', unitSystem: 'imperial' });
  });

  it('translates weather keys with replacements', () => {
    expect(translateWeather('weather.updated', 'en-US', { time: '12:00' })).toContain('12:00');
  });

  it('formats numbers, dates, times, and measurements', () => {
    expect(formatLocalizedNumber(1234.5, 'en-US')).toContain('1,234');
    expect(formatLocalizedDate('2026-10-11T12:00:00Z', 'en-US', { timeZone: 'UTC' })).toBeTruthy();
    expect(formatLocalizedTime('2026-10-11T12:00:00Z', 'en-US', { timeZone: 'UTC' })).toBeTruthy();
    expect(formatMeasurement(20, 'temperature', 'en-US', 'metric')).toContain('20');
  });

  it('normalizes workspace localization settings', () => {
    expect(localizedWorkspaceSettings({ locale: 'de-DE' })).toMatchObject({ locale: 'de-DE', unitSystem: 'metric' });
  });

  it('searches command labels and keywords', () => {
    const commands = [
      { id: 'forecast', label: 'Open forecast', keywords: ['weather', 'outlook'], group: 'Navigation' },
      { id: 'settings', label: 'Open settings', keywords: ['preferences'], group: 'Navigation' },
    ];
    expect(searchCommands('outlook', commands)[0].command.id).toBe('forecast');
    expect(commandGroups(searchCommands('open', commands))[0].items).toHaveLength(2);
  });

  it('builds contextual weather commands', () => {
    const commands = createWeatherCommands({ openTab: () => {} }, { activeLocation: { name: 'Bengaluru' } });
    expect(commands.length).toBeGreaterThan(5);
    expect(commands.some((command) => `${command.title} ${command.subtitle}`.includes('Bengaluru'))).toBe(true);
  });
});
