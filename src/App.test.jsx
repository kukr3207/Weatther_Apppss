import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from './App';
import { DEFAULT_CURRENT_WEATHER, DEFAULT_FORECAST } from './data/defaultWeather';
import { WeatherServiceError, WEATHER_ERROR_CODES } from './services/errors';

function dashboardOptions(overrides = {}) {
  let favoriteItems = [];
  let settingsValue = { unitSystem: 'metric', theme: 'system', refreshMinutes: 10 };
  const favorites = {
    list: vi.fn(() => favoriteItems),
    has: vi.fn((location) => favoriteItems.some((item) => item.id === location.id)),
    add: vi.fn((location) => { favoriteItems = [{ ...location }]; return favoriteItems; }),
    remove: vi.fn(() => { favoriteItems = []; return favoriteItems; }),
  };
  const recent = { list: vi.fn(() => []), record: vi.fn(() => []), clear: vi.fn(() => []) };
  const settings = {
    read: vi.fn(() => settingsValue),
    update: vi.fn((changes) => { settingsValue = { ...settingsValue, ...changes }; return settingsValue; }),
  };
  const client = {
    searchLocations: vi.fn().mockResolvedValue([DEFAULT_CURRENT_WEATHER.location]),
    getCurrent: vi.fn().mockResolvedValue(DEFAULT_CURRENT_WEATHER),
    getForecast: vi.fn().mockResolvedValue(DEFAULT_FORECAST),
  };
  const locate = vi.fn().mockResolvedValue(DEFAULT_CURRENT_WEATHER.location);
  return { favorites, recent, settings, client, locate, ...overrides };
}

test('renders the forecast dashboard and default weather', () => {
  render(<App dashboardOptions={dashboardOptions()} />);
  expect(screen.getByRole('heading', { name: /forecast dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /london, gb/i })).toBeInTheDocument();
  expect(screen.getAllByText('24°C')).not.toHaveLength(0);
  expect(screen.getByRole('heading', { name: /hourly forecast/i })).toBeInTheDocument();
});

test('loads a searched location through the dashboard client', async () => {
  const options = dashboardOptions();
  render(<App dashboardOptions={options} />);
  fireEvent.change(screen.getByLabelText(/search for a location/i), { target: { value: ' Paris ' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));
  await waitFor(() => expect(options.client.searchLocations).toHaveBeenCalledWith('Paris'));
  expect(options.client.getCurrent).toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Weather updated for London.');
});

test('keeps current weather visible after a search error', async () => {
  const options = dashboardOptions({
    client: {
      searchLocations: vi.fn().mockRejectedValue(
        new WeatherServiceError(WEATHER_ERROR_CODES.network, 'No network connection.'),
      ),
    },
  });
  render(<App dashboardOptions={options} />);
  fireEvent.change(screen.getByLabelText(/search for a location/i), { target: { value: 'Paris' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No network connection.');
  expect(screen.getByRole('heading', { name: /london, gb/i })).toBeInTheDocument();
});

test('switches displayed temperature units', () => {
  render(<App dashboardOptions={dashboardOptions()} />);
  fireEvent.click(screen.getByLabelText('°F'));
  expect(screen.getAllByText('75°F')).not.toHaveLength(0);
});

test('saves and removes the current place', () => {
  render(<App dashboardOptions={dashboardOptions()} />);
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
  expect(screen.getByRole('button', { name: /^saved$/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1/8')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /remove london/i }));
  expect(screen.getByText('0/8')).toBeInTheDocument();
});

test('loads weather for the device location', async () => {
  const options = dashboardOptions();
  render(<App dashboardOptions={options} />);
  fireEvent.click(screen.getByRole('button', { name: /use my location/i }));
  await waitFor(() => expect(options.locate).toHaveBeenCalled());
  expect(options.client.getCurrent).toHaveBeenCalled();
});
