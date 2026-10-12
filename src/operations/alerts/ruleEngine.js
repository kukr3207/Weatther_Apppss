import {
  assertArray,
  assertEnum,
  assertFiniteNumber,
  assertObject,
  assertString,
  deepFreeze,
  parseTimestamp,
  round,
} from '../core/validation';
import { maximum, mean, minimum } from '../core/statistics';

const OPERATORS = Object.freeze([
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'equal',
  'not_equal',
  'between',
  'outside',
  'includes',
  'changes_by',
]);

const SEVERITIES = Object.freeze(['info', 'minor', 'moderate', 'severe', 'extreme']);
const SEVERITY_ORDER = Object.freeze(Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index])));

function readPath(value, path) {
  return String(path).split('.').reduce((current, part) => current?.[part], value);
}

function normalizeCondition(condition, index) {
  assertObject(condition, `Condition ${index + 1}`);
  const field = assertString(condition.field, `Condition ${index + 1} field`, { maximum: 120 });
  const operator = assertEnum(condition.operator, OPERATORS, `Condition ${index + 1} operator`);
  return Object.freeze({
    field,
    operator,
    value: condition.value,
    secondValue: condition.secondValue,
    previousField: condition.previousField ?? field,
    missingMatches: condition.missingMatches === true,
  });
}

function normalizeRule(rule, index) {
  assertObject(rule, `Rule ${index + 1}`);
  const id = assertString(rule.id, `Rule ${index + 1} id`, { maximum: 120 });
  const conditions = assertArray(rule.conditions, `Rule ${id} conditions`, { nonEmpty: true })
    .map(normalizeCondition);
  return Object.freeze({
    id,
    name: assertString(rule.name ?? id, `Rule ${id} name`, { maximum: 160 }),
    description: typeof rule.description === 'string' ? rule.description.trim() : '',
    severity: assertEnum(rule.severity ?? 'moderate', SEVERITIES, `Rule ${id} severity`),
    category: assertString(rule.category ?? 'weather', `Rule ${id} category`, { maximum: 80 }),
    mode: rule.mode === 'any' ? 'any' : 'all',
    conditions,
    message: typeof rule.message === 'string' ? rule.message : null,
    cooldownMinutes: assertFiniteNumber(rule.cooldownMinutes ?? 60, `Rule ${id} cooldown`, {
      minimum: 0,
      maximum: 43_200,
    }),
    activeFrom: rule.activeFrom ? new Date(parseTimestamp(rule.activeFrom)).toISOString() : null,
    activeUntil: rule.activeUntil ? new Date(parseTimestamp(rule.activeUntil)).toISOString() : null,
    tags: Array.isArray(rule.tags)
      ? [...new Set(rule.tags.map((tag) => assertString(tag, `Rule ${id} tag`, { maximum: 60 })))]
      : [],
    guidance: Array.isArray(rule.guidance)
      ? rule.guidance.map((item) => assertString(item, `Rule ${id} guidance`, { maximum: 280 }))
      : [],
  });
}

function compare(actual, condition, previous) {
  if (actual === undefined || actual === null) return condition.missingMatches;
  const expected = condition.value;
  if (condition.operator === 'greater_than') return Number(actual) > Number(expected);
  if (condition.operator === 'greater_than_or_equal') return Number(actual) >= Number(expected);
  if (condition.operator === 'less_than') return Number(actual) < Number(expected);
  if (condition.operator === 'less_than_or_equal') return Number(actual) <= Number(expected);
  if (condition.operator === 'equal') return actual === expected;
  if (condition.operator === 'not_equal') return actual !== expected;
  if (condition.operator === 'between') {
    return Number(actual) >= Number(expected) && Number(actual) <= Number(condition.secondValue);
  }
  if (condition.operator === 'outside') {
    return Number(actual) < Number(expected) || Number(actual) > Number(condition.secondValue);
  }
  if (condition.operator === 'includes') {
    return Array.isArray(actual)
      ? actual.includes(expected)
      : String(actual).toLowerCase().includes(String(expected).toLowerCase());
  }
  if (condition.operator === 'changes_by') {
    return Number.isFinite(Number(previous))
      && Math.abs(Number(actual) - Number(previous)) >= Math.abs(Number(expected));
  }
  return false;
}

function conditionResult(condition, observation, previous) {
  const actual = readPath(observation, condition.field);
  const previousValue = readPath(previous, condition.previousField);
  return Object.freeze({
    field: condition.field,
    operator: condition.operator,
    expected: condition.value,
    secondValue: condition.secondValue,
    actual: actual ?? null,
    previous: previousValue ?? null,
    matched: compare(actual, condition, previousValue),
  });
}

function ruleIsActive(rule, timestamp) {
  if (rule.activeFrom && timestamp < parseTimestamp(rule.activeFrom)) return false;
  if (rule.activeUntil && timestamp >= parseTimestamp(rule.activeUntil)) return false;
  return true;
}

function interpolateMessage(template, context) {
  if (!template) return null;
  return template.replace(/\{([^}]+)\}/g, (_, path) => {
    const value = readPath(context, path.trim());
    return value === undefined || value === null ? 'unknown' : String(value);
  });
}

