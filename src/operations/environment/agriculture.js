import { assertArray, assertFiniteNumber, assertObject, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, mean, minimum, sum } from '../core/statistics';

const CROP_PROFILES = Object.freeze({
  wheat: { baseC: 0, optimal: [12, 24], frostC: -2, heatC: 32, rootDepthMm: 1200, depletion: 0.55, kc: 1.15 },
  maize: { baseC: 10, optimal: [18, 30], frostC: 0, heatC: 35, rootDepthMm: 1000, depletion: 0.55, kc: 1.2 },
  rice: { baseC: 10, optimal: [20, 32], frostC: 4, heatC: 37, rootDepthMm: 600, depletion: 0.2, kc: 1.2 },
  soybean: { baseC: 10, optimal: [18, 30], frostC: 0, heatC: 35, rootDepthMm: 900, depletion: 0.5, kc: 1.15 },
  potato: { baseC: 4, optimal: [12, 22], frostC: -1, heatC: 30, rootDepthMm: 600, depletion: 0.35, kc: 1.15 },
  tomato: { baseC: 10, optimal: [18, 29], frostC: 1, heatC: 35, rootDepthMm: 700, depletion: 0.4, kc: 1.15 },
  lettuce: { baseC: 4, optimal: [7, 22], frostC: -2, heatC: 28, rootDepthMm: 400, depletion: 0.3, kc: 1 },
  apple: { baseC: 4, optimal: [10, 24], frostC: -2, heatC: 35, rootDepthMm: 1200, depletion: 0.5, kc: 1.05 },
  grape: { baseC: 10, optimal: [15, 30], frostC: -1, heatC: 38, rootDepthMm: 1500, depletion: 0.45, kc: 0.8 },
  citrus: { baseC: 12.5, optimal: [18, 32], frostC: -1, heatC: 40, rootDepthMm: 1200, depletion: 0.5, kc: 0.7 },
});

function cropProfile(name, overrides = {}) {
  const base = CROP_PROFILES[name];
  if (!base) throw new TypeError(`Unknown crop profile: ${name}`);
  return Object.freeze({ ...base, ...overrides });
}

export function growingDegreeDays(days, crop, options = {}) {
  const profile = cropProfile(crop, options.profile);
  const upper = Number.isFinite(options.upperC) ? options.upperC : profile.heatC;
  const values = assertArray(days, 'Weather days', { nonEmpty: true }).map((day) => {
    const minimumC = assertFiniteNumber(day.minimumC, 'Daily minimum temperature');
    const maximumC = assertFiniteNumber(day.maximumC, 'Daily maximum temperature');
    const adjustedMinimum = Math.max(profile.baseC, Math.min(upper, minimumC));
    const adjustedMaximum = Math.max(profile.baseC, Math.min(upper, maximumC));
    return deepFreeze({
      date: day.date ?? day.dateKey ?? null,
      minimumC,
      maximumC,
      degreeDays: round(Math.max(0, (adjustedMinimum + adjustedMaximum) / 2 - profile.baseC), 2),
    });
  });
  return deepFreeze({ crop, baseC: profile.baseC, upperC: upper, days: values, total: round(sum(values.map((day) => day.degreeDays)), 2) });
}

export function referenceEvapotranspiration(day, location = {}) {
  assertObject(day, 'Weather day');
  const meanTemperature = mean([day.minimumC, day.maximumC].filter(Number.isFinite));
  if (!Number.isFinite(meanTemperature)) return null;
  const range = Math.max(0, (day.maximumC ?? meanTemperature) - (day.minimumC ?? meanTemperature));
  const latitudeFactor = Number.isFinite(location.latitude)
    ? Math.max(0.6, Math.cos(location.latitude * Math.PI / 180) + 0.25)
    : 1;
  const daylightHours = Number.isFinite(day.daylightHours) ? day.daylightHours : 12;
  const radiationProxy = latitudeFactor * daylightHours * 0.082;
  const windFactor = 1 + Math.min(0.5, (day.averageWindMps ?? day.maximumWindMps ?? 0) / 20);
  const humidityFactor = 1 + Math.max(-0.25, Math.min(0.4, (50 - (day.averageHumidityPercent ?? 50)) / 100));
  return round(0.0023 * (meanTemperature + 17.8) * Math.sqrt(range) * radiationProxy * windFactor * humidityFactor, 2);
}

