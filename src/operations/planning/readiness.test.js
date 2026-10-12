import { describe, expect, it } from 'vitest';
import {
  buildHouseholdReadinessPlan,
  calculateEmergencySupplies,
  householdPlanSummary,
  updateHouseholdPlanProgress,
} from './householdPlan';
import {
  assessCommute,
  compareCommutes,
  commuteNotification,
  findCommuteDepartureWindow,
} from './commute';

describe('household readiness planning', () => {
  const household = { adults: 2, children: 1, pets: 1, vehicles: 1 };

  it('calculates emergency supplies by people, pets, and days', () => {
    const result = calculateEmergencySupplies(household, { days: 3 });
    expect(result.people).toBe(3);
    expect(result.supplies.find((item) => item.id === 'drinking_water_liters').quantity).toBe(35);
    expect(result.supplies.find((item) => item.id === 'pet_meals').quantity).toBe(6);
  });

  it('adds backup power for medical equipment', () => {
    const result = calculateEmergencySupplies({
      adults: 1,
      medicalEquipment: [{ name: 'Oxygen concentrator', watts: 300, hoursPerDay: 8 }],
    }, { days: 2 });
    expect(result.supplies.find((item) => item.id.startsWith('equipment_power')).quantity).toBe(4800);
  });

  it('requires at least one household member', () => {
    expect(() => calculateEmergencySupplies({ adults: 0, children: 0 })).toThrow('at least one');
  });

  it('builds actions for multiple hazards', () => {
    const plan = buildHouseholdReadinessPlan({
      household,
      hazards: [
        { id: 'heat', type: 'heat', severity: 'severe', startsAt: '2026-06-02T12:00:00Z' },
        { id: 'rain', type: 'flood', severity: 'moderate', startsAt: '2026-06-02T15:00:00Z' },
      ],
    }, { now: '2026-06-01T12:00:00Z' });
    expect(plan.actions.some((action) => action.category === 'heat')).toBe(true);
    expect(plan.actions.some((action) => action.category === 'flood')).toBe(true);
    expect(plan.supplies.length).toBeGreaterThan(5);
  });

  it('adds accessibility and medication actions', () => {
    const plan = buildHouseholdReadinessPlan({
      household: { adults: 1, mobilityNeeds: true, medications: ['insulin'] },
      hazards: [],
    }, { now: '2026-06-01T12:00:00Z' });
    expect(plan.actions.map((action) => action.category)).toEqual(['accessibility', 'medical']);
  });

  it('marks past due actions as overdue', () => {
    const plan = buildHouseholdReadinessPlan({
      household,
      hazards: [{ id: 'storm', type: 'storm', startsAt: '2026-06-01T13:00:00Z' }],
    }, { now: '2026-06-01T12:00:00Z' });
    expect(plan.actions.some((action) => action.overdue)).toBe(true);
  });

  it('tracks completion progress by weighted priority', () => {
    const plan = buildHouseholdReadinessPlan({
      household,
      hazards: [{ id: 'storm', type: 'storm', startsAt: '2026-06-03T12:00:00Z' }],
    }, { now: '2026-06-01T12:00:00Z' });
    const updated = updateHouseholdPlanProgress(plan, [plan.actions[0].id]);
    expect(updated.completedCount).toBe(1);
    expect(updated.remainingCount).toBe(plan.actions.length - 1);
    expect(updated.readinessScore).toBeGreaterThan(0);
  });

  it('summarizes urgent unfinished actions', () => {
    const plan = buildHouseholdReadinessPlan({
      household: { adults: 1, medications: ['medicine'] },
      hazards: [{ id: 'flood', type: 'flood', startsAt: '2026-06-02T12:00:00Z' }],
    }, { now: '2026-06-01T12:00:00Z' });
    const summary = householdPlanSummary(plan);
    expect(summary.urgentCount).toBeGreaterThan(0);
    expect(summary.nextDueAt).toBeTruthy();
  });
});

describe('commute weather planning', () => {
  function leg(changes = {}) {
    return {
      id: 'walk',
      mode: 'walking',
      startsAt: '2026-06-01T08:00:00Z',
      durationMinutes: 30,
      weather: { temperatureC: 25, windSpeedMps: 3, precipitationMm: 0, visibilityMeters: 10000 },
      ...changes,
    };
  }

  it('rates calm commutes as good', () => {
    const result = assessCommute([leg()]);
    expect(result.level).toBe('good');
    expect(result.score).toBeLessThan(15);
  });

  it('elevates exposed lightning risk', () => {
    const result = assessCommute([leg({ weather: { lightningRisk: 'high' } })]);
    expect(['poor', 'avoid']).toContain(result.level);
    expect(result.recommendations[0]).toContain('lightning');
  });

  it('elevates flood risk for every mode', () => {
    const result = assessCommute([leg({ mode: 'driving', weather: { floodRisk: 'extreme' } })]);
    expect(result.score).toBeGreaterThan(15);
    expect(result.recommendations.some((value) => value.includes('flooded'))).toBe(true);
  });

  it('weights longer legs in the overall risk', () => {
    const result = assessCommute([
      leg({ id: 'short', durationMinutes: 5, weather: { precipitationMm: 10 } }),
      leg({ id: 'long', startsAt: '2026-06-01T08:05:00Z', durationMinutes: 55, weather: {} }),
    ]);
    expect(result.totalDurationMinutes).toBe(60);
    expect(result.score).toBeLessThan(50);
  });

  it('recommends the lowest-risk commute', () => {
    const options = compareCommutes([
      { id: 'walk', name: 'Walk', legs: [leg({ weather: { precipitationMm: 10 } })] },
      { id: 'transit', name: 'Transit', legs: [leg({ mode: 'transit', weather: { precipitationMm: 10 } })] },
    ]);
    expect(options[0].id).toBe('transit');
    expect(options[0].recommended).toBe(true);
  });

  it('breaks ties using duration', () => {
    const options = compareCommutes([
      { id: 'slow', legs: [leg({ durationMinutes: 60 })] },
      { id: 'fast', legs: [leg({ durationMinutes: 20 })] },
    ]);
    expect(options[0].id).toBe('fast');
  });

  it('finds the best departure window', () => {
    const result = findCommuteDepartureWindow([
      { id: 'rainy', departsAt: '2026-06-01T08:00:00Z', legs: [leg({ weather: { precipitationMm: 10 } })] },
      { id: 'dry', departsAt: '2026-06-01T09:00:00Z', legs: [leg({ startsAt: '2026-06-01T09:00:00Z' })] },
    ]);
    expect(result.recommended.id).toBe('dry');
  });

  it('creates severity-aware commute notifications', () => {
    const assessment = assessCommute([leg({ weather: { lightningRisk: 'high', floodRisk: 'high' } })]);
    const notification = commuteNotification(assessment);
    expect(notification.title).toBeTruthy();
    expect(['warning', 'critical']).toContain(notification.severity);
    expect(notification.data.score).toBe(assessment.score);
  });
});
