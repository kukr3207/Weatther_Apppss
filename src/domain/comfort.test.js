import { describe, expect, test } from 'vitest';
import {
  apparentTemperatureC,
  calculateDewPointC,
  calculateHeatIndexC,
  calculateHumidex,
  calculateWindChillC,
  comfortSummary,
  dewPointComfort,
  humidityComfort,
} from './comfort';

describe('comfort calculations', () => {
  test('calculates a realistic dew point', () => {
    expect(calculateDewPointC(25, 60)).toBeCloseTo(16.7, 1);
  });

  test('returns null for incomplete dew-point input', () => {
    expect(calculateDewPointC(25, null)).toBeNull();
  });

  test('calculates heat index only for hot humid weather', () => {
    expect(calculateHeatIndexC(32, 70)).toBeGreaterThan(38);
    expect(calculateHeatIndexC(20, 70)).toBe(20);
  });

  test('calculates wind chill for cold windy weather', () => {
    expect(calculateWindChillC(-5, 10)).toBeLessThan(-10);
    expect(calculateWindChillC(15, 10)).toBe(15);
  });

  test('calculates humidex from temperature and humidity', () => {
    expect(calculateHumidex(30, 70)).toBeGreaterThan(39);
  });

  test('chooses heat index, wind chill, or provider feels-like by conditions', () => {
    expect(apparentTemperatureC({ temperatureC: 32, humidityPercent: 70, wind: { speedMps: 2 } })).toBeGreaterThan(38);
    expect(apparentTemperatureC({ temperatureC: -5, humidityPercent: 60, wind: { speedMps: 10 } })).toBeLessThan(-10);
    expect(apparentTemperatureC({ temperatureC: 18, feelsLikeC: 17, humidityPercent: 60, wind: { speedMps: 3 } })).toBe(17);
  });

  test('classifies humidity and dew-point comfort', () => {
    expect(humidityComfort(50).level).toBe('comfortable');
    expect(humidityComfort(85).level).toBe('oppressive');
    expect(dewPointComfort(8).level).toBe('dry');
    expect(dewPointComfort(25).level).toBe('oppressive');
  });

  test('builds a complete comfort summary', () => {
    const result = comfortSummary({ temperatureC: 24, feelsLikeC: 24, humidityPercent: 55, wind: { speedMps: 3 } });
    expect(result.dewPointC).toBeTypeOf('number');
    expect(result.summary).toContain('Comfortable');
  });
});
