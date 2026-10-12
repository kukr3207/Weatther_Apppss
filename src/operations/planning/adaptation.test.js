import { describe, expect, it } from 'vitest';
import {
  ADAPTATION_MEASURES,
  adaptationCatalogFor,
  adaptationMonitoringPlan,
  adaptationSummary,
  buildAdaptationRoadmap,
  calculateClimateRisk,
  compareAdaptationScenarios,
  evaluateAdaptationMeasure,
  prioritizeAdaptationPortfolio,
} from './adaptation';

const assets = [
  {
    id: 'clinic',
    name: 'Community clinic',
    type: 'clinic',
    replacementValue: 2_000_000,
    annualRevenue: 1_200_000,
    occupants: 80,
    criticality: 1,
    vulnerability: { heat: 0.75, flood: 0.55, storm: 0.4 },
  },
  {
    id: 'school',
    name: 'Primary school',
    type: 'school',
    replacementValue: 3_000_000,
    annualRevenue: 0,
    occupants: 650,
    criticality: 0.8,
    vulnerability: { heat: 0.65, flood: 0.3, storm: 0.45 },
  },
];

const projections = [
  {
    hazard: 'heat',
    horizonYear: 2050,
    annualProbability: 0.8,
    intensity: 0.75,
    durationDays: 12,
    confidence: 0.85,
  },
  {
    hazard: 'flood',
    horizonYear: 2050,
    annualProbability: 0.12,
    intensity: 0.6,
    durationDays: 4,
    confidence: 0.7,
  },
  {
    hazard: 'storm',
    horizonYear: 2050,
    annualProbability: 0.25,
    intensity: 0.55,
    durationDays: 2,
    confidence: 0.75,
  },
];

describe('climate adaptation risk', () => {
  it('calculates asset and hazard losses from the same risk pairs', () => {
    const risk = calculateClimateRisk({ assets, projections });

    expect(risk.assetCount).toBe(2);
    expect(risk.hazardCount).toBe(3);
    expect(risk.replacementValue).toBe(5_000_000);
    expect(risk.pairs).toHaveLength(6);
    expect(risk.expectedAnnualLoss).toBeGreaterThan(0);
    expect(risk.byHazard[0].expectedAnnualLoss).toBeGreaterThanOrEqual(
      risk.byHazard[1].expectedAnnualLoss,
    );
    expect(risk.byAsset.reduce((total, item) => total + item.expectedAnnualLoss, 0))
      .toBeCloseTo(risk.expectedAnnualLoss, 1);
    expect(risk.highestRiskHazard).toBe(risk.byHazard[0].hazard);
  });

  it('uses default vulnerability without mutating the source asset', () => {
    const asset = {
      id: 'warehouse',
      type: 'warehouse',
      replacementValue: 500_000,
      occupants: 10,
    };
    const risk = calculateClimateRisk({
      assets: [asset],
      projections: [projections[0]],
    });

    expect(risk.pairs[0].vulnerability).toBe(0.35);
    expect(asset).not.toHaveProperty('vulnerability');
    expect(Object.isFrozen(risk)).toBe(true);
  });

  it('rejects unsupported hazards and invalid probabilities', () => {
    expect(() => calculateClimateRisk({
      assets,
      projections: [{ hazard: 'volcano', annualProbability: 0.2 }],
    })).toThrow('Unsupported climate hazard');
    expect(() => calculateClimateRisk({
      assets,
      projections: [{ hazard: 'heat', annualProbability: 2 }],
    })).toThrow('no more than 1');
  });
});

