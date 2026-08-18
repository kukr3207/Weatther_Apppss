function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateDewPointC(temperatureC, humidityPercent) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPercent)) return null;
  const humidity = clamp(humidityPercent, 1, 100) / 100;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(humidity) + (a * temperatureC) / (b + temperatureC);
  return round((b * gamma) / (a - gamma));
}

export function calculateHeatIndexC(temperatureC, humidityPercent) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPercent)) return null;
  if (temperatureC < 26.7 || humidityPercent < 40) return round(temperatureC);

  const fahrenheit = (temperatureC * 9) / 5 + 32;
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
  } else if (humidity > 85 && fahrenheit >= 80 && fahrenheit <= 87) {
    index += ((humidity - 85) / 10) * ((87 - fahrenheit) / 5);
  }

  return round(((index - 32) * 5) / 9);
}

export function calculateWindChillC(temperatureC, windSpeedMps) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(windSpeedMps)) return null;
  const speedKph = Math.max(0, windSpeedMps * 3.6);
  if (temperatureC > 10 || speedKph <= 4.8) return round(temperatureC);
  const power = speedKph ** 0.16;
  return round(13.12 + 0.6215 * temperatureC - 11.37 * power + 0.3965 * temperatureC * power);
}

export function calculateHumidex(temperatureC, humidityPercent) {
  const dewPointC = calculateDewPointC(temperatureC, humidityPercent);
  if (dewPointC === null) return null;
  const vaporPressure = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + dewPointC)));
  return round(temperatureC + (5 / 9) * (vaporPressure - 10));
}

export function apparentTemperatureC(weather) {
  const temperatureC = weather?.temperatureC;
  const humidityPercent = weather?.humidityPercent;
  const windSpeedMps = weather?.wind?.speedMps;
  if (![temperatureC, humidityPercent, windSpeedMps].every(Number.isFinite)) return null;
  if (temperatureC >= 26.7) return calculateHeatIndexC(temperatureC, humidityPercent);
  if (temperatureC <= 10) return calculateWindChillC(temperatureC, windSpeedMps);
  return round(Number.isFinite(weather?.feelsLikeC) ? weather.feelsLikeC : temperatureC);
}

export function humidityComfort(humidityPercent) {
  if (!Number.isFinite(humidityPercent)) return { level: 'unknown', label: 'Unknown', advice: '' };
  if (humidityPercent < 25) {
    return { level: 'dry', label: 'Very dry', advice: 'Use moisturizer and drink water regularly.' };
  }
  if (humidityPercent < 40) {
    return { level: 'comfortable', label: 'Comfortably dry', advice: 'Indoor and outdoor comfort should be good.' };
  }
  if (humidityPercent <= 60) {
    return { level: 'comfortable', label: 'Comfortable', advice: 'Humidity is in a comfortable range.' };
  }
  if (humidityPercent <= 75) {
    return { level: 'humid', label: 'Humid', advice: 'Light clothing can improve comfort.' };
  }
  return { level: 'oppressive', label: 'Very humid', advice: 'Limit strenuous activity and seek ventilation.' };
}

export function dewPointComfort(dewPointC) {
  if (!Number.isFinite(dewPointC)) return { level: 'unknown', label: 'Unknown' };
  if (dewPointC < 10) return { level: 'dry', label: 'Dry air' };
  if (dewPointC < 16) return { level: 'pleasant', label: 'Pleasant' };
  if (dewPointC < 19) return { level: 'noticeable', label: 'Slightly humid' };
  if (dewPointC < 22) return { level: 'humid', label: 'Humid' };
  if (dewPointC < 24) return { level: 'uncomfortable', label: 'Uncomfortable' };
  return { level: 'oppressive', label: 'Oppressive' };
}

export function comfortSummary(weather) {
  if (!weather) return null;
  const dewPointC = calculateDewPointC(weather.temperatureC, weather.humidityPercent);
  const apparentC = apparentTemperatureC(weather);
  const humidex = calculateHumidex(weather.temperatureC, weather.humidityPercent);
  const humidity = humidityComfort(weather.humidityPercent);
  const dewPoint = dewPointComfort(dewPointC);

  return {
    apparentC,
    dewPointC,
    humidex,
    humidity,
    dewPoint,
    summary: `${humidity.label}; dew point conditions are ${dewPoint.label.toLowerCase()}.`,
  };
}
