import { describe, expect, test } from 'vitest';
import {
  airQualityBand,
  airQualitySummary,
  airQualityTrend,
  dominantPollutant,
  healthAdvice,
  normalizePollutants,
  pollutantBand,
} from './airQuality';

describe('air-quality intelligence', () => {
  test('maps provider indexes to public bands', () => {
    expect(airQualityBand(1).label).toBe('Good');
    expect(airQualityBand(5).label).toBe('Very poor');
    expect(airQualityBand(9).key).toBe('unknown');
  });

  test('normalizes every supported pollutant', () => {
    const result = normalizePollutants({ pm2_5: 8, no2: -5, extra: 12 });
    expect(result.pm2_5).toBe(8);
    expect(result.no2).toBe(0);
    expect(result.extra).toBeUndefined();
    expect(result.pm10).toBeNull();
  });

  test('classifies fine and coarse particle readings', () => {
    expect(pollutantBand('pm2_5', 8).index).toBe(1);
    expect(pollutantBand('pm2_5', 80).index).toBe(5);
    expect(pollutantBand('pm10', 75).index).toBe(3);
  });

  test('finds the particle with the worse band', () => {
    const result = dominantPollutant({ pm2_5: 60, pm10: 30 });
    expect(result.key).toBe('pm2_5');
  });

  test('builds a summary with pollutant metadata', () => {
    const result = airQualitySummary({ index: 3, observedAt: '2024-01-01T00:00:00Z', components: { pm2_5: 30 } });
    expect(result.label).toBe('Moderate');
    expect(result.dominantPollutant.shortLabel).toBe('PM2.5');
  });

  test('adds more cautious advice for sensitive profiles', () => {
    const advice = healthAdvice({ index: 3, components: { pm2_5: 30 } }, { asthma: true });
    expect(advice.some((item) => item.includes('sensitivity'))).toBe(true);
  });

  test('describes improving and worsening trends', () => {
    expect(airQualityTrend([{ index: 2 }, { index: 4 }]).direction).toBe('worsening');
    expect(airQualityTrend([{ index: 4 }, { index: 1 }]).direction).toBe('improving');
    expect(airQualityTrend([{ index: 2 }]).direction).toBe('steady');
  });
});
