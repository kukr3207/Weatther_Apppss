const CONDITION_GROUPS = Object.freeze({
  '01': { key: 'clear', label: 'Clear sky', icon: 'clear' },
  '02': { key: 'partly-cloudy', label: 'Partly cloudy', icon: 'cloud' },
  '03': { key: 'cloudy', label: 'Cloudy', icon: 'cloud' },
  '04': { key: 'overcast', label: 'Overcast', icon: 'cloud' },
  '09': { key: 'showers', label: 'Rain showers', icon: 'rain' },
  '10': { key: 'rain', label: 'Rain', icon: 'rain' },
  '11': { key: 'storm', label: 'Thunderstorm', icon: 'rain' },
  '13': { key: 'snow', label: 'Snow', icon: 'snow' },
  '50': { key: 'mist', label: 'Mist', icon: 'drizzle' },
});

const FALLBACK_CONDITION = Object.freeze({
  key: 'unknown',
  label: 'Conditions unavailable',
  icon: 'cloud',
});

export function conditionForIcon(iconCode) {
  const prefix = typeof iconCode === 'string' ? iconCode.slice(0, 2) : '';
  return CONDITION_GROUPS[prefix] ?? FALLBACK_CONDITION;
}

export function conditionLabel(iconCode, description) {
  const detail = typeof description === 'string' ? description.trim() : '';
  if (detail) return detail.charAt(0).toUpperCase() + detail.slice(1);
  return conditionForIcon(iconCode).label;
}

export function isNightIcon(iconCode) {
  return typeof iconCode === 'string' && iconCode.endsWith('n');
}
