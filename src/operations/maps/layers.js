import { assertArray, assertObject, assertString, deepFreeze } from '../core/validation';

const LAYER_TYPES = Object.freeze(['tile', 'raster', 'points', 'line', 'polygon', 'heatmap', 'labels']);

function normalizeLayer(layer, index) {
  assertObject(layer, `Map layer ${index + 1}`);
  const type = LAYER_TYPES.includes(layer.type) ? layer.type : 'points';
  return deepFreeze({
    id: assertString(layer.id ?? `layer-${index + 1}`, `Map layer ${index + 1} id`, { maximum: 120 }),
    name: assertString(layer.name ?? layer.id ?? `Layer ${index + 1}`, `Map layer ${index + 1} name`, { maximum: 160 }),
    type,
    group: String(layer.group ?? 'weather'),
    visible: layer.visible !== false,
    opacity: Number.isFinite(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1,
    minimumZoom: Number.isFinite(layer.minimumZoom) ? Math.max(0, layer.minimumZoom) : 0,
    maximumZoom: Number.isFinite(layer.maximumZoom) ? Math.min(30, layer.maximumZoom) : 30,
    zIndex: Number.isFinite(layer.zIndex) ? layer.zIndex : index,
    exclusiveGroup: layer.exclusiveGroup ?? null,
    attribution: layer.attribution ?? null,
    source: deepFreeze({ ...(layer.source ?? {}) }),
    style: deepFreeze({ ...(layer.style ?? {}) }),
    metadata: deepFreeze({ ...(layer.metadata ?? {}) }),
  });
}

export function createMapLayerStack(inputLayers, options = {}) {
  const layers = assertArray(inputLayers, 'Map layers').map(normalizeLayer);
  const ids = new Set();
  layers.forEach((layer) => {
    if (ids.has(layer.id)) throw new TypeError(`Map layer ${layer.id} is duplicated.`);
    ids.add(layer.id);
  });
  const sorted = [...layers].sort((first, second) => first.zIndex - second.zIndex || first.id.localeCompare(second.id));
  const normalized = enforceExclusiveGroups(sorted, options.preferredLayers ?? []);
  return deepFreeze({
    layers: normalized,
    groups: [...new Set(normalized.map((layer) => layer.group))],
    visibleCount: normalized.filter((layer) => layer.visible).length,
  });
}

function enforceExclusiveGroups(layers, preferred = []) {
  const chosen = new Map();
  const preferredSet = new Set(preferred);
  layers.forEach((layer) => {
    if (!layer.exclusiveGroup || !layer.visible) return;
    const current = chosen.get(layer.exclusiveGroup);
    if (!current || preferredSet.has(layer.id)) chosen.set(layer.exclusiveGroup, layer.id);
  });
  return layers.map((layer) => {
    if (!layer.exclusiveGroup || !layer.visible) return layer;
    return chosen.get(layer.exclusiveGroup) === layer.id ? layer : deepFreeze({ ...layer, visible: false });
  });
}

export function updateMapLayer(stack, layerId, changes) {
  const layers = stack.layers.map((layer, index) => layer.id === layerId
    ? normalizeLayer({ ...layer, ...changes, id: layer.id }, index)
    : layer);
  if (!layers.some((layer) => layer.id === layerId)) throw new TypeError(`Map layer ${layerId} does not exist.`);
  return createMapLayerStack(layers, {
    preferredLayers: changes.visible === true ? [layerId] : [],
  });
}

export function reorderMapLayer(stack, layerId, targetIndex) {
  const layers = [...stack.layers];
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) throw new TypeError(`Map layer ${layerId} does not exist.`);
  const [layer] = layers.splice(index, 1);
  const destination = Math.max(0, Math.min(layers.length, Math.trunc(targetIndex)));
  layers.splice(destination, 0, layer);
  return createMapLayerStack(layers.map((entry, position) => ({ ...entry, zIndex: position })));
}

export function visibleMapLayers(stack, zoom, options = {}) {
  const group = options.group;
  return stack.layers.filter((layer) => (
    layer.visible
    && zoom >= layer.minimumZoom
    && zoom <= layer.maximumZoom
    && (!group || layer.group === group)
  ));
}

export function mapAttributions(stack, zoom) {
  return [...new Set(visibleMapLayers(stack, zoom).map((layer) => layer.attribution).filter(Boolean))];
}

export function serializeMapLayerStack(stack) {
  return JSON.stringify({ version: 1, layers: stack.layers });
}

export function parseMapLayerStack(value) {
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    throw new TypeError(`Map layer configuration is not valid JSON: ${error.message}`);
  }
  if (parsed?.version !== 1) throw new TypeError('Map layer configuration version is not supported.');
  return createMapLayerStack(parsed.layers ?? []);
}

export function defaultWeatherLayers(options = {}) {
  const tileTemplate = options.tileTemplate ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  return createMapLayerStack([
    {
      id: 'base-light',
      name: 'Light map',
      type: 'tile',
      group: 'base',
      exclusiveGroup: 'base-map',
      source: { url: tileTemplate },
      attribution: '© OpenStreetMap contributors',
      zIndex: 0,
    },
    {
      id: 'radar',
      name: 'Precipitation radar',
      type: 'raster',
      group: 'weather',
      source: { timeline: true },
      opacity: 0.75,
      zIndex: 10,
    },
    {
      id: 'alerts',
      name: 'Weather alerts',
      type: 'polygon',
      group: 'hazards',
      style: { fillColor: '#ef4444', fillOpacity: 0.2, strokeColor: '#b91c1c' },
      zIndex: 20,
    },
    {
      id: 'saved-places',
      name: 'Saved places',
      type: 'points',
      group: 'workspace',
      style: { color: '#2563eb', radius: 6 },
      zIndex: 30,
    },
  ]);
}
