import { describe, expect, it } from 'vitest';
import {
  analyzeRiverGauge,
  assessFlashFloodRisk,
  calculateCatchmentResponse,
  floodTravelAdvisory,
} from './flood';
import { analyzeLightningThreat, lightningSafetyCountdown, lightningTrend } from './lightning';
import {
  analyzeCycloneTrack,
  assessCycloneLocationRisk,
  cycloneImpactWindows,
  projectCycloneTrack,
} from './tropicalCyclone';

describe('tropical cyclone analysis', () => {
  const advisories = [
    { id: 'a', issuedAt: '2026-10-10T00:00:00Z', latitude: 14, longitude: 80, maximumWindMps: 25, centralPressureHpa: 990 },
    { id: 'b', issuedAt: '2026-10-10T06:00:00Z', latitude: 14.5, longitude: 81, maximumWindMps: 30, centralPressureHpa: 980 },
    { id: 'c', issuedAt: '2026-10-10T12:00:00Z', latitude: 15, longitude: 82, maximumWindMps: 35, centralPressureHpa: 970, radius34KtKm: 180 },
  ];

  it('calculates track speed, bearing, and strengthening', () => {
    const track = analyzeCycloneTrack(advisories);
    expect(track.segments).toHaveLength(2);
    expect(track.totalDistanceKm).toBeGreaterThan(200);
    expect(track.strengthening).toBe(true);
    expect(track.latest.classification).toBe('category_1');
  });

  it('sorts advisories chronologically', () => {
    const track = analyzeCycloneTrack([...advisories].reverse());
    expect(track.advisories.map((advisory) => advisory.id)).toEqual(['a', 'b', 'c']);
  });

  it('rejects duplicate advisory times', () => {
    expect(() => analyzeCycloneTrack([advisories[0], { ...advisories[1], issuedAt: advisories[0].issuedAt }])).toThrow('distinct');
  });

  it('projects movement using recent motion', () => {
    const projection = projectCycloneTrack(analyzeCycloneTrack(advisories), { hours: [6, 12] });
    expect(projection).toHaveLength(2);
    expect(projection[1].forecastHour).toBe(12);
    expect(projection[1].uncertaintyRadiusKm).toBeGreaterThan(projection[0].uncertaintyRadiusKm);
  });

  it('supports explicit motion projections', () => {
    const projection = projectCycloneTrack(analyzeCycloneTrack(advisories), {
      hours: [10], speedKph: 20, bearingDegrees: 90,
    });
    expect(projection[0].longitude).toBeGreaterThan(advisories.at(-1).longitude);
  });

  it('assesses risk for nearby communities', () => {
    const track = analyzeCycloneTrack(advisories);
    const risk = assessCycloneLocationRisk({ latitude: 15, longitude: 82.1 }, track, { projection: [] });
    expect(risk.score).toBeGreaterThan(50);
    expect(risk.closestApproach.distanceKm).toBeLessThan(20);
  });

  it('identifies projected impact windows', () => {
    const projection = [
      { validAt: '2026-10-10T18:00:00Z', latitude: 15, longitude: 82, maximumWindMps: 35 },
      { validAt: '2026-10-11T00:00:00Z', latitude: 16, longitude: 83, maximumWindMps: 32 },
    ];
    const window = cycloneImpactWindows({ latitude: 15.1, longitude: 82.1 }, projection, { thresholdKm: 200 });
    expect(window.affected).toBe(true);
    expect(window.closest.distanceKm).toBeLessThan(20);
  });
});

