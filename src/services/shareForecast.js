import { formatTemperature } from '../domain/units';
import { groupForecastByDay } from '../domain/dailyForecast';

export function forecastShareText(current, forecast, unitSystem = 'metric') {
  if (!current?.location) return '';
  const location = `${current.location.name}, ${current.location.country}`;
  const lines = [
    `${location}: ${formatTemperature(current.temperatureC, unitSystem)}, ${current.condition.description}.`,
  ];
  groupForecastByDay(forecast, { limit: 3 }).forEach((day) => {
    lines.push(
      `${day.label}: ${formatTemperature(day.minimumC, unitSystem)}–${formatTemperature(day.maximumC, unitSystem)}, ${day.condition.description}.`,
    );
  });
  lines.push('Shared from Weather Workspace.');
  return lines.join('\n');
}

export async function shareForecast(current, forecast, unitSystem, options = {}) {
  const text = forecastShareText(current, forecast, unitSystem);
  if (!text) return { method: 'none', shared: false };
  const navigatorRef = options.navigator ?? globalThis.navigator;
  if (typeof navigatorRef?.share === 'function') {
    try {
      await navigatorRef.share({
        title: `Weather for ${current.location.name}`,
        text,
      });
      return { method: 'share', shared: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'share', shared: false };
    }
  }
  if (typeof navigatorRef?.clipboard?.writeText === 'function') {
    await navigatorRef.clipboard.writeText(text);
    return { method: 'clipboard', shared: true };
  }
  return { method: 'text', shared: false, text };
}
