import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import { maximum, mean, minimum, sum } from '../core/statistics';

export const PHENOLOGY_PROFILES = Object.freeze({
  apple: {
    name: 'Apple',
    baseTemperatureC: 4,
    upperTemperatureC: 30,
    chillRequirementHours: 900,
    stages: [
      { id: 'bud_swell', degreeDays: 55 },
      { id: 'green_tip', degreeDays: 85 },
      { id: 'flowering', degreeDays: 145 },
      { id: 'fruit_set', degreeDays: 230 },
      { id: 'harvest', degreeDays: 1450 },
    ],
    frostThresholds: { dormant: -20, bud_swell: -8, green_tip: -4, flowering: -2, fruit_set: -1 },
  },
  cherry: {
    name: 'Cherry',
    baseTemperatureC: 4,
    upperTemperatureC: 30,
    chillRequirementHours: 800,
    stages: [
      { id: 'bud_swell', degreeDays: 45 },
      { id: 'green_tip', degreeDays: 70 },
      { id: 'flowering', degreeDays: 120 },
      { id: 'fruit_set', degreeDays: 190 },
      { id: 'harvest', degreeDays: 900 },
    ],
    frostThresholds: { dormant: -18, bud_swell: -7, green_tip: -4, flowering: -2, fruit_set: -1 },
  },
  grape: {
    name: 'Grapevine',
    baseTemperatureC: 10,
    upperTemperatureC: 35,
    chillRequirementHours: 300,
    stages: [
      { id: 'budburst', degreeDays: 50 },
      { id: 'flowering', degreeDays: 300 },
      { id: 'fruit_set', degreeDays: 420 },
      { id: 'veraison', degreeDays: 1000 },
      { id: 'harvest', degreeDays: 1450 },
    ],
    frostThresholds: { dormant: -15, budburst: -1, flowering: 0, fruit_set: 1, veraison: 0 },
  },
  wheat: {
    name: 'Winter wheat',
    baseTemperatureC: 0,
    upperTemperatureC: 30,
    chillRequirementHours: 0,
    stages: [
      { id: 'emergence', degreeDays: 110 },
      { id: 'tillering', degreeDays: 300 },
      { id: 'stem_extension', degreeDays: 650 },
      { id: 'heading', degreeDays: 1050 },
      { id: 'maturity', degreeDays: 1800 },
    ],
    frostThresholds: { emergence: -8, tillering: -12, stem_extension: -4, heading: -2, maturity: -1 },
  },
  maize: {
    name: 'Maize',
    baseTemperatureC: 10,
    upperTemperatureC: 30,
    chillRequirementHours: 0,
    stages: [
      { id: 'emergence', degreeDays: 125 },
      { id: 'six_leaf', degreeDays: 475 },
      { id: 'tasseling', degreeDays: 950 },
      { id: 'silking', degreeDays: 1050 },
      { id: 'maturity', degreeDays: 2300 },
    ],
    frostThresholds: { emergence: 0, six_leaf: 0, tasseling: 2, silking: 2, maturity: 0 },
  },
  rice: {
    name: 'Rice',
    baseTemperatureC: 10,
    upperTemperatureC: 35,
    chillRequirementHours: 0,
    stages: [
      { id: 'emergence', degreeDays: 100 },
      { id: 'tillering', degreeDays: 450 },
      { id: 'panicle_initiation', degreeDays: 900 },
      { id: 'flowering', degreeDays: 1300 },
      { id: 'maturity', degreeDays: 2100 },
    ],
    frostThresholds: { emergence: 4, tillering: 5, panicle_initiation: 8, flowering: 10, maturity: 4 },
  },
  tomato: {
    name: 'Tomato',
    baseTemperatureC: 10,
    upperTemperatureC: 32,
    chillRequirementHours: 0,
    stages: [
      { id: 'emergence', degreeDays: 120 },
      { id: 'transplant', degreeDays: 350 },
      { id: 'flowering', degreeDays: 700 },
      { id: 'fruit_set', degreeDays: 850 },
      { id: 'first_harvest', degreeDays: 1400 },
    ],
    frostThresholds: { emergence: 2, transplant: 2, flowering: 4, fruit_set: 4, first_harvest: 2 },
  },
  soybean: {
    name: 'Soybean',
    baseTemperatureC: 10,
    upperTemperatureC: 30,
    chillRequirementHours: 0,
    stages: [
      { id: 'emergence', degreeDays: 130 },
      { id: 'third_node', degreeDays: 420 },
      { id: 'flowering', degreeDays: 750 },
      { id: 'pod_set', degreeDays: 1050 },
      { id: 'maturity', degreeDays: 2200 },
    ],
    frostThresholds: { emergence: -1, third_node: -1, flowering: 1, pod_set: 1, maturity: -1 },
  },
  lilac: {
    name: 'Common lilac',
    baseTemperatureC: 4,
    upperTemperatureC: 30,
    chillRequirementHours: 600,
    stages: [
      { id: 'bud_swell', degreeDays: 60 },
      { id: 'first_leaf', degreeDays: 95 },
      { id: 'first_bloom', degreeDays: 180 },
      { id: 'full_bloom', degreeDays: 240 },
      { id: 'fruit', degreeDays: 600 },
    ],
    frostThresholds: { dormant: -25, bud_swell: -8, first_leaf: -4, first_bloom: -2, full_bloom: -1 },
  },
  ragweed: {
    name: 'Common ragweed',
    baseTemperatureC: 8,
    upperTemperatureC: 35,
    chillRequirementHours: 0,
    stages: [
      { id: 'emergence', degreeDays: 250 },
      { id: 'vegetative', degreeDays: 650 },
      { id: 'pollen_start', degreeDays: 1100 },
      { id: 'pollen_peak', degreeDays: 1400 },
      { id: 'senescence', degreeDays: 2100 },
    ],
    frostThresholds: { emergence: -1, vegetative: -1, pollen_start: 0, pollen_peak: 0, senescence: -2 },
  },
});

