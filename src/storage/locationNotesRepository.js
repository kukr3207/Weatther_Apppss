const NOTES_KEY = 'location-notes.v1';
const MAX_NOTES = 40;

function normalizeNote(note) {
  if (!note || typeof note !== 'object') return null;
  const locationId = typeof note.locationId === 'string' ? note.locationId.trim() : '';
  const text = typeof note.text === 'string' ? note.text.trim().replace(/\s+/g, ' ').slice(0, 280) : '';
  if (!locationId || !text) return null;
  const updatedAt = Number.isNaN(Date.parse(note.updatedAt)) ? new Date(0).toISOString() : note.updatedAt;
  return { locationId, text, updatedAt };
}

export function createLocationNotesRepository(store, options = {}) {
  const now = options.now ?? (() => new Date());
  function list() {
    const source = store.get(NOTES_KEY, []);
    if (!Array.isArray(source)) return [];
    const seen = new Set();
    return source
      .map(normalizeNote)
      .filter((note) => {
        if (!note || seen.has(note.locationId)) return false;
        seen.add(note.locationId);
        return true;
      })
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
      .slice(0, MAX_NOTES);
  }
  function write(notes) {
    store.set(NOTES_KEY, notes.map(normalizeNote).filter(Boolean).slice(0, MAX_NOTES));
    return list();
  }
  return {
    list,
    get(locationId) {
      return list().find((note) => note.locationId === locationId) ?? null;
    },
    save(locationId, text) {
      const note = normalizeNote({ locationId, text, updatedAt: now().toISOString() });
      if (!note) throw new TypeError('Location and note text are required.');
      write([note, ...list().filter((item) => item.locationId !== note.locationId)]);
      return note;
    },
    remove(locationId) {
      return write(list().filter((note) => note.locationId !== locationId));
    },
    clear() {
      store.remove(NOTES_KEY);
      return [];
    },
    replace(items) {
      return write(Array.isArray(items) ? items : []);
    },
  };
}
