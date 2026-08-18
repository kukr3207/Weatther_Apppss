function points(items, selector) {
  return items
    .map((item, index) => ({ index, value: selector(item) }))
    .filter((point) => Number.isFinite(point.value));
}

export function linearTrend(items, selector = (item) => item) {
  const values = points(Array.isArray(items) ? items : [], selector);
  if (values.length < 2) return { slope: 0, change: 0, direction: 'steady', confidence: 0 };

  const count = values.length;
  const meanX = values.reduce((total, point) => total + point.index, 0) / count;
  const meanY = values.reduce((total, point) => total + point.value, 0) / count;
  const numerator = values.reduce(
    (total, point) => total + (point.index - meanX) * (point.value - meanY),
    0,
  );
  const denominator = values.reduce(
    (total, point) => total + (point.index - meanX) ** 2,
    0,
  );
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const change = values.at(-1).value - values[0].value;
  const residual = values.reduce((total, point) => {
    const predicted = meanY + slope * (point.index - meanX);
    return total + (point.value - predicted) ** 2;
  }, 0);
  const spread = values.reduce((total, point) => total + (point.value - meanY) ** 2, 0);
  const confidence = spread === 0 ? 1 : Math.max(0, Math.min(1, 1 - residual / spread));

  return {
    slope,
    change,
    direction: Math.abs(slope) < 0.15 ? 'steady' : slope > 0 ? 'rising' : 'falling',
    confidence,
  };
}

function describeTemperature(trend) {
  if (trend.direction === 'steady') return 'Temperatures should stay fairly steady.';
  const amount = Math.abs(Math.round(trend.change));
  return `Temperatures are ${trend.direction}, changing about ${amount}° over the period.`;
}

function describePressure(trend) {
  if (trend.direction === 'falling' && trend.change <= -4) {
    return 'Pressure is falling quickly, which can signal unsettled weather.';
  }
  if (trend.direction === 'rising' && trend.change >= 4) {
    return 'Pressure is rising, which often supports improving conditions.';
  }
  return 'Pressure is not showing a strong change.';
}

function describeHumidity(trend) {
  if (trend.direction === 'rising' && trend.change >= 10) return 'Humidity will become noticeably higher.';
  if (trend.direction === 'falling' && trend.change <= -10) return 'The air should become drier.';
  return 'Humidity should remain in a similar range.';
}

export function forecastTrends(forecast) {
  const items = Array.isArray(forecast?.items) ? forecast.items : [];
  const temperature = linearTrend(items, (item) => item.temperatureC);
  const humidity = linearTrend(items, (item) => item.humidityPercent);
  const pressure = linearTrend(items, (item) => item.pressureHpa);
  const wind = linearTrend(items, (item) => item.windSpeedMps);
  const precipitation = linearTrend(items, (item) => item.precipitationProbability);

  const highlights = [describeTemperature(temperature), describeHumidity(humidity)];
  if (points(items, (item) => item.pressureHpa).length >= 2) highlights.push(describePressure(pressure));
  if (precipitation.direction === 'rising' && precipitation.change >= 0.25) {
    highlights.push('The chance of precipitation increases later in the forecast.');
  } else if (precipitation.direction === 'falling' && precipitation.change <= -0.25) {
    highlights.push('Precipitation becomes less likely later in the forecast.');
  }

  return { temperature, humidity, pressure, wind, precipitation, highlights };
}

export function minMax(items, selector = (item) => item) {
  const values = points(Array.isArray(items) ? items : [], selector).map((point) => point.value);
  return values.length
    ? { minimum: Math.min(...values), maximum: Math.max(...values) }
    : { minimum: null, maximum: null };
}

export function normalizeSeries(items, selector = (item) => item) {
  const range = minMax(items, selector);
  if (range.minimum === null) return [];
  const span = range.maximum - range.minimum;
  return items.map((item, index) => {
    const value = selector(item);
    return {
      index,
      value,
      normalized: Number.isFinite(value) ? (span === 0 ? 0.5 : (value - range.minimum) / span) : null,
    };
  });
}
