import { describe, expect, it } from 'vitest';
import {
  applyProbabilityCalibration,
  brierScore,
  buildProbabilityCalibration,
  continuousRankedProbabilityScore,
  ensemblePercentiles,
  ensembleSpreadSkill,
  predictionIntervalCoverage,
  probabilisticForecastSummary,
  probabilityThresholdTable,
  quantileScore,
  rankHistogram,
  receiverOperatingCurve,
  reliabilityDiagram,
} from './probabilistic';

const binary = [
  { id: 'a', probability: 0.9, observed: true },
  { id: 'b', probability: 0.8, observed: true },
  { id: 'c', probability: 0.7, observed: true },
  { id: 'd', probability: 0.3, observed: false },
  { id: 'e', probability: 0.2, observed: false },
  { id: 'f', probability: 0.1, observed: false },
];

describe('probabilistic forecast verification', () => {
  it('builds reliability bins with weighted calibration errors', () => {
    const result = reliabilityDiagram(binary, { binCount: 5 });
    expect(result.sampleCount).toBe(6);
    expect(result.bins).toHaveLength(5);
    expect(result.eventFrequency).toBe(0.5);
    expect(result.expectedCalibrationError).toBeGreaterThanOrEqual(0);
  });

  it('decomposes the Brier score and reports skill', () => {
    const result = brierScore(binary, { binCount: 5 });
    expect(result.score).toBeLessThan(result.referenceScore);
    expect(result.skillScore).toBeGreaterThan(0);
    expect(result.uncertainty).toBe(0.25);
  });

  it('creates a receiver operating curve and threshold table', () => {
    const curve = receiverOperatingCurve(binary);
    expect(curve.areaUnderCurve).toBeGreaterThan(0.9);
    expect(curve.bestThreshold).toBeGreaterThanOrEqual(0.3);
    expect(probabilityThresholdTable(binary)).toHaveLength(5);
  });

  it('scores quantile forecasts asymmetrically', () => {
    const low = quantileScore([8, 18], [10, 20], 0.1);
    const high = quantileScore([8, 18], [10, 20], 0.9);
    expect(high.score).toBeGreaterThan(low.score);
    expect(low.losses).toHaveLength(2);
  });

  it('calculates continuous ranked probability scores', () => {
    const result = continuousRankedProbabilityScore([
      [8, 10, 12],
      [18, 20, 22],
    ], [10, 21]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.scores).toHaveLength(2);
  });

  it('measures interval coverage and misses', () => {
    const result = predictionIntervalCoverage([
      { lower: 8, upper: 12 },
      { lower: 18, upper: 20 },
    ], [10, 22], { expectedCoverage: 0.8 });
    expect(result.actualCoverage).toBe(0.5);
    expect(result.coverageBias).toBe(-0.3);
    expect(result.averageMissDistance).toBe(2);
  });

  it('rejects reversed prediction intervals', () => {
    expect(() => predictionIntervalCoverage([{ lower: 5, upper: 1 }], [3]))
      .toThrow('reversed bounds');
  });

  it('creates rank histograms with one more bin than members', () => {
    const result = rankHistogram([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ], [0, 5, 10]);
    expect(result.counts).toHaveLength(4);
    expect(result.counts.reduce((total, count) => total + count, 0)).toBe(3);
  });

  it('compares ensemble spread with mean forecast error', () => {
    const result = ensembleSpreadSkill([
      [8, 10, 12],
      [18, 20, 22],
    ], [10, 21]);
    expect(result.averageSpread).toBeGreaterThan(0);
    expect(result.rootMeanSquareError).toBeGreaterThan(0);
    expect(result.cases).toHaveLength(2);
  });

  it('builds and applies monotonic probability calibration', () => {
    const calibration = buildProbabilityCalibration(binary, { binCount: 5 });
    const values = calibration.points.map((point) => point.output);
    expect(values).toEqual([...values].sort((first, second) => first - second));
    expect(applyProbabilityCalibration(0.5, calibration)).toBeGreaterThanOrEqual(0);
    expect(applyProbabilityCalibration(0.5, calibration)).toBeLessThanOrEqual(1);
  });

  it('summarizes binary and continuous quality', () => {
    const result = probabilisticForecastSummary({
      binaryForecasts: binary,
      ensembles: [[8, 10, 12], [18, 20, 22]],
      observations: [10, 21],
    });
    expect(result.binary.sampleCount).toBe(6);
    expect(result.continuous.sampleCount).toBe(2);
    expect(['good', 'review', 'poor']).toContain(result.quality);
  });

  it('summarizes ensemble percentiles', () => {
    const result = ensemblePercentiles([1, 2, 3, 4, 5]);
    expect(result).toMatchObject({ minimum: 1, maximum: 5, mean: 3 });
    expect(result.percentiles['0.5']).toBe(3);
  });

  it('validates probability ranges and paired lengths', () => {
    expect(() => brierScore([{ probability: 1.2, observed: true }])).toThrow('no more than 1');
    expect(() => continuousRankedProbabilityScore([[1, 2]], [1, 2])).toThrow('equal length');
  });
});