function profileFor(input, overrides = {}) {
  const base = typeof input === 'string' ? PHENOLOGY_PROFILES[input] : input;
  if (!base) throw new TypeError(`Unknown phenology profile: ${input}.`);
  assertObject(base, 'Phenology profile');
  return deepFreeze({ ...base, ...overrides });
}

function normalizeDay(day, index) {
  assertObject(day, `Phenology day ${index + 1}`);
  const dateValue = day.date ?? day.observedAt ?? day.forecastAt;
  const date = new Date(parseTimestamp(dateValue, `Phenology day ${index + 1} date`)).toISOString().slice(0, 10);
  const minimumC = assertFiniteNumber(day.minimumC ?? day.minTemperatureC, `${date} minimum temperature`);
  const maximumC = assertFiniteNumber(day.maximumC ?? day.maxTemperatureC, `${date} maximum temperature`);
  if (maximumC < minimumC) throw new TypeError(`${date} maximum temperature is below its minimum.`);
  return deepFreeze({
    ...day,
    date,
    minimumC,
    maximumC,
    meanC: Number.isFinite(day.meanC) ? day.meanC : (minimumC + maximumC) / 2,
  });
}

function dailyDegreeDay(day, base, upper) {
  const boundedMinimum = Math.max(base, Math.min(upper, day.minimumC));
  const boundedMaximum = Math.max(base, Math.min(upper, day.maximumC));
  return Math.max(0, (boundedMinimum + boundedMaximum) / 2 - base);
}

