import { describe, expect, it } from 'vitest';
import {
  allocateShelters,
  assessShelterWeather,
  buildShelterOperationalPlan,
  buildShelterStaffingPlan,
  buildShelterMutualAidRequest,
  buildShelterDeliveryManifest,
  calculateShelterSupplies,
  forecastShelterOccupancy,
  planShelterRelocation,
  planShelterDemobilization,
  prioritizeShelterDeliveries,
  reconcileShelterCensus,
  scheduleShelterTransport,
  scoreShelterForGroup,
  shelterDailyBrief,
  shelterAccessibilityAudit,
  shelterNetworkSummary,
  shelterSupplyGap,
} from './emergencyShelters';

const shelters = [
  {
    id: 'school',
    name: 'Central School',
    location: { latitude: 12.97, longitude: 77.59 },
    capacity: 200,
    occupied: 20,
    accessibility: ['wheelchair', 'mobility_assistance', 'medical_power', 'service_animal'],
    acceptsPets: true,
    medicalLevel: 1,
    backupPowerHours: 48,
    airFiltration: 'enhanced',
    hazardTolerance: { flood: 0.7, smoke: 0.5, wind: 0.8 },
    transportHub: true,
    supplies: { drinking_water_liters: 2000, meals: 1500, cots: 220, blankets: 400 },
  },
  {
    id: 'hall',
    name: 'Community Hall',
    location: { latitude: 13.02, longitude: 77.61 },
    capacity: 100,
    occupied: 0,
    accessibility: [],
    acceptsPets: false,
    medicalLevel: 0,
    backupPowerHours: 0,
    airFiltration: 'none',
    hazardTolerance: { flood: 0.3, smoke: 0.2, wind: 0.5 },
  },
];

const groups = [
  {
    id: 'medical',
    people: 20,
    medicalLevel: 1,
    accessNeeds: ['wheelchair', 'medical_power'],
    origin: { latitude: 12.98, longitude: 77.58 },
    priority: 90,
    vehicleSeats: 0,
  },
  {
    id: 'families',
    people: 60,
    infants: 5,
    pets: 3,
    accessNeeds: [],
    origin: { latitude: 13, longitude: 77.6 },
    priority: 60,
    vehicleSeats: 60,
  },
  {
    id: 'general',
    people: 70,
    accessNeeds: [],
    origin: { latitude: 13.03, longitude: 77.62 },
    priority: 40,
    vehicleSeats: 0,
  },
];

const smoke = [{ type: 'smoke', severity: 0.6, startsAt: '2026-10-11T12:00:00Z' }];

describe('shelter suitability', () => {
  it('applies building mitigation to weather hazards', () => {
    const result = assessShelterWeather(shelters[0], smoke);
    expect(result.safe).toBe(true);
    expect(result.impacts[0].effectiveSeverity).toBeLessThan(result.impacts[0].severity);
  });

  it('marks exposed facilities unsafe', () => {
    const result = assessShelterWeather(shelters[1], smoke);
    expect(result.safe).toBe(false);
    expect(result.unsafeHazards).toEqual(['smoke']);
  });

  it('scores distance, capacity, access, and weather together', () => {
    const score = scoreShelterForGroup(shelters[0], groups[0], { hazards: smoke });
    expect(score.eligible).toBe(true);
    expect(score.score).toBeGreaterThan(0);
    expect(score.unmetNeeds).toEqual([]);
  });

  it('explains unmet accessibility requirements', () => {
    const score = scoreShelterForGroup(shelters[1], groups[0]);
    expect(score.eligible).toBe(false);
    expect(score.unmetNeeds).toEqual(expect.arrayContaining(['wheelchair', 'medical_power', 'medical_level_1']));
  });
});

