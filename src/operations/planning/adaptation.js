import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  round,
} from '../core/validation';
import { maximum, sum } from '../core/statistics';

const HAZARD_PROFILES = Object.freeze({
  heat: {
    label: 'Extreme heat',
    defaultDurationDays: 5,
    downtimeFactor: 0.12,
    exposureFactor: 0.7,
  },
  flood: {
    label: 'River or surface flooding',
    defaultDurationDays: 3,
    downtimeFactor: 0.8,
    exposureFactor: 0.5,
  },
  coastal_flood: {
    label: 'Coastal flooding',
    defaultDurationDays: 4,
    downtimeFactor: 0.9,
    exposureFactor: 0.6,
  },
  drought: {
    label: 'Drought and water shortage',
    defaultDurationDays: 45,
    downtimeFactor: 0.25,
    exposureFactor: 0.35,
  },
  wildfire: {
    label: 'Wildfire',
    defaultDurationDays: 7,
    downtimeFactor: 1,
    exposureFactor: 0.75,
  },
  smoke: {
    label: 'Wildfire smoke',
    defaultDurationDays: 10,
    downtimeFactor: 0.2,
    exposureFactor: 0.9,
  },
  storm: {
    label: 'Severe wind and storm',
    defaultDurationDays: 2,
    downtimeFactor: 0.65,
    exposureFactor: 0.45,
  },
  cold: {
    label: 'Extreme cold',
    defaultDurationDays: 5,
    downtimeFactor: 0.35,
    exposureFactor: 0.7,
  },
  landslide: {
    label: 'Landslide',
    defaultDurationDays: 14,
    downtimeFactor: 1,
    exposureFactor: 0.3,
  },
});

