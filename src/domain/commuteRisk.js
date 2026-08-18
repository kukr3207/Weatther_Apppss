import { formatLocationClock } from './time';

function riskForPeriod(item) {
  const reasons = [];
  let score = 0;
  const precipitation = Number.isFinite(item.precipitationProbability) ? item.precipitationProbability : 0;
  const wind = Number.isFinite(item.windSpeedMps) ? item.windSpeedMps : 0;
  const temperature = item.temperatureC;
  const description = item.condition?.description?.toLowerCase() ?? '';

  if (precipitation >= 0.75) {
    score += 35;
    reasons.push('rain is likely');
  } else if (precipitation >= 0.4) {
    score += 18;
    reasons.push('showers are possible');
  }
  if ((item.rainMm ?? 0) >= 8) {
    score += 25;
    reasons.push('rain may be heavy');
  }
  if (wind >= 20) {
    score += 35;
    reasons.push('winds may be hazardous');
  } else if (wind >= 12) {
    score += 18;
    reasons.push('strong wind may slow travel');
  }
  if (Number.isFinite(temperature) && temperature <= 0) {
    score += 25;
    reasons.push('ice is possible');
  } else if (Number.isFinite(temperature) && temperature >= 38) {
    score += 20;
    reasons.push('heat may make travel uncomfortable');
  }
  if (description.includes('thunder')) {
    score += 45;
    reasons.push('thunderstorms are possible');
  }
  if (description.includes('snow')) {
    score += 35;
    reasons.push('snow may affect surfaces');
  }
  if (description.includes('fog') || description.includes('mist')) {
    score += 22;
    reasons.push('visibility may be limited');
  }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    level: score >= 70 ? 'high' : score >= 35 ? 'moderate' : score >= 15 ? 'low' : 'minimal',
    reasons: reasons.length ? reasons : ['no significant travel hazards are indicated'],
  };
}

export function commuteOutlook(forecast, options = {}) {
  const offset = forecast?.location?.timezoneOffsetSeconds ?? 0;
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const periods = items.map((item) => ({
    ...riskForPeriod(item),
    forecastAt: item.forecastAt,
    label: formatLocationClock(item.forecastAt, offset),
    condition: item.condition,
    temperatureC: item.temperatureC,
  }));
  const highest = [...periods].sort((first, second) => second.score - first.score)[0] ?? null;
  const safest = [...periods].sort((first, second) => first.score - second.score)[0] ?? null;
  return {
    periods: periods.slice(0, options.limit ?? 8),
    highest,
    safest,
    summary: highest
      ? `The highest travel risk is ${highest.level} around ${highest.label}.`
      : 'Travel risk needs forecast data.',
  };
}

export function commuteAdvice(period, mode = 'general') {
  if (!period) return [];
  const advice = [];
  if (period.score >= 35) advice.push('Allow extra travel time and check conditions before leaving.');
  if (period.reasons.some((reason) => reason.includes('rain'))) advice.push('Keep extra stopping distance on wet roads.');
  if (period.reasons.some((reason) => reason.includes('wind'))) advice.push('Use care on exposed roads, bridges, and cycle routes.');
  if (period.reasons.some((reason) => reason.includes('ice'))) advice.push('Watch for untreated surfaces and shaded areas.');
  if (mode === 'cycling' && period.score >= 15) advice.push('Use visible waterproof clothing and secure loose items.');
  if (mode === 'walking' && period.score >= 15) advice.push('Choose sheltered routes where possible.');
  if (!advice.length) advice.push('Normal travel planning should be sufficient.');
  return advice;
}
