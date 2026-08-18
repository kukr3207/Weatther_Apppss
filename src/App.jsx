
import './App.css';
import WeatherDashboard from './components/WeatherDashboard';

function App({ dashboardOptions }) {
  return (
    <div className="App">
      <WeatherDashboard dashboardOptions={dashboardOptions} />
    </div>
  );
}

export default App;
