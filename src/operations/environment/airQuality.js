import { assertArray, assertObject, clamp, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, minimum, sum } from '../core/statistics';
import { sortByTime } from '../core/timeSeries';

const POLLUTANT_BREAKPOINTS = Object.freeze({
  pm2_5: [
    [0, 12, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500],
  ],
  pm10: [
    [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
    [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500],
  ],
  o3: [
    [0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150],
    [86, 105, 151, 200], [106, 200, 201, 300],
  ],
  no2: [
    [0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150],
    [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 1649, 301, 400], [1650, 2049, 401, 500],
  ],
  so2: [
    [0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150],
    [186, 304, 151, 200], [305, 604, 201, 300], [605, 804, 301, 400], [805, 1004, 401, 500],
  ],
  co: [
    [0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150],
    [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 40.4, 301, 400], [40.5, 50.4, 401, 500],
  ],
});

const AQI_CATEGORIES = Object.freeze([
  { maximum: 50, id: 'good', label: 'Good', color: '#00e400' },
  { maximum: 100, id: 'moderate', label: 'Moderate', color: '#ffff00' },
  { maximum: 150, id: 'unhealthy_sensitive', label: 'Unhealthy for sensitive groups', color: '#ff7e00' },
  { maximum: 200, id: 'unhealthy', label: 'Unhealthy', color: '#ff0000' },
  { maximum: 300, id: 'very_unhealthy', label: 'Very unhealthy', color: '#8f3f97' },
  { maximum: 500, id: 'hazardous', label: 'Hazardous', color: '#7e0023' },
]);

function pollutantIndex(name, concentration) {
  if (!Number.isFinite(concentration)) return null;
  const breakpoints = POLLUTANT_BREAKPOINTS[name];
  if (!breakpoints) return null;
  const selected = breakpoints.find(([low, high]) => concentration >= low && concentration <= high)
    ?? breakpoints.at(-1);
  const [concentrationLow, concentrationHigh, indexLow, indexHigh] = selected;
  if (concentration > concentrationHigh) return 500;
  return Math.round(
    (indexHigh - indexLow) / (concentrationHigh - concentrationLow)
    * (concentration - concentrationLow) + indexLow,
  );
}

function categoryForAqi(aqi) {
  return AQI_CATEGORIES.find((category) => aqi <= category.maximum) ?? AQI_CATEGORIES.at(-1);
}

function normalizeComponents(components) {
  assertObject(components, 'Pollutant components');
  return Object.freeze({
    pm2_5: Number.isFinite(components.pm2_5) ? Math.max(0, components.pm2_5) : null,
    pm10: Number.isFinite(components.pm10) ? Math.max(0, components.pm10) : null,
    o3: Number.isFinite(components.o3) ? Math.max(0, components.o3) : null,
    no2: Number.isFinite(components.no2) ? Math.max(0, components.no2) : null,
    so2: Number.isFinite(components.so2) ? Math.max(0, components.so2) : null,
    co: Number.isFinite(components.co) ? Math.max(0, components.co) : null,
    nh3: Number.isFinite(components.nh3) ? Math.max(0, components.nh3) : null,
  });
}

export function calculateAirQualityIndex(components) {
  const normalized = normalizeComponents(components);
  const indices = Object.fromEntries(Object.entries(normalized).map(([pollutant, value]) => [
    pollutant,
    pollutantIndex(pollutant, value),
  ]));
  const valid = Object.entries(indices).filter(([, value]) => Number.isFinite(value));
  const aqi = maximum(valid.map(([, value]) => value));
  const dominantPollutants = valid.filter(([, value]) => value === aqi).map(([name]) => name);
  return deepFreeze({
    aqi,
    category: aqi === null ? null : categoryForAqi(aqi),
    dominantPollutants,
    indices,
    components: normalized,
  });
}

function profileMultiplier(profile) {
  let multiplier = 1;
  if (profile?.asthma) multiplier += 0.35;
  if (profile?.copd) multiplier += 0.45;
  if (profile?.cardiovascular) multiplier += 0.3;
  if (profile?.pregnant) multiplier += 0.15;
  if (profile?.ageGroup === 'child') multiplier += 0.2;
  if (profile?.ageGroup === 'older_adult') multiplier += 0.25;
  if (profile?.outdoorWorker) multiplier += 0.2;
  return multiplier;
}

export function airQualityGuidance(aqiResult, profile = {}, activity = {}) {
  const aqi = aqiResult?.aqi;
  if (!Number.isFinite(aqi)) {
    return deepFreeze({ risk: 'unknown', messages: ['Air-quality measurements are unavailable.'] });
  }
  const exertion = activity.exertion === 'high' ? 1.35 : activity.exertion === 'moderate' ? 1.15 : 1;
  const duration = Number.isFinite(activity.durationMinutes)
    ? clamp(activity.durationMinutes / 60, 0.25, 4)
    : 1;
  const adjusted = Math.min(500, aqi * profileMultiplier(profile) * exertion * Math.sqrt(duration));
  const category = categoryForAqi(adjusted);
  const messages = [];
  if (adjusted <= 50) messages.push('Outdoor activity can continue as planned.');
  else if (adjusted <= 100) messages.push('Unusually sensitive people should monitor symptoms.');
  else if (adjusted <= 150) messages.push('Sensitive people should reduce long or intense outdoor activity.');
  else if (adjusted <= 200) messages.push('Reduce prolonged outdoor exertion and take more breaks indoors.');
  else if (adjusted <= 300) messages.push('Avoid strenuous outdoor activity and keep indoor air clean.');
  else messages.push('Remain indoors with filtered air when possible and follow local health advice.');
  if (aqiResult.dominantPollutants.includes('pm2_5')) messages.push('Fine particles are the main concern.');
  if (aqiResult.dominantPollutants.includes('o3')) messages.push('Ozone can be worse during warm, sunny afternoons.');
  return deepFreeze({
    risk: category.id,
    label: category.label,
    rawAqi: aqi,
    adjustedAqi: round(adjusted, 0),
    messages,
  });
}

export function calculateExposureDose(readings, activity = {}) {
  const sorted = sortByTime(assertArray(readings, 'Air-quality readings', { nonEmpty: true }), (reading) => reading.observedAt);
  const breathingRate = Number.isFinite(activity.breathingRateLitersPerMinute)
    ? Math.max(1, activity.breathingRateLitersPerMinute)
    : activity.exertion === 'high' ? 60 : activity.exertion === 'moderate' ? 35 : 12;
  let pm25Micrograms = 0;
  let pm10Micrograms = 0;
  let minutes = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const durationMinutes = Math.max(0, parseTimestamp(current.observedAt) - parseTimestamp(previous.observedAt)) / 60_000;
    const inhaledCubicMeters = breathingRate * durationMinutes / 1000;
    const pm25 = mean([previous.components?.pm2_5, current.components?.pm2_5].filter(Number.isFinite)) ?? 0;
    const pm10 = mean([previous.components?.pm10, current.components?.pm10].filter(Number.isFinite)) ?? 0;
    pm25Micrograms += pm25 * inhaledCubicMeters;
    pm10Micrograms += pm10 * inhaledCubicMeters;
    minutes += durationMinutes;
  }
  return deepFreeze({
    durationMinutes: round(minutes, 1),
    estimatedAirVolumeCubicMeters: round(breathingRate * minutes / 1000, 3),
    pm25DoseMicrograms: round(pm25Micrograms, 2),
    pm10DoseMicrograms: round(pm10Micrograms, 2),
    breathingRateLitersPerMinute: breathingRate,
  });
}

