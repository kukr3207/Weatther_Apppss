import { assertArray, assertObject, clamp, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean } from '../core/statistics';
import { sortByTime } from '../core/timeSeries';

const PLANT_PROFILES = Object.freeze({
  alder: { category: 'tree', season: [1, 4], threshold: 30, aliases: ['alnus'] },
  birch: { category: 'tree', season: [3, 6], threshold: 50, aliases: ['betula'] },
  cedar: { category: 'tree', season: [1, 5], threshold: 40, aliases: ['juniper'] },
  elm: { category: 'tree', season: [2, 5], threshold: 30, aliases: ['ulmus'] },
  hazel: { category: 'tree', season: [1, 4], threshold: 30, aliases: ['corylus'] },
  oak: { category: 'tree', season: [3, 6], threshold: 50, aliases: ['quercus'] },
  pine: { category: 'tree', season: [3, 7], threshold: 80, aliases: ['pinus'] },
  plane: { category: 'tree', season: [3, 6], threshold: 40, aliases: ['platanus'] },
  poplar: { category: 'tree', season: [2, 5], threshold: 40, aliases: ['populus'] },
  willow: { category: 'tree', season: [2, 5], threshold: 30, aliases: ['salix'] },
  grass: { category: 'grass', season: [4, 9], threshold: 20, aliases: ['poaceae'] },
  ryegrass: { category: 'grass', season: [4, 8], threshold: 20, aliases: ['lolium'] },
  bermuda: { category: 'grass', season: [5, 10], threshold: 20, aliases: ['cynodon'] },
  timothy: { category: 'grass', season: [5, 8], threshold: 20, aliases: ['phleum'] },
  ragweed: { category: 'weed', season: [7, 10], threshold: 10, aliases: ['ambrosia'] },
  mugwort: { category: 'weed', season: [7, 10], threshold: 10, aliases: ['artemisia'] },
  nettle: { category: 'weed', season: [5, 9], threshold: 20, aliases: ['urtica'] },
  plantain: { category: 'weed', season: [4, 9], threshold: 20, aliases: ['plantago'] },
  sorrel: { category: 'weed', season: [4, 8], threshold: 20, aliases: ['rumex'] },
});

function pollenLevel(concentration, threshold) {
  if (!Number.isFinite(concentration) || concentration <= 0) return 0;
  if (concentration < threshold * 0.5) return 1;
  if (concentration < threshold) return 2;
  if (concentration < threshold * 2) return 3;
  if (concentration < threshold * 4) return 4;
  return 5;
}

function weatherMultiplier(weather) {
  let multiplier = 1;
  if ((weather.rainMm ?? 0) >= 2) multiplier *= 0.55;
  else if ((weather.rainMm ?? 0) > 0) multiplier *= 0.8;
  if ((weather.windSpeedMps ?? 0) >= 5 && (weather.windSpeedMps ?? 0) <= 12) multiplier *= 1.2;
  if ((weather.windSpeedMps ?? 0) > 18) multiplier *= 0.8;
  if ((weather.humidityPercent ?? 50) < 35) multiplier *= 1.2;
  if ((weather.humidityPercent ?? 50) > 85) multiplier *= 0.85;
  if ((weather.temperatureC ?? 15) >= 20) multiplier *= 1.1;
  return multiplier;
}

export function assessPollenReading(reading, profile = {}, weather = {}) {
  assertObject(reading, 'Pollen reading');
  const sensitivities = new Set(Array.isArray(profile.sensitivities) ? profile.sensitivities : []);
  const components = Object.entries(reading.components ?? reading)
    .filter(([name]) => PLANT_PROFILES[name])
    .map(([name, concentration]) => {
      const plant = PLANT_PROFILES[name];
      const rawLevel = pollenLevel(concentration, plant.threshold);
      const adjustedLevel = clamp(Math.round(rawLevel * weatherMultiplier(weather)), 0, 5);
      const sensitive = sensitivities.size === 0 || sensitivities.has(name) || sensitivities.has(plant.category);
      return deepFreeze({
        name,
        category: plant.category,
        concentration: Number.isFinite(concentration) ? concentration : null,
        rawLevel,
        level: adjustedLevel,
        sensitive,
        risk: sensitive ? adjustedLevel : Math.max(0, adjustedLevel - 2),
      });
    });
  const risk = maximum(components.map((component) => component.risk)) ?? 0;
  const dominant = components.filter((component) => component.risk === risk).map((component) => component.name);
  const advice = [];
  if (risk <= 1) advice.push('Pollen exposure should be low for most people.');
  else if (risk === 2) advice.push('Sensitive people may notice mild symptoms.');
  else if (risk === 3) advice.push('Limit long outdoor activity during peak pollen hours.');
  else if (risk === 4) advice.push('Keep windows closed and change clothes after outdoor activity.');
  else advice.push('Consider staying indoors with filtered air and follow your allergy plan.');
  if ((weather.rainMm ?? 0) > 0) advice.push('Rain may temporarily lower airborne pollen.');
  return deepFreeze({
    observedAt: reading.observedAt ? new Date(parseTimestamp(reading.observedAt)).toISOString() : null,
    risk,
    label: ['none', 'low', 'moderate', 'high', 'very high', 'extreme'][risk],
    dominant,
    components,
    advice,
  });
}

export function pollenCalendar(latitude, year = new Date().getUTCFullYear()) {
  const hemisphereShift = latitude < 0 ? 6 : 0;
  return Object.entries(PLANT_PROFILES).map(([name, profile]) => {
    const shift = (month) => ((month - 1 + hemisphereShift) % 12) + 1;
    return deepFreeze({
      name,
      category: profile.category,
      year,
      startsInMonth: shift(profile.season[0]),
      endsInMonth: shift(profile.season[1]),
    });
  });
}

export function summarizePollenForecast(readings, profile = {}) {
  const sorted = sortByTime(assertArray(readings, 'Pollen forecast', { nonEmpty: true }), (reading) => reading.observedAt ?? reading.forecastAt);
  const assessments = sorted.map((reading) => assessPollenReading({
    ...reading,
    observedAt: reading.observedAt ?? reading.forecastAt,
  }, profile, reading.weather ?? {}));
  const best = [...assessments].sort((first, second) => first.risk - second.risk)[0];
  const worst = [...assessments].sort((first, second) => second.risk - first.risk)[0];
  return deepFreeze({
    assessments,
    averageRisk: round(mean(assessments.map((assessment) => assessment.risk)), 1),
    bestAt: best?.observedAt ?? null,
    worstAt: worst?.observedAt ?? null,
    peakRisk: worst?.risk ?? null,
    dominant: [...new Set(assessments.flatMap((assessment) => assessment.dominant))],
  });
}

export const POLLEN_PLANT_PROFILES = PLANT_PROFILES;