describe('shelter allocation', () => {
  it('assigns high-priority groups first without exceeding capacity', () => {
    const result = allocateShelters({ shelters, groups });
    expect(result.assignedPeople).toBe(150);
    expect(result.unassignedPeople).toBe(0);
    expect(result.shelterLoads.every((load) => load.finalOccupied <= load.capacity)).toBe(true);
    expect(result.allocations.find((entry) => entry.groupId === 'medical').shelterId).toBe('school');
  });

  it('keeps pet-owning groups at pet-friendly shelters', () => {
    const result = allocateShelters({ shelters, groups });
    expect(result.allocations.find((entry) => entry.groupId === 'families').shelterId).toBe('school');
  });

  it('reports groups that cannot be accommodated', () => {
    const result = allocateShelters({
      shelters: [{ ...shelters[1], capacity: 10 }],
      groups: [groups[2]],
    });
    expect(result.unassignedPeople).toBe(70);
    expect(result.unassigned[0].reason).toBe('capacity');
  });

  it('removes unsafe shelters from allocation', () => {
    const result = allocateShelters({ shelters, groups: [groups[2]] }, { hazards: smoke });
    expect(result.allocations[0].shelterId).toBe('school');
  });
});

describe('shelter supplies and staffing', () => {
  it('calculates multi-day supplies with reserves', () => {
    const result = calculateShelterSupplies({
      people: 100, infants: 4, pets: 3, medicalPeople: 10,
    }, { days: 3 });
    expect(result.byId.drinking_water_liters).toBeGreaterThan(1000);
    expect(result.byId.meals).toBeGreaterThanOrEqual(900);
    expect(result.byId.infant_kits).toBeGreaterThanOrEqual(4);
    expect(result.byId.pet_meals).toBeGreaterThanOrEqual(18);
  });

  it('reports supply gaps and surplus', () => {
    const requirements = calculateShelterSupplies({ people: 10 }).supplies;
    const gap = shelterSupplyGap(requirements, { drinking_water_liters: 1000 });
    expect(gap.complete).toBe(false);
    expect(gap.items.find((item) => item.id === 'drinking_water_liters').surplus).toBeGreaterThan(0);
    expect(gap.missingItemCount).toBeGreaterThan(0);
  });

  it('scales staffing roles with occupancy and needs', () => {
    const plan = buildShelterStaffingPlan({ people: 240, medicalPeople: 30, children: 45 });
    expect(plan.peoplePerShift).toBeGreaterThan(10);
    expect(plan.roles.find((role) => role.id === 'medical').perShift).toBeGreaterThan(1);
    expect(plan.dailyAssignments).toBe(plan.peoplePerShift * plan.shiftsPerDay);
  });
});

describe('shelter transport', () => {
  const vehicles = [
    { id: 'accessible-bus', seats: 30, wheelchairSpaces: 4, petSpaces: 4, cycleMinutes: 60, availableAt: '2026-10-11T12:00:00Z' },
    { id: 'bus', seats: 80, wheelchairSpaces: 0, petSpaces: 0, cycleMinutes: 90, availableAt: '2026-10-11T12:00:00Z' },
  ];

  it('schedules priority groups on compatible vehicles', () => {
    const result = scheduleShelterTransport(groups, vehicles);
    expect(result.trips.find((trip) => trip.groupId === 'medical').vehicleId).toBe('accessible-bus');
    expect(result.trips.find((trip) => trip.groupId === 'general').vehicleId).toBe('bus');
    expect(result.servedPeople).toBe(90);
  });

  it('reports groups without compatible vehicles', () => {
    const result = scheduleShelterTransport([groups[0]], [vehicles[1]]);
    expect(result.unservedPeople).toBe(20);
    expect(result.unserved[0].reason).toBe('accessible_vehicle_unavailable');
  });

  it('does not schedule groups with their own seats', () => {
    const result = scheduleShelterTransport([groups[1]], vehicles);
    expect(result.trips).toEqual([]);
    expect(result.servedPeople).toBe(0);
  });
});

