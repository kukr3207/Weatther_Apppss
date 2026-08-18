import { describe, expect, test } from 'vitest';
import {
  formatForecastTime,
  formatLocationTime,
  formatPercent,
  formatPressure,
  formatVisibility,
  windDirection,
} from './formatters';

describe('weather display formatters', () => {
  test('formats time in the location offset instead of the browser zone', () => {
    expect(formatLocationTime('2024-03-15T12:00:00.000Z', 7200, 'en-GB')).toContain('14:00');
    expect(formatForecastTime('2024-03-15T12:00:00.000Z', -18_000, 'en-US')).toContain('7');
  });

  test('handles invalid time values', () => {
    expect(formatLocationTime('not-a-date')).toBe('Time unavailable');
    expect(formatForecastTime('not-a-date')).toBe('—');
  });

  test('formats visibility for both unit systems', () => {
    expect(formatVisibility(10_000, 'metric')).toBe('10.0 km');
    expect(formatVisibility(1609.344, 'imperial')).toBe('1.0 mi');
  });

  test('formats scalar weather metrics', () => {
    expect(formatPressure(1013.6)).toBe('1014 hPa');
    expect(formatPercent(63.7)).toBe('64%');
    expect(formatPercent(null)).toBe('—');
  });

  test.each([
    [0, 'N'], [45, 'NE'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N'], [-45, 'NW'],
  ])('maps %s degrees to %s', (degrees, direction) => {
    expect(windDirection(degrees)).toBe(direction);
  });
});
