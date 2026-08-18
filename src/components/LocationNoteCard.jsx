import { useEffect, useState } from 'react';
import { formatLocationDate, formatLocationClock } from '../domain/time';

function LocationNoteCard({ location, note, onSave, onRemove }) {
  const [text, setText] = useState(note?.text ?? '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setText(note?.text ?? '');
    setMessage('');
  }, [location?.id, note?.text]);

  if (!location) return null;

  function submit(event) {
    event.preventDefault();
    const normalized = text.trim();
    if (!normalized) {
      setMessage('Write a note before saving.');
      return;
    }
    onSave(normalized);
    setText(normalized);
    setMessage('Location note saved.');
  }

  function remove() {
    onRemove();
    setText('');
    setMessage('Location note removed.');
  }

  return (
    <section className="workspace-panel note-panel" aria-labelledby="location-note-title">
      <div className="workspace-panel__heading">
        <div>
          <p>Private to this browser</p>
          <h2 id="location-note-title">Note for {location.name}</h2>
        </div>
        <span>{text.length}/280</span>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="location-note-text">Travel tips, addresses, or reminders</label>
        <textarea
          id="location-note-text"
          value={text}
          maxLength={280}
          rows={4}
          placeholder="Example: Pack a light rain jacket for the afternoon commute."
          onChange={(event) => {
            setText(event.target.value);
            setMessage('');
          }}
        />
        <div className="form-actions">
          <button type="submit">Save note</button>
          {note ? <button type="button" className="button-secondary" onClick={remove}>Remove</button> : null}
        </div>
      </form>
      {note ? (
        <p className="note-panel__updated">
          Updated {formatLocationDate(note.updatedAt)} at {formatLocationClock(note.updatedAt)}
        </p>
      ) : null}
      <p className="sr-status" role="status">{message}</p>
    </section>
  );
}

export default LocationNoteCard;
