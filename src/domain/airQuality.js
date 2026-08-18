export const AIR_QUALITY_INDEX = Object.freeze([
  Object.freeze({
    index: 1,
    key: 'good',
    label: 'Good',
    color: '#4fc27d',
    summary: 'Air quality is satisfactory for most people.',
    guidance: 'Enjoy normal outdoor activities.',
  }),
  Object.freeze({
    index: 2,
    key: 'fair',
    label: 'Fair',
    color: '#b8cb53',
    summary: 'Air quality is acceptable, with a small risk for very sensitive people.',
    guidance: 'Sensitive people can consider shorter periods of strenuous activity.',
  }),
  Object.freeze({
    index: 3,
    key: 'moderate',
    label: 'Moderate',
    color: '#e7aa45',
    summary: 'Sensitive groups may notice health effects.',
    guidance: 'Children, older adults, and people with breathing conditions should reduce intense activity.',
  }),
  Object.freeze({
    index: 4,
    key: 'poor',
    label: 'Poor',
    color: '#e56d5c',
    summary: 'Air pollution can affect everyone, especially sensitive groups.',
    guidance: 'Reduce long or intense outdoor activity and keep windows closed near traffic.',
  }),
  Object.freeze({
    index: 5,
    key: 'very-poor',
    label: 'Very poor',
    color: '#9a5bc5',
    summary: 'Health effects are possible for everyone.',
    guidance: 'Avoid strenuous outdoor activity and follow local health advice.',
  }),
]);

export const POLLUTANTS = Object.freeze({
  co: Object.freeze({ key: 'co', label: 'Carbon monoxide', shortLabel: 'CO', unit: 'μg/m³' }),
  no: Object.freeze({ key: 'no', label: 'Nitric oxide', shortLabel: 'NO', unit: 'μg/m³' }),
  no2: Object.freeze({ key: 'no2', label: 'Nitrogen dioxide', shortLabel: 'NO₂', unit: 'μg/m³' }),
  o3: Object.freeze({ key: 'o3', label: 'Ozone', shortLabel: 'O₃', unit: 'μg/m³' }),
  so2: Object.freeze({ key: 'so2', label: 'Sulphur dioxide', shortLabel: 'SO₂', unit: 'μg/m³' }),
  pm2_5: Object.freeze({ key: 'pm2_5', label: 'Fine particles', shortLabel: 'PM2.5', unit: 'μg/m³' }),
  pm10: Object.freeze({ key: 'pm10', label: 'Coarse particles', shortLabel: 'PM10', unit: 'μg/m³' }),
  nh3: Object.freeze({ key: 'nh3', label: 'Ammonia', shortLabel: 'NH₃', unit: 'μg/m³' }),
});

const PARTICULATE_THRESHOLDS = Object.freeze({
  pm2_5: [10, 25, 50, 75],
  pm10: [20, 50, 100, 200],
});

export function airQualityBand(index) {
  const normalized = Number.isFinite(index) ? Math.round(index) : 0;
  return AIR_QUALITY_INDEX.find((band) => band.index === normalized) ?? {
    index: null,
    key: 'unknown',
    label: 'Unavailable',
    color: '#8a93aa',
    summary: 'Air-quality readings are not available.',
    guidance: 'Check a local air-quality authority if conditions look hazy or smoky.',
  };
}

export function pollutantBand(key, value) {
  if (!Number.isFinite(value)) return { index: null, label: 'Unavailable' };
  const thresholds = PARTICULATE_THRESHOLDS[key];
  if (!thresholds) return { index: null, label: 'Measured' };
  const index = thresholds.findIndex((threshold) => value <= threshold) + 1;
  const normalized = index === 0 ? 5 : index;
  return airQualityBand(normalized);
}

export function normalizePollutants(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.keys(POLLUTANTS).reduce((result, key) => {
    result[key] = Number.isFinite(source[key]) ? Math.max(0, source[key]) : null;
    return result;
  }, {});
}

export function dominantPollutant(components) {
  const normalized = normalizePollutants(components);
  const particleCandidates = ['pm2_5', 'pm10']
    .map((key) => ({ key, value: normalized[key], band: pollutantBand(key, normalized[key]) }))
    .filter((item) => Number.isFinite(item.value));
  if (particleCandidates.length) {
    return particleCandidates.sort((first, second) => (
      (second.band.index ?? 0) - (first.band.index ?? 0)
      || second.value - first.value
    ))[0];
  }

  return Object.entries(normalized)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => ({ key, value, band: pollutantBand(key, value) }))
    .sort((first, second) => second.value - first.value)[0] ?? null;
}

export function airQualitySummary(reading) {
  if (!reading) return null;
  const band = airQualityBand(reading.index);
  const dominant = dominantPollutant(reading.components);
  return {
    ...band,
    observedAt: reading.observedAt ?? null,
    dominantPollutant: dominant
      ? { ...POLLUTANTS[dominant.key], value: dominant.value, band: dominant.band }
      : null,
  };
}

export function healthAdvice(reading, profile = {}) {
  const summary = airQualitySummary(reading);
  if (!summary) return [];
  const advice = [summary.guidance];
  const sensitive = profile.asthma || profile.heartCondition || profile.child || profile.olderAdult;
  if (sensitive && summary.index >= 2) {
    advice.push('Because you marked a sensitivity, watch for symptoms and move activity indoors if needed.');
  }
  if (summary.dominantPollutant?.key === 'pm2_5' && summary.dominantPollutant.band.index >= 3) {
    advice.push('Fine particles are elevated; a well-fitted particulate mask can reduce exposure.');
  }
  if (summary.index >= 4) {
    advice.push('Use recirculated air in vehicles and avoid busy roads where practical.');
  }
  return advice;
}

export function airQualityTrend(readings) {
  const valid = (Array.isArray(readings) ? readings : [])
    .filter((reading) => Number.isFinite(reading?.index));
  if (valid.length < 2) return { direction: 'steady', change: 0 };
  const change = valid.at(-1).index - valid[0].index;
  return { direction: change > 0 ? 'worsening' : change < 0 ? 'improving' : 'steady', change };
}
