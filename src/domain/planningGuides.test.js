import { describe, expect, test } from 'vitest';
import { commuteAdvice, commuteOutlook } from './commuteRisk';
import { forecastConfidence } from './forecastConfidence';
import { buildPackingGuide, packingText } from './packingGuide';

function item(at, overrides = {}) {
  return {
    forecastAt: at,
    temperatureC: 20,
    minimumC: 16,
    maximumC: 23,
    humidityPercent: 55,
    precipitationProbability: 0.1,
    rainMm: 0,
    windSpeedMps: 4,
    condition: { iconCode: '01d', description: 'clear sky' },
    ...overrides,
  };
}

function forecast(items) {
  return { location: { timezoneOffsetSeconds: 0 }, items };
}

describe('travel and planning guides', () => {
  test('builds a packing list from wet, cold, and windy extremes', () => {
    const guide = buildPackingGuide(forecast([
      item('2024-03-15T12:00:00Z', { minimumC: -2, maximumC: 5, rainMm: 8, precipitationProbability: 0.9, windSpeedMps: 14 }),
    ]));
    expect(guide.items.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'umbrella', 'raincoat', 'heavy-coat', 'gloves', 'wind-layer', 'sturdy-shoes',
    ]));
  });

  test('adds particulate protection for poor air quality', () => {
    const guide = buildPackingGuide(forecast([item('2024-03-15T12:00:00Z')]), { index: 4 });
    expect(guide.items.some((entry) => entry.id === 'mask')).toBe(true);
  });

  test('formats packing guidance as portable text', () => {
    const text = packingText({ items: [{ name: 'Umbrella', reason: 'Rain.' }] }, 'London');
    expect(text).toContain('Weather packing list for London');
    expect(text).toContain('- Umbrella: Rain.');
  });

  test('marks thunder and heavy rain as high commute risk', () => {
    const result = commuteOutlook(forecast([item('2024-03-15T12:00:00Z', {
      precipitationProbability: 1,
      rainMm: 20,
      condition: { iconCode: '11d', description: 'thunderstorm' },
    })]));
    expect(result.highest.level).toBe('high');
    expect(result.highest.score).toBeGreaterThanOrEqual(70);
  });

  test('provides mode-aware travel advice', () => {
    const period = { score: 60, reasons: ['rain is likely', 'strong wind may slow travel'] };
    expect(commuteAdvice(period, 'cycling')).toEqual(expect.arrayContaining([
      expect.stringContaining('stopping distance'),
      expect.stringContaining('visible waterproof clothing'),
    ]));
  });

  test('reduces confidence farther into the forecast', () => {
    const items = Array.from({ length: 5 }, (_, index) => item(`2024-03-${15 + index}T12:00:00Z`));
    const result = forecastConfidence(forecast(items));
    expect(result.daily[0].score).toBeGreaterThan(result.daily.at(-1).score);
  });

  test('reports unavailable confidence without periods', () => {
    expect(forecastConfidence(forecast([]))).toMatchObject({ overall: null, level: 'unavailable' });
  });
});
