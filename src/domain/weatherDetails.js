const BEAUFORT_SCALE = Object.freeze([
  { maximumMps: 0.2, force: 0, label: 'Calm', effect: 'Smoke rises vertically.' },
  { maximumMps: 1.5, force: 1, label: 'Light air', effect: 'Wind direction is visible in smoke.' },
  { maximumMps: 3.3, force: 2, label: 'Light breeze', effect: 'Leaves rustle and wind is felt on the face.' },
  { maximumMps: 5.4, force: 3, label: 'Gentle breeze', effect: 'Leaves and small twigs move continuously.' },
  { maximumMps: 7.9, force: 4, label: 'Moderate breeze', effect: 'Dust and loose paper can lift.' },
  { maximumMps: 10.7, force: 5, label: 'Fresh breeze', effect: 'Small trees sway.' },
  { maximumMps: 13.8, force: 6, label: 'Strong breeze', effect: 'Large branches move and umbrellas become difficult.' },
  { maximumMps: 17.1, force: 7, label: 'Near gale', effect: 'Whole trees move and walking against wind is difficult.' },
  { maximumMps: 20.7, force: 8, label: 'Gale', effect: 'Twigs can break from trees.' },
  { maximumMps: 24.4, force: 9, label: 'Strong gale', effect: 'Minor structural damage is possible.' },
  { maximumMps: 28.4, force: 10, label: 'Storm', effect: 'Trees can be uprooted.' },
  { maximumMps: 32.6, force: 11, label: 'Violent storm', effect: 'Widespread damage is possible.' },
  { maximumMps: Infinity, force: 12, label: 'Hurricane force', effect: 'Severe and widespread damage is possible.' },
]);

export function beaufortWind(speedMps) {
  if (!Number.isFinite(speedMps) || speedMps < 0) return null;
  return BEAUFORT_SCALE.find((band) => speedMps <= band.maximumMps) ?? BEAUFORT_SCALE.at(-1);
}

export function pressureCategory(pressureHpa) {
  if (!Number.isFinite(pressureHpa)) return { key: 'unknown', label: 'Unknown pressure', guidance: '' };
  if (pressureHpa < 990) {
    return { key: 'very-low', label: 'Very low pressure', guidance: 'Low pressure often accompanies active or stormy weather.' };
  }
  if (pressureHpa < 1005) {
    return { key: 'low', label: 'Low pressure', guidance: 'Conditions may stay unsettled or changeable.' };
  }
  if (pressureHpa <= 1020) {
    return { key: 'normal', label: 'Typical pressure', guidance: 'Pressure is near the common sea-level range.' };
  }
  if (pressureHpa <= 1035) {
    return { key: 'high', label: 'High pressure', guidance: 'High pressure often supports quieter weather.' };
  }
  return { key: 'very-high', label: 'Very high pressure', guidance: 'A strong high-pressure system may support settled conditions.' };
}

export function visibilityCategory(visibilityMeters) {
  if (!Number.isFinite(visibilityMeters)) return { key: 'unknown', label: 'Unavailable', guidance: '' };
  if (visibilityMeters < 200) return { key: 'very-poor', label: 'Very poor', guidance: 'Avoid unnecessary travel if visibility is this restricted.' };
  if (visibilityMeters < 1_000) return { key: 'poor', label: 'Poor', guidance: 'Allow more braking distance and use suitable vehicle lights.' };
  if (visibilityMeters < 4_000) return { key: 'moderate', label: 'Moderate', guidance: 'Distant landmarks may be obscured.' };
  if (visibilityMeters < 10_000) return { key: 'good', label: 'Good', guidance: 'Visibility should not significantly affect most plans.' };
  return { key: 'excellent', label: 'Excellent', guidance: 'Long-range visibility is clear.' };
}

export function gustFactor(wind) {
  const sustained = wind?.speedMps;
  const gust = wind?.gustMps;
  if (!Number.isFinite(sustained) || !Number.isFinite(gust) || sustained <= 0) return null;
  const factor = gust / sustained;
  return {
    factor,
    label: factor >= 2 ? 'Very gusty' : factor >= 1.5 ? 'Gusty' : 'Fairly steady',
    differenceMps: gust - sustained,
  };
}

export function detailedConditions(weather) {
  if (!weather) return null;
  const wind = beaufortWind(weather.wind?.speedMps);
  const pressure = pressureCategory(weather.pressureHpa);
  const visibility = visibilityCategory(weather.visibilityMeters);
  const gusts = gustFactor(weather.wind);
  return {
    wind,
    pressure,
    visibility,
    gusts,
    cards: [
      wind ? { id: 'wind-force', title: `Force ${wind.force}: ${wind.label}`, detail: wind.effect } : null,
      { id: 'pressure', title: pressure.label, detail: pressure.guidance },
      { id: 'visibility', title: `${visibility.label} visibility`, detail: visibility.guidance },
      gusts ? { id: 'gusts', title: gusts.label, detail: `Gusts are ${gusts.differenceMps.toFixed(1)} m/s above sustained wind.` } : null,
    ].filter(Boolean),
  };
}
