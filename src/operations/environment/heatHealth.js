import { assertArray, clamp, deepFreeze, round } from '../core/validation';
import { maximum, mean } from '../core/statistics';

export function dewPointCelsius(temperatureC, humidityPercent) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPercent) || humidityPercent <= 0) return null;
  const humidity = clamp(humidityPercent, 1, 100) / 100;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(humidity) + a * temperatureC / (b + temperatureC);
  return round(b * gamma / (a - gamma), 2);
}

export function heatIndexCelsius(temperatureC, humidityPercent) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPercent)) return null;
  if (temperatureC < 26.7 || humidityPercent < 40) return round(temperatureC, 1);
  const fahrenheit = temperatureC * 9 / 5 + 32;
  const humidity = clamp(humidityPercent, 0, 100);
  let index = -42.379
    + 2.04901523 * fahrenheit
    + 10.14333127 * humidity
    - 0.22475541 * fahrenheit * humidity
    - 0.00683783 * fahrenheit ** 2
    - 0.05481717 * humidity ** 2
    + 0.00122874 * fahrenheit ** 2 * humidity
    + 0.00085282 * fahrenheit * humidity ** 2
    - 0.00000199 * fahrenheit ** 2 * humidity ** 2;
  if (humidity < 13 && fahrenheit >= 80 && fahrenheit <= 112) {
    index -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(fahrenheit - 95)) / 17);
  }
  if (humidity > 85 && fahrenheit >= 80 && fahrenheit <= 87) {
    index += ((humidity - 85) / 10) * ((87 - fahrenheit) / 5);
  }
  return round((index - 32) * 5 / 9, 1);
}

export function windChillCelsius(temperatureC, windSpeedMps) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(windSpeedMps)) return null;
  const windKph = windSpeedMps * 3.6;
  if (temperatureC > 10 || windKph < 4.8) return round(temperatureC, 1);
  return round(13.12 + 0.6215 * temperatureC - 11.37 * windKph ** 0.16
    + 0.3965 * temperatureC * windKph ** 0.16, 1);
}

export function wetBulbTemperatureC(temperatureC, humidityPercent) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPercent)) return null;
  const humidity = clamp(humidityPercent, 1, 100);
  return round(
    temperatureC * Math.atan(0.151977 * Math.sqrt(humidity + 8.313659))
    + Math.atan(temperatureC + humidity)
    - Math.atan(humidity - 1.676331)
    + 0.00391838 * humidity ** 1.5 * Math.atan(0.023101 * humidity)
    - 4.686035,
    1,
  );
}

export function apparentTemperature(reading) {
  const temperature = reading.temperatureC;
  const humidity = reading.humidityPercent;
  const wind = reading.windSpeedMps;
  const heat = heatIndexCelsius(temperature, humidity);
  const chill = windChillCelsius(temperature, wind);
  const apparent = temperature >= 20 ? heat : chill;
  return deepFreeze({
    temperatureC: temperature,
    apparentC: apparent,
    heatIndexC: heat,
    windChillC: chill,
    wetBulbC: wetBulbTemperatureC(temperature, humidity),
    dewPointC: dewPointCelsius(temperature, humidity),
  });
}

function vulnerabilityMultiplier(profile) {
  let value = 1;
  if (profile.ageGroup === 'child') value += 0.15;
  if (profile.ageGroup === 'older_adult') value += 0.3;
  if (profile.pregnant) value += 0.15;
  if (profile.cardiovascular) value += 0.2;
  if (profile.respiratory) value += 0.15;
  if (profile.outdoorWorker) value += 0.2;
  if (profile.acclimatized === false) value += 0.15;
  return value;
}

export function heatHealthRisk(reading, profile = {}) {
  const values = apparentTemperature(reading);
  const wetBulb = values.wetBulbC ?? reading.temperatureC;
  const apparent = values.apparentC ?? reading.temperatureC;
  let base = 0;
  if (apparent >= 54) base = 100;
  else if (apparent >= 41) base = 85;
  else if (apparent >= 32) base = 65;
  else if (apparent >= 27) base = 35;
  else base = 10;
  if (wetBulb >= 35) base = 100;
  else if (wetBulb >= 31) base = Math.max(base, 90);
  else if (wetBulb >= 28) base = Math.max(base, 70);
  const score = clamp(base * vulnerabilityMultiplier(profile), 0, 100);
  const level = score >= 90 ? 'extreme' : score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low';
  const advice = [];
  if (score >= 70) advice.push('Move strenuous activity to a cooler time and use frequent cooling breaks.');
  if (score >= 40) advice.push('Drink water regularly and watch for heat illness symptoms.');
  if (score < 40) advice.push('Normal hydration and sun protection are appropriate.');
  if ((reading.uvIndex ?? 0) >= 6) advice.push('Use shade, protective clothing, and broad-spectrum sunscreen.');
  return deepFreeze({ score: round(score, 1), level, ...values, advice });
}

export function coldHealthRisk(reading, profile = {}) {
  const values = apparentTemperature(reading);
  const chill = values.windChillC ?? reading.temperatureC;
  let base = chill <= -40 ? 100 : chill <= -28 ? 85 : chill <= -15 ? 65 : chill <= -5 ? 40 : 10;
  if (profile.ageGroup === 'child' || profile.ageGroup === 'older_adult') base *= 1.2;
  if (profile.outdoorWorker) base *= 1.15;
  const score = clamp(base, 0, 100);
  return deepFreeze({
    score: round(score, 1),
    level: score >= 85 ? 'extreme' : score >= 65 ? 'high' : score >= 40 ? 'moderate' : 'low',
    ...values,
    advice: score >= 65
      ? ['Limit exposed skin and take frequent warm-up breaks.']
      : score >= 40 ? ['Wear insulating layers and protect hands and ears.'] : ['Dress for the temperature.'],
  });
}

export function summarizeThermalRisk(periods, profile = {}) {
  const selected = assertArray(periods, 'Forecast periods', { nonEmpty: true });
  const assessments = selected.map((period) => ({
    forecastAt: period.forecastAt,
    heat: heatHealthRisk(period, profile),
    cold: coldHealthRisk(period, profile),
  }));
  const heatScores = assessments.map((entry) => entry.heat.score);
  const coldScores = assessments.map((entry) => entry.cold.score);
  return deepFreeze({
    assessments,
    maximumHeatRisk: maximum(heatScores),
    maximumColdRisk: maximum(coldScores),
    averageHeatRisk: round(mean(heatScores), 1),
    averageColdRisk: round(mean(coldScores), 1),
  });
}
