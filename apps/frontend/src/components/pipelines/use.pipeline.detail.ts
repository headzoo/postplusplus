'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { PipelineDetail } from '@gitroom/frontend/components/pipelines/pipeline.types';

export const pipelineDetailKey = (id: string) => `/pipelines/${id}`;

export const usePipelineDetail = (id?: string) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (
      await fetch(pipelineDetailKey(id!))
    ).json() as Promise<PipelineDetail>;
  }, [fetch, id]);

  return useSWR<PipelineDetail>(id ? pipelineDetailKey(id) : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
