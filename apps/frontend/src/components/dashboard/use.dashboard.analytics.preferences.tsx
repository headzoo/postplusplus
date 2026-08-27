'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { DashboardAnalyticsPreference } from './dashboard.analytics.layout';

export const useDashboardAnalyticsPreferences = (integrationId?: string) => {
  const fetch = useFetch();

  const load = useCallback(async (): Promise<
    DashboardAnalyticsPreference[]
  > => {
    if (!integrationId) {
      return [];
    }
    return (
      await fetch(
        `/user/dashboard-analytics-preferences?integrationId=${encodeURIComponent(
          integrationId
        )}`
      )
    ).json();
  }, [fetch, integrationId]);

  const swr = useSWR(
    integrationId
      ? `/user/dashboard-analytics-preferences?integrationId=${integrationId}`
      : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );

  const savePreferences = useCallback(
    async (preferences: DashboardAnalyticsPreference[]) => {
      const response = await (
        await fetch('/user/dashboard-analytics-preferences', {
          method: 'POST',
          body: JSON.stringify({ preferences }),
        })
      ).json();
      await swr.mutate(response, false);
      return response as DashboardAnalyticsPreference[];
    },
    [fetch, swr]
  );

  return {
    ...swr,
    savePreferences,
  };
};