export function calculatePhenologyThermalTime(daysInput, profileInput, options = {}) {
  const profile = profileFor(profileInput, options.profile);
  const days = assertArray(daysInput, 'Phenology days', { nonEmpty: true }).map(normalizeDay)
    .sort((first, second) => first.date.localeCompare(second.date));
  const base = assertFiniteNumber(options.baseTemperatureC ?? profile.baseTemperatureC, 'Base temperature');
  const upper = assertFiniteNumber(options.upperTemperatureC ?? profile.upperTemperatureC, 'Upper temperature');
  if (upper <= base) throw new TypeError('Upper temperature must exceed base temperature.');
  let cumulative = assertFiniteNumber(options.startingDegreeDays ?? 0, 'Starting degree days', { minimum: 0 });
  const series = days.map((day) => {
    const degreeDays = dailyDegreeDay(day, base, upper);
    cumulative += degreeDays;
    return deepFreeze({
      date: day.date,
      minimumC: day.minimumC,
      maximumC: day.maximumC,
      degreeDays: round(degreeDays, 2),
      cumulativeDegreeDays: round(cumulative, 2),
    });
  });
  return deepFreeze({
    profile: profile.name,
    baseTemperatureC: base,
    upperTemperatureC: upper,
    startingDegreeDays: options.startingDegreeDays ?? 0,
    totalDegreeDays: round(cumulative, 2),
    series,
  });
}

function hourlyTemperatureEstimate(day, hour) {
  const midpoint = (day.minimumC + day.maximumC) / 2;
  const amplitude = (day.maximumC - day.minimumC) / 2;
  return midpoint + amplitude * Math.sin((hour - 8) / 24 * Math.PI * 2);
}

export function calculateChillAccumulation(daysInput, options = {}) {
  const days = assertArray(daysInput, 'Chill days', { nonEmpty: true }).map(normalizeDay)
    .sort((first, second) => first.date.localeCompare(second.date));
  const minimumC = assertFiniteNumber(options.minimumC ?? 0, 'Chill minimum temperature');
  const maximumC = assertFiniteNumber(options.maximumC ?? 7.2, 'Chill maximum temperature');
  if (maximumC <= minimumC) throw new TypeError('Chill maximum must exceed its minimum.');
  let cumulative = 0;
  const series = days.map((day) => {
    let chillHours = 0;
    let warmPenalty = 0;
    for (let hour = 0; hour < 24; hour += 1) {
      const temperature = hourlyTemperatureEstimate(day, hour);
      if (temperature >= minimumC && temperature <= maximumC) chillHours += 1;
      if (options.warmPenalty && temperature > 16) warmPenalty += 0.5;
    }
    const effectiveHours = Math.max(0, chillHours - warmPenalty);
    cumulative += effectiveHours;
    return deepFreeze({
      date: day.date,
      chillHours,
      warmPenalty: round(warmPenalty, 1),
      effectiveChillHours: round(effectiveHours, 1),
      cumulativeChillHours: round(cumulative, 1),
    });
  });
  return deepFreeze({
    minimumC,
    maximumC,
    totalChillHours: round(cumulative, 1),
    series,
  });
}

export function estimatePhenologyStages(daysInput, profileInput, options = {}) {
  const profile = profileFor(profileInput, options.profile);
  const thermal = calculatePhenologyThermalTime(daysInput, profile, options);
  const stages = assertArray(profile.stages, 'Phenology stages', { nonEmpty: true }).map((stage) => {
    const threshold = assertFiniteNumber(stage.degreeDays, `${stage.id} degree-day threshold`, { minimum: 0 });
    const reached = thermal.series.find((day) => day.cumulativeDegreeDays >= threshold);
    return deepFreeze({
      id: assertString(stage.id, 'Phenology stage id'),
      thresholdDegreeDays: threshold,
      reached: Boolean(reached),
      reachedAt: reached?.date ?? null,
      remainingDegreeDays: round(Math.max(0, threshold - thermal.totalDegreeDays), 2),
    });
  });
  const reached = stages.filter((stage) => stage.reached);
  return deepFreeze({
    profile: profile.name,
    currentStage: reached.at(-1)?.id ?? 'dormant',
    nextStage: stages.find((stage) => !stage.reached)?.id ?? null,
    stages,
    thermal,
  });
}