describe('network readiness', () => {
  it('audits accessible capacity by need', () => {
    const result = shelterAccessibilityAudit(shelters, groups);
    expect(result.needCoverage.find((entry) => entry.need === 'wheelchair').capacity).toBe(180);
    expect(result.maximumMedicalDemand).toBe(1);
    expect(result.petFriendlyCapacity).toBe(180);
  });

  it('summarizes capacity that remains safe for the forecast', () => {
    const result = shelterNetworkSummary(shelters, smoke);
    expect(result.shelterCount).toBe(2);
    expect(result.weatherSuitableCount).toBe(1);
    expect(result.availableCapacity).toBe(180);
  });

  it('builds one operational plan with allocation, supplies, and staffing', () => {
    const result = buildShelterOperationalPlan({ shelters, groups, hazards: smoke }, {
      now: '2026-10-11T12:00:00Z',
      supplyDays: 3,
    });
    expect(result.shelterPlans).toHaveLength(2);
    expect(result.shelterPlans[0].supplies.days).toBe(3);
    expect(result.allocation.assignedPeople).toBe(150);
    expect(result.network.weatherSuitableCount).toBe(1);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('warns when no site can accept the forecast hazard', () => {
    const severe = [{ type: 'flood', severity: 1 }];
    const result = buildShelterOperationalPlan({
      shelters,
      groups: [groups[2]],
      hazards: severe,
    }, { now: '2026-10-11T12:00:00Z' });
    expect(result.ready).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('No open shelter'))).toBe(true);
  });
});