export const ADAPTATION_MEASURES = Object.freeze([
  {
    id: 'cool-roof',
    name: 'High-reflectance roof',
    hazards: ['heat'],
    assetTypes: ['home', 'office', 'school', 'clinic', 'warehouse'],
    capitalCost: 18000,
    annualMaintenance: 250,
    lifetimeYears: 20,
    reduction: 0.2,
    coBenefits: ['lower_cooling_demand', 'indoor_comfort'],
  },
  {
    id: 'shade-and-trees',
    name: 'Shade structures and climate-suitable trees',
    hazards: ['heat'],
    assetTypes: ['home', 'office', 'school', 'clinic', 'public_space'],
    capitalCost: 12500,
    annualMaintenance: 700,
    lifetimeYears: 25,
    reduction: 0.13,
    coBenefits: ['biodiversity', 'lower_cooling_demand', 'public_realm'],
  },
  {
    id: 'passive-cooling',
    name: 'Passive cooling and envelope upgrade',
    hazards: ['heat', 'smoke', 'cold'],
    assetTypes: ['home', 'office', 'school', 'clinic'],
    capitalCost: 42000,
    annualMaintenance: 350,
    lifetimeYears: 30,
    reduction: 0.28,
    coBenefits: ['energy_efficiency', 'indoor_air_quality', 'indoor_comfort'],
  },
  {
    id: 'backup-cooling',
    name: 'Efficient backup cooling and resilient power',
    hazards: ['heat'],
    assetTypes: ['clinic', 'school', 'care_home', 'community_center'],
    capitalCost: 85000,
    annualMaintenance: 2400,
    lifetimeYears: 15,
    reduction: 0.45,
    coBenefits: ['continuity', 'emergency_shelter'],
  },
  {
    id: 'flood-barriers',
    name: 'Deployable flood barriers',
    hazards: ['flood', 'coastal_flood'],
    assetTypes: ['home', 'office', 'clinic', 'warehouse', 'utility'],
    capitalCost: 38000,
    annualMaintenance: 1000,
    lifetimeYears: 20,
    reduction: 0.48,
    coBenefits: ['business_continuity'],
  },
  {
    id: 'raise-equipment',
    name: 'Raise critical equipment and utilities',
    hazards: ['flood', 'coastal_flood'],
    assetTypes: ['home', 'office', 'clinic', 'warehouse', 'utility', 'school'],
    capitalCost: 26000,
    annualMaintenance: 200,
    lifetimeYears: 30,
    reduction: 0.32,
    coBenefits: ['faster_recovery', 'continuity'],
  },
  {
    id: 'sustainable-drainage',
    name: 'Permeable surfaces and rain gardens',
    hazards: ['flood'],
    assetTypes: ['home', 'office', 'school', 'public_space', 'warehouse'],
    capitalCost: 52000,
    annualMaintenance: 1800,
    lifetimeYears: 30,
    reduction: 0.24,
    coBenefits: ['water_quality', 'biodiversity', 'groundwater_recharge'],
  },
  {
    id: 'rainwater-storage',
    name: 'Rainwater capture and non-potable storage',
    hazards: ['drought', 'flood'],
    assetTypes: ['home', 'office', 'school', 'warehouse', 'farm'],
    capitalCost: 28000,
    annualMaintenance: 900,
    lifetimeYears: 25,
    reduction: 0.18,
    coBenefits: ['water_conservation', 'stormwater_control'],
  },
  {
    id: 'efficient-irrigation',
    name: 'Soil sensing and efficient irrigation',
    hazards: ['drought', 'heat'],
    assetTypes: ['farm', 'public_space', 'school'],
    capitalCost: 22000,
    annualMaintenance: 1200,
    lifetimeYears: 12,
    reduction: 0.25,
    coBenefits: ['water_conservation', 'crop_yield'],
  },
  {
    id: 'defensible-space',
    name: 'Defensible space and ember-resistant landscaping',
    hazards: ['wildfire'],
    assetTypes: ['home', 'office', 'school', 'clinic', 'utility'],
    capitalCost: 16000,
    annualMaintenance: 1600,
    lifetimeYears: 15,
    reduction: 0.33,
    coBenefits: ['site_access', 'vegetation_health'],
  },
  {
    id: 'ember-hardening',
    name: 'Ember-resistant vents and building hardening',
    hazards: ['wildfire'],
    assetTypes: ['home', 'office', 'school', 'clinic'],
    capitalCost: 34000,
    annualMaintenance: 500,
    lifetimeYears: 25,
    reduction: 0.42,
    coBenefits: ['energy_efficiency'],
  },
  {
    id: 'smoke-filtration',
    name: 'High-efficiency smoke filtration',
    hazards: ['smoke', 'wildfire'],
    assetTypes: ['home', 'office', 'school', 'clinic', 'care_home'],
    capitalCost: 24000,
    annualMaintenance: 2200,
    lifetimeYears: 12,
    reduction: 0.38,
    coBenefits: ['indoor_air_quality', 'infection_control'],
  },
  {
    id: 'wind-retrofit',
    name: 'Roof, opening, and cladding wind retrofit',
    hazards: ['storm'],
    assetTypes: ['home', 'office', 'school', 'clinic', 'warehouse'],
    capitalCost: 48000,
    annualMaintenance: 650,
    lifetimeYears: 30,
    reduction: 0.35,
    coBenefits: ['weatherproofing', 'insurance_readiness'],
  },
  {
    id: 'backup-power',
    name: 'Solar and battery continuity system',
    hazards: ['storm', 'heat', 'cold', 'wildfire'],
    assetTypes: ['home', 'office', 'school', 'clinic', 'utility', 'care_home'],
    capitalCost: 72000,
    annualMaintenance: 1100,
    lifetimeYears: 18,
    reduction: 0.22,
    coBenefits: ['lower_emissions', 'energy_cost', 'continuity'],
  },
  {
    id: 'slope-drainage',
    name: 'Slope drainage and stabilization',
    hazards: ['landslide', 'flood'],
    assetTypes: ['home', 'road', 'utility', 'school', 'clinic'],
    capitalCost: 120000,
    annualMaintenance: 2800,
    lifetimeYears: 35,
    reduction: 0.5,
    coBenefits: ['erosion_control', 'access_continuity'],
  },
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeProjection(projection, index) {
  assertObject(projection, `Hazard projection ${index + 1}`);
  const hazard = assertString(projection.hazard, `Hazard projection ${index + 1} hazard`).toLowerCase();
  const profile = HAZARD_PROFILES[hazard];
  if (!profile) throw new TypeError(`Unsupported climate hazard: ${hazard}.`);
  return deepFreeze({
    hazard,
    label: profile.label,
    horizonYear: Math.trunc(assertFiniteNumber(
      projection.horizonYear ?? new Date().getUTCFullYear(),
      `${hazard} horizon year`,
      { minimum: 2000, maximum: 2300 },
    )),
    annualProbability: assertFiniteNumber(
      projection.annualProbability,
      `${hazard} annual probability`,
      { minimum: 0, maximum: 1 },
    ),
    intensity: assertFiniteNumber(projection.intensity ?? 0.5, `${hazard} intensity`, {
      minimum: 0,
      maximum: 1,
    }),
    durationDays: assertFiniteNumber(
      projection.durationDays ?? profile.defaultDurationDays,
      `${hazard} duration`,
      { minimum: 0, maximum: 366 },
    ),
    confidence: assertFiniteNumber(projection.confidence ?? 0.7, `${hazard} confidence`, {
      minimum: 0,
      maximum: 1,
    }),
    source: projection.source ? String(projection.source) : null,
  });
}

function normalizeAsset(asset, index) {
  assertObject(asset, `Asset ${index + 1}`);
  const id = assertString(asset.id ?? `asset-${index + 1}`, `Asset ${index + 1} id`);
  const type = assertString(asset.type ?? 'other', `Asset ${id} type`).toLowerCase();
  const vulnerability = {};
  Object.entries(asset.vulnerability ?? {}).forEach(([hazard, value]) => {
    vulnerability[hazard] = assertFiniteNumber(value, `${id} ${hazard} vulnerability`, {
      minimum: 0,
      maximum: 1,
    });
  });
  return deepFreeze({
    id,
    name: String(asset.name ?? id),
    type,
    replacementValue: assertFiniteNumber(asset.replacementValue ?? 0, `${id} replacement value`, {
      minimum: 0,
    }),
    annualRevenue: assertFiniteNumber(asset.annualRevenue ?? 0, `${id} annual revenue`, { minimum: 0 }),
    occupants: Math.trunc(assertFiniteNumber(asset.occupants ?? 0, `${id} occupants`, { minimum: 0 })),
    criticality: assertFiniteNumber(asset.criticality ?? 0.5, `${id} criticality`, {
      minimum: 0,
      maximum: 1,
    }),
    vulnerability: deepFreeze(vulnerability),
    tags: Object.freeze(assertArray(asset.tags ?? [], `${id} tags`).map(String)),
  });
}

function ratingForScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'moderate';
  if (score >= 15) return 'low';
  return 'minimal';
}

function riskForPair(asset, projection) {
  const profile = HAZARD_PROFILES[projection.hazard];
  const vulnerability = asset.vulnerability[projection.hazard] ?? 0.35;
  const effectiveIntensity = projection.intensity * (0.6 + projection.confidence * 0.4);
  const damageFraction = clamp01(vulnerability * effectiveIntensity);
  const expectedDamage = asset.replacementValue * projection.annualProbability * damageFraction;
  const interruptionFraction = clamp01(
    profile.downtimeFactor * vulnerability * projection.intensity * projection.durationDays / 365,
  );
  const interruptionLoss = asset.annualRevenue * projection.annualProbability * interruptionFraction;
  const exposedPeople = asset.occupants * projection.annualProbability * effectiveIntensity * profile.exposureFactor;
  const continuityPenalty = (expectedDamage + interruptionLoss) * asset.criticality * 0.2;
  return deepFreeze({
    assetId: asset.id,
    hazard: projection.hazard,
    annualProbability: projection.annualProbability,
    vulnerability,
    damageFraction: round(damageFraction, 4),
    expectedDamage: round(expectedDamage, 2),
    interruptionLoss: round(interruptionLoss, 2),
    continuityPenalty: round(continuityPenalty, 2),
    expectedAnnualLoss: round(expectedDamage + interruptionLoss + continuityPenalty, 2),
    exposedPeople: round(exposedPeople, 2),
  });
}

export function calculateClimateRisk(input) {
  assertObject(input, 'Climate risk input');
  const assets = assertArray(input.assets, 'Climate risk assets', { nonEmpty: true }).map(normalizeAsset);
  const projections = assertArray(input.projections, 'Climate projections', { nonEmpty: true })
    .map(normalizeProjection);
  const pairs = assets.flatMap((asset) => projections.map((projection) => riskForPair(asset, projection)));
  const byAsset = assets.map((asset) => {
    const entries = pairs.filter((entry) => entry.assetId === asset.id);
    const expectedAnnualLoss = sum(entries.map((entry) => entry.expectedAnnualLoss));
    const valueAtRiskPercent = asset.replacementValue > 0
      ? expectedAnnualLoss / asset.replacementValue * 100
      : 0;
    return deepFreeze({
      assetId: asset.id,
      name: asset.name,
      type: asset.type,
      expectedAnnualLoss: round(expectedAnnualLoss, 2),
      valueAtRiskPercent: round(valueAtRiskPercent, 2),
      exposedPeople: round(sum(entries.map((entry) => entry.exposedPeople)), 2),
      rating: ratingForScore(Math.min(100, valueAtRiskPercent * 5 + asset.criticality * 30)),
      hazards: entries.sort((first, second) => second.expectedAnnualLoss - first.expectedAnnualLoss),
    });
  });
  const byHazard = projections.map((projection) => {
    const entries = pairs.filter((entry) => entry.hazard === projection.hazard);
    return deepFreeze({
      hazard: projection.hazard,
      label: projection.label,
      horizonYear: projection.horizonYear,
      expectedAnnualLoss: round(sum(entries.map((entry) => entry.expectedAnnualLoss)), 2),
      exposedPeople: round(sum(entries.map((entry) => entry.exposedPeople)), 2),
      affectedAssetCount: entries.filter((entry) => entry.expectedAnnualLoss > 0).length,
    });
  }).sort((first, second) => second.expectedAnnualLoss - first.expectedAnnualLoss);
  const expectedAnnualLoss = sum(pairs.map((entry) => entry.expectedAnnualLoss));
  const replacementValue = sum(assets.map((asset) => asset.replacementValue));
  const score = replacementValue > 0 ? Math.min(100, expectedAnnualLoss / replacementValue * 500) : 0;
  return deepFreeze({
    assetCount: assets.length,
    hazardCount: projections.length,
    replacementValue: round(replacementValue, 2),
    expectedAnnualLoss: round(expectedAnnualLoss, 2),
    exposedPeople: round(sum(pairs.map((entry) => entry.exposedPeople)), 2),
    riskScore: round(score, 1),
    rating: ratingForScore(score),
    highestRiskHazard: byHazard[0]?.hazard ?? null,
    byAsset,
    byHazard,
    pairs,
  });
}

function presentValueFactor(rate, years) {
  if (rate === 0) return years;
  return (1 - (1 + rate) ** -years) / rate;
}

function normalizedMeasure(measure) {
  const value = typeof measure === 'string'
    ? ADAPTATION_MEASURES.find((candidate) => candidate.id === measure)
    : measure;
  if (!value) throw new TypeError(`Unknown adaptation measure: ${measure}.`);
  assertObject(value, 'Adaptation measure');
  return deepFreeze({
    id: assertString(value.id, 'Adaptation measure id'),
    name: assertString(value.name, 'Adaptation measure name'),
    hazards: assertArray(value.hazards, `${value.id} hazards`, { nonEmpty: true }).map(String),
    assetTypes: assertArray(value.assetTypes ?? [], `${value.id} asset types`).map(String),
    capitalCost: assertFiniteNumber(value.capitalCost, `${value.id} capital cost`, { minimum: 0 }),
    annualMaintenance: assertFiniteNumber(value.annualMaintenance ?? 0, `${value.id} maintenance`, { minimum: 0 }),
    lifetimeYears: Math.trunc(assertFiniteNumber(value.lifetimeYears, `${value.id} lifetime`, {
      minimum: 1,
      maximum: 100,
    })),
    reduction: assertFiniteNumber(value.reduction, `${value.id} reduction`, { minimum: 0, maximum: 1 }),
    coBenefits: assertArray(value.coBenefits ?? [], `${value.id} co-benefits`).map(String),
    dependencies: assertArray(value.dependencies ?? [], `${value.id} dependencies`).map(String),
  });
}

export function evaluateAdaptationMeasure(measureInput, riskAssessment, options = {}) {
  const measure = normalizedMeasure(measureInput);
  assertObject(riskAssessment, 'Climate risk assessment');
  const discountRate = assertFiniteNumber(options.discountRate ?? 0.04, 'Discount rate', {
    minimum: 0,
    maximum: 0.5,
  });
  const benefitGrowth = assertFiniteNumber(options.benefitGrowth ?? 0, 'Benefit growth', {
    minimum: -0.2,
    maximum: 0.5,
  });
  const applicableHazards = riskAssessment.byHazard
    .filter((entry) => measure.hazards.includes(entry.hazard));
  const eligibleAssets = riskAssessment.byAsset.filter((asset) => (
    measure.assetTypes.length === 0 || measure.assetTypes.includes(asset.type)
  ));
  const eligibleAssetIds = new Set(eligibleAssets.map((asset) => asset.assetId));
  const coveredLoss = sum(riskAssessment.pairs
    .filter((entry) => measure.hazards.includes(entry.hazard) && eligibleAssetIds.has(entry.assetId))
    .map((entry) => entry.expectedAnnualLoss));
  const annualAvoidedLoss = coveredLoss * measure.reduction;
  const effectiveRate = discountRate - benefitGrowth;
  const benefitFactor = presentValueFactor(effectiveRate, measure.lifetimeYears);
  const maintenanceFactor = presentValueFactor(discountRate, measure.lifetimeYears);
  const presentBenefits = annualAvoidedLoss * benefitFactor;
  const presentMaintenance = measure.annualMaintenance * maintenanceFactor;
  const lifecycleCost = measure.capitalCost + presentMaintenance;
  const netPresentValue = presentBenefits - lifecycleCost;
  const benefitCostRatio = lifecycleCost > 0 ? presentBenefits / lifecycleCost : null;
  const annualNetBenefit = annualAvoidedLoss - measure.annualMaintenance;
  const paybackYears = annualNetBenefit > 0 ? measure.capitalCost / annualNetBenefit : null;
  return deepFreeze({
    ...measure,
    applicable: applicableHazards.length > 0 && eligibleAssets.length > 0,
    applicableHazards: applicableHazards.map((entry) => entry.hazard),
    eligibleAssetIds: [...eligibleAssetIds],
    coveredAnnualLoss: round(coveredLoss, 2),
    annualAvoidedLoss: round(annualAvoidedLoss, 2),
    presentBenefits: round(presentBenefits, 2),
    presentMaintenance: round(presentMaintenance, 2),
    lifecycleCost: round(lifecycleCost, 2),
    netPresentValue: round(netPresentValue, 2),
    benefitCostRatio: round(benefitCostRatio, 3),
    paybackYears: round(paybackYears, 2),
    residualAnnualLoss: round(Math.max(0, coveredLoss - annualAvoidedLoss), 2),
    discountRate,
    benefitGrowth,
  });
}

function selectionScore(assessment, weights) {
  const economic = Math.max(0, Math.min(2, assessment.benefitCostRatio ?? 0)) / 2;
  const risk = assessment.coveredAnnualLoss > 0
    ? assessment.annualAvoidedLoss / assessment.coveredAnnualLoss
    : 0;
  const affordability = assessment.capitalCost > 0
    ? 1 / (1 + assessment.capitalCost / 100000)
    : 1;
  const coBenefit = Math.min(1, assessment.coBenefits.length / 4);
  return economic * weights.economic
    + risk * weights.risk
    + affordability * weights.affordability
    + coBenefit * weights.coBenefits;
}

export function prioritizeAdaptationPortfolio(input, options = {}) {
  assertObject(input, 'Adaptation portfolio input');
  const risk = input.riskAssessment ?? calculateClimateRisk(input);
  const measures = assertArray(input.measures ?? ADAPTATION_MEASURES, 'Adaptation measures', { nonEmpty: true });
  const budget = assertFiniteNumber(options.budget ?? input.budget ?? Number.MAX_SAFE_INTEGER, 'Adaptation budget', {
    minimum: 0,
  });
  const maximumMeasures = Math.trunc(assertFiniteNumber(options.maximumMeasures ?? measures.length, 'Maximum measures', {
    minimum: 1,
  }));
  const weights = {
    economic: assertFiniteNumber(options.weights?.economic ?? 0.4, 'Economic weight', { minimum: 0 }),
    risk: assertFiniteNumber(options.weights?.risk ?? 0.35, 'Risk weight', { minimum: 0 }),
    affordability: assertFiniteNumber(options.weights?.affordability ?? 0.1, 'Affordability weight', { minimum: 0 }),
    coBenefits: assertFiniteNumber(options.weights?.coBenefits ?? 0.15, 'Co-benefit weight', { minimum: 0 }),
  };
  const weightTotal = sum(Object.values(weights));
  if (weightTotal <= 0) throw new TypeError('At least one portfolio weight must be positive.');
  Object.keys(weights).forEach((key) => { weights[key] /= weightTotal; });
  const assessments = measures.map((measure) => evaluateAdaptationMeasure(measure, risk, options))
    .filter((assessment) => assessment.applicable)
    .map((assessment) => ({
      ...assessment,
      priorityScore: round(selectionScore(assessment, weights) * 100, 1),
    }))
    .sort((first, second) => second.priorityScore - first.priorityScore
      || second.netPresentValue - first.netPresentValue
      || first.capitalCost - second.capitalCost);
  const selected = [];
  const selectedIds = new Set();
  let committed = 0;
  const canSelect = (assessment) => assessment.dependencies.every((id) => selectedIds.has(id));
  for (const assessment of assessments) {
    if (selected.length >= maximumMeasures) break;
    if (committed + assessment.capitalCost > budget || !canSelect(assessment)) continue;
    selected.push(deepFreeze(assessment));
    selectedIds.add(assessment.id);
    committed += assessment.capitalCost;
  }
  const annualAvoidedLoss = sum(selected.map((assessment) => assessment.annualAvoidedLoss));
  return deepFreeze({
    budget: Number.isSafeInteger(budget) ? budget : null,
    committedCapital: round(committed, 2),
    remainingBudget: Number.isSafeInteger(budget) ? round(budget - committed, 2) : null,
    selected,
    considered: assessments,
    rejected: assessments.filter((assessment) => !selectedIds.has(assessment.id)),
    annualAvoidedLoss: round(annualAvoidedLoss, 2),
    baselineAnnualLoss: risk.expectedAnnualLoss,
    residualAnnualLoss: round(Math.max(0, risk.expectedAnnualLoss - annualAvoidedLoss), 2),
    riskReductionPercent: risk.expectedAnnualLoss > 0
      ? round(Math.min(100, annualAvoidedLoss / risk.expectedAnnualLoss * 100), 1)
      : 0,
    weights: deepFreeze(weights),
  });
}

export function buildAdaptationRoadmap(portfolio, options = {}) {
  assertObject(portfolio, 'Adaptation portfolio');
  const startYear = Math.trunc(assertFiniteNumber(
    options.startYear ?? new Date().getUTCFullYear(),
    'Roadmap start year',
    { minimum: 2000, maximum: 2300 },
  ));
  const annualBudget = assertFiniteNumber(options.annualBudget ?? portfolio.committedCapital, 'Annual adaptation budget', {
    minimum: 1,
  });
  const selected = assertArray(portfolio.selected ?? [], 'Selected measures');
  const years = [];
  let year = startYear;
  let spent = 0;
  let phase = [];
  const flush = () => {
    if (!phase.length) return;
    years.push(deepFreeze({
      year,
      measures: phase,
      capitalCost: round(sum(phase.map((measure) => measure.capitalCost)), 2),
      annualAvoidedLoss: round(sum(phase.map((measure) => measure.annualAvoidedLoss)), 2),
      milestone: phase.some((measure) => measure.coveredAnnualLoss >= portfolio.baselineAnnualLoss * 0.25)
        ? 'major_risk_reduction'
        : 'resilience_improvement',
    }));
    year += 1;
    spent = 0;
    phase = [];
  };
  selected.forEach((measure) => {
    if (phase.length && spent + measure.capitalCost > annualBudget) flush();
    phase.push(measure);
    spent += measure.capitalCost;
    if (measure.capitalCost > annualBudget) flush();
  });
  flush();
  let cumulativeCost = 0;
  let cumulativeBenefit = 0;
  const phases = years.map((entry) => {
    cumulativeCost += entry.capitalCost;
    cumulativeBenefit += entry.annualAvoidedLoss;
    return deepFreeze({
      ...entry,
      cumulativeCost: round(cumulativeCost, 2),
      cumulativeAnnualAvoidedLoss: round(cumulativeBenefit, 2),
    });
  });
  return deepFreeze({
    startYear,
    endYear: phases.at(-1)?.year ?? startYear,
    annualBudget,
    phases,
    measureCount: selected.length,
    totalCapital: round(cumulativeCost, 2),
    finalAnnualAvoidedLoss: round(cumulativeBenefit, 2),
  });
}

export function compareAdaptationScenarios(scenarios) {
  const normalized = assertArray(scenarios, 'Adaptation scenarios', { nonEmpty: true }).map((scenario, index) => {
    assertObject(scenario, `Scenario ${index + 1}`);
    const name = assertString(scenario.name ?? `Scenario ${index + 1}`, `Scenario ${index + 1} name`);
    const risk = scenario.riskAssessment ?? calculateClimateRisk(scenario);
    const portfolio = scenario.portfolio ?? prioritizeAdaptationPortfolio({
      ...scenario,
      riskAssessment: risk,
    }, scenario.options ?? {});
    return deepFreeze({
      name,
      baselineAnnualLoss: risk.expectedAnnualLoss,
      committedCapital: portfolio.committedCapital,
      annualAvoidedLoss: portfolio.annualAvoidedLoss,
      residualAnnualLoss: portfolio.residualAnnualLoss,
      riskReductionPercent: portfolio.riskReductionPercent,
      selectedMeasureCount: portfolio.selected.length,
      score: round(portfolio.riskReductionPercent * 0.6
        + Math.min(40, (portfolio.annualAvoidedLoss / Math.max(1, portfolio.committedCapital)) * 400), 1),
    });
  });
  const ranked = [...normalized].sort((first, second) => second.score - first.score
    || first.residualAnnualLoss - second.residualAnnualLoss);
  return deepFreeze({
    scenarios: ranked.map((scenario, index) => deepFreeze({ ...scenario, rank: index + 1 })),
    recommended: ranked[0]?.name ?? null,
    lowestResidualRisk: [...normalized].sort(
      (first, second) => first.residualAnnualLoss - second.residualAnnualLoss,
    )[0]?.name ?? null,
    highestCapitalRequirement: [...normalized].sort(
      (first, second) => second.committedCapital - first.committedCapital,
    )[0]?.name ?? null,
  });
}

export function adaptationMonitoringPlan(portfolio, options = {}) {
  assertObject(portfolio, 'Adaptation portfolio');
  const reviewIntervalMonths = Math.trunc(assertFiniteNumber(
    options.reviewIntervalMonths ?? 12,
    'Review interval',
    { minimum: 1, maximum: 60 },
  ));
  const measures = assertArray(portfolio.selected ?? [], 'Selected measures');
  const indicators = measures.flatMap((measure) => {
    const base = [{
      id: `${measure.id}:performance`,
      measureId: measure.id,
      name: `${measure.name} performance`,
      unit: 'percent',
      target: round(measure.reduction * 100, 1),
      warningBelow: round(measure.reduction * 70, 1),
    }];
    if (measure.hazards.includes('flood') || measure.hazards.includes('coastal_flood')) base.push({
      id: `${measure.id}:flood-events`,
      measureId: measure.id,
      name: 'Damaging flood events after installation',
      unit: 'events',
      target: 0,
      warningAbove: 0,
    });
    if (measure.hazards.includes('heat')) base.push({
      id: `${measure.id}:indoor-heat`,
      measureId: measure.id,
      name: 'Occupied hours above heat threshold',
      unit: 'hours',
      target: 0,
      warningAbove: 8,
    });
    if (measure.hazards.includes('drought')) base.push({
      id: `${measure.id}:water-use`,
      measureId: measure.id,
      name: 'Potable water use reduction',
      unit: 'percent',
      target: 20,
      warningBelow: 10,
    });
    return base;
  });
  return deepFreeze({
    reviewIntervalMonths,
    indicators: indicators.map((indicator) => deepFreeze(indicator)),
    reviewTopics: Object.freeze([
      'Update hazard projections and observed event frequency.',
      'Compare realized losses with the baseline estimate.',
      'Inspect assets and confirm maintenance completion.',
      'Recalculate lifecycle economics using current costs.',
      'Record community outcomes and unintended consequences.',
    ]),
    nextDecisionRules: deepFreeze({
      reassessWhenLossExceedsBaselinePercent: assertFiniteNumber(
        options.reassessWhenLossExceedsBaselinePercent ?? 110,
        'Loss reassessment threshold',
        { minimum: 0 },
      ),
      escalateWhenPerformanceBelowPercent: assertFiniteNumber(
        options.escalateWhenPerformanceBelowPercent ?? 70,
        'Performance escalation threshold',
        { minimum: 0, maximum: 100 },
      ),
    }),
  });
}

export function adaptationCatalogFor(input) {
  assertObject(input, 'Adaptation catalog filter');
  const hazards = new Set(assertArray(input.hazards ?? [], 'Catalog hazards').map(String));
  const assetTypes = new Set(assertArray(input.assetTypes ?? [], 'Catalog asset types').map(String));
  const maximumCost = assertFiniteNumber(input.maximumCost ?? Number.MAX_SAFE_INTEGER, 'Maximum measure cost', {
    minimum: 0,
  });
  return ADAPTATION_MEASURES.filter((measure) => (
    (!hazards.size || measure.hazards.some((hazard) => hazards.has(hazard)))
      && (!assetTypes.size || measure.assetTypes.some((type) => assetTypes.has(type)))
      && measure.capitalCost <= maximumCost
  )).map((measure) => deepFreeze({ ...measure }));
}

export function adaptationSummary(risk, portfolio) {
  assertObject(risk, 'Climate risk assessment');
  assertObject(portfolio, 'Adaptation portfolio');
  const largestAssetRisk = [...risk.byAsset].sort(
    (first, second) => second.expectedAnnualLoss - first.expectedAnnualLoss,
  )[0] ?? null;
  const bestEconomics = [...portfolio.selected].sort(
    (first, second) => (second.benefitCostRatio ?? 0) - (first.benefitCostRatio ?? 0),
  )[0] ?? null;
  return deepFreeze({
    rating: risk.rating,
    riskScore: risk.riskScore,
    expectedAnnualLoss: risk.expectedAnnualLoss,
    highestRiskHazard: risk.highestRiskHazard,
    highestRiskAssetId: largestAssetRisk?.assetId ?? null,
    selectedMeasureCount: portfolio.selected.length,
    committedCapital: portfolio.committedCapital,
    riskReductionPercent: portfolio.riskReductionPercent,
    bestValueMeasureId: bestEconomics?.id ?? null,
    maximumPaybackYears: maximum(portfolio.selected
      .map((measure) => measure.paybackYears)
      .filter(Number.isFinite)) ?? null,
  });
}
