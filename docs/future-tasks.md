# Future task map

The codebase contains independent surfaces for future feature tasks. Each task below can add behavior without replacing the architecture.

1. Add location suggestions with keyboard selection and request debouncing.
2. Add daily forecast summaries from the three-hour forecast feed.
3. Add severe-weather alerts with severity filters and dismissal state.
4. Add air-quality readings with health guidance for each category.
5. Add sunrise, sunset, and daylight-duration details.
6. Add a precipitation chart for the next 24 hours.
7. Add automatic refresh with pause and interval settings.
8. Add cached service responses with an expiration policy.
9. Add favorite reordering with keyboard-accessible controls.
10. Add export and import for saved places and settings.
11. Add a compare view for two saved locations.
12. Add locale selection for dates, numbers, and condition labels.
13. Add an explicit light, dark, and system theme control.
14. Add stale-data indicators and a manual retry queue for offline use.
15. Add a backend proxy that keeps the OpenWeather key outside the browser.

Each task must keep service payloads outside React components. Add response rules to a mapper or domain module.
