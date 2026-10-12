import { assertArray, assertObject, deepFreeze, round } from '../core/validation';
import { maximum, minimum, sum } from '../core/statistics';

const PACKING_CATALOG = Object.freeze([
  { id: 'light-rain-jacket', category: 'clothing', label: 'Light rain jacket', weightGrams: 350, triggers: ['rain'] },
  { id: 'waterproof-shell', category: 'clothing', label: 'Waterproof shell', weightGrams: 520, triggers: ['heavy_rain', 'storm'] },
  { id: 'compact-umbrella', category: 'equipment', label: 'Compact umbrella', weightGrams: 280, triggers: ['rain'] },
  { id: 'waterproof-trousers', category: 'clothing', label: 'Waterproof trousers', weightGrams: 310, triggers: ['heavy_rain'] },
  { id: 'warm-coat', category: 'clothing', label: 'Warm insulated coat', weightGrams: 900, triggers: ['cold'] },
  { id: 'thermal-base-layer', category: 'clothing', label: 'Thermal base layer', weightGrams: 240, triggers: ['freezing', 'cold'] },
  { id: 'warm-hat', category: 'accessory', label: 'Warm hat', weightGrams: 90, triggers: ['freezing', 'cold', 'wind'] },
  { id: 'gloves', category: 'accessory', label: 'Insulated gloves', weightGrams: 120, triggers: ['freezing'] },
  { id: 'scarf', category: 'accessory', label: 'Scarf or neck gaiter', weightGrams: 140, triggers: ['cold', 'wind'] },
  { id: 'snow-boots', category: 'footwear', label: 'Waterproof snow boots', weightGrams: 1500, triggers: ['snow', 'freezing'] },
  { id: 'traction-cleats', category: 'safety', label: 'Ice traction cleats', weightGrams: 350, triggers: ['ice'] },
  { id: 'sun-hat', category: 'accessory', label: 'Sun hat', weightGrams: 110, triggers: ['sun', 'heat'] },
  { id: 'sunscreen', category: 'health', label: 'Broad-spectrum sunscreen', weightGrams: 120, triggers: ['sun', 'high_uv'] },
  { id: 'sunglasses', category: 'accessory', label: 'UV-protective sunglasses', weightGrams: 40, triggers: ['sun', 'snow'] },
  { id: 'water-bottle', category: 'health', label: 'Reusable water bottle', weightGrams: 500, triggers: ['heat', 'dry', 'activity'] },
  { id: 'electrolytes', category: 'health', label: 'Electrolyte sachets', weightGrams: 80, triggers: ['extreme_heat', 'activity'] },
  { id: 'breathable-shirts', category: 'clothing', label: 'Breathable shirts', weightGrams: 180, triggers: ['heat', 'humid'] },
  { id: 'light-layers', category: 'clothing', label: 'Light removable layers', weightGrams: 300, triggers: ['variable'] },
  { id: 'windbreaker', category: 'clothing', label: 'Windbreaker', weightGrams: 280, triggers: ['wind'] },
  { id: 'dust-mask', category: 'health', label: 'Respirator mask', weightGrams: 30, triggers: ['poor_air', 'dust', 'smoke'] },
  { id: 'allergy-medicine', category: 'health', label: 'Usual allergy medicine', weightGrams: 40, triggers: ['pollen'] },
  { id: 'inhaler', category: 'health', label: 'Prescribed rescue inhaler', weightGrams: 70, triggers: ['poor_air'] },
  { id: 'lip-balm', category: 'health', label: 'Protective lip balm', weightGrams: 20, triggers: ['cold', 'dry', 'wind'] },
  { id: 'moisturizer', category: 'health', label: 'Moisturizer', weightGrams: 120, triggers: ['dry', 'cold'] },
  { id: 'dry-bag', category: 'equipment', label: 'Dry bag for electronics', weightGrams: 160, triggers: ['heavy_rain', 'marine'] },
  { id: 'waterproof-phone-case', category: 'equipment', label: 'Waterproof phone case', weightGrams: 80, triggers: ['rain', 'marine'] },
  { id: 'headlamp', category: 'equipment', label: 'Headlamp', weightGrams: 120, triggers: ['short_daylight', 'camping'] },
  { id: 'power-bank', category: 'equipment', label: 'Charged power bank', weightGrams: 320, triggers: ['storm', 'remote'] },
  { id: 'emergency-blanket', category: 'safety', label: 'Emergency blanket', weightGrams: 70, triggers: ['freezing', 'remote'] },
  { id: 'first-aid-kit', category: 'safety', label: 'Compact first-aid kit', weightGrams: 350, triggers: ['activity', 'remote'] },
  { id: 'weather-radio', category: 'safety', label: 'Battery weather radio', weightGrams: 450, triggers: ['storm', 'remote'] },
  { id: 'insect-repellent', category: 'health', label: 'Insect repellent', weightGrams: 100, triggers: ['humid', 'camping'] },
  { id: 'spare-socks', category: 'clothing', label: 'Spare dry socks', weightGrams: 100, triggers: ['rain', 'snow', 'activity'] },
  { id: 'shoe-covers', category: 'footwear', label: 'Water-resistant shoe covers', weightGrams: 180, triggers: ['rain'] },
]);

