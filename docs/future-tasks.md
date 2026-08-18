# Future task map

The codebase contains independent surfaces for more feature tasks. Each task can add behavior without replacing the architecture.

1. Add location suggestions with keyboard selection and request debouncing.
2. Add favorite reordering with keyboard-accessible controls.
3. Add locale selection for dates, numbers, and condition labels.
4. Add a backend proxy that keeps the OpenWeather key outside the browser.
5. Add official provider alerts with acknowledgement and expiration rules.
6. Add pollen forecasts with plant categories and profile-based health guidance.
7. Add a route forecast that samples weather between an origin and destination.
8. Add calendar reminders for selected activity windows.
9. Add push notifications for saved alert thresholds.
10. Add a radar map with time controls and accessible text summaries.
11. Add favorite synchronization through an optional user account.
12. Add home-screen installation and background cache updates.
13. Add provider fallback when the primary weather service is unavailable.
14. Add configurable dashboard cards with keyboard reordering.
15. Add historical climate comparisons for a selected calendar date.

Each task must keep service payloads outside React components. Add response rules to a mapper or domain module.
