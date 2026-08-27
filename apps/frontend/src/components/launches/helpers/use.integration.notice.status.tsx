'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

export type ChannelNoticeCategory =
  | 'mention'
  | 'reply'
  | 'like'
  | 'repost'
  | 'follow';

export type IntegrationNoticeStatus = {
  id: string;
  state: 'ok' | 'unsupported' | 'unavailable' | 'disabled';
  unreadCount: number;
  categories?: Partial<Record<ChannelNoticeCategory, number>>;
};

export type IntegrationNoticeStatusResponse = {
  statuses: Record<string, IntegrationNoticeStatus>;
};

export const useIntegrationNoticeStatus = () => {
  const fetch = useFetch();

  const load =
    useCallback(async (): Promise<IntegrationNoticeStatusResponse> => {
      return await (await fetch('/integrations/notice-status')).json();
    }, [fetch]);

  return useSWR<IntegrationNoticeStatusResponse>(
    '/integrations/notice-status',
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      fallbackData: { statuses: {} },
    }
  );
};
