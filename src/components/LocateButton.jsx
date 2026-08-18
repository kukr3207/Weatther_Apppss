import './LocateButton.css';

function LocateButton({ onLocate, disabled = false }) {
  return (
    <button className="locate-button" type="button" onClick={onLocate} disabled={disabled}>
      <span aria-hidden="true">⌖</span>
      Use my location
    </button>
  );
}

export default LocateButton;
