function ageMinutes(value, now) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / 60_000);
}

function issue(id, severity, title, detail) {
  return { id, severity, title, detail };
}

export function assessWeatherData(current, forecast, airQuality, options = {}) {
  const now = options.now ?? new Date();
  const issues = [];
  let score = 100;
  const currentAgeMinutes = ageMinutes(current?.observedAt, now);
  const airAgeMinutes = ageMinutes(airQuality?.observedAt, now);
  const forecastItems = Array.isArray(forecast?.items) ? forecast.items : [];

  if (!current) {
    issues.push(issue('current-missing', 'error', 'Current conditions unavailable', 'No current weather record is loaded.'));
    score -= 45;
  } else if (currentAgeMinutes === null) {
    issues.push(issue('current-time', 'warning', 'Observation time unavailable', 'Freshness cannot be determined.'));
    score -= 12;
  } else if (currentAgeMinutes > 180) {
    issues.push(issue('current-stale', 'warning', 'Current conditions are old', `The observation is ${Math.round(currentAgeMinutes / 60)} hours old.`));
    score -= 22;
  } else if (currentAgeMinutes > 60) {
    issues.push(issue('current-aging', 'info', 'Current conditions may need a refresh', `The observation is ${Math.round(currentAgeMinutes)} minutes old.`));
    score -= 8;
  }

  if (forecastItems.length < 8) {
    issues.push(issue('forecast-short', 'warning', 'Forecast coverage is limited', `Only ${forecastItems.length} forecast periods are available.`));
    score -= 18;
  }

  const invalidDates = forecastItems.filter((item) => Number.isNaN(Date.parse(item.forecastAt))).length;
  if (invalidDates) {
    issues.push(issue('forecast-dates', 'error', 'Forecast dates are incomplete', `${invalidDates} periods have invalid dates.`));
    score -= Math.min(30, invalidDates * 5);
  }

  const outOfOrder = forecastItems.some((item, index) => (
    index > 0 && Date.parse(item.forecastAt) <= Date.parse(forecastItems[index - 1].forecastAt)
  ));
  if (outOfOrder) {
    issues.push(issue('forecast-order', 'warning', 'Forecast order is inconsistent', 'Some forecast periods overlap or run backward.'));
    score -= 10;
  }

  if (!airQuality) {
    issues.push(issue('air-missing', 'info', 'Air quality unavailable', 'Health guidance uses weather data only.'));
    score -= 5;
  } else if (airAgeMinutes !== null && airAgeMinutes > 360) {
    issues.push(issue('air-stale', 'info', 'Air-quality reading is old', `The reading is ${Math.round(airAgeMinutes / 60)} hours old.`));
    score -= 7;
  }

  const currentLocation = current?.location;
  const forecastLocation = forecast?.location;
  if (currentLocation && forecastLocation) {
    const distance = Math.hypot(
      currentLocation.latitude - forecastLocation.latitude,
      currentLocation.longitude - forecastLocation.longitude,
    );
    if (distance > 0.2) {
      issues.push(issue('location-mismatch', 'error', 'Weather sources do not match', 'Current and forecast coordinates refer to different areas.'));
      score -= 30;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    grade: score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 55 ? 'fair' : 'limited',
    currentAgeMinutes,
    airAgeMinutes,
    forecastPeriods: forecastItems.length,
    issues,
    summary: issues.length
      ? `${issues.length} data-quality note${issues.length === 1 ? '' : 's'} found.`
      : 'Weather data is complete, consistent, and recent.',
  };
}
