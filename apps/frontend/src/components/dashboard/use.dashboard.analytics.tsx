'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

export type DashboardAnalyticsMetric = {
  label: string;
  metricKey?: string;
  drilldownSlug?: string | null;
  data: Array<{ total: number; date: string }>;
  valueMode?: 'sum' | 'average' | 'latest';
  displayUnit?: 'count' | 'percentage' | 'duration' | 'decimal';
  average?: boolean;
  percentageChange?: number;
};

export type DashboardChannelAnalytics = {
  id: string;
  name: string;
  picture?: string | null;
  display?: string | null;
  identifier: string;
  state: 'ok' | 'unsupported' | 'unavailable' | 'disabled';
  analytics: DashboardAnalyticsMetric[];
};

export const useDashboardAnalytics = (
  date: 7 | 30 | 90,
  integrationId?: string,
  refreshInterval = 0
) => {
  const fetch = useFetch();

  const load = useCallback(
    async (): Promise<DashboardChannelAnalytics[]> =>
      await (
        await fetch(
          `/analytics/dashboard?date=${date}&integrationId=${integrationId}`
        )
      ).json(),
    [date, fetch, integrationId]
  );

  return useSWR<DashboardChannelAnalytics[]>(
    integrationId
      ? `/analytics/dashboard?date=${date}&integrationId=${integrationId}`
      : null,
    load,
    {
      refreshInterval,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );
};
