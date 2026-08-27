'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import {
  ChannelInteractionTrackingFailureCategory,
  FollowerPageTracking,
} from '@gitroom/frontend/components/followers/use.followers';
import { listChannelStrategies } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.registry';
import type { ChannelStrategyId } from '@gitroom/nestjs-libraries/channel-strategies/channel-strategy.types';

export type ChannelStrategyLocalizedCopy = {
  key: string;
  defaultValue: string;
};

export type ChannelStrategyPublicSummary = {
  id: ChannelStrategyId;
  version: number;
  label: ChannelStrategyLocalizedCopy;
  description: ChannelStrategyLocalizedCopy;
};

export const channelStrategyOptions: ChannelStrategyPublicSummary[] =
  listChannelStrategies().map((strategy) => ({
    id: strategy.id,
    version: strategy.version,
    label: strategy.label,
    description: strategy.description,
  }));

export type ChannelSubscriptionDetail = {
  eventKey: string;
  direction: string;
  state: string;
  remoteIdentifier?: string;
  failureCategory?: ChannelInteractionTrackingFailureCategory;
  reason?: string;
  trackingStartedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ChannelDetails = {
  id: string;
  name: string;
  picture?: string;
  display?: string;
  identifier: string;
  internalId: string;
  type: string;
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
  deleted?: boolean;
  profileUrl?: string;
  trackingAuthorization?: { connected: boolean };
  tracking: FollowerPageTracking;
  subscriptions: ChannelSubscriptionDetail[];
  strategyApplicable: boolean;
  strategy?: ChannelStrategyPublicSummary;
  recomputing?: boolean;
  recomputeRequested?: boolean;
  utmParams?: string | null;
};

export const useChannelDetails = (integrationId?: string) => {
  const fetch = useFetch();

  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load channel details');
      }
      return (await response.json()) as ChannelDetails;
    },
    [fetch]
  );

  return useSWR<ChannelDetails>(
    integrationId ? `/integrations/${integrationId}/channel-details` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    }
  );
};
