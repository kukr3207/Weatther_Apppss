import { groupForecastByDay } from './dailyForecast';

const ITEMS = Object.freeze({
  umbrella: { id: 'umbrella', name: 'Umbrella', icon: '☂', reason: 'Rain is likely during the trip.' },
  raincoat: { id: 'raincoat', name: 'Rain jacket', icon: '🧥', reason: 'Wet or windy periods are expected.' },
  warmLayer: { id: 'warm-layer', name: 'Warm layer', icon: '🧶', reason: 'Cool temperatures are expected.' },
  heavyCoat: { id: 'heavy-coat', name: 'Heavy coat', icon: '🧥', reason: 'Freezing temperatures are possible.' },
  sunProtection: { id: 'sun-protection', name: 'Sun protection', icon: '🧴', reason: 'Warm, bright periods are expected.' },
  water: { id: 'water', name: 'Water bottle', icon: '💧', reason: 'Hot weather increases hydration needs.' },
  sturdyShoes: { id: 'sturdy-shoes', name: 'Weatherproof shoes', icon: '🥾', reason: 'Rain or snow may make surfaces wet.' },
  windLayer: { id: 'wind-layer', name: 'Wind-resistant layer', icon: '🌬', reason: 'Strong wind is forecast.' },
  gloves: { id: 'gloves', name: 'Gloves', icon: '🧤', reason: 'Cold or freezing weather is expected.' },
  mask: { id: 'mask', name: 'Particulate mask', icon: '😷', reason: 'Air quality may be poor.' },
});

function add(items, key, customReason) {
  if (items.some((item) => item.id === ITEMS[key].id)) return;
  items.push(customReason ? { ...ITEMS[key], reason: customReason } : ITEMS[key]);
}

export function buildPackingGuide(forecast, airQuality, options = {}) {
  const days = groupForecastByDay(forecast, { limit: options.days ?? 5 });
  const items = [];
  if (!days.length) return { items, summary: 'Forecast data is needed to build a packing list.', extremes: null };
  const minimumC = Math.min(...days.map((day) => day.minimumC).filter(Number.isFinite));
  const maximumC = Math.max(...days.map((day) => day.maximumC).filter(Number.isFinite));
  const rainProbability = Math.max(...days.map((day) => day.precipitationProbability ?? 0));
  const rainTotalMm = days.reduce((total, day) => total + (day.rainTotalMm ?? 0), 0);
  const maximumWindMps = Math.max(...days.map((day) => day.maximumWindMps ?? 0));
  const descriptions = days.map((day) => day.condition?.description?.toLowerCase() ?? '');

  if (rainProbability >= 0.4) add(items, 'umbrella');
  if (rainTotalMm >= 3 || (rainProbability >= 0.5 && maximumWindMps >= 8)) add(items, 'raincoat');
  if (minimumC < 15) add(items, 'warmLayer');
  if (minimumC <= 3) add(items, 'heavyCoat');
  if (minimumC <= 7) add(items, 'gloves');
  if (maximumC >= 24 || descriptions.some((description) => description.includes('clear'))) add(items, 'sunProtection');
  if (maximumC >= 30) add(items, 'water');
  if (maximumWindMps >= 10) add(items, 'windLayer');
  if (rainTotalMm >= 5 || descriptions.some((description) => description.includes('snow'))) add(items, 'sturdyShoes');
  if (airQuality?.index >= 4) add(items, 'mask');
  if (!items.length) add(items, 'warmLayer', 'A light extra layer is useful if conditions change.');

  const summary = items.length <= 2
    ? 'Only a few weather-specific items are recommended.'
    : `Pack ${items.length} weather-specific items for the forecast range.`;
  return {
    items,
    summary,
    extremes: { minimumC, maximumC, rainProbability, rainTotalMm, maximumWindMps },
  };
}

export function packingText(guide, locationName) {
  if (!guide?.items?.length) return `No weather packing guidance is available for ${locationName}.`;
  return [
    `Weather packing list for ${locationName}`,
    ...guide.items.map((item) => `- ${item.name}: ${item.reason}`),
  ].join('\n');
}