export function assessPhenologyFrostRisk(daysInput, profileInput, stageInput, options = {}) {
  const profile = profileFor(profileInput, options.profile);
  const stage = stageInput ?? 'dormant';
  const threshold = options.thresholdC
    ?? profile.frostThresholds?.[stage]
    ?? profile.frostThresholds?.dormant
    ?? 0;
  const days = assertArray(daysInput, 'Frost forecast days', { nonEmpty: true }).map(normalizeDay);
  const events = days.filter((day) => day.minimumC <= threshold).map((day) => {
    const difference = threshold - day.minimumC;
    return deepFreeze({
      date: day.date,
      minimumC: day.minimumC,
      thresholdC: threshold,
      belowThresholdC: round(difference, 1),
      severity: difference >= 5 ? 'extreme' : difference >= 3 ? 'severe' : difference >= 1 ? 'moderate' : 'minor',
    });
  });
  const severityOrder = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
  const maximumSeverity = events.reduce(
    (selected, event) => severityOrder[event.severity] > severityOrder[selected] ? event.severity : selected,
    'none',
  );
  return deepFreeze({
    profile: profile.name,
    stage,
    thresholdC: threshold,
    risk: events.length > 0,
    eventCount: events.length,
    maximumSeverity,
    events,
    lowestTemperatureC: minimum(days.map((day) => day.minimumC)),
  });
}

