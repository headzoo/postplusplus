'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { PostRuleResponse } from '@gitroom/nestjs-libraries/dtos/rules/rule.types';

export const ruleDetailKey = (id: string) => `/rules/${id}`;

export const useRuleDetail = (id?: string) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (
      await fetch(ruleDetailKey(id!))
    ).json() as Promise<PostRuleResponse>;
  }, [fetch, id]);

  return useSWR<PostRuleResponse>(id ? ruleDetailKey(id) : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
