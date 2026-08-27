'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { PostRuleListItemResponse } from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

const RULES_KEY = '/rules';

export const useRulesList = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch(RULES_KEY)).json() as Promise<
      PostRuleListItemResponse[]
    >;
  }, [fetch]);

  return useSWR<PostRuleListItemResponse[]>(RULES_KEY, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};

export { RULES_KEY };
