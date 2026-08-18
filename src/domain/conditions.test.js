import { describe, expect, test } from 'vitest';
import { conditionForIcon, conditionLabel, isNightIcon } from './conditions';

describe('weather condition catalog', () => {
  test.each([
    ['01d', 'clear'],
    ['04n', 'overcast'],
    ['10d', 'rain'],
    ['13n', 'snow'],
    ['50d', 'mist'],
  ])('maps %s to %s', (iconCode, key) => {
    expect(conditionForIcon(iconCode).key).toBe(key);
  });

  test('uses a stable fallback for unknown codes', () => {
    expect(conditionForIcon('99d')).toEqual({
      key: 'unknown',
      label: 'Conditions unavailable',
      icon: 'cloud',
    });
  });

  test('prefers the service description for the display label', () => {
    expect(conditionLabel('10d', 'light rain')).toBe('Light rain');
    expect(conditionLabel('01d', '')).toBe('Clear sky');
  });

  test('recognizes night icon variants', () => {
    expect(isNightIcon('01n')).toBe(true);
    expect(isNightIcon('01d')).toBe(false);
  });
});