export function irrigationSchedule(days, crop, soil = {}, options = {}) {
  const profile = cropProfile(crop, options.profile);
  const fieldCapacity = assertFiniteNumber(soil.fieldCapacity ?? 0.3, 'Soil field capacity', { minimum: 0.05, maximum: 0.7 });
  const wiltingPoint = assertFiniteNumber(soil.wiltingPoint ?? 0.12, 'Soil wilting point', { minimum: 0, maximum: fieldCapacity });
  const initialMoisture = assertFiniteNumber(soil.currentMoisture ?? fieldCapacity, 'Current soil moisture', {
    minimum: 0,
    maximum: 0.8,
  });
  const efficiency = assertFiniteNumber(options.irrigationEfficiency ?? 0.8, 'Irrigation efficiency', { minimum: 0.1, maximum: 1 });
  const rootDepth = profile.rootDepthMm;
  const availableWaterMm = (fieldCapacity - wiltingPoint) * rootDepth;
  const triggerDepletionMm = availableWaterMm * profile.depletion;
  let storedWaterMm = Math.max(0, (initialMoisture - wiltingPoint) * rootDepth);
  const schedule = assertArray(days, 'Weather days', { nonEmpty: true }).map((day) => {
    const referenceEt = referenceEvapotranspiration(day, options.location) ?? 0;
    const cropEt = referenceEt * profile.kc;
    const rain = Math.max(0, day.rainTotalMm ?? day.rainMm ?? 0);
    const effectiveRain = rain * (rain > 20 ? 0.65 : 0.85);
    storedWaterMm = Math.min(availableWaterMm, Math.max(0, storedWaterMm - cropEt + effectiveRain));
    const depleted = availableWaterMm - storedWaterMm;
    let irrigationMm = 0;
    if (depleted >= triggerDepletionMm) {
      irrigationMm = depleted / efficiency;
      storedWaterMm = availableWaterMm;
    }
    return deepFreeze({
      date: day.date ?? day.dateKey ?? null,
      referenceEvapotranspirationMm: referenceEt,
      cropEvapotranspirationMm: round(cropEt, 2),
      rainMm: rain,
      effectiveRainMm: round(effectiveRain, 2),
      soilWaterBeforeIrrigationMm: round(availableWaterMm - depleted, 2),
      irrigationMm: round(irrigationMm, 2),
      soilWaterAfterMm: round(storedWaterMm, 2),
    });
  });
  return deepFreeze({
    crop,
    availableWaterMm: round(availableWaterMm, 2),
    triggerDepletionMm: round(triggerDepletionMm, 2),
    schedule,
    totalIrrigationMm: round(sum(schedule.map((day) => day.irrigationMm)), 2),
    totalCropEvapotranspirationMm: round(sum(schedule.map((day) => day.cropEvapotranspirationMm)), 2),
  });
}

export function cropWeatherRisks(days, crop, options = {}) {
  const profile = cropProfile(crop, options.profile);
  const selected = assertArray(days, 'Weather days', { nonEmpty: true });
  const risks = [];
  selected.forEach((day) => {
    const date = day.date ?? day.dateKey ?? null;
    if (Number.isFinite(day.minimumC) && day.minimumC <= profile.frostC) {
      risks.push({ date, type: 'frost', severity: day.minimumC <= profile.frostC - 4 ? 'severe' : 'moderate', value: day.minimumC });
    }
    if (Number.isFinite(day.maximumC) && day.maximumC >= profile.heatC) {
      risks.push({ date, type: 'heat', severity: day.maximumC >= profile.heatC + 5 ? 'severe' : 'moderate', value: day.maximumC });
    }
    if ((day.rainTotalMm ?? day.rainMm ?? 0) >= 30) {
      risks.push({ date, type: 'waterlogging', severity: (day.rainTotalMm ?? day.rainMm) >= 60 ? 'severe' : 'moderate', value: day.rainTotalMm ?? day.rainMm });
    }
    if ((day.maximumWindMps ?? 0) >= 15) {
      risks.push({ date, type: 'wind_damage', severity: day.maximumWindMps >= 25 ? 'severe' : 'moderate', value: day.maximumWindMps });
    }
    if ((day.averageHumidityPercent ?? 0) >= 85 && (day.minimumC ?? 100) >= 10) {
      risks.push({ date, type: 'fungal_disease', severity: 'moderate', value: day.averageHumidityPercent });
    }
  });
  return deepFreeze({
    crop,
    risks,
    riskDays: [...new Set(risks.map((risk) => risk.date))].length,
    highestTemperatureC: maximum(selected.map((day) => day.maximumC)),
    lowestTemperatureC: minimum(selected.map((day) => day.minimumC)),
  });
}

export const AGRICULTURAL_CROP_PROFILES = CROP_PROFILES;
