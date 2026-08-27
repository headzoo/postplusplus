'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';
import { Integration } from '@prisma/client';

export type IntegrationListItem = Integration & {
  identifier: string;
  editor: 'none' | 'normal' | 'markdown' | 'html';
  display: string;
  time: {
    time: number;
  }[];
  refreshNeeded?: boolean;
  profileUrl?: string;
  changeProfilePicture: boolean;
  changeNickName: boolean;
  customer?: {
    id?: string;
    name?: string;
    position?: number;
  };
  customFields?: {
    key: string;
    label: string;
    defaultValue?: string;
    validation: string;
    type: 'text' | 'password';
    hint?: string;
  }[];
  isCustomFields?: boolean;
};

export const useIntegrationList = () => {
  const fetch = useFetch();

  const load = useCallback(
    async (path: string): Promise<IntegrationListItem[]> => {
      return (await (await fetch(path)).json()).integrations;
    },
    []
  );

  return useSWR<IntegrationListItem[]>('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};
