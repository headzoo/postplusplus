'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { FollowerBoardColumnPreference } from '@gitroom/frontend/components/followers/follower.board.layout';

export const useFollowerBoardColumnPreferences = (integrationId?: string) => {
  const fetch = useFetch();

  const load = useCallback(async (): Promise<
    FollowerBoardColumnPreference[]
  > => {
    if (!integrationId) {
      return [];
    }
    return (
      await fetch(
        `/user/follower-board-column-preferences?integrationId=${encodeURIComponent(
          integrationId
        )}`
      )
    ).json();
  }, [fetch, integrationId]);

  const swr = useSWR(
    integrationId
      ? `/user/follower-board-column-preferences?integrationId=${integrationId}`
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
    async (preferences: FollowerBoardColumnPreference[]) => {
      const response = await (
        await fetch('/user/follower-board-column-preferences', {
          method: 'POST',
          body: JSON.stringify({ preferences }),
        })
      ).json();
      await swr.mutate(response, false);
      return response as FollowerBoardColumnPreference[];
    },
    [fetch, swr]
  );

  return {
    ...swr,
    savePreferences,
  };
};
