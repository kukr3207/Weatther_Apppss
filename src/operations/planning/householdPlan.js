import { assertArray, assertFiniteNumber, assertObject, deepFreeze, parseTimestamp, round } from '../core/validation';
import { maximum, sum } from '../core/statistics';

const SUPPLY_CATALOG = Object.freeze({
  drinking_water_liters: { label: 'Drinking water', unit: 'liters', perPersonDay: 3.8, minimum: 4 },
  shelf_stable_meals: { label: 'Shelf-stable meals', unit: 'meals', perPersonDay: 3, minimum: 3 },
  prescription_days: { label: 'Prescription medicine', unit: 'person-days', perPersonDay: 1, minimum: 3 },
  flashlight_batteries: { label: 'Flashlight batteries', unit: 'sets', perHouseholdDay: 0.35, minimum: 2 },
  phone_power_wh: { label: 'Phone charging capacity', unit: 'Wh', perPersonDay: 15, minimum: 30 },
  sanitation_liters: { label: 'Sanitation water', unit: 'liters', perPersonDay: 7.5, minimum: 8 },
  pet_water_liters: { label: 'Pet water', unit: 'liters', perPetDay: 1, minimum: 0 },
  pet_meals: { label: 'Pet meals', unit: 'meals', perPetDay: 2, minimum: 0 },
});

const HAZARD_ACTIONS = Object.freeze({
  heat: [
    { id: 'cooling', task: 'Confirm access to a cooled room and backup cooling location.', leadHours: 24, priority: 90 },
    { id: 'hydration', task: 'Stage drinking water and oral rehydration supplies.', leadHours: 12, priority: 85 },
    { id: 'medications', task: 'Check whether medicines require cool storage.', leadHours: 24, priority: 80 },
  ],
  cold: [
    { id: 'heating', task: 'Test safe heating equipment and carbon-monoxide alarms.', leadHours: 36, priority: 95 },
    { id: 'pipes', task: 'Protect exposed pipes and locate the water shutoff.', leadHours: 24, priority: 80 },
    { id: 'warmth', task: 'Stage blankets, warm clothing, and sleeping bags.', leadHours: 12, priority: 70 },
  ],
  storm: [
    { id: 'outdoors', task: 'Secure or move loose outdoor objects.', leadHours: 24, priority: 90 },
    { id: 'windows', task: 'Close shutters or move away from exposed windows.', leadHours: 6, priority: 95 },
    { id: 'power', task: 'Charge phones, lights, and backup batteries.', leadHours: 8, priority: 85 },
  ],
  flood: [
    { id: 'documents', task: 'Move documents, medicines, and electronics above expected water level.', leadHours: 12, priority: 95 },
    { id: 'vehicle', task: 'Move vehicles away from flood-prone parking.', leadHours: 8, priority: 90 },
    { id: 'evacuation', task: 'Review the evacuation route without low-water crossings.', leadHours: 12, priority: 100 },
  ],
  cyclone: [
    { id: 'shutters', task: 'Install storm shutters or protective window coverings.', leadHours: 36, priority: 95 },
    { id: 'fuel', task: 'Fuel the vehicle and backup generator safely.', leadHours: 36, priority: 85 },
    { id: 'evacuation', task: 'Confirm evacuation zone, route, and destination.', leadHours: 48, priority: 100 },
  ],
  air_quality: [
    { id: 'filtration', task: 'Run a correctly sized indoor air cleaner.', leadHours: 8, priority: 90 },
    { id: 'masks', task: 'Keep well-fitting particulate respirators available.', leadHours: 12, priority: 80 },
    { id: 'seal', task: 'Close windows and set ventilation to recirculate when appropriate.', leadHours: 2, priority: 85 },
  ],
});

function normalizeHousehold(input) {
  assertObject(input, 'Household');
  return deepFreeze({
    adults: Math.trunc(assertFiniteNumber(input.adults ?? 1, 'Adults', { minimum: 0, maximum: 50 })),
    children: Math.trunc(assertFiniteNumber(input.children ?? 0, 'Children', { minimum: 0, maximum: 50 })),
    pets: Math.trunc(assertFiniteNumber(input.pets ?? 0, 'Pets', { minimum: 0, maximum: 50 })),
    mobilityNeeds: input.mobilityNeeds === true,
    medicalEquipment: assertArray(input.medicalEquipment ?? [], 'Medical equipment'),
    medications: assertArray(input.medications ?? [], 'Medications'),
    vehicles: Math.trunc(assertFiniteNumber(input.vehicles ?? 0, 'Vehicles', { minimum: 0, maximum: 20 })),
  });
}

