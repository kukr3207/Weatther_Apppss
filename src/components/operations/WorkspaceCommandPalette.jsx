import { useEffect, useMemo, useRef, useState } from 'react';
import { createWeatherCommands, executeCommand, searchCommands } from '../../operations/workspace/commandPalette';

function WorkspaceCommandPalette({ open, onClose, dashboard, activeTab, onOpenTab }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const commands = useMemo(() => createWeatherCommands({
    refresh: dashboard.refresh,
    locate: dashboard.locate,
    toggleFavorite: dashboard.toggleFavorite,
    toggleUnits: () => dashboard.setUnitSystem(dashboard.settings.unitSystem === 'metric' ? 'imperial' : 'metric'),
    openTab: onOpenTab,
  }, {
    location: dashboard.activeLocation,
    favorite: dashboard.isFavorite,
    unitSystem: dashboard.settings.unitSystem,
    activeTab,
  }), [activeTab, dashboard, onOpenTab]);
  const results = useMemo(() => searchCommands(query, commands, { limit: 10 }), [commands, query]);

  useEffect(() => {
    function onGlobalKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) onClose();
      }
      if (event.key === 'Escape' && open) onClose();
    }
    globalThis.addEventListener?.('keydown', onGlobalKeyDown);
    return () => globalThis.removeEventListener?.('keydown', onGlobalKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      globalThis.setTimeout?.(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  async function run(command) {
    await executeCommand(command, { dashboard });
    onClose();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((value) => Math.min(results.length - 1, value + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((value) => Math.max(0, value - 1));
    }
    if (event.key === 'Enter' && results[selected]) {
      event.preventDefault();
      run(results[selected].command);
    }
  }

  return (
    <div className="command-palette" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
        <header>
          <h2 id="command-palette-title">Weather workspace commands</h2>
          <button type="button" onClick={onClose} aria-label="Close command palette">×</button>
        </header>
        <label>
          <span className="visually-hidden">Search commands</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or section…"
          />
        </label>
        <ul role="listbox" aria-label="Matching commands">
          {results.map((result, index) => (
            <li key={result.command.id} role="option" aria-selected={selected === index}>
              <button type="button" onMouseEnter={() => setSelected(index)} onClick={() => run(result.command)}>
                <span><strong>{result.command.title}</strong><small>{result.command.subtitle}</small></span>
                {result.command.shortcut.length ? <kbd>{result.command.shortcut.join(' ')}</kbd> : null}
              </button>
            </li>
          ))}
          {!results.length ? <li className="command-palette__empty">No matching commands.</li> : null}
        </ul>
      </section>
    </div>
  );
}

export default WorkspaceCommandPalette;
