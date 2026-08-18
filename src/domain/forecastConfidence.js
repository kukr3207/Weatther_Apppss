import { groupForecastByDay } from './dailyForecast';

function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
}

function dayConfidence(day, index) {
  const temperatures = day.items.map((item) => item.temperatureC).filter(Number.isFinite);
  const probabilities = day.items.map((item) => item.precipitationProbability).filter(Number.isFinite);
  const conditionCodes = new Set(day.items.map((item) => item.condition?.iconCode?.slice(0, 2)).filter(Boolean));
  let score = 92 - index * 8;
  score -= Math.min(18, variance(temperatures) * 0.7);
  score -= Math.min(12, variance(probabilities) * 40);
  score -= Math.max(0, conditionCodes.size - 2) * 4;
  score = Math.max(25, Math.min(95, Math.round(score)));
  const factors = [];
  if (index >= 3) factors.push('farther into the forecast');
  if (conditionCodes.size >= 4) factors.push('several condition changes');
  if (variance(probabilities) >= 0.08) factors.push('changing precipitation guidance');
  if (!factors.length) factors.push('consistent nearby forecast periods');
  return {
    dateKey: day.dateKey,
    label: day.label,
    score,
    level: score >= 80 ? 'high' : score >= 60 ? 'moderate' : 'limited',
    factors,
  };
}

export function forecastConfidence(forecast) {
  const days = groupForecastByDay(forecast, { limit: 7 });
  const daily = days.map(dayConfidence);
  const overall = daily.length
    ? Math.round(daily.reduce((total, day) => total + day.score, 0) / daily.length)
    : null;
  return {
    overall,
    level: overall === null ? 'unavailable' : overall >= 80 ? 'high' : overall >= 60 ? 'moderate' : 'limited',
    daily,
    explanation: overall === null
      ? 'Forecast confidence needs forecast periods.'
      : 'Confidence is an estimate based on forecast distance and agreement between nearby periods.',
  };
}