export function calculateEmergencySupplies(inputHousehold, options = {}) {
  const household = normalizeHousehold(inputHousehold);
  const days = Math.trunc(assertFiniteNumber(options.days ?? 3, 'Supply duration', { minimum: 1, maximum: 30 }));
  const people = household.adults + household.children;
  if (people < 1) throw new TypeError('A household plan requires at least one person.');
  const supplies = Object.entries(SUPPLY_CATALOG).map(([id, item]) => {
    const calculated = (item.perPersonDay ?? 0) * people * days
      + (item.perHouseholdDay ?? 0) * days
      + (item.perPetDay ?? 0) * household.pets * days;
    const quantity = Math.ceil(Math.max(item.minimum, calculated));
    return deepFreeze({ id, label: item.label, unit: item.unit, quantity, days });
  });
  household.medicalEquipment.forEach((equipment, index) => {
    supplies.push(deepFreeze({
      id: `equipment_power_${index + 1}`,
      label: `${equipment.name ?? 'Medical equipment'} backup power`,
      unit: 'Wh',
      quantity: Math.ceil((equipment.watts ?? 0) * (equipment.hoursPerDay ?? 24) * days),
      days,
    }));
  });
  return deepFreeze({ household, days, people, supplies });
}

function normalizeHazard(hazard, index) {
  const startsAt = new Date(parseTimestamp(hazard.startsAt ?? hazard.effectiveAt, `Hazard ${index + 1} start`)).toISOString();
  return deepFreeze({
    id: String(hazard.id ?? `hazard-${index + 1}`),
    type: String(hazard.type ?? 'storm').toLowerCase(),
    severity: String(hazard.severity ?? 'moderate').toLowerCase(),
    startsAt,
    endsAt: hazard.endsAt ? new Date(parseTimestamp(hazard.endsAt)).toISOString() : null,
    title: hazard.title ?? hazard.type ?? 'Weather hazard',
  });
}

export function buildHouseholdReadinessPlan(input, options = {}) {
  assertObject(input, 'Household readiness input');
  const household = normalizeHousehold(input.household);
  const now = parseTimestamp(options.now ?? Date.now());
  const hazards = assertArray(input.hazards ?? [], 'Household hazards').map(normalizeHazard)
    .sort((first, second) => parseTimestamp(first.startsAt) - parseTimestamp(second.startsAt));
  const actions = [];
  hazards.forEach((hazard) => {
    const templates = HAZARD_ACTIONS[hazard.type] ?? HAZARD_ACTIONS.storm;
    templates.forEach((template) => {
      const dueAt = parseTimestamp(hazard.startsAt) - template.leadHours * 3_600_000;
      actions.push({
        id: `${hazard.id}:${template.id}`,
        hazardId: hazard.id,
        category: hazard.type,
        task: template.task,
        priority: template.priority + (hazard.severity === 'extreme' ? 10 : hazard.severity === 'severe' ? 5 : 0),
        dueAt: new Date(dueAt).toISOString(),
        overdue: dueAt < now,
      });
    });
  });
  if (household.mobilityNeeds) actions.push({
    id: 'household:accessible-transport',
    hazardId: null,
    category: 'accessibility',
    task: 'Confirm accessible transport and a destination that meets mobility needs.',
    priority: 100,
    dueAt: new Date(now).toISOString(),
    overdue: false,
  });
  if (household.medications.length) actions.push({
    id: 'household:medications',
    hazardId: null,
    category: 'medical',
    task: 'Refill essential medicines and keep a current medication list.',
    priority: 100,
    dueAt: new Date(now).toISOString(),
    overdue: false,
  });
  const deduplicated = [...new Map(actions.map((action) => [`${action.category}:${action.task}`, action])).values()]
    .sort((first, second) => second.priority - first.priority || parseTimestamp(first.dueAt) - parseTimestamp(second.dueAt));
  const supplies = calculateEmergencySupplies(household, { days: options.supplyDays ?? 3 });
  return deepFreeze({
    generatedAt: new Date(now).toISOString(),
    household,
    hazards,
    actions: deduplicated.map((action) => deepFreeze(action)),
    supplies: supplies.supplies,
    readinessScore: round(readinessScore(deduplicated, input.completedActionIds ?? []), 1),
    highestPriority: maximum(deduplicated.map((action) => action.priority)) ?? 0,
  });
}

function readinessScore(actions, completedActionIds) {
  if (!actions.length) return 100;
  const completed = new Set(completedActionIds);
  const possible = sum(actions.map((action) => action.priority));
  const achieved = sum(actions.filter((action) => completed.has(action.id)).map((action) => action.priority));
  return possible ? achieved / possible * 100 : 100;
}

export function updateHouseholdPlanProgress(plan, completedActionIds) {
  const completed = new Set(assertArray(completedActionIds, 'Completed actions'));
  const actions = plan.actions.map((action) => deepFreeze({ ...action, completed: completed.has(action.id) }));
  return deepFreeze({
    ...plan,
    actions,
    readinessScore: round(readinessScore(actions, completedActionIds), 1),
    completedCount: actions.filter((action) => action.completed).length,
    remainingCount: actions.filter((action) => !action.completed).length,
  });
}

export function householdPlanSummary(plan) {
  const urgent = plan.actions.filter((action) => !action.completed && (action.overdue || action.priority >= 95));
  return deepFreeze({
    readinessScore: plan.readinessScore,
    hazardCount: plan.hazards.length,
    actionCount: plan.actions.length,
    urgentCount: urgent.length,
    urgent: urgent.slice(0, 5),
    supplyItemCount: plan.supplies.length,
    nextDueAt: plan.actions.filter((action) => !action.completed).map((action) => action.dueAt).sort()[0] ?? null,
  });
}
