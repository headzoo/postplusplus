'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { ChannelDetails } from '@gitroom/frontend/components/settings/use.channel.details';

export type ChannelTrackingAlertItem = {
  integrationId: string;
  channelName: string;
  details: ChannelDetails;
};

export const useChannelTrackingAlerts = () => {
  const fetch = useFetch();
  const { data: integrations } = useIntegrationList();
  const trackedIntegrations =
    integrations?.filter((integration) => integration.identifier === 'x') || [];
  const cacheKey = trackedIntegrations.length
    ? `channel-tracking-alerts:${trackedIntegrations
        .map((item) => item.id)
        .join(',')}`
    : null;

  const load = useCallback(async () => {
    const responses = await Promise.all(
      trackedIntegrations.map(async (integration) => {
        const response = await fetch(
          `/integrations/${integration.id}/channel-details`
        );
        if (!response.ok) {
          return null;
        }
        return (await response.json()) as ChannelDetails;
      })
    );

    return responses
      .filter((details): details is ChannelDetails => !!details)
      .filter(
        (details) =>
          details.tracking.state === 'error' ||
          (details.tracking.state === 'partial' &&
            !!details.tracking.failedSubscriptions?.length)
      )
      .map((details) => ({
        integrationId: details.id,
        channelName: details.display || details.name,
        details,
      }));
  }, [fetch, trackedIntegrations]);

  return useSWR<ChannelTrackingAlertItem[]>(cacheKey, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
};