describe('measure economics', () => {
  const risk = calculateClimateRisk({ assets, projections });

  it('calculates discounted benefits, costs, and residual loss', () => {
    const result = evaluateAdaptationMeasure('cool-roof', risk, {
      discountRate: 0.03,
      benefitGrowth: 0.01,
    });

    expect(result.applicable).toBe(true);
    expect(result.applicableHazards).toEqual(['heat']);
    expect(result.eligibleAssetIds).toEqual(['clinic', 'school']);
    expect(result.annualAvoidedLoss).toBeGreaterThan(0);
    expect(result.presentBenefits).toBeGreaterThan(result.annualAvoidedLoss);
    expect(result.lifecycleCost).toBeGreaterThan(result.capitalCost);
    expect(result.residualAnnualLoss).toBeLessThan(result.coveredAnnualLoss);
  });

  it('marks a valid measure inapplicable when asset types do not match', () => {
    const result = evaluateAdaptationMeasure({
      id: 'harbor-breakwater',
      name: 'Harbor breakwater reinforcement',
      hazards: ['flood'],
      assetTypes: ['port'],
      capitalCost: 500_000,
      annualMaintenance: 5_000,
      lifetimeYears: 40,
      reduction: 0.45,
      coBenefits: ['navigation_continuity'],
    }, risk);

    expect(result.applicable).toBe(false);
    expect(result.eligibleAssetIds).toEqual([]);
    expect(result.annualAvoidedLoss).toBe(0);
    expect(result.paybackYears).toBeNull();
  });

  it('supports a project-specific measure without prescribing storage', () => {
    const result = evaluateAdaptationMeasure({
      id: 'clinic-canopy',
      name: 'Clinic entrance canopy',
      hazards: ['heat', 'storm'],
      assetTypes: ['clinic'],
      capitalCost: 10_000,
      annualMaintenance: 100,
      lifetimeYears: 15,
      reduction: 0.1,
      coBenefits: ['patient_comfort'],
    }, risk);

    expect(result.eligibleAssetIds).toEqual(['clinic']);
    expect(result.applicableHazards).toEqual(expect.arrayContaining(['heat', 'storm']));
    expect(result.coBenefits).toEqual(['patient_comfort']);
  });

  it('rejects unknown catalog measures', () => {
    expect(() => evaluateAdaptationMeasure('not-real', risk)).toThrow('Unknown adaptation measure');
  });
});

describe('portfolio and roadmap planning', () => {
  const risk = calculateClimateRisk({ assets, projections });

  it('keeps the selected portfolio inside capital and count limits', () => {
    const portfolio = prioritizeAdaptationPortfolio({
      riskAssessment: risk,
      measures: ADAPTATION_MEASURES,
    }, {
      budget: 100_000,
      maximumMeasures: 3,
    });

    expect(portfolio.committedCapital).toBeLessThanOrEqual(100_000);
    expect(portfolio.selected.length).toBeLessThanOrEqual(3);
    expect(portfolio.considered.length).toBeGreaterThan(portfolio.selected.length);
    expect(portfolio.rejected).toHaveLength(portfolio.considered.length - portfolio.selected.length);
    expect(portfolio.annualAvoidedLoss).toBeGreaterThan(0);
    expect(portfolio.residualAnnualLoss).toBeLessThan(risk.expectedAnnualLoss);
  });

  it('normalizes custom priority weights', () => {
    const portfolio = prioritizeAdaptationPortfolio({ riskAssessment: risk }, {
      budget: 80_000,
      weights: { economic: 3, risk: 2, affordability: 1, coBenefits: 0 },
    });

    expect(Object.values(portfolio.weights).reduce((total, value) => total + value, 0)).toBeCloseTo(1);
    expect(portfolio.weights.economic).toBeCloseTo(0.5);
    expect(portfolio.considered[0].priorityScore).toBeGreaterThanOrEqual(
      portfolio.considered.at(-1).priorityScore,
    );
  });

  it('places selected work into annual capital phases', () => {
    const portfolio = prioritizeAdaptationPortfolio({ riskAssessment: risk }, {
      budget: 200_000,
      maximumMeasures: 5,
    });
    const roadmap = buildAdaptationRoadmap(portfolio, {
      startYear: 2028,
      annualBudget: 70_000,
    });

    expect(roadmap.startYear).toBe(2028);
    expect(roadmap.measureCount).toBe(portfolio.selected.length);
    expect(roadmap.phases.flatMap((phase) => phase.measures)).toHaveLength(portfolio.selected.length);
    expect(roadmap.totalCapital).toBe(portfolio.committedCapital);
    expect(roadmap.phases.at(-1).cumulativeCost).toBe(portfolio.committedCapital);
  });

  it('keeps a measure larger than the annual budget in its own phase', () => {
    const measure = evaluateAdaptationMeasure('slope-drainage', risk);
    const portfolio = {
      selected: [measure],
      committedCapital: measure.capitalCost,
      baselineAnnualLoss: risk.expectedAnnualLoss,
    };
    const roadmap = buildAdaptationRoadmap(portfolio, {
      startYear: 2030,
      annualBudget: 50_000,
    });

    expect(roadmap.phases).toHaveLength(1);
    expect(roadmap.phases[0].capitalCost).toBe(120_000);
    expect(roadmap.endYear).toBe(2030);
  });
});

