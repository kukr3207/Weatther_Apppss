import { assertArray, assertInteger, assertString, deepFreeze, normalizeLocation, round } from '../core/validation';
import { haversineDistance } from '../core/geo';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function subsequenceScore(query, value) {
  if (!query || !value) return 0;
  let queryIndex = 0;
  let gaps = 0;
  let lastMatch = -1;
  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] === query[queryIndex]) {
      if (lastMatch >= 0) gaps += index - lastMatch - 1;
      lastMatch = index;
      queryIndex += 1;
    }
  }
  return queryIndex === query.length ? Math.max(0, 1 - gaps / Math.max(1, value.length)) : 0;
}

function levenshtein(first, second) {
  const rows = Array.from({ length: first.length + 1 }, () => Array(second.length + 1).fill(0));
  for (let index = 0; index <= first.length; index += 1) rows[index][0] = index;
  for (let index = 0; index <= second.length; index += 1) rows[0][index] = index;
  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1),
      );
    }
  }
  return rows[first.length][second.length];
}

function locationLabel(location) {
  return [location.name, location.state, location.country].filter(Boolean).join(', ');
}

function searchScore(query, location, options) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = tokens(query);
  const name = normalizeText(location.name);
  const state = normalizeText(location.state);
  const country = normalizeText(location.country);
  const label = normalizeText(locationLabel(location));
  const aliases = Array.isArray(location.aliases) ? location.aliases.map(normalizeText) : [];
  let score = 0;
  const reasons = [];
  if (name === normalizedQuery) {
    score += 100;
    reasons.push('exact_name');
  } else if (name.startsWith(normalizedQuery)) {
    score += 75;
    reasons.push('name_prefix');
  } else if (name.includes(normalizedQuery)) {
    score += 55;
    reasons.push('name_contains');
  }
  if (label.startsWith(normalizedQuery)) score += 20;
  if (aliases.includes(normalizedQuery)) {
    score += 65;
    reasons.push('alias');
  }
  const tokenMatches = queryTokens.filter((token) => (
    name.includes(token) || state.includes(token) || country.includes(token) || aliases.some((alias) => alias.includes(token))
  )).length;
  score += queryTokens.length ? tokenMatches / queryTokens.length * 30 : 0;
  const subsequence = subsequenceScore(normalizedQuery, name);
  if (subsequence >= 0.5) {
    score += subsequence * 18;
    reasons.push('subsequence');
  }
  if (normalizedQuery.length >= 4 && name.length >= 4) {
    const distance = levenshtein(normalizedQuery, name);
    const similarity = 1 - distance / Math.max(normalizedQuery.length, name.length);
    if (similarity >= 0.65) {
      score += similarity * 25;
      reasons.push('fuzzy');
    }
  }
  if (Number.isFinite(location.population) && location.population > 0) {
    score += Math.min(15, Math.log10(location.population + 1) * 2);
  }
  if (options.near) {
    const distanceKm = haversineDistance(options.near, location);
    score += Math.max(0, 15 - distanceKm / 100);
  }
  if (options.country && normalizeText(options.country) === country) score += 20;
  return { score, reasons };
}

export function rankLocationSuggestions(queryInput, locationsInput, options = {}) {
  const query = assertString(queryInput, 'Location query', { maximum: 160 });
  const locations = assertArray(locationsInput, 'Locations').map((location, index) => ({
    ...normalizeLocation(location, `Location ${index + 1}`),
    aliases: Array.isArray(location.aliases) ? location.aliases : [],
    population: location.population,
    timezone: location.timezone,
  }));
  const limit = assertInteger(options.limit ?? 10, 'Suggestion limit', { minimum: 1, maximum: 100 });
  return locations.map((location) => {
    const match = searchScore(query, location, options);
    return deepFreeze({
      location,
      label: locationLabel(location),
      score: round(match.score, 3),
      reasons: match.reasons,
      distanceKm: options.near ? round(haversineDistance(options.near, location), 1) : null,
    });
  }).filter((entry) => entry.score >= (options.minimumScore ?? 10))
    .sort((first, second) => second.score - first.score || first.label.localeCompare(second.label))
    .slice(0, limit);
}

export function groupSuggestions(suggestions) {
  const groups = new Map();
  assertArray(suggestions, 'Location suggestions').forEach((suggestion) => {
    const country = suggestion.location?.country ?? 'Other';
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country).push(suggestion);
  });
  return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([country, items]) => ({
    country,
    suggestions: items,
  }));
}

export function createRecentSearchBoost(recentSearches, now = new Date().toISOString()) {
  const current = Date.parse(now);
  const weights = new Map();
  assertArray(recentSearches, 'Recent searches').forEach((entry, index) => {
    const id = entry.location?.id ?? entry.id;
    const searchedAt = Date.parse(entry.searchedAt ?? now);
    const ageDays = Math.max(0, current - searchedAt) / 86_400_000;
    const recency = 0.5 ** (ageDays / 14);
    const order = 1 / (index + 1);
    weights.set(id, Math.max(weights.get(id) ?? 0, round(recency * 0.7 + order * 0.3, 4)));
  });
  return weights;
}

export function applySearchBoosts(suggestions, boosts) {
  return assertArray(suggestions, 'Suggestions').map((suggestion) => {
    const boost = boosts.get?.(suggestion.location.id) ?? boosts[suggestion.location.id] ?? 0;
    return deepFreeze({ ...suggestion, score: round(suggestion.score + boost * 20, 3), recentBoost: boost });
  }).sort((first, second) => second.score - first.score || first.label.localeCompare(second.label));
}