function deriveSignals(days, context) {
  const temperatures = days.flatMap((day) => [day.minimumC, day.maximumC]).filter(Number.isFinite);
  const maximumRain = maximum(days.map((day) => day.rainTotalMm ?? day.rainMm));
  const maximumSnow = maximum(days.map((day) => day.snowTotalMm ?? day.snowMm));
  const maximumWind = maximum(days.map((day) => day.maximumWindMps ?? day.windSpeedMps));
  const maximumPrecipitation = maximum(days.map((day) => day.precipitationProbability));
  const minimumTemperature = minimum(temperatures);
  const maximumTemperature = maximum(temperatures);
  const humidity = maximum(days.map((day) => day.averageHumidityPercent));
  const uv = maximum(days.map((day) => day.maximumUvIndex));
  const aqi = context.airQualityIndex ?? maximum(days.map((day) => day.airQualityIndex));
  const pollen = context.pollenIndex ?? maximum(days.map((day) => day.pollenIndex));
  const daylight = minimum(days.map((day) => day.daylightHours));
  const signals = new Set();
  if ((maximumRain ?? 0) > 0 || (maximumPrecipitation ?? 0) >= 0.3) signals.add('rain');
  if ((maximumRain ?? 0) >= 10 || (maximumPrecipitation ?? 0) >= 0.8) signals.add('heavy_rain');
  if ((maximumSnow ?? 0) > 0) signals.add('snow');
  if ((minimumTemperature ?? 100) <= 0) signals.add('freezing');
  if ((minimumTemperature ?? 100) <= 10) signals.add('cold');
  if ((maximumTemperature ?? -100) >= 27) signals.add('heat');
  if ((maximumTemperature ?? -100) >= 35) signals.add('extreme_heat');
  if ((maximumWind ?? 0) >= 8) signals.add('wind');
  if ((maximumWind ?? 0) >= 18) signals.add('storm');
  if ((humidity ?? 0) >= 75) signals.add('humid');
  if ((uv ?? 0) >= 3) signals.add('sun');
  if ((uv ?? 0) >= 6) signals.add('high_uv');
  if (Number.isFinite(aqi) && aqi >= 4) signals.add('poor_air');
  if (Number.isFinite(pollen) && pollen >= 3) signals.add('pollen');
  if (Number.isFinite(daylight) && daylight < 9) signals.add('short_daylight');
  if (maximumTemperature - minimumTemperature >= 12) signals.add('variable');
  if (context.activity) signals.add('activity');
  if (context.remote) signals.add('remote');
  if (context.camping) signals.add('camping');
  if (context.marine) signals.add('marine');
  if (context.iceRisk) signals.add('ice');
  if (context.smokeRisk) signals.add('smoke');
  if (context.dustRisk) signals.add('dust');
  if (context.dryClimate) signals.add('dry');
  return { signals, minimumTemperature, maximumTemperature, maximumRain, maximumSnow, maximumWind };
}

export function createPackingPlan(forecastDays, context = {}) {
  const days = assertArray(forecastDays, 'Forecast days', { nonEmpty: true });
  assertObject(context, 'Packing context');
  const derived = deriveSignals(days, context);
  const excluded = new Set(Array.isArray(context.excludedItems) ? context.excludedItems : []);
  const owned = new Set(Array.isArray(context.ownedItems) ? context.ownedItems : []);
  const custom = Array.isArray(context.customItems) ? context.customItems : [];
  const items = [...PACKING_CATALOG, ...custom].filter((item) => (
    !excluded.has(item.id) && item.triggers.some((trigger) => derived.signals.has(trigger))
  )).map((item) => deepFreeze({
    ...item,
    packed: owned.has(item.id),
    reasons: item.triggers.filter((trigger) => derived.signals.has(trigger)),
  }));
  const byCategory = Object.fromEntries([...new Set(items.map((item) => item.category))]
    .sort()
    .map((category) => [category, items.filter((item) => item.category === category)]));
  return deepFreeze({
    generatedAt: new Date().toISOString(),
    tripName: context.tripName ?? null,
    forecastDayCount: days.length,
    signals: [...derived.signals].sort(),
    items,
    byCategory,
    summary: {
      itemCount: items.length,
      packedCount: items.filter((item) => item.packed).length,
      estimatedWeightGrams: sum(items.map((item) => item.weightGrams ?? 0)),
      completionPercent: items.length ? round(items.filter((item) => item.packed).length / items.length * 100, 1) : 100,
      minimumTemperatureC: derived.minimumTemperature,
      maximumTemperatureC: derived.maximumTemperature,
      maximumRainMm: derived.maximumRain,
      maximumSnowMm: derived.maximumSnow,
      maximumWindMps: derived.maximumWind,
    },
  });
}

export function updatePackingProgress(plan, itemId, packed) {
  const items = plan.items.map((item) => item.id === itemId ? { ...item, packed: Boolean(packed) } : item);
  const packedCount = items.filter((item) => item.packed).length;
  return deepFreeze({
    ...plan,
    items,
    byCategory: Object.fromEntries(Object.keys(plan.byCategory).map((category) => [
      category,
      items.filter((item) => item.category === category),
    ])),
    summary: {
      ...plan.summary,
      packedCount,
      completionPercent: items.length ? round(packedCount / items.length * 100, 1) : 100,
    },
  });
}

export const WEATHER_PACKING_CATALOG = PACKING_CATALOG;
