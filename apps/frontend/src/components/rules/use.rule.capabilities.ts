'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { PostRuleCapabilitiesResponse } from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

const CAPABILITIES_KEY = '/rules/capabilities';

export const useRuleCapabilities = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (
      await fetch(CAPABILITIES_KEY)
    ).json() as Promise<PostRuleCapabilitiesResponse>;
  }, [fetch]);

  return useSWR<PostRuleCapabilitiesResponse>(CAPABILITIES_KEY, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

export { CAPABILITIES_KEY };