describe('lightning threat analysis', () => {
  const NOW = '2026-10-11T12:00:00Z';
  const location = { latitude: 12.9716, longitude: 77.5946 };
  const strikes = [
    { id: 'near', observedAt: '2026-10-11T11:55:00Z', latitude: 12.98, longitude: 77.6, peakCurrentKa: 20 },
    { id: 'older', observedAt: '2026-10-11T11:40:00Z', latitude: 13.02, longitude: 77.62, peakCurrentKa: 10 },
    { id: 'far', observedAt: '2026-10-11T11:58:00Z', latitude: 15, longitude: 80 },
  ];

  it('filters strikes by age and distance', () => {
    const result = analyzeLightningThreat(location, strikes, { now: NOW, radiusKm: 30, windowMinutes: 30 });
    expect(result.strikeCount).toBe(2);
    expect(result.closest.id).toBe('near');
  });

  it('produces actionable elevated threats', () => {
    const repeated = Array.from({ length: 10 }, (_, index) => ({
      id: `strike-${index}`,
      observedAt: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
      latitude: 12.98,
      longitude: 77.6,
    }));
    const result = analyzeLightningThreat(location, repeated, { now: NOW });
    expect(['high', 'extreme']).toContain(result.level);
    expect(result.instruction).toContain('indoors');
  });

  it('reports no threat without recent strikes', () => {
    const result = analyzeLightningThreat(location, [], { now: NOW });
    expect(result.level).toBe('none');
    expect(result.allClearAt).toBeNull();
  });

  it('tracks increasing lightning frequency', () => {
    const values = [55, 45, 15, 10, 5, 1].map((minutesAgo, index) => ({
      id: `s-${index}`,
      observedAt: new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString(),
      latitude: 13,
      longitude: 77.6,
    }));
    expect(lightningTrend(values, location, { now: NOW }).direction).toBe('increasing');
  });

  it('counts down the lightning all-clear interval', () => {
    const threat = analyzeLightningThreat(location, strikes, { now: NOW, allClearMinutes: 30 });
    const countdown = lightningSafetyCountdown(threat, NOW);
    expect(countdown.clear).toBe(false);
    expect(countdown.remainingMinutes).toBe(25);
  });
});

describe('flood hazard analysis', () => {
  it('classifies river stage and rising trend', () => {
    const result = analyzeRiverGauge([
      { observedAt: '2026-10-11T09:00:00Z', levelM: 2, flowCms: 100 },
      { observedAt: '2026-10-11T10:00:00Z', levelM: 2.5, flowCms: 120 },
      { observedAt: '2026-10-11T11:00:00Z', levelM: 3, flowCms: 150 },
    ], { actionM: 2, minorM: 3.5, moderateM: 4.5, majorM: 5.5 });
    expect(result.stage).toBe('action');
    expect(result.trend).toBe('rising');
    expect(result.hoursToNextStage).toBe(1);
  });

  it('classifies falling gauges', () => {
    const result = analyzeRiverGauge([
      { observedAt: '2026-10-11T09:00:00Z', levelM: 4 },
      { observedAt: '2026-10-11T10:00:00Z', levelM: 3 },
    ], { actionM: 2, minorM: 3.5 });
    expect(result.trend).toBe('falling');
    expect(result.hoursToNextStage).toBeNull();
  });

  it('scores saturated intense-rain flash floods', () => {
    const result = assessFlashFloodRisk({
      rain1hMm: 60, rain3hMm: 100, rain24hMm: 150, soilSaturation: 1, slopePercent: 25, imperviousPercent: 80,
    });
    expect(['high', 'extreme']).toContain(result.level);
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('adds burn-scar guidance', () => {
    const result = assessFlashFloodRisk({ rain1hMm: 20, burnScar: true });
    expect(result.actions.some((action) => action.includes('burn scars'))).toBe(true);
  });

  it('turns rainfall into a lagged catchment hydrograph', () => {
    const result = calculateCatchmentResponse([
      { startsAt: '2026-10-11T10:00:00Z', rainfallMm: 10, durationHours: 1 },
      { startsAt: '2026-10-11T11:00:00Z', rainfallMm: 20, durationHours: 1 },
    ], { areaKm2: 50, runoffCoefficient: 0.5, lagHours: 2, baseFlowCms: 10 });
    expect(result.hydrograph).toHaveLength(2);
    expect(result.totalRainfallMm).toBe(30);
    expect(result.hydrograph[0].validAt).toBe('2026-10-11T12:00:00.000Z');
    expect(result.peakFlowCms).toBeGreaterThan(10);
  });

  it('flags route segments intersecting flood hazards', () => {
    const advisory = floodTravelAdvisory([
      { id: 'bridge', road: 'River Road', elevationM: 2 },
      { id: 'hill', road: 'Hill Road', elevationM: 20 },
    ], [{ id: 'flood-1', segmentIds: ['bridge'], depthM: 0.5 }]);
    expect(advisory.safe).toBe(false);
    expect(advisory.closedSegments).toEqual(['bridge']);
  });

  it('returns a clear advisory when hazards miss the route', () => {
    const advisory = floodTravelAdvisory([{ id: 'hill' }], [{ id: 'flood', segmentIds: ['river'] }]);
    expect(advisory.safe).toBe(true);
  });
});
