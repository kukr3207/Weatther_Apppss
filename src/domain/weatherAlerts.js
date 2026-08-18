import { compareIsoDates } from './time';

export const ALERT_SEVERITIES = Object.freeze({
  info: Object.freeze({ rank: 1, label: 'Advisory' }),
  watch: Object.freeze({ rank: 2, label: 'Watch' }),
  warning: Object.freeze({ rank: 3, label: 'Warning' }),
  emergency: Object.freeze({ rank: 4, label: 'Emergency' }),
});

function alertId(type, startsAt) {
  return `derived:${type}:${startsAt ?? 'current'}`;
}

function derivedAlert(type, severity, title, message, startsAt, endsAt, details = {}) {
  return {
    id: alertId(type, startsAt),
    source: 'forecast',
    type,
    severity,
    title,
    message,
    startsAt: startsAt ?? null,
    endsAt: endsAt ?? null,
    details,
  };
}

function forecastAlerts(forecast) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const alerts = [];
  items.forEach((item) => {
    const at = item.forecastAt;
    const endsAt = Number.isNaN(Date.parse(at)) ? null : new Date(Date.parse(at) + 10_800_000).toISOString();
    const description = item.condition?.description?.toLowerCase() ?? '';

    if (Number.isFinite(item.maximumC) && item.maximumC >= 38) {
      alerts.push(derivedAlert(
        'extreme-heat',
        item.maximumC >= 43 ? 'warning' : 'watch',
        'Dangerous heat possible',
        `Temperatures may reach ${Math.round(item.maximumC)}°C. Plan shade, water, and rest breaks.`,
        at,
        endsAt,
        { temperatureC: item.maximumC },
      ));
    }
    if (Number.isFinite(item.minimumC) && item.minimumC <= -5) {
      alerts.push(derivedAlert(
        'hard-freeze',
        item.minimumC <= -15 ? 'warning' : 'watch',
        'Hard freeze possible',
        `Temperatures may fall to ${Math.round(item.minimumC)}°C. Protect people, pets, and exposed pipes.`,
        at,
        endsAt,
        { temperatureC: item.minimumC },
      ));
    }
    if (Number.isFinite(item.windSpeedMps) && item.windSpeedMps >= 15) {
      alerts.push(derivedAlert(
        'strong-wind',
        item.windSpeedMps >= 24 ? 'warning' : 'watch',
        'Strong winds expected',
        `Winds may reach ${Math.round(item.windSpeedMps)} m/s. Secure loose outdoor items.`,
        at,
        endsAt,
        { windSpeedMps: item.windSpeedMps },
      ));
    }
    if ((item.rainMm ?? 0) >= 15 || (item.precipitationProbability >= 0.85 && (item.rainMm ?? 0) >= 8)) {
      alerts.push(derivedAlert(
        'heavy-rain',
        (item.rainMm ?? 0) >= 30 ? 'warning' : 'watch',
        'Heavy rain possible',
        `${Math.round(item.rainMm)} mm of rain is forecast for this period. Watch for poor drainage and difficult travel.`,
        at,
        endsAt,
        { rainMm: item.rainMm },
      ));
    }
    if (description.includes('thunder')) {
      alerts.push(derivedAlert(
        'thunderstorm',
        'warning',
        'Thunderstorms possible',
        'Move indoors when thunder is heard and postpone exposed outdoor activities.',
        at,
        endsAt,
      ));
    }
    if (description.includes('snow') && (item.precipitationProbability ?? 0) >= 0.5) {
      alerts.push(derivedAlert(
        'snow',
        'watch',
        'Snow may affect travel',
        'Allow extra travel time and check local road conditions before leaving.',
        at,
        endsAt,
      ));
    }
  });
  return alerts;
}

function currentAlerts(current) {
  if (!current) return [];
  const alerts = [];
  if (Number.isFinite(current.visibilityMeters) && current.visibilityMeters < 1_000) {
    alerts.push(derivedAlert(
      'low-visibility',
      current.visibilityMeters < 250 ? 'warning' : 'watch',
      'Visibility is limited',
      `Visibility is about ${Math.round(current.visibilityMeters)} metres. Slow down and use appropriate lights.`,
      current.observedAt,
      null,
      { visibilityMeters: current.visibilityMeters },
    ));
  }
  if (Number.isFinite(current.wind?.gustMps) && current.wind.gustMps >= 20) {
    alerts.push(derivedAlert(
      'wind-gusts',
      current.wind.gustMps >= 28 ? 'warning' : 'watch',
      'Strong wind gusts observed',
      `Gusts are reaching ${Math.round(current.wind.gustMps)} m/s. Use care around trees and temporary structures.`,
      current.observedAt,
      null,
      { gustMps: current.wind.gustMps },
    ));
  }
  return alerts;
}

function deduplicate(alerts) {
  const byType = new Map();
  alerts.forEach((alert) => {
    const current = byType.get(alert.type);
    if (!current || ALERT_SEVERITIES[alert.severity].rank > ALERT_SEVERITIES[current.severity].rank) {
      byType.set(alert.type, alert);
    }
  });
  return [...byType.values()];
}

export function deriveWeatherAlerts(current, forecast, providerAlerts = []) {
  return deduplicate([
    ...(Array.isArray(providerAlerts) ? providerAlerts : []),
    ...currentAlerts(current),
    ...forecastAlerts(forecast),
  ]).sort((first, second) => (
    ALERT_SEVERITIES[second.severity].rank - ALERT_SEVERITIES[first.severity].rank
    || compareIsoDates(first.startsAt, second.startsAt)
  ));
}

export function filterAlerts(alerts, preferences = {}) {
  const disabledTypes = new Set(Array.isArray(preferences.disabledTypes) ? preferences.disabledTypes : []);
  const minimumRank = ALERT_SEVERITIES[preferences.minimumSeverity]?.rank ?? 1;
  return (Array.isArray(alerts) ? alerts : []).filter((alert) => (
    !disabledTypes.has(alert.type)
    && (ALERT_SEVERITIES[alert.severity]?.rank ?? 0) >= minimumRank
  ));
}

export function alertCounts(alerts) {
  return (Array.isArray(alerts) ? alerts : []).reduce((counts, alert) => {
    counts.total += 1;
    counts[alert.severity] = (counts[alert.severity] ?? 0) + 1;
    return counts;
  }, { total: 0, info: 0, watch: 0, warning: 0, emergency: 0 });
}
