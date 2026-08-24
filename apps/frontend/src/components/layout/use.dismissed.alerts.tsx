'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type DismissedAlertsResponse = {
  keys: string[];
};

export const useDismissedAlerts = () => {
  const fetch = useFetch();

  const load = useCallback(async (): Promise<DismissedAlertsResponse> => {
    const response = await fetch('/user/dismissed-alerts');
    if (!response.ok) {
      throw new Error('Failed to load dismissed alerts');
    }
    return (await response.json()) as DismissedAlertsResponse;
  }, [fetch]);

  const swr = useSWR('/user/dismissed-alerts', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const dismissAlert = useCallback(
    async (alertKey: string) => {
      const previous = swr.data;
      const optimistic: DismissedAlertsResponse = {
        keys: [...new Set([...(previous?.keys ?? []), alertKey])].sort(),
      };
      await swr.mutate(optimistic, false);

      try {
        const response = await fetch('/user/dismissed-alerts', {
          method: 'POST',
          body: JSON.stringify({ alertKey }),
        });
        if (!response.ok) {
          throw new Error('Failed to dismiss alert');
        }
        const next = (await response.json()) as DismissedAlertsResponse;
        await swr.mutate(next, false);
        return next;
      } catch (error) {
        await swr.mutate(previous, false);
        throw error;
      }
    },
    [fetch, swr]
  );

  return {
    ...swr,
    dismissAlert,
  };
};
