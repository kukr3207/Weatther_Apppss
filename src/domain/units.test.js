import { describe, expect, test } from 'vitest';
import {
  convertTemperature,
  convertWindSpeed,
  formatTemperature,
  formatWindSpeed,
  normalizeUnitSystem,
} from './units';

describe('weather units', () => {
  test('converts temperatures from the canonical Celsius value', () => {
    expect(convertTemperature(0, 'metric')).toBe(0);
    expect(convertTemperature(0, 'imperial')).toBe(32);
    expect(convertTemperature(20, 'imperial')).toBe(68);
  });

  test('converts wind speed to miles per hour', () => {
    expect(convertWindSpeed(10, 'imperial')).toBeCloseTo(22.36936);
  });

  test('formats values and handles missing readings', () => {
    expect(formatTemperature(17.6, 'metric')).toBe('18°C');
    expect(formatTemperature(17.6, 'imperial')).toBe('64°F');
    expect(formatWindSpeed(3.26, 'metric')).toBe('3.3 m/s');
    expect(formatWindSpeed(Number.NaN, 'metric')).toBe('—');
  });

  test('falls back to metric for unknown settings', () => {
    expect(normalizeUnitSystem('kelvin')).toBe('metric');
  });
});
