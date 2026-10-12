import { assertArray, clamp, deepFreeze, round } from '../core/validation';
import { maximum } from '../core/statistics';

function skinFactor(type) {
  return { I: 0.67, II: 1, III: 1.35, IV: 1.7, V: 2.2, VI: 2.8 }[type] ?? 1;
}

export function uvRisk(uvIndex, profile = {}) {
  const uv = clamp(uvIndex ?? 0, 0, 30);
  const factor = skinFactor(profile.skinType ?? 'II');
  const medicationFactor = profile.photosensitizingMedication ? 0.7 : 1;
  const altitudeFactor = 1 + Math.max(0, profile.altitudeMeters ?? 0) / 10_000;
  const unprotectedMinutes = uv > 0 ? 200 * factor * medicationFactor / (uv * altitudeFactor) : Infinity;
  const level = uv < 3 ? 'low' : uv < 6 ? 'moderate' : uv < 8 ? 'high' : uv < 11 ? 'very_high' : 'extreme';
  const advice = [];
  if (uv >= 3) advice.push('Use broad-spectrum sunscreen and seek shade near solar noon.');
  if (uv >= 6) advice.push('Wear protective clothing, a hat, and UV-blocking sunglasses.');
  if (uv >= 8) advice.push('Reduce time in direct sun during the middle of the day.');
  if (uv < 3) advice.push('Routine protection is sufficient for most people.');
  return deepFreeze({
    uvIndex: round(uv, 1),
    level,
    estimatedUnprotectedMinutes: Number.isFinite(unprotectedMinutes) ? round(unprotectedMinutes, 0) : null,
    advice,
  });
}

export function sunscreenReapplication(profile = {}, activity = {}) {
  let minutes = profile.spf >= 50 ? 120 : profile.spf >= 30 ? 100 : 80;
  if (activity.swimming) minutes = Math.min(minutes, 40);
  if (activity.waterResistant) minutes = Math.min(minutes, 80);
  if (activity.sweating || activity.towelDrying) minutes = Math.min(minutes, 60);
  return minutes;
}

export function summarizeUvForecast(periods, profile = {}) {
  const assessments = assertArray(periods, 'UV forecast periods', { nonEmpty: true }).map((period) => ({
    forecastAt: period.forecastAt,
    assessment: uvRisk(period.uvIndex, profile),
  }));
  const peak = maximum(assessments.map((entry) => entry.assessment.uvIndex));
  return deepFreeze({
    assessments,
    maximumUvIndex: peak,
    peakAt: assessments.find((entry) => entry.assessment.uvIndex === peak)?.forecastAt ?? null,
    highRiskPeriods: assessments.filter((entry) => entry.assessment.uvIndex >= 6).length,
  });
}
