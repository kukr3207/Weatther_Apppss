import clearIcon from '../clear.png';
import cloudIcon from '../cloud.png';
import drizzleIcon from '../drizzle.png';
import rainIcon from '../rain.png';
import snowIcon from '../snow.png';
import { conditionForIcon, conditionLabel } from '../domain/conditions';
import './WeatherIcon.css';

const ICONS = { clear: clearIcon, cloud: cloudIcon, drizzle: drizzleIcon, rain: rainIcon, snow: snowIcon };

function WeatherIcon({ iconCode, description, size = 'medium' }) {
  const condition = conditionForIcon(iconCode);
  return (
    <img
      className={`condition-icon condition-icon--${size}`}
      src={ICONS[condition.icon] ?? cloudIcon}
      alt={conditionLabel(iconCode, description)}
    />
  );
}

export default WeatherIcon;