describe('scenario comparison and monitoring', () => {
  it('ranks named adaptation strategies and preserves comparison facts', () => {
    const risk = calculateClimateRisk({ assets, projections });
    const focused = prioritizeAdaptationPortfolio({
      riskAssessment: risk,
      measures: ['cool-roof', 'flood-barriers', 'raise-equipment'],
    }, { budget: 70_000 });
    const broad = prioritizeAdaptationPortfolio({ riskAssessment: risk }, {
      budget: 180_000,
      maximumMeasures: 5,
    });
    const comparison = compareAdaptationScenarios([
      { name: 'Focused retrofit', riskAssessment: risk, portfolio: focused },
      { name: 'Broad resilience', riskAssessment: risk, portfolio: broad },
    ]);

    expect(comparison.scenarios).toHaveLength(2);
    expect(comparison.scenarios.map((item) => item.rank)).toEqual([1, 2]);
    expect(['Focused retrofit', 'Broad resilience']).toContain(comparison.recommended);
    expect(['Focused retrofit', 'Broad resilience']).toContain(comparison.lowestResidualRisk);
    expect(comparison.highestCapitalRequirement).toBe('Broad resilience');
  });

  it('creates measure-specific monitoring indicators', () => {
    const risk = calculateClimateRisk({ assets, projections });
    const selected = [
      evaluateAdaptationMeasure('cool-roof', risk),
      evaluateAdaptationMeasure('flood-barriers', risk),
      evaluateAdaptationMeasure('rainwater-storage', risk),
    ];
    const monitoring = adaptationMonitoringPlan({ selected }, { reviewIntervalMonths: 6 });

    expect(monitoring.reviewIntervalMonths).toBe(6);
    expect(monitoring.indicators.some((indicator) => indicator.id.endsWith(':indoor-heat'))).toBe(true);
    expect(monitoring.indicators.some((indicator) => indicator.id.endsWith(':flood-events'))).toBe(true);
    expect(monitoring.indicators.some((indicator) => indicator.id.endsWith(':water-use'))).toBe(true);
    expect(monitoring.reviewTopics).toHaveLength(5);
  });

  it('summarizes decision-critical fields', () => {
    const risk = calculateClimateRisk({ assets, projections });
    const portfolio = prioritizeAdaptationPortfolio({ riskAssessment: risk }, {
      budget: 100_000,
      maximumMeasures: 3,
    });
    const summary = adaptationSummary(risk, portfolio);

    expect(summary.expectedAnnualLoss).toBe(risk.expectedAnnualLoss);
    expect(summary.selectedMeasureCount).toBe(portfolio.selected.length);
    expect(summary.highestRiskAssetId).toBeTruthy();
    expect(summary.bestValueMeasureId).toBeTruthy();
  });
});

describe('adaptation catalog', () => {
  it('filters by hazard, asset type, and capital ceiling', () => {
    const matches = adaptationCatalogFor({
      hazards: ['flood'],
      assetTypes: ['school'],
      maximumCost: 40_000,
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((measure) => measure.hazards.includes('flood'))).toBe(true);
    expect(matches.every((measure) => measure.assetTypes.includes('school'))).toBe(true);
    expect(matches.every((measure) => measure.capitalCost <= 40_000)).toBe(true);
  });

  it('returns immutable catalog copies', () => {
    const [measure] = adaptationCatalogFor({ hazards: ['storm'] });

    expect(Object.isFrozen(measure)).toBe(true);
    expect(ADAPTATION_MEASURES.some((candidate) => candidate.id === measure.id)).toBe(true);
  });
});
