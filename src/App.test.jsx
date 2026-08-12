import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('renders the default forecast with accessible search controls', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /weather forecast/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'London' })).toBeInTheDocument();
  expect(screen.getByText('24°C')).toBeInTheDocument();
  expect(screen.getByLabelText(/city name/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /search weather/i })).toBeEnabled();
});

test('validates an empty city without calling the weather service', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key');
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /search weather/i }));

  expect(screen.getByRole('status')).toHaveTextContent('Enter a city to search.');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('loads and displays weather for a searched city', async () => {
  vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key');
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      name: 'Paris',
      main: { temp: 17.4, humidity: 71 },
      wind: { speed: 3.26 },
      weather: [{ icon: '10d' }],
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);

  fireEvent.change(screen.getByLabelText(/city name/i), { target: { value: '  Paris  ' } });
  fireEvent.click(screen.getByRole('button', { name: /search weather/i }));

  expect(await screen.findByRole('heading', { name: 'Paris' })).toBeInTheDocument();
  expect(screen.getByText('17°C')).toBeInTheDocument();
  expect(screen.getByText('71%')).toBeInTheDocument();
  expect(screen.getByText('3.3 m/s')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Weather updated for Paris.');

  const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
  expect(requestedUrl.searchParams.get('q')).toBe('Paris');
  expect(requestedUrl.searchParams.get('units')).toBe('metric');
  expect(requestedUrl.searchParams.get('appid')).toBe('test-key');
});

test('shows a useful API error and preserves the current forecast', async () => {
  vi.stubEnv('VITE_OPENWEATHER_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  render(<App />);

  fireEvent.change(screen.getByLabelText(/city name/i), { target: { value: 'Unknown place' } });
  fireEvent.submit(screen.getByRole('search'));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('City not found.'));
  expect(screen.getByRole('heading', { name: 'London' })).toBeInTheDocument();
  expect(screen.getByText('24°C')).toBeInTheDocument();
});

test('explains when the API key is missing', () => {
  vi.stubEnv('VITE_OPENWEATHER_API_KEY', '');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);

  fireEvent.change(screen.getByLabelText(/city name/i), { target: { value: 'Delhi' } });
  fireEvent.click(screen.getByRole('button', { name: /search weather/i }));

  expect(screen.getByRole('status')).toHaveTextContent('Weather service is not configured.');
  expect(fetchMock).not.toHaveBeenCalled();
});