export function summarizeAirQualityForecast(readings, profile = {}) {
  const normalized = assertArray(readings, 'Air-quality forecast', { nonEmpty: true }).map((reading) => ({
    ...reading,
    observedAt: new Date(parseTimestamp(reading.observedAt ?? reading.forecastAt)).toISOString(),
    result: calculateAirQualityIndex(reading.components ?? reading),
  }));
  const values = normalized.map((reading) => reading.result.aqi).filter(Number.isFinite);
  const worst = [...normalized].sort((first, second) => (second.result.aqi ?? -1) - (first.result.aqi ?? -1))[0];
  const unhealthyHours = normalized.filter((reading) => (reading.result.aqi ?? 0) > 100).length;
  return deepFreeze({
    readings: normalized,
    minimumAqi: minimum(values),
    maximumAqi: maximum(values),
    averageAqi: round(mean(values), 1),
    unhealthyHours,
    worstAt: worst?.observedAt ?? null,
    worstGuidance: worst ? airQualityGuidance(worst.result, profile) : null,
    pollutantTotals: Object.fromEntries(Object.keys(POLLUTANT_BREAKPOINTS).map((pollutant) => [
      pollutant,
      round(sum(normalized.map((reading) => reading.result.components[pollutant]).filter(Number.isFinite)), 2),
    ])),
  });
}

export const AIR_QUALITY_BREAKPOINTS = POLLUTANT_BREAKPOINTS;
export const AIR_QUALITY_CATEGORIES = AQI_CATEGORIES;