export function projectStageDate(recentDaysInput, profileInput, targetStage, options = {}) {
  const profile = profileFor(profileInput, options.profile);
  const thermal = calculatePhenologyThermalTime(recentDaysInput, profile, options);
  const stage = profile.stages.find((entry) => entry.id === targetStage);
  if (!stage) throw new TypeError(`Unknown ${profile.name} stage: ${targetStage}.`);
  const remaining = Math.max(0, stage.degreeDays - thermal.totalDegreeDays);
  if (remaining === 0) {
    const reached = thermal.series.find((entry) => entry.cumulativeDegreeDays >= stage.degreeDays);
    return deepFreeze({ stage: targetStage, projectedDate: reached?.date ?? thermal.series.at(-1).date, daysRemaining: 0, reached: true });
  }
  const lookback = Math.trunc(assertFiniteNumber(options.lookbackDays ?? 7, 'Projection lookback', {
    minimum: 1,
    maximum: thermal.series.length,
  }));
  const dailyRate = mean(thermal.series.slice(-lookback).map((entry) => entry.degreeDays));
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return deepFreeze({ stage: targetStage, projectedDate: null, daysRemaining: null, reached: false });
  }
  const daysRemaining = Math.ceil(remaining / dailyRate);
  const date = new Date(`${thermal.series.at(-1).date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + daysRemaining);
  return deepFreeze({
    stage: targetStage,
    projectedDate: date.toISOString().slice(0, 10),
    daysRemaining,
    reached: false,
    recentDailyRate: round(dailyRate, 2),
    remainingDegreeDays: round(remaining, 2),
  });
}

export function comparePhenologySeasons(currentInput, baselineInput, profileInput, options = {}) {
  const profile = profileFor(profileInput, options.profile);
  const current = estimatePhenologyStages(currentInput, profile, options.current);
  const baseline = estimatePhenologyStages(baselineInput, profile, options.baseline);
  const stageComparisons = profile.stages.map((stage) => {
    const currentStage = current.stages.find((entry) => entry.id === stage.id);
    const baselineStage = baseline.stages.find((entry) => entry.id === stage.id);
    let shiftDays = null;
    if (currentStage.reachedAt && baselineStage.reachedAt) {
      shiftDays = Math.round((parseTimestamp(`${currentStage.reachedAt}T00:00:00Z`)
        - parseTimestamp(`${baselineStage.reachedAt}T00:00:00Z`)) / 86_400_000);
    }
    return deepFreeze({
      id: stage.id,
      currentDate: currentStage.reachedAt,
      baselineDate: baselineStage.reachedAt,
      shiftDays,
      timing: shiftDays === null ? 'unknown' : shiftDays < -2 ? 'early' : shiftDays > 2 ? 'late' : 'near_normal',
    });
  });
  return deepFreeze({
    profile: profile.name,
    thermalTimeDifference: round(current.thermal.totalDegreeDays - baseline.thermal.totalDegreeDays, 2),
    currentStage: current.currentStage,
    baselineStage: baseline.currentStage,
    stageComparisons,
  });
}

export function floweringWeatherWindows(daysInput, stageEstimate, options = {}) {
  const days = assertArray(daysInput, 'Flowering weather days', { nonEmpty: true }).map(normalizeDay);
  const minimumC = assertFiniteNumber(options.minimumC ?? 12, 'Pollinator minimum temperature');
  const maximumWindMps = assertFiniteNumber(options.maximumWindMps ?? 8, 'Pollinator maximum wind', { minimum: 0 });
  const maximumRainMm = assertFiniteNumber(options.maximumRainMm ?? 1, 'Pollinator maximum rain', { minimum: 0 });
  const startsAt = stageEstimate.stages?.find((stage) => ['flowering', 'first_bloom'].includes(stage.id))?.reachedAt ?? null;
  const windows = days.map((day) => {
    const temperature = day.meanC;
    const wind = day.windSpeedMps ?? day.maximumWindMps ?? 0;
    const rain = day.rainMm ?? day.rainTotalMm ?? 0;
    const suitable = temperature >= minimumC && wind <= maximumWindMps && rain <= maximumRainMm;
    const score = Math.max(0, 100
      - Math.max(0, minimumC - temperature) * 8
      - Math.max(0, wind - maximumWindMps) * 8
      - Math.max(0, rain - maximumRainMm) * 12);
    return deepFreeze({
      date: day.date,
      activeFlowering: startsAt ? day.date >= startsAt : false,
      suitable,
      score: round(score, 1),
      constraints: [
        temperature < minimumC ? 'cold' : null,
        wind > maximumWindMps ? 'wind' : null,
        rain > maximumRainMm ? 'rain' : null,
      ].filter(Boolean),
    });
  });
  return deepFreeze({
    floweringStartsAt: startsAt,
    suitableDayCount: windows.filter((window) => window.activeFlowering && window.suitable).length,
    bestDate: [...windows].filter((window) => window.activeFlowering)
      .sort((first, second) => second.score - first.score)[0]?.date ?? null,
    windows,
  });
}

export function phenologySeasonSummary(daysInput, profileInput, options = {}) {
  const profile = profileFor(profileInput, options.profile);
  const stages = estimatePhenologyStages(daysInput, profile, options);
  const chill = calculateChillAccumulation(daysInput, options.chill);
  const frost = assessPhenologyFrostRisk(daysInput, profile, stages.currentStage, options.frost);
  const chillRequirement = profile.chillRequirementHours ?? 0;
  const chillCompletion = chillRequirement > 0 ? Math.min(1, chill.totalChillHours / chillRequirement) : 1;
  const alerts = [];
  if (chillCompletion < 0.8) alerts.push('Winter chill is below the profile requirement.');
  if (frost.risk && stages.currentStage !== 'dormant') alerts.push(`Frost threatens the ${stages.currentStage} stage.`);
  if (stages.thermal.totalDegreeDays > maximum(profile.stages.map((stage) => stage.degreeDays))) {
    alerts.push('Thermal accumulation is beyond the final modeled stage.');
  }
  return deepFreeze({
    profile: profile.name,
    currentStage: stages.currentStage,
    nextStage: stages.nextStage,
    totalDegreeDays: stages.thermal.totalDegreeDays,
    chillHours: chill.totalChillHours,
    chillRequirementHours: chillRequirement,
    chillCompletionPercent: round(chillCompletion * 100, 1),
    frostRisk: frost.risk,
    lowestTemperatureC: frost.lowestTemperatureC,
    averageTemperatureC: round(mean(stages.thermal.series.map((day) => (day.minimumC + day.maximumC) / 2)), 1),
    alerts,
  });
}
