import { assertArray, assertString, deepFreeze, round } from '../core/validation';

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(value) {
  return normalize(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function acronym(value) {
  return tokenize(value).map((token) => token[0]).join('');
}

function matchQuery(query, command) {
  const text = normalize([command.title, command.subtitle, ...(command.keywords ?? [])].join(' '));
  const normalizedQuery = normalize(query).trim();
  const queryTokens = tokenize(query);
  let score = 0;
  const matches = [];
  if (!normalizedQuery) return { score: command.priority ?? 0, matches };
  if (normalize(command.title) === normalizedQuery) score += 100;
  if (normalize(command.title).startsWith(normalizedQuery)) score += 70;
  if (normalize(command.title).includes(normalizedQuery)) score += 50;
  if (acronym(command.title).startsWith(normalizedQuery.replace(/\s/g, ''))) score += 45;
  queryTokens.forEach((token) => {
    const index = text.indexOf(token);
    if (index >= 0) {
      score += 20;
      matches.push({ token, index });
    }
  });
  if (queryTokens.length && matches.length === queryTokens.length) score += 20;
  score += command.priority ?? 0;
  return { score, matches };
}

function normalizeCommand(command, index) {
  const id = assertString(command.id, `Command ${index + 1} id`, { maximum: 120 });
  return Object.freeze({
    ...command,
    id,
    title: assertString(command.title ?? command.label, `Command ${id} title`, { maximum: 160 }),
    subtitle: typeof command.subtitle === 'string' ? command.subtitle : '',
    group: typeof command.group === 'string' ? command.group : 'General',
    keywords: Array.isArray(command.keywords) ? command.keywords : [],
    shortcut: Array.isArray(command.shortcut) ? command.shortcut : [],
    disabled: command.disabled === true,
    priority: Number.isFinite(command.priority) ? command.priority : 0,
    perform: typeof command.perform === 'function' ? command.perform : null,
  });
}

export function searchCommands(query, commands, options = {}) {
  const normalized = assertArray(commands, 'Commands').map(normalizeCommand);
  const recent = new Map((options.recent ?? []).map((id, index) => [id, Math.max(0, 20 - index * 2)]));
  return normalized.map((command) => {
    const result = matchQuery(query, command);
    const recencyBoost = recent.get(command.id) ?? 0;
    return deepFreeze({ command, score: round(result.score + recencyBoost, 2), matches: result.matches });
  }).filter((entry) => !query || entry.score > entry.command.priority + (recent.get(entry.command.id) ?? 0))
    .sort((first, second) => second.score - first.score || first.command.title.localeCompare(second.command.title))
    .slice(0, options.limit ?? 20);
}

export function commandGroups(results) {
  const groups = new Map();
  assertArray(results, 'Command results').forEach((result) => {
    const group = result.command.group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(result);
  });
  return [...groups.entries()].map(([label, items]) => deepFreeze({ label, items }));
}

export async function executeCommand(command, context = {}) {
  const normalized = normalizeCommand(command, 0);
  if (normalized.disabled) return deepFreeze({ status: 'disabled', commandId: normalized.id, value: null });
  if (!normalized.perform) return deepFreeze({ status: 'unavailable', commandId: normalized.id, value: null });
  try {
    const value = await normalized.perform(context);
    return deepFreeze({ status: 'completed', commandId: normalized.id, value });
  } catch (error) {
    return deepFreeze({
      status: 'failed',
      commandId: normalized.id,
      value: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createWeatherCommands(actions = {}, state = {}) {
  const location = state.location?.name ?? state.activeLocation?.name ?? 'current location';
  return [
    { id: 'refresh', title: 'Refresh weather', subtitle: `Update ${location}`, group: 'Weather', keywords: ['reload', 'update'], shortcut: ['R'], perform: actions.refresh },
    { id: 'search', title: 'Search for a place', subtitle: 'Find another forecast', group: 'Places', keywords: ['city', 'location'], shortcut: ['/'], perform: actions.openSearch },
    { id: 'locate', title: 'Use my location', subtitle: 'Load device location', group: 'Places', keywords: ['gps', 'nearby'], perform: actions.locate },
    { id: 'favorite', title: state.favorite ? 'Remove favorite' : 'Save as favorite', subtitle: location, group: 'Places', keywords: ['bookmark', 'star'], perform: actions.toggleFavorite },
    { id: 'units', title: state.unitSystem === 'imperial' ? 'Use metric units' : 'Use imperial units', subtitle: 'Change display units', group: 'Settings', keywords: ['celsius', 'fahrenheit'], perform: actions.toggleUnits },
    { id: 'overview', title: 'Open overview', group: 'Navigation', keywords: ['current'], perform: () => actions.openTab?.('overview') },
    { id: 'forecast', title: 'Open forecast', group: 'Navigation', keywords: ['hourly', 'daily'], perform: () => actions.openTab?.('forecast') },
    { id: 'health', title: 'Open health', group: 'Navigation', keywords: ['air quality', 'alerts'], perform: () => actions.openTab?.('health') },
    { id: 'planner', title: 'Open planner', group: 'Navigation', keywords: ['activities', 'packing'], perform: () => actions.openTab?.('planner') },
    { id: 'operations', title: 'Open operations center', group: 'Navigation', keywords: ['consensus', 'watches', 'verification'], perform: () => actions.openTab?.('operations') },
    { id: 'export', title: 'Export workspace', group: 'Data', keywords: ['backup', 'download'], perform: actions.exportWorkspace },
    { id: 'import', title: 'Import workspace', group: 'Data', keywords: ['restore', 'upload'], perform: actions.importWorkspace },
  ];
}