describe('live shelter operations', () => {
  it('reconciles an idempotent chronological census', () => {
    const events = [
      { id: 'one', type: 'check_in', people: 20, at: '2026-10-11T12:00:00Z' },
      { id: 'two', type: 'check_out', people: 5, at: '2026-10-11T13:00:00Z' },
      { id: 'one', type: 'check_in', people: 20, at: '2026-10-11T12:00:00Z' },
    ];
    const result = reconcileShelterCensus(10, events, { capacity: 100 });
    expect(result.currentOccupancy).toBe(25);
    expect(result.eventCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.timeline[0]).toMatchObject({ before: 10, after: 30 });
  });

  it('rejects census conflicts, negative counts, and overflow', () => {
    expect(() => reconcileShelterCensus(5, [
      { id: 'one', type: 'check_out', people: 10, at: '2026-10-11T12:00:00Z' },
    ])).toThrow('negative');
    expect(() => reconcileShelterCensus(5, [
      { id: 'one', type: 'check_in', people: 10, at: '2026-10-11T12:00:00Z' },
    ], { capacity: 10 })).toThrow('exceeds capacity');
    expect(() => reconcileShelterCensus(0, [
      { id: 'same', type: 'check_in', people: 1, at: '2026-10-11T12:00:00Z' },
      { id: 'same', type: 'check_in', people: 2, at: '2026-10-11T12:00:00Z' },
    ])).toThrow('conflicting content');
  });

  it('forecasts expected and conservative occupancy', () => {
    const result = forecastShelterOccupancy({
      initialOccupancy: 50,
      capacity: 100,
      changes: [
        { id: 'arrival', at: '2026-10-11T13:00:00Z', people: 60, confidence: 0.5 },
        { id: 'departure', at: '2026-10-11T14:00:00Z', people: -20, confidence: 0.5 },
      ],
    });
    expect(result.finalExpectedOccupancy).toBe(70);
    expect(result.peakConservativeOccupancy).toBe(110);
    expect(result.overflowAt).toBe('2026-10-11T13:00:00.000Z');
  });

  it('relocates occupants to compatible destinations', () => {
    const source = { ...shelters[0], id: 'source', occupied: 90 };
    const result = planShelterRelocation({
      source,
      destinations: shelters,
      groups: [groups[0], groups[2]],
      hazards: [],
    });
    expect(result.complete).toBe(true);
    expect(result.relocatedPeople).toBe(90);
    expect(result.remainingAtSource).toBe(0);
    expect(result.waves).toHaveLength(2);
  });

  it('rejects relocation groups beyond the registered census', () => {
    expect(() => planShelterRelocation({
      source: { ...shelters[0], id: 'source', occupied: 10 },
      destinations: shelters,
      groups: [groups[2]],
    })).toThrow('exceed the source shelter census');
  });

  it('builds a daily brief from the latest census', () => {
    const operational = buildShelterOperationalPlan({ shelters, groups, hazards: smoke }, {
      now: '2026-10-11T12:00:00Z',
    });
    const census = reconcileShelterCensus(20, [
      { id: 'arrival', type: 'check_in', people: 150, at: '2026-10-11T13:00:00Z' },
    ], { capacity: 200 });
    const brief = shelterDailyBrief(operational, { school: census }, {
      now: '2026-10-11T14:00:00Z',
    });
    expect(brief.totalOccupancy).toBeGreaterThanOrEqual(170);
    expect(brief.shelters.find((shelter) => shelter.shelterId === 'school').occupancy).toBe(170);
    expect(brief.headline).toBeTruthy();
  });

  it('prioritizes critical deliveries by deficit and occupancy', () => {
    const operational = buildShelterOperationalPlan({ shelters, groups, hazards: [] }, {
      now: '2026-10-11T12:00:00Z',
    });
    const result = prioritizeShelterDeliveries(operational.shelterPlans, { maximumStops: 5 });
    expect(result.deliveries.length).toBeLessThanOrEqual(5);
    expect(result.deliveries.map((delivery) => delivery.rank))
      .toEqual(result.deliveries.map((_, index) => index + 1));
    expect(result.totalItemUnits).toBeGreaterThan(0);
    expect(result.criticalDeliveryCount).toBeGreaterThan(0);
  });

  it('builds a mutual-aid request from operational shortfalls', () => {
    const operational = buildShelterOperationalPlan({
      shelters: [{ ...shelters[1], capacity: 10 }],
      groups: [groups[2]],
      hazards: [],
    }, { now: '2026-10-11T12:00:00Z' });
    const request = buildShelterMutualAidRequest(operational, {
      jurisdiction: 'Bengaluru Urban',
      incidentId: 'storm-1',
      requestedAt: '2026-10-11T13:00:00Z',
      staffingShortfalls: [{ role: 'medical', people: 2, shifts: 3 }],
    });
    expect(request.needed).toBe(true);
    expect(request.priority).toBe('immediate');
    expect(request.requestedCapacity).toBe(70);
    expect(request.staffing[0]).toMatchObject({ role: 'medical', people: 2, shifts: 3 });
    expect(request.justification.length).toBeGreaterThan(0);
  });

  it('builds a timed manifest from prioritized deliveries', () => {
    const deliveryPlan = {
      deliveries: [
        { shelterId: 'school', itemId: 'water', quantity: 100, priorityScore: 90, critical: true },
        { shelterId: 'school', itemId: 'blankets', quantity: 50, priorityScore: 40, critical: false },
        { shelterId: 'hall', itemId: 'meals', quantity: 80, priorityScore: 75, critical: true },
      ],
    };
    const manifest = buildShelterDeliveryManifest(deliveryPlan, {
      dispatchAt: '2026-10-11T12:00:00Z',
      travelMinutesByShelter: { school: 15, hall: 25 },
      serviceMinutesPerStop: 10,
    });
    expect(manifest.stopCount).toBe(2);
    expect(manifest.totalUnits).toBe(230);
    expect(manifest.stops[0].items[0].critical).toBe(true);
    expect(manifest.completesAt).toBe('2026-10-11T13:00:00.000Z');
  });

  it('keeps protected capabilities open during demobilization', () => {
    const operational = buildShelterOperationalPlan({ shelters, groups: [groups[0]], hazards: [] }, {
      now: '2026-10-11T12:00:00Z',
    });
    const result = planShelterDemobilization(operational, {
      minimumOccupancyPercent: 30,
      keepOpenShelterIds: ['hall'],
    });
    expect(result.plans.find((plan) => plan.shelterId === 'hall').action).toBe('review');
    expect(result.plans.find((plan) => plan.shelterId === 'school').reasons).toContain('protected_capability');
    expect(result.eligible).toBe(true);
  });
});