export function evaluateAlertRules(inputRules, observation, options = {}) {
  assertObject(observation, 'Weather observation');
  const rules = assertArray(inputRules, 'Alert rules').map(normalizeRule);
  const timestamp = parseTimestamp(
    options.at ?? observation.observedAt ?? observation.forecastAt ?? new Date().toISOString(),
    'Evaluation time',
  );
  const previous = options.previous ?? {};
  const priorAlerts = Array.isArray(options.priorAlerts) ? options.priorAlerts : [];
  const evaluations = rules.map((rule) => {
    const conditionResults = rule.conditions.map((condition) => conditionResult(condition, observation, previous));
    const conditionsMatched = rule.mode === 'any'
      ? conditionResults.some((result) => result.matched)
      : conditionResults.every((result) => result.matched);
    const active = ruleIsActive(rule, timestamp);
    const prior = priorAlerts
      .filter((alert) => alert.ruleId === rule.id)
      .sort((first, second) => parseTimestamp(second.triggeredAt) - parseTimestamp(first.triggeredAt))[0];
    const cooldownEndsAt = prior
      ? parseTimestamp(prior.triggeredAt) + rule.cooldownMinutes * 60_000
      : null;
    const suppressed = conditionsMatched && active && cooldownEndsAt !== null && timestamp < cooldownEndsAt;
    const matched = conditionsMatched && active && !suppressed;
    const alert = matched ? deepFreeze({
      id: `${rule.id}:${new Date(timestamp).toISOString()}`,
      ruleId: rule.id,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      triggeredAt: new Date(timestamp).toISOString(),
      message: interpolateMessage(rule.message, observation)
        ?? `${rule.name} conditions were detected.`,
      guidance: rule.guidance,
      tags: rule.tags,
      evidence: conditionResults.filter((result) => result.matched),
    }) : null;
    return deepFreeze({
      ruleId: rule.id,
      active,
      conditionsMatched,
      suppressed,
      cooldownEndsAt: suppressed ? new Date(cooldownEndsAt).toISOString() : null,
      conditionResults,
      alert,
    });
  });
  const alerts = evaluations.map((evaluation) => evaluation.alert).filter(Boolean)
    .sort((first, second) => (
      SEVERITY_ORDER[second.severity] - SEVERITY_ORDER[first.severity]
      || first.name.localeCompare(second.name)
    ));
  return deepFreeze({
    evaluatedAt: new Date(timestamp).toISOString(),
    alerts,
    evaluations,
    summary: {
      ruleCount: rules.length,
      matchedCount: alerts.length,
      suppressedCount: evaluations.filter((evaluation) => evaluation.suppressed).length,
      highestSeverity: alerts[0]?.severity ?? null,
    },
  });
}

export function evaluateRulesAcrossForecast(rules, forecastItems, options = {}) {
  const items = assertArray(forecastItems, 'Forecast items')
    .map((item) => ({ ...item, forecastAt: new Date(parseTimestamp(item.forecastAt)).toISOString() }))
    .sort((first, second) => parseTimestamp(first.forecastAt) - parseTimestamp(second.forecastAt));
  const evaluations = items.map((item, index) => evaluateAlertRules(rules, item, {
    ...options,
    at: item.forecastAt,
    previous: index > 0 ? items[index - 1] : options.previous,
    priorAlerts: [],
  }));
  const occurrences = evaluations.flatMap((evaluation) => evaluation.alerts);
  const grouped = new Map();
  occurrences.forEach((alert) => {
    if (!grouped.has(alert.ruleId)) grouped.set(alert.ruleId, []);
    grouped.get(alert.ruleId).push(alert);
  });
  const windows = [...grouped.entries()].map(([ruleId, alerts]) => deepFreeze({
    ruleId,
    name: alerts[0].name,
    severity: alerts[0].severity,
    startsAt: alerts[0].triggeredAt,
    endsAt: alerts.at(-1).triggeredAt,
    occurrenceCount: alerts.length,
    peakEvidence: alerts.sort((first, second) => second.evidence.length - first.evidence.length)[0].evidence,
  }));
  return deepFreeze({ evaluations, occurrences, windows });
}

export function summarizeAlertLoad(alerts) {
  const selected = Array.isArray(alerts) ? alerts : [];
  const severityScores = selected.map((alert) => SEVERITY_ORDER[alert.severity] ?? 0);
  return deepFreeze({
    total: selected.length,
    bySeverity: Object.fromEntries(SEVERITIES.map((severity) => [
      severity,
      selected.filter((alert) => alert.severity === severity).length,
    ])),
    averageSeverity: round(mean(severityScores), 2),
    minimumSeverity: SEVERITIES[minimum(severityScores)] ?? null,
    maximumSeverity: SEVERITIES[maximum(severityScores)] ?? null,
    categories: [...new Set(selected.map((alert) => alert.category))].sort(),
  });
}

export const ALERT_OPERATORS = OPERATORS;
export const ALERT_SEVERITIES = SEVERITIES;
