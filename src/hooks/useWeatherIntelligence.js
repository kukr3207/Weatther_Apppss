import { useMemo } from 'react';
import { comfortSummary } from '../domain/comfort';
import { groupForecastByDay } from '../domain/dailyForecast';
import { forecastTrends } from '../domain/trends';
import { precipitationSummary, findDryWindows, umbrellaAdvice } from '../domain/precipitation';
import { deriveWeatherAlerts, filterAlerts } from '../domain/weatherAlerts';
import { airQualitySummary, healthAdvice, airQualityTrend } from '../domain/airQuality';
import { planActivity, rankActivities, activityRecommendation } from '../domain/activityPlanner';
import { solarSummary } from '../domain/astronomy';

export function useWeatherIntelligence({
  current,
  forecast,
  airQuality,
  airQualityForecast = [],
  providerAlerts = [],
  alertPreferences,
  healthProfile,
  plannerPreferences,
  now,
}) {
  return useMemo(() => {
    const daily = groupForecastByDay(forecast, { limit: 7 });
    const comfort = comfortSummary(current);
    const trends = forecastTrends(forecast);
    const precipitation = precipitationSummary(forecast);
    const dryWindows = findDryWindows(forecast, { minimumHours: 3 });
    const umbrella = umbrellaAdvice(forecast);
    const allAlerts = deriveWeatherAlerts(current, forecast, providerAlerts);
    const alerts = filterAlerts(allAlerts, alertPreferences);
    const air = airQualitySummary(airQuality);
    const airAdvice = healthAdvice(airQuality, healthProfile);
    const airTrend = airQualityTrend(airQualityForecast);
    const selectedActivity = planActivity(
      forecast,
      plannerPreferences?.selectedActivity ?? 'walk',
      { limit: 6 },
    );
    const activities = rankActivities(forecast, { limit: 5 });
    const activitySummary = activityRecommendation(forecast);
    const solar = solarSummary(current, now ?? new Date());

    return {
      daily,
      comfort,
      trends,
      precipitation,
      dryWindows,
      umbrella,
      allAlerts,
      alerts,
      air,
      airAdvice,
      airTrend,
      selectedActivity,
      activities,
      activitySummary,
      solar,
    };
  }, [
    airQuality,
    airQualityForecast,
    alertPreferences,
    current,
    forecast,
    healthProfile,
    now,
    plannerPreferences,
    providerAlerts,
  ]);
}
