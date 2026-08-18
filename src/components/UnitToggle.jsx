import './UnitToggle.css';

function UnitToggle({ value, onChange, disabled = false }) {
  return (
    <fieldset className="unit-toggle" disabled={disabled}>
      <legend>Temperature units</legend>
      <label>
        <input
          type="radio"
          name="unit-system"
          value="metric"
          checked={value === 'metric'}
          onChange={() => onChange('metric')}
        />
        <span>°C</span>
      </label>
      <label>
        <input
          type="radio"
          name="unit-system"
          value="imperial"
          checked={value === 'imperial'}
          onChange={() => onChange('imperial')}
        />
        <span>°F</span>
      </label>
    </fieldset>
  );
}

export default UnitToggle;
