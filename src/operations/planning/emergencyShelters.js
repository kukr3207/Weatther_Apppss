import {
  assertArray,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import { haversineDistance } from '../core/geo';
import { maximum, mean, sum } from '../core/statistics';

const ACCESS_NEEDS = Object.freeze([
  'wheelchair',
  'mobility_assistance',
  'hearing_support',
  'visual_support',
  'medical_power',
  'refrigerated_medicine',
  'caregiver_space',
  'service_animal',
  'language_support',
]);

const SUPPLY_STANDARDS = Object.freeze({
  drinking_water_liters: { perPersonDay: 3.8, reserveFactor: 1.15, roundTo: 1 },
  meals: { perPersonDay: 3, reserveFactor: 1.1, roundTo: 1 },
  cots: { perPerson: 1, reserveFactor: 1.05, roundTo: 1 },
  blankets: { perPerson: 2, reserveFactor: 1.05, roundTo: 1 },
  hygiene_kits: { perPerson: 1, reserveFactor: 1.05, roundTo: 1 },
  masks: { perPersonDay: 2, reserveFactor: 1.2, roundTo: 10 },
  phone_charging_wh: { perPersonDay: 15, reserveFactor: 1.25, roundTo: 100 },
  sanitation_liters: { perPersonDay: 8, reserveFactor: 1.1, roundTo: 10 },
  infant_kits: { perInfant: 1, reserveFactor: 1.2, roundTo: 1 },
  pet_meals: { perPetDay: 2, reserveFactor: 1.15, roundTo: 1 },
  pet_water_liters: { perPetDay: 1.2, reserveFactor: 1.15, roundTo: 1 },
  medical_consumable_sets: { perMedicalPersonDay: 1, reserveFactor: 1.25, roundTo: 1 },
});

const HAZARD_DEFAULT_TOLERANCE = Object.freeze({
  flood: 0.2,
  coastal_flood: 0.15,
  wind: 0.75,
  heat: 0.6,
  cold: 0.65,
  smoke: 0.55,
  wildfire: 0.2,
  landslide: 0.15,
});

function normalizedLocation(input, label) {
  assertObject(input, `${label} location`);
  return deepFreeze({
    latitude: assertFiniteNumber(input.latitude, `${label} latitude`, { minimum: -90, maximum: 90 }),
    longitude: assertFiniteNumber(input.longitude, `${label} longitude`, { minimum: -180, maximum: 180 }),
  });
}

function normalizeShelter(input, index) {
  assertObject(input, `Shelter ${index + 1}`);
  const id = assertString(input.id, `Shelter ${index + 1} id`);
  const capacity = Math.trunc(assertFiniteNumber(input.capacity, `${id} capacity`, { minimum: 1 }));
  const occupied = Math.trunc(assertFiniteNumber(input.occupied ?? 0, `${id} occupied`, {
    minimum: 0,
    maximum: capacity,
  }));
  const accessibility = [...new Set(assertArray(input.accessibility ?? [], `${id} accessibility`).map(String))];
  const hazardTolerance = {};
  Object.entries(input.hazardTolerance ?? {}).forEach(([hazard, tolerance]) => {
    hazardTolerance[hazard] = assertFiniteNumber(tolerance, `${id} ${hazard} tolerance`, {
      minimum: 0,
      maximum: 1,
    });
  });
  return deepFreeze({
    id,
    name: assertString(input.name ?? id, `${id} name`),
    location: normalizedLocation(input.location, id),
    capacity,
    occupied,
    availableCapacity: capacity - occupied,
    state: ['open', 'standby', 'closed', 'full'].includes(input.state) ? input.state : 'open',
    accessibility: Object.freeze(accessibility),
    acceptsPets: input.acceptsPets === true,
    serviceAnimalsOnly: input.serviceAnimalsOnly === true,
    medicalLevel: Math.trunc(assertFiniteNumber(input.medicalLevel ?? 0, `${id} medical level`, {
      minimum: 0,
      maximum: 3,
    })),
    backupPowerHours: assertFiniteNumber(input.backupPowerHours ?? 0, `${id} backup power`, { minimum: 0 }),
    airFiltration: ['none', 'basic', 'enhanced', 'smoke'].includes(input.airFiltration)
      ? input.airFiltration
      : 'none',
    hazardTolerance: deepFreeze(hazardTolerance),
    transportHub: input.transportHub === true,
    supplies: deepFreeze({ ...(input.supplies ?? {}) }),
    tags: Object.freeze(assertArray(input.tags ?? [], `${id} tags`).map(String)),
  });
}

function normalizeGroup(input, index) {
  assertObject(input, `Evacuation group ${index + 1}`);
  const id = assertString(input.id, `Evacuation group ${index + 1} id`);
  const people = Math.trunc(assertFiniteNumber(input.people, `${id} people`, { minimum: 1 }));
  const accessNeeds = [...new Set(assertArray(input.accessNeeds ?? [], `${id} access needs`).map(String))];
  const unsupported = accessNeeds.filter((need) => !ACCESS_NEEDS.includes(need));
  if (unsupported.length) throw new TypeError(`Evacuation group ${id} has unsupported access needs: ${unsupported.join(', ')}.`);
  return deepFreeze({
    id,
    name: String(input.name ?? id),
    people,
    infants: Math.trunc(assertFiniteNumber(input.infants ?? 0, `${id} infants`, { minimum: 0, maximum: people })),
    pets: Math.trunc(assertFiniteNumber(input.pets ?? 0, `${id} pets`, { minimum: 0 })),
    medicalLevel: Math.trunc(assertFiniteNumber(input.medicalLevel ?? 0, `${id} medical level`, {
      minimum: 0,
      maximum: 3,
    })),
    accessNeeds: Object.freeze(accessNeeds),
    origin: normalizedLocation(input.origin, id),
    priority: assertFiniteNumber(input.priority ?? 50, `${id} priority`, { minimum: 0, maximum: 100 }),
    vehicleSeats: Math.trunc(assertFiniteNumber(input.vehicleSeats ?? 0, `${id} vehicle seats`, { minimum: 0 })),
    latestArrivalAt: input.latestArrivalAt
      ? new Date(parseTimestamp(input.latestArrivalAt, `${id} latest arrival`)).toISOString()
      : null,
    together: input.together !== false,
  });
}

function normalizeHazard(input, index) {
  assertObject(input, `Shelter hazard ${index + 1}`);
  return deepFreeze({
    type: assertString(input.type, `Shelter hazard ${index + 1} type`).toLowerCase(),
    severity: assertFiniteNumber(input.severity, `Shelter hazard ${index + 1} severity`, {
      minimum: 0,
      maximum: 1,
    }),
    startsAt: input.startsAt ? new Date(parseTimestamp(input.startsAt)).toISOString() : null,
    endsAt: input.endsAt ? new Date(parseTimestamp(input.endsAt)).toISOString() : null,
    affectedShelterIds: input.affectedShelterIds
      ? Object.freeze(assertArray(input.affectedShelterIds, 'Affected shelter ids').map(String))
      : null,
  });
}

export function assessShelterWeather(shelterInput, hazardsInput, options = {}) {
  const shelter = normalizeShelter(shelterInput, 0);
  const hazards = assertArray(hazardsInput, 'Shelter hazards').map(normalizeHazard);
  const impacts = hazards.filter((hazard) => (
    !hazard.affectedShelterIds || hazard.affectedShelterIds.includes(shelter.id)
  )).map((hazard) => {
    const tolerance = shelter.hazardTolerance[hazard.type]
      ?? options.defaultTolerance?.[hazard.type]
      ?? HAZARD_DEFAULT_TOLERANCE[hazard.type]
      ?? 0.4;
    let mitigation = 0;
    if (hazard.type === 'smoke' && ['enhanced', 'smoke'].includes(shelter.airFiltration)) mitigation += 0.3;
    if (['heat', 'cold', 'storm'].includes(hazard.type) && shelter.backupPowerHours >= 24) mitigation += 0.15;
    const effectiveSeverity = Math.max(0, hazard.severity - mitigation);
    const margin = tolerance - effectiveSeverity;
    return deepFreeze({
      hazard: hazard.type,
      severity: hazard.severity,
      effectiveSeverity: round(effectiveSeverity, 3),
      tolerance: round(tolerance, 3),
      margin: round(margin, 3),
      safe: margin >= 0,
      startsAt: hazard.startsAt,
      endsAt: hazard.endsAt,
    });
  });
  const unsafe = impacts.filter((impact) => !impact.safe);
  const minimumMargin = impacts.length ? minimumValue(impacts.map((impact) => impact.margin)) : null;
  return deepFreeze({
    shelterId: shelter.id,
    safe: unsafe.length === 0,
    status: unsafe.length ? 'unsafe' : impacts.some((impact) => impact.margin < 0.15) ? 'watch' : 'suitable',
    impacts,
    unsafeHazards: unsafe.map((impact) => impact.hazard),
    minimumSafetyMargin: minimumMargin,
  });
}

function minimumValue(values) {
  return values.length ? Math.min(...values) : null;
}

function unmetNeeds(group, shelter) {
  const needs = [];
  group.accessNeeds.forEach((need) => {
    if (need === 'medical_power' && shelter.backupPowerHours <= 0) needs.push(need);
    else if (need === 'refrigerated_medicine' && !shelter.accessibility.includes(need)) needs.push(need);
    else if (need === 'service_animal' && !(shelter.acceptsPets || shelter.serviceAnimalsOnly)) needs.push(need);
    else if (!['medical_power', 'refrigerated_medicine', 'service_animal'].includes(need)
      && !shelter.accessibility.includes(need)) needs.push(need);
  });
  if (group.medicalLevel > shelter.medicalLevel) needs.push(`medical_level_${group.medicalLevel}`);
  if (group.pets > 0 && !shelter.acceptsPets && !group.accessNeeds.includes('service_animal')) needs.push('pets');
  return [...new Set(needs)];
}

export function scoreShelterForGroup(shelterInput, groupInput, options = {}) {
  const shelter = normalizeShelter(shelterInput, 0);
  const group = normalizeGroup(groupInput, 0);
  const weather = assessShelterWeather(shelter, options.hazards ?? [], options);
  const distanceKm = haversineDistance(group.origin, shelter.location);
  const missing = unmetNeeds(group, shelter);
  const enoughCapacity = shelter.availableCapacity >= (group.together ? group.people : 1);
  const open = shelter.state === 'open' || (shelter.state === 'standby' && options.allowStandby === true);
  const eligible = open && weather.safe && enoughCapacity && missing.length === 0;
  const distancePenalty = Math.min(35, distanceKm * (options.distancePenaltyPerKm ?? 0.8));
  const occupancyRatio = shelter.capacity ? shelter.occupied / shelter.capacity : 1;
  const capacityPenalty = occupancyRatio * 15;
  const resilienceBonus = shelter.backupPowerHours >= 24 ? 8 : 0;
  const hubBonus = shelter.transportHub ? 5 : 0;
  const score = eligible
    ? Math.max(0, 100 - distancePenalty - capacityPenalty + resilienceBonus + hubBonus)
    : 0;
  return deepFreeze({
    shelterId: shelter.id,
    groupId: group.id,
    eligible,
    score: round(score, 1),
    distanceKm: round(distanceKm, 2),
    enoughCapacity,
    availableCapacity: shelter.availableCapacity,
    unmetNeeds: missing,
    weatherStatus: weather.status,
    unsafeHazards: weather.unsafeHazards,
    reasons: [
      !open ? 'closed' : null,
      !weather.safe ? 'unsafe_weather' : null,
      !enoughCapacity ? 'insufficient_capacity' : null,
      ...missing.map((need) => `unmet:${need}`),
    ].filter(Boolean),
  });
}

function allocationPriority(group) {
  return group.priority
    + group.medicalLevel * 15
    + group.accessNeeds.length * 5
    + (group.latestArrivalAt ? 5 : 0);
}

export function allocateShelters(input, options = {}) {
  assertObject(input, 'Shelter allocation input');
  const shelters = assertArray(input.shelters, 'Shelters', { nonEmpty: true }).map(normalizeShelter);
  const groups = assertArray(input.groups, 'Evacuation groups', { nonEmpty: true }).map(normalizeGroup)
    .sort((first, second) => allocationPriority(second) - allocationPriority(first)
      || second.people - first.people
      || first.id.localeCompare(second.id));
  const occupied = new Map(shelters.map((shelter) => [shelter.id, shelter.occupied]));
  const allocations = [];
  const unassigned = [];
  groups.forEach((group) => {
    const candidates = shelters.map((shelter) => {
      const currentShelter = { ...shelter, occupied: occupied.get(shelter.id) };
      currentShelter.availableCapacity = currentShelter.capacity - currentShelter.occupied;
      return scoreShelterForGroup(currentShelter, group, options);
    }).sort((first, second) => second.score - first.score
      || first.distanceKm - second.distanceKm
      || first.shelterId.localeCompare(second.shelterId));
    const selected = candidates.find((candidate) => candidate.eligible);
    if (!selected) {
      unassigned.push(deepFreeze({
        groupId: group.id,
        people: group.people,
        priority: group.priority,
        candidates,
        reason: candidates.some((candidate) => candidate.reasons.includes('insufficient_capacity'))
          ? 'capacity'
          : candidates.some((candidate) => candidate.reasons.includes('unsafe_weather'))
            ? 'weather'
            : 'requirements',
      }));
      return;
    }
    occupied.set(selected.shelterId, occupied.get(selected.shelterId) + group.people);
    allocations.push(deepFreeze({
      groupId: group.id,
      shelterId: selected.shelterId,
      people: group.people,
      pets: group.pets,
      infants: group.infants,
      medicalLevel: group.medicalLevel,
      distanceKm: selected.distanceKm,
      score: selected.score,
      priority: group.priority,
    }));
  });
  const shelterLoads = shelters.map((shelter) => {
    const finalOccupied = occupied.get(shelter.id);
    const assigned = allocations.filter((allocation) => allocation.shelterId === shelter.id);
    return deepFreeze({
      shelterId: shelter.id,
      capacity: shelter.capacity,
      initialOccupied: shelter.occupied,
      assignedPeople: sum(assigned.map((allocation) => allocation.people)),
      finalOccupied,
      remainingCapacity: shelter.capacity - finalOccupied,
      occupancyPercent: round(finalOccupied / shelter.capacity * 100, 1),
      assignedGroups: assigned.map((allocation) => allocation.groupId),
    });
  });
  const requestedPeople = sum(groups.map((group) => group.people));
  const assignedPeople = sum(allocations.map((allocation) => allocation.people));
  return deepFreeze({
    allocations,
    unassigned,
    shelterLoads,
    requestedPeople,
    assignedPeople,
    unassignedPeople: requestedPeople - assignedPeople,
    assignmentRate: round(assignedPeople / requestedPeople, 4),
    averageTravelKm: round(mean(allocations.map((allocation) => allocation.distanceKm)), 2),
  });
}

function roundUp(value, increment) {
  return Math.ceil(value / increment) * increment;
}

export function calculateShelterSupplies(occupancyInput, options = {}) {
  assertObject(occupancyInput, 'Shelter occupancy');
  const people = Math.trunc(assertFiniteNumber(occupancyInput.people, 'Shelter people', { minimum: 0 }));
  const infants = Math.trunc(assertFiniteNumber(occupancyInput.infants ?? 0, 'Shelter infants', {
    minimum: 0,
    maximum: people,
  }));
  const pets = Math.trunc(assertFiniteNumber(occupancyInput.pets ?? 0, 'Shelter pets', { minimum: 0 }));
  const medicalPeople = Math.trunc(assertFiniteNumber(occupancyInput.medicalPeople ?? 0, 'People with medical needs', {
    minimum: 0,
    maximum: people,
  }));
  const days = Math.trunc(assertFiniteNumber(options.days ?? 3, 'Shelter supply days', { minimum: 1, maximum: 30 }));
  const standards = { ...SUPPLY_STANDARDS, ...(options.standards ?? {}) };
  const supplies = Object.entries(standards).map(([id, standard]) => {
    const base = (standard.perPersonDay ?? 0) * people * days
      + (standard.perPerson ?? 0) * people
      + (standard.perInfant ?? 0) * infants
      + (standard.perPetDay ?? 0) * pets * days
      + (standard.perMedicalPersonDay ?? 0) * medicalPeople * days;
    const quantity = roundUp(base * (standard.reserveFactor ?? 1), standard.roundTo ?? 1);
    return deepFreeze({ id, quantity, days });
  });
  return deepFreeze({
    people,
    infants,
    pets,
    medicalPeople,
    days,
    supplies,
    byId: deepFreeze(Object.fromEntries(supplies.map((item) => [item.id, item.quantity]))),
  });
}

export function shelterSupplyGap(requirementsInput, inventoryInput) {
  const requirements = assertArray(requirementsInput, 'Shelter supply requirements', { nonEmpty: true });
  assertObject(inventoryInput, 'Shelter inventory');
  const items = requirements.map((requirement) => {
    const available = Math.max(0, Number(inventoryInput[requirement.id] ?? 0));
    const required = assertFiniteNumber(requirement.quantity, `${requirement.id} required quantity`, { minimum: 0 });
    return deepFreeze({
      id: requirement.id,
      required,
      available,
      gap: Math.max(0, required - available),
      surplus: Math.max(0, available - required),
      coveragePercent: required > 0 ? round(Math.min(100, available / required * 100), 1) : 100,
    });
  });
  return deepFreeze({
    items,
    missingItemCount: items.filter((item) => item.gap > 0).length,
    complete: items.every((item) => item.gap === 0),
    lowestCoveragePercent: minimumValue(items.map((item) => item.coveragePercent)),
  });
}

export function buildShelterStaffingPlan(occupancyInput, options = {}) {
  assertObject(occupancyInput, 'Shelter staffing occupancy');
  const people = Math.trunc(assertFiniteNumber(occupancyInput.people, 'Staffing people', { minimum: 0 }));
  const medicalPeople = Math.trunc(assertFiniteNumber(occupancyInput.medicalPeople ?? 0, 'Staffing medical people', { minimum: 0 }));
  const children = Math.trunc(assertFiniteNumber(occupancyInput.children ?? 0, 'Staffing children', { minimum: 0 }));
  const shiftsPerDay = Math.trunc(assertFiniteNumber(options.shiftsPerDay ?? 3, 'Shelter shifts per day', {
    minimum: 1,
    maximum: 6,
  }));
  const roles = [
    { id: 'manager', perShift: people > 0 ? 1 : 0 },
    { id: 'registration', perShift: Math.ceil(people / 150) },
    { id: 'floor_support', perShift: Math.ceil(people / 40) },
    { id: 'security', perShift: Math.max(people > 0 ? 1 : 0, Math.ceil(people / 200)) },
    { id: 'medical', perShift: Math.ceil(medicalPeople / 20) + (people >= 100 ? 1 : 0) },
    { id: 'child_support', perShift: Math.ceil(children / 30) },
    { id: 'logistics', perShift: Math.ceil(people / 175) },
    { id: 'sanitation', perShift: Math.ceil(people / 100) },
  ].map((role) => deepFreeze({
    ...role,
    dailyAssignments: role.perShift * shiftsPerDay,
  }));
  return deepFreeze({
    people,
    shiftsPerDay,
    roles,
    peoplePerShift: sum(roles.map((role) => role.perShift)),
    dailyAssignments: sum(roles.map((role) => role.dailyAssignments)),
  });
}

function normalizeVehicle(vehicle, index) {
  assertObject(vehicle, `Transport vehicle ${index + 1}`);
  return deepFreeze({
    id: assertString(vehicle.id, `Transport vehicle ${index + 1} id`),
    seats: Math.trunc(assertFiniteNumber(vehicle.seats, `${vehicle.id} seats`, { minimum: 1 })),
    wheelchairSpaces: Math.trunc(assertFiniteNumber(vehicle.wheelchairSpaces ?? 0, `${vehicle.id} wheelchair spaces`, { minimum: 0 })),
    petSpaces: Math.trunc(assertFiniteNumber(vehicle.petSpaces ?? 0, `${vehicle.id} pet spaces`, { minimum: 0 })),
    cycleMinutes: assertFiniteNumber(vehicle.cycleMinutes ?? 60, `${vehicle.id} cycle time`, { minimum: 1 }),
    availableAt: new Date(parseTimestamp(vehicle.availableAt ?? Date.now())).toISOString(),
  });
}

export function scheduleShelterTransport(groupsInput, vehiclesInput, options = {}) {
  const groups = assertArray(groupsInput, 'Transport groups', { nonEmpty: true }).map(normalizeGroup)
    .filter((group) => group.vehicleSeats < group.people)
    .sort((first, second) => allocationPriority(second) - allocationPriority(first));
  const vehicles = assertArray(vehiclesInput, 'Transport vehicles', { nonEmpty: true }).map(normalizeVehicle);
  const state = vehicles.map((vehicle) => ({ ...vehicle, nextAt: parseTimestamp(vehicle.availableAt), trip: 0 }));
  const trips = [];
  const unserved = [];
  groups.forEach((group) => {
    const wheelchairRequired = group.accessNeeds.includes('wheelchair');
    const candidates = state.filter((vehicle) => (
      (!wheelchairRequired || vehicle.wheelchairSpaces > 0)
      && (group.pets === 0 || vehicle.petSpaces >= group.pets)
      && vehicle.seats >= group.people
    )).sort((first, second) => first.nextAt - second.nextAt || first.id.localeCompare(second.id));
    const selected = candidates[0];
    if (!selected) {
      unserved.push(deepFreeze({
        groupId: group.id,
        people: group.people,
        reason: wheelchairRequired ? 'accessible_vehicle_unavailable' : group.pets ? 'pet_transport_unavailable' : 'vehicle_capacity',
      }));
      return;
    }
    selected.trip += 1;
    const departsAt = selected.nextAt;
    const arrivesAt = departsAt + selected.cycleMinutes / 2 * 60_000;
    selected.nextAt += selected.cycleMinutes * 60_000;
    trips.push(deepFreeze({
      vehicleId: selected.id,
      tripNumber: selected.trip,
      groupId: group.id,
      people: group.people,
      pets: group.pets,
      departsAt: new Date(departsAt).toISOString(),
      arrivesAt: new Date(arrivesAt).toISOString(),
    }));
  });
  return deepFreeze({
    trips: trips.sort((first, second) => parseTimestamp(first.departsAt) - parseTimestamp(second.departsAt)),
    unserved,
    servedPeople: sum(trips.map((trip) => trip.people)),
    unservedPeople: sum(unserved.map((entry) => entry.people)),
    completesAt: trips.length ? trips.map((trip) => trip.arrivesAt).sort().at(-1) : null,
    vehicleUtilization: state.map((vehicle) => deepFreeze({ vehicleId: vehicle.id, trips: vehicle.trip })),
  });
}

export function shelterAccessibilityAudit(sheltersInput, groupsInput) {
  const shelters = assertArray(sheltersInput, 'Accessibility shelters', { nonEmpty: true }).map(normalizeShelter);
  const groups = assertArray(groupsInput, 'Accessibility groups').map(normalizeGroup);
  const needs = [...new Set(groups.flatMap((group) => group.accessNeeds))];
  const needCoverage = needs.map((need) => {
    const people = sum(groups.filter((group) => group.accessNeeds.includes(need)).map((group) => group.people));
    const matchingShelters = shelters.filter((shelter) => unmetNeeds({
      accessNeeds: [need], medicalLevel: 0, pets: 0,
    }, shelter).length === 0);
    const capacity = sum(matchingShelters.map((shelter) => shelter.availableCapacity));
    return deepFreeze({
      need,
      people,
      capacity,
      gap: Math.max(0, people - capacity),
      shelterIds: matchingShelters.map((shelter) => shelter.id),
    });
  });
  const medicalDemand = maximum(groups.map((group) => group.medicalLevel)) ?? 0;
  return deepFreeze({
    needCoverage,
    unmetNeeds: needCoverage.filter((entry) => entry.gap > 0).map((entry) => entry.need),
    maximumMedicalDemand: medicalDemand,
    maximumAvailableMedicalLevel: maximum(shelters.map((shelter) => shelter.medicalLevel)) ?? 0,
    petFriendlyCapacity: sum(shelters.filter((shelter) => shelter.acceptsPets).map((shelter) => shelter.availableCapacity)),
    accessibleCapacity: sum(shelters.filter((shelter) => shelter.accessibility.length > 0).map((shelter) => shelter.availableCapacity)),
  });
}

export function shelterNetworkSummary(sheltersInput, hazardsInput = []) {
  const shelters = assertArray(sheltersInput, 'Shelter network', { nonEmpty: true }).map(normalizeShelter);
  const weather = shelters.map((shelter) => assessShelterWeather(shelter, hazardsInput));
  const open = shelters.filter((shelter) => shelter.state === 'open');
  const suitableIds = new Set(weather.filter((entry) => entry.safe).map((entry) => entry.shelterId));
  const usable = open.filter((shelter) => suitableIds.has(shelter.id));
  return deepFreeze({
    shelterCount: shelters.length,
    openCount: open.length,
    weatherSuitableCount: usable.length,
    totalCapacity: sum(shelters.map((shelter) => shelter.capacity)),
    openCapacity: sum(open.map((shelter) => shelter.capacity)),
    availableCapacity: sum(usable.map((shelter) => shelter.availableCapacity)),
    currentOccupancy: sum(shelters.map((shelter) => shelter.occupied)),
    occupancyPercent: round(
      sum(shelters.map((shelter) => shelter.occupied)) / sum(shelters.map((shelter) => shelter.capacity)) * 100,
      1,
    ),
    backupPowerCapacity: sum(usable.filter((shelter) => shelter.backupPowerHours >= 24)
      .map((shelter) => shelter.availableCapacity)),
    petFriendlyCapacity: sum(usable.filter((shelter) => shelter.acceptsPets)
      .map((shelter) => shelter.availableCapacity)),
    medicalShelterCount: usable.filter((shelter) => shelter.medicalLevel > 0).length,
    weather,
  });
}

export function buildShelterOperationalPlan(input, options = {}) {
  assertObject(input, 'Shelter operational plan input');
  const allocation = allocateShelters(input, { ...options, hazards: input.hazards ?? [] });
  const shelterById = new Map(input.shelters.map((shelter) => [shelter.id, shelter]));
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const shelterPlans = allocation.shelterLoads.map((load) => {
    const shelter = normalizeShelter(shelterById.get(load.shelterId), 0);
    const assignedGroups = load.assignedGroups.map((id) => normalizeGroup(groupById.get(id), 0));
    const people = load.finalOccupied;
    const occupancy = {
      people,
      infants: sum(assignedGroups.map((group) => group.infants)),
      pets: sum(assignedGroups.map((group) => group.pets)),
      medicalPeople: sum(assignedGroups.filter((group) => group.medicalLevel > 0).map((group) => group.people)),
      children: sum(assignedGroups.map((group) => group.infants)),
    };
    const supplies = calculateShelterSupplies(occupancy, { days: options.supplyDays ?? 3 });
    return deepFreeze({
      shelterId: shelter.id,
      name: shelter.name,
      load,
      weather: assessShelterWeather(shelter, input.hazards ?? [], options),
      supplies,
      supplyGap: shelterSupplyGap(supplies.supplies, shelter.supplies),
      staffing: buildShelterStaffingPlan(occupancy, options.staffing),
    });
  });
  const network = shelterNetworkSummary(input.shelters, input.hazards ?? []);
  const accessibility = shelterAccessibilityAudit(input.shelters, input.groups);
  const warnings = [];
  if (allocation.unassignedPeople > 0) warnings.push(`${allocation.unassignedPeople} people remain unassigned.`);
  if (accessibility.unmetNeeds.length) warnings.push(`Accessibility gaps: ${accessibility.unmetNeeds.join(', ')}.`);
  if (shelterPlans.some((plan) => !plan.supplyGap.complete)) warnings.push('One or more shelters need additional supplies.');
  if (network.weatherSuitableCount === 0) warnings.push('No open shelter is suitable for the forecast hazards.');
  return deepFreeze({
    generatedAt: new Date(parseTimestamp(options.now ?? Date.now())).toISOString(),
    allocation,
    shelterPlans,
    network,
    accessibility,
    warnings,
    ready: allocation.unassignedPeople === 0
      && accessibility.unmetNeeds.length === 0
      && network.weatherSuitableCount > 0,
  });
}

function normalizeCensusEvent(input, index) {
  assertObject(input, `Shelter census event ${index + 1}`);
  const type = assertString(input.type, `Census event ${index + 1} type`);
  if (!['check_in', 'check_out', 'transfer_in', 'transfer_out', 'correction'].includes(type)) {
    throw new TypeError(`Unsupported shelter census event: ${type}.`);
  }
  const people = Math.trunc(assertFiniteNumber(input.people, `Census event ${index + 1} people`));
  if (type !== 'correction' && people <= 0) throw new TypeError(`${type} census events require a positive people count.`);
  if (type === 'correction' && people === 0) throw new TypeError('A census correction cannot be zero.');
  return deepFreeze({
    id: assertString(input.id, `Census event ${index + 1} id`),
    type,
    people,
    at: new Date(parseTimestamp(input.at, `Census event ${index + 1} time`)).toISOString(),
    groupId: input.groupId ? String(input.groupId) : null,
    note: input.note ? String(input.note) : null,
  });
}

function censusDelta(event) {
  if (['check_in', 'transfer_in'].includes(event.type)) return event.people;
  if (['check_out', 'transfer_out'].includes(event.type)) return -event.people;
  return event.people;
}

export function reconcileShelterCensus(initialOccupancyInput, eventsInput, options = {}) {
  const initialOccupancy = Math.trunc(assertFiniteNumber(initialOccupancyInput, 'Initial shelter occupancy', {
    minimum: 0,
  }));
  const capacity = options.capacity === undefined
    ? Number.POSITIVE_INFINITY
    : Math.trunc(assertFiniteNumber(options.capacity, 'Shelter census capacity', { minimum: 1 }));
  const events = assertArray(eventsInput, 'Shelter census events').map(normalizeCensusEvent)
    .sort((first, second) => parseTimestamp(first.at) - parseTimestamp(second.at) || first.id.localeCompare(second.id));
  const seen = new Map();
  events.forEach((event) => {
    const existing = seen.get(event.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
      throw new TypeError(`Shelter census event ${event.id} has conflicting content.`);
    }
    seen.set(event.id, existing ?? event);
  });
  let occupancy = initialOccupancy;
  let maximumOccupancy = occupancy;
  const timeline = [];
  [...seen.values()].forEach((event) => {
    const before = occupancy;
    occupancy += censusDelta(event);
    if (occupancy < 0) throw new TypeError(`Shelter census event ${event.id} would make occupancy negative.`);
    if (occupancy > capacity && options.allowOverCapacity !== true) {
      throw new TypeError(`Shelter census event ${event.id} exceeds capacity.`);
    }
    maximumOccupancy = Math.max(maximumOccupancy, occupancy);
    timeline.push(deepFreeze({
      ...event,
      before,
      delta: censusDelta(event),
      after: occupancy,
      overCapacity: occupancy > capacity,
    }));
  });
  return deepFreeze({
    initialOccupancy,
    currentOccupancy: occupancy,
    maximumOccupancy,
    capacity: Number.isFinite(capacity) ? capacity : null,
    remainingCapacity: Number.isFinite(capacity) ? capacity - occupancy : null,
    eventCount: timeline.length,
    duplicateCount: events.length - seen.size,
    timeline,
  });
}

export function forecastShelterOccupancy(input, options = {}) {
  assertObject(input, 'Shelter occupancy forecast');
  const initialOccupancy = Math.trunc(assertFiniteNumber(input.initialOccupancy ?? 0, 'Forecast initial occupancy', {
    minimum: 0,
  }));
  const capacity = Math.trunc(assertFiniteNumber(input.capacity, 'Forecast shelter capacity', { minimum: 1 }));
  const changes = assertArray(input.changes ?? [], 'Forecast occupancy changes').map((change, index) => {
    assertObject(change, `Occupancy change ${index + 1}`);
    return deepFreeze({
      id: String(change.id ?? `change-${index + 1}`),
      at: new Date(parseTimestamp(change.at, `Occupancy change ${index + 1} time`)).toISOString(),
      people: Math.trunc(assertFiniteNumber(change.people, `Occupancy change ${index + 1} people`)),
      confidence: assertFiniteNumber(change.confidence ?? 1, `Occupancy change ${index + 1} confidence`, {
        minimum: 0,
        maximum: 1,
      }),
      source: change.source ? String(change.source) : null,
    });
  }).sort((first, second) => parseTimestamp(first.at) - parseTimestamp(second.at));
  let expected = initialOccupancy;
  let conservative = initialOccupancy;
  const timeline = changes.map((change) => {
    expected = Math.max(0, expected + change.people * change.confidence);
    conservative = Math.max(0, conservative + (change.people > 0 ? change.people : change.people * change.confidence));
    return deepFreeze({
      ...change,
      expectedOccupancy: round(expected, 1),
      conservativeOccupancy: round(conservative, 1),
      expectedPercent: round(expected / capacity * 100, 1),
      conservativePercent: round(conservative / capacity * 100, 1),
      expectedOverCapacity: expected > capacity,
      conservativeOverCapacity: conservative > capacity,
    });
  });
  const threshold = assertFiniteNumber(options.warningPercent ?? 90, 'Occupancy warning percent', {
    minimum: 0,
  });
  const firstWarning = timeline.find((entry) => entry.conservativePercent >= threshold) ?? null;
  const firstOverflow = timeline.find((entry) => entry.conservativeOverCapacity) ?? null;
  return deepFreeze({
    capacity,
    initialOccupancy,
    timeline,
    peakExpectedOccupancy: round(maximum([initialOccupancy, ...timeline.map((entry) => entry.expectedOccupancy)]), 1),
    peakConservativeOccupancy: round(maximum([initialOccupancy, ...timeline.map((entry) => entry.conservativeOccupancy)]), 1),
    warningAt: firstWarning?.at ?? null,
    overflowAt: firstOverflow?.at ?? null,
    finalExpectedOccupancy: timeline.at(-1)?.expectedOccupancy ?? initialOccupancy,
  });
}

export function planShelterRelocation(input, options = {}) {
  assertObject(input, 'Shelter relocation input');
  const source = normalizeShelter(input.source, 0);
  const destinations = assertArray(input.destinations, 'Relocation destinations', { nonEmpty: true });
  const groups = assertArray(input.groups, 'Relocation groups', { nonEmpty: true });
  const peopleToMove = sum(groups.map((group) => group.people));
  if (peopleToMove > source.occupied && options.allowUnregistered !== true) {
    throw new TypeError('Relocation groups exceed the source shelter census.');
  }
  const allocation = allocateShelters({ shelters: destinations, groups }, {
    ...options,
    hazards: input.hazards ?? [],
  });
  const waves = allocation.allocations.map((allocationEntry, index) => deepFreeze({
    wave: index + 1,
    groupId: allocationEntry.groupId,
    fromShelterId: source.id,
    toShelterId: allocationEntry.shelterId,
    people: allocationEntry.people,
    distanceKm: allocationEntry.distanceKm,
    priority: allocationEntry.priority,
  }));
  return deepFreeze({
    sourceShelterId: source.id,
    sourceOccupancy: source.occupied,
    requestedRelocation: peopleToMove,
    relocatedPeople: allocation.assignedPeople,
    remainingAtSource: source.occupied - allocation.assignedPeople,
    waves,
    allocation,
    complete: allocation.unassignedPeople === 0,
    warnings: [
      allocation.unassignedPeople > 0 ? `${allocation.unassignedPeople} people have no relocation destination.` : null,
      source.occupied > peopleToMove ? `${source.occupied - peopleToMove} registered occupants are not in a relocation group.` : null,
    ].filter(Boolean),
  });
}

export function shelterDailyBrief(operationalPlan, censusByShelter = {}, options = {}) {
  assertObject(operationalPlan, 'Shelter operational plan');
  assertObject(censusByShelter, 'Shelter census map');
  const generatedAt = new Date(parseTimestamp(options.now ?? Date.now())).toISOString();
  const shelters = operationalPlan.shelterPlans.map((plan) => {
    const census = censusByShelter[plan.shelterId];
    const occupancy = census?.currentOccupancy ?? plan.load.finalOccupied;
    const capacity = plan.load.capacity;
    const supplyGaps = plan.supplyGap.items.filter((item) => item.gap > 0)
      .sort((first, second) => first.coveragePercent - second.coveragePercent);
    const issues = [
      !plan.weather.safe ? `Unsafe weather: ${plan.weather.unsafeHazards.join(', ')}` : null,
      occupancy > capacity ? 'Over capacity' : null,
      occupancy / capacity >= 0.9 ? 'Near capacity' : null,
      supplyGaps.length ? `${supplyGaps.length} supply gaps` : null,
    ].filter(Boolean);
    return deepFreeze({
      shelterId: plan.shelterId,
      name: plan.name,
      occupancy,
      capacity,
      occupancyPercent: round(occupancy / capacity * 100, 1),
      remainingCapacity: capacity - occupancy,
      weatherStatus: plan.weather.status,
      topSupplyGaps: supplyGaps.slice(0, 3).map((item) => ({ id: item.id, gap: item.gap })),
      staffPerShift: plan.staffing.peoplePerShift,
      issues,
      status: issues.some((issue) => ['Over capacity'].includes(issue) || issue.startsWith('Unsafe'))
        ? 'critical'
        : issues.length ? 'attention' : 'ready',
    });
  });
  const statusOrder = { critical: 3, attention: 2, ready: 1 };
  shelters.sort((first, second) => statusOrder[second.status] - statusOrder[first.status]
    || second.occupancyPercent - first.occupancyPercent);
  return deepFreeze({
    generatedAt,
    shelters,
    totalOccupancy: sum(shelters.map((shelter) => shelter.occupancy)),
    totalCapacity: sum(shelters.map((shelter) => shelter.capacity)),
    criticalCount: shelters.filter((shelter) => shelter.status === 'critical').length,
    attentionCount: shelters.filter((shelter) => shelter.status === 'attention').length,
    unassignedPeople: operationalPlan.allocation.unassignedPeople,
    headline: shelters.some((shelter) => shelter.status === 'critical')
      ? 'Shelter network needs immediate action.'
      : shelters.some((shelter) => shelter.status === 'attention')
        ? 'Shelter network is operating with open issues.'
        : 'Shelter network is ready.',
  });
}

export function prioritizeShelterDeliveries(shelterPlansInput, options = {}) {
  const shelterPlans = assertArray(shelterPlansInput, 'Shelter delivery plans', { nonEmpty: true });
  const criticalItems = new Set(options.criticalItems ?? [
    'drinking_water_liters',
    'meals',
    'medical_consumable_sets',
    'sanitation_liters',
  ]);
  const deliveries = shelterPlans.flatMap((plan, planIndex) => {
    assertObject(plan, `Shelter delivery plan ${planIndex + 1}`);
    const shelterId = assertString(plan.shelterId, `Shelter delivery plan ${planIndex + 1} id`);
    const occupancy = plan.load?.finalOccupied ?? plan.supplies?.people ?? 0;
    const weatherUnsafe = plan.weather?.safe === false;
    return assertArray(plan.supplyGap?.items ?? [], `${shelterId} supply gaps`)
      .filter((item) => item.gap > 0)
      .map((item) => {
        const critical = criticalItems.has(item.id);
        const coverageDeficit = 100 - (item.coveragePercent ?? 0);
        const priorityScore = coverageDeficit * 0.5
          + Math.min(30, occupancy / 10)
          + (critical ? 25 : 0)
          + (weatherUnsafe ? 10 : 0);
        return deepFreeze({
          shelterId,
          itemId: item.id,
          quantity: item.gap,
          coveragePercent: item.coveragePercent,
          occupancy,
          critical,
          priorityScore: round(priorityScore, 1),
        });
      });
  }).sort((first, second) => second.priorityScore - first.priorityScore
    || first.coveragePercent - second.coveragePercent
    || first.shelterId.localeCompare(second.shelterId)
    || first.itemId.localeCompare(second.itemId));
  const maximumStops = Math.trunc(assertFiniteNumber(options.maximumStops ?? Math.max(1, deliveries.length), 'Maximum delivery stops', {
    minimum: 1,
  }));
  const selected = deliveries.slice(0, maximumStops);
  return deepFreeze({
    deliveries: selected.map((delivery, index) => deepFreeze({ ...delivery, rank: index + 1 })),
    deferred: deliveries.slice(maximumStops),
    shelterCount: new Set(selected.map((delivery) => delivery.shelterId)).size,
    totalItemUnits: sum(selected.map((delivery) => delivery.quantity)),
    criticalDeliveryCount: selected.filter((delivery) => delivery.critical).length,
  });
}

export function buildShelterMutualAidRequest(operationalPlan, input = {}) {
  assertObject(operationalPlan, 'Mutual-aid operational plan');
  assertObject(input, 'Mutual-aid request');
  const jurisdiction = assertString(input.jurisdiction, 'Mutual-aid jurisdiction');
  const shelterPlans = assertArray(operationalPlan.shelterPlans ?? [], 'Mutual-aid shelter plans');
  const requestedSupplies = new Map();
  shelterPlans.forEach((plan) => {
    (plan.supplyGap?.items ?? []).filter((item) => item.gap > 0).forEach((item) => {
      requestedSupplies.set(item.id, (requestedSupplies.get(item.id) ?? 0) + item.gap);
    });
  });
  const staffingShortfalls = assertArray(input.staffingShortfalls ?? [], 'Staffing shortfalls').map((shortfall, index) => {
    assertObject(shortfall, `Staffing shortfall ${index + 1}`);
    return deepFreeze({
      role: assertString(shortfall.role, `Staffing shortfall ${index + 1} role`),
      people: Math.trunc(assertFiniteNumber(shortfall.people, `${shortfall.role} shortfall`, { minimum: 1 })),
      shifts: Math.trunc(assertFiniteNumber(shortfall.shifts ?? 1, `${shortfall.role} shifts`, { minimum: 1 })),
    });
  });
  const unassignedPeople = operationalPlan.allocation?.unassignedPeople ?? 0;
  const requestedCapacity = Math.max(
    unassignedPeople,
    Math.trunc(assertFiniteNumber(input.minimumAdditionalCapacity ?? 0, 'Minimum additional shelter capacity', { minimum: 0 })),
  );
  const supplies = [...requestedSupplies.entries()].map(([id, quantity]) => deepFreeze({ id, quantity }))
    .sort((first, second) => second.quantity - first.quantity || first.id.localeCompare(second.id));
  const needed = requestedCapacity > 0 || supplies.length > 0 || staffingShortfalls.length > 0;
  const priority = unassignedPeople > 0 || operationalPlan.network?.weatherSuitableCount === 0
    ? 'immediate'
    : supplies.some((item) => ['drinking_water_liters', 'meals', 'medical_consumable_sets'].includes(item.id))
      ? 'urgent'
      : needed ? 'routine' : 'none';
  return deepFreeze({
    id: String(input.id ?? `${jurisdiction}:${input.incidentId ?? 'weather'}:mutual-aid`),
    jurisdiction,
    incidentId: input.incidentId ? String(input.incidentId) : null,
    requestedAt: new Date(parseTimestamp(input.requestedAt ?? Date.now())).toISOString(),
    needed,
    priority,
    requestedCapacity,
    unassignedPeople,
    supplies,
    staffing: staffingShortfalls,
    justification: [
      unassignedPeople > 0 ? `${unassignedPeople} evacuees are not assigned to a shelter.` : null,
      operationalPlan.network?.weatherSuitableCount === 0 ? 'No open shelter is weather-suitable.' : null,
      supplies.length > 0 ? `${supplies.length} supply categories have unmet demand.` : null,
      staffingShortfalls.length > 0 ? `${staffingShortfalls.length} staffing roles have open shifts.` : null,
    ].filter(Boolean),
  });
}

export function buildShelterDeliveryManifest(deliveryPlan, options = {}) {
  assertObject(deliveryPlan, 'Shelter delivery plan');
  const deliveries = assertArray(deliveryPlan.deliveries ?? [], 'Prioritized deliveries');
  const dispatchAt = new Date(parseTimestamp(options.dispatchAt ?? Date.now())).toISOString();
  const manifests = new Map();
  deliveries.forEach((delivery, index) => {
    assertObject(delivery, `Delivery ${index + 1}`);
    const shelterId = assertString(delivery.shelterId, `Delivery ${index + 1} shelter`);
    if (!manifests.has(shelterId)) manifests.set(shelterId, []);
    manifests.get(shelterId).push(deepFreeze({
      itemId: assertString(delivery.itemId, `Delivery ${index + 1} item`),
      quantity: assertFiniteNumber(delivery.quantity, `Delivery ${index + 1} quantity`, { minimum: 0 }),
      priorityScore: delivery.priorityScore ?? 0,
      critical: delivery.critical === true,
    }));
  });
  const travelMinutes = options.travelMinutesByShelter ?? {};
  const serviceMinutes = assertFiniteNumber(options.serviceMinutesPerStop ?? 20, 'Delivery service minutes', {
    minimum: 0,
  });
  let departure = parseTimestamp(dispatchAt);
  const stops = [...manifests.entries()].map(([shelterId, items], index) => {
    const travelMinutesForStop = assertFiniteNumber(
      travelMinutes[shelterId] ?? options.defaultTravelMinutes ?? 30,
      `${shelterId} delivery travel minutes`,
      { minimum: 0 },
    );
    const arrivesAt = departure + travelMinutesForStop * 60_000;
    const departsAt = arrivesAt + serviceMinutes * 60_000;
    departure = departsAt;
    return deepFreeze({
      stop: index + 1,
      shelterId,
      arrivesAt: new Date(arrivesAt).toISOString(),
      departsAt: new Date(departsAt).toISOString(),
      items: [...items].sort((first, second) => Number(second.critical) - Number(first.critical)
        || second.priorityScore - first.priorityScore),
      criticalItemCount: items.filter((item) => item.critical).length,
      totalUnits: sum(items.map((item) => item.quantity)),
    });
  });
  return deepFreeze({
    dispatchAt,
    routeId: String(options.routeId ?? `shelter-delivery:${dispatchAt}`),
    stops,
    stopCount: stops.length,
    itemLineCount: deliveries.length,
    totalUnits: sum(stops.map((stop) => stop.totalUnits)),
    completesAt: stops.at(-1)?.departsAt ?? dispatchAt,
  });
}

export function planShelterDemobilization(operationalPlan, options = {}) {
  assertObject(operationalPlan, 'Shelter demobilization plan');
  const minimumOccupancyPercent = assertFiniteNumber(
    options.minimumOccupancyPercent ?? 20,
    'Demobilization minimum occupancy',
    { minimum: 0, maximum: 100 },
  );
  const keepOpenIds = new Set(assertArray(options.keepOpenShelterIds ?? [], 'Shelters to keep open').map(String));
  const plans = assertArray(operationalPlan.shelterPlans ?? [], 'Operational shelter plans').map((plan) => {
    const occupancyPercent = plan.load.capacity
      ? plan.load.finalOccupied / plan.load.capacity * 100
      : 0;
    const protectedSite = keepOpenIds.has(plan.shelterId)
      || plan.load.finalOccupied > 0 && plan.staffing?.roles?.some((role) => role.id === 'medical' && role.perShift > 0);
    const canClose = plan.weather.safe
      && occupancyPercent <= minimumOccupancyPercent
      && !protectedSite;
    return deepFreeze({
      shelterId: plan.shelterId,
      occupancy: plan.load.finalOccupied,
      capacity: plan.load.capacity,
      occupancyPercent: round(occupancyPercent, 1),
      action: canClose ? 'close' : occupancyPercent <= minimumOccupancyPercent ? 'review' : 'remain_open',
      reasons: [
        !plan.weather.safe ? 'hazard_monitoring_required' : null,
        protectedSite ? 'protected_capability' : null,
        occupancyPercent > minimumOccupancyPercent ? 'continued_demand' : null,
      ].filter(Boolean),
    });
  });
  return deepFreeze({
    plans,
    closeCount: plans.filter((plan) => plan.action === 'close').length,
    reviewCount: plans.filter((plan) => plan.action === 'review').length,
    remainOpenCount: plans.filter((plan) => plan.action === 'remain_open').length,
    releasedCapacity: sum(plans.filter((plan) => plan.action === 'close').map((plan) => plan.capacity)),
    eligible: operationalPlan.allocation?.unassignedPeople === 0,
  });
}

export { ACCESS_NEEDS as SHELTER_ACCESS_NEEDS, SUPPLY_STANDARDS as SHELTER_SUPPLY_STANDARDS };
