import './WeatherMetric.css';

function WeatherMetric({ label, value, detail, icon }) {
  return (
    <div className="weather-metric">
      {icon && <img className="weather-metric__icon" src={icon} alt="" aria-hidden="true" />}
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

export default WeatherMetric;
