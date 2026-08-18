import { describe, expect, test } from 'vitest';
import { WeatherServiceError } from '../errors';
import { mapLocations } from './locations';

describe('location mapper', () => {
  test('creates stable location options', () => {
    expect(mapLocations([
      { name: 'Springfield', state: 'Illinois', country: 'US', lat: 39.78, lon: -89.64 },
      { name: 'Paris', country: 'FR', lat: 48.86, lon: 2.35 },
    ])).toEqual([
      {
        id: '39.78,-89.64',
        name: 'Springfield',
        state: 'Illinois',
        country: 'US',
        latitude: 39.78,
        longitude: -89.64,
        label: 'Springfield, Illinois, US',
      },
      {
        id: '48.86,2.35',
        name: 'Paris',
        state: null,
        country: 'FR',
        latitude: 48.86,
        longitude: 2.35,
        label: 'Paris, FR',
      },
    ]);
  });

  test('supports an empty result set', () => {
    expect(mapLocations([])).toEqual([]);
  });

  test('rejects malformed results', () => {
    expect(() => mapLocations({})).toThrow(WeatherServiceError);
    expect(() => mapLocations([{ name: 'Nowhere', country: 'XX' }])).toThrow(WeatherServiceError);
  });
});
