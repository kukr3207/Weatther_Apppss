import { calculateDewPointC, humidityComfort } from './comfort';
import { formatLocationClock } from './time';

function ventilationScore(item, airQualityIndex) {
  let score = 100;
  const humidity = item.humidityPercent ?? 50;
  const temperature = item.temperatureC;
  const rain = item.precipitationProbability ?? 0;
  const wind = item.windSpeedMps ?? 0;
  if (humidity > 80) score -= 30;
  if (humidity < 25) score -= 15;
  if (temperature < 5 || temperature > 32) score -= 30;
  if (rain > 0.5) score -= 25;
  if (wind > 15) score -= 20;
  if (airQualityIndex >= 4) score -= 70;
  else if (airQualityIndex === 3) score -= 30;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function dryingScore(item) {
  let score = 55;
  score += Math.max(-20, Math.min(20, (item.temperatureC - 15) * 1.8));
  score += Math.max(-20, Math.min(18, (65 - item.humidityPercent) * 0.7));
  score += Math.max(0, Math.min(15, item.windSpeedMps * 1.5));
  score -= (item.precipitationProbability ?? 0) * 65;
  if ((item.rainMm ?? 0) > 0) score -= 30;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function homeEnergyLoad(current, options = {}) {
  if (!current || !Number.isFinite(current.temperatureC)) return null;
  const heatingSetPointC = Number.isFinite(options.heatingSetPointC) ? options.heatingSetPointC : 19;
  const coolingSetPointC = Number.isFinite(options.coolingSetPointC) ? options.coolingSetPointC : 25;
  const temperature = current.temperatureC;
  const heatingDegrees = Math.max(0, heatingSetPointC - temperature);
  const coolingDegrees = Math.max(0, temperature - coolingSetPointC);
  const humidityAdjustment = current.humidityPercent > 70 && coolingDegrees > 0 ? 1.15 : 1;
  const coolingLoad = coolingDegrees * humidityAdjustment;
  const mode = heatingDegrees > 0 ? 'heating' : coolingLoad > 0 ? 'cooling' : 'neutral';
  const load = mode === 'heating' ? heatingDegrees : mode === 'cooling' ? coolingLoad : 0;
  return {
    mode,
    load,
    level: load >= 12 ? 'high' : load >= 6 ? 'moderate' : load > 0 ? 'low' : 'minimal',
    message: mode === 'heating'
      ? `${load.toFixed(1)} heating degree units below the preferred indoor temperature.`
      : mode === 'cooling'
        ? `${load.toFixed(1)} cooling degree units above the preferred indoor temperature.`
        : 'Outdoor temperature is close to a common indoor comfort range.',
  };
}

export function planVentilation(forecast, airQuality, options = {}) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const offset = forecast?.location?.timezoneOffsetSeconds ?? 0;
  const minimumScore = Number.isFinite(options.minimumScore) ? options.minimumScore : 55;
  const periods = items.map((item) => ({
    forecastAt: item.forecastAt,
    label: formatLocationClock(item.forecastAt, offset),
    score: ventilationScore(item, airQuality?.index),
    temperatureC: item.temperatureC,
    humidityPercent: item.humidityPercent,
    precipitationProbability: item.precipitationProbability,
  }));
  const recommended = periods
    .filter((period) => period.score >= minimumScore)
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);
  return {
    periods,
    recommended,
    best: recommended[0] ?? null,
    message: recommended.length
      ? `A good ventilation window begins around ${recommended[0].label}.`
      : 'Keep windows closed for now; no strong ventilation window appears in the forecast.',
  };
}

export function planOutdoorDrying(forecast) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const offset = forecast?.location?.timezoneOffsetSeconds ?? 0;
  const periods = items.map((item) => ({
    forecastAt: item.forecastAt,
    label: formatLocationClock(item.forecastAt, offset),
    score: dryingScore(item),
    temperatureC: item.temperatureC,
    humidityPercent: item.humidityPercent,
    windSpeedMps: item.windSpeedMps,
  }));
  const best = [...periods].sort((first, second) => second.score - first.score)[0] ?? null;
  return {
    periods,
    best,
    message: !best
      ? 'Drying guidance needs forecast data.'
      : best.score >= 70
        ? `Outdoor drying conditions look good around ${best.label}.`
        : best.score >= 45
          ? `Outdoor drying may be slow; the best available period is around ${best.label}.`
          : 'Indoor drying is the safer choice in this forecast.',
  };
}

export function homeComfortSummary(current, forecast, airQuality) {
  if (!current) return null;
  const energy = homeEnergyLoad(current);
  const ventilation = planVentilation(forecast, airQuality);
  const drying = planOutdoorDrying(forecast);
  const dewPointC = calculateDewPointC(current.temperatureC, current.humidityPercent);
  const humidity = humidityComfort(current.humidityPercent);
  return {
    energy,
    ventilation,
    drying,
    dewPointC,
    humidity,
    actions: [
      ventilation.message,
      drying.message,
      energy?.mode === 'heating' ? 'Close curtains after sunset to reduce heat loss.' : null,
      energy?.mode === 'cooling' ? 'Use shade before direct sun reaches windows.' : null,
      airQuality?.index >= 4 ? 'Use filtered indoor air while outdoor pollution is elevated.' : null,
    ].filter(Boolean),
  };
}
