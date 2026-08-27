'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { parseApiError } from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { PIPELINES_KEY } from '@gitroom/frontend/components/pipelines/use.pipeline.list';
import { pipelineDetailKey } from '@gitroom/frontend/components/pipelines/use.pipeline.detail';

export const usePipelineStatus = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (id: string, active: boolean) => {
      const response = await fetch(`${pipelineDetailKey(id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ active }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      await Promise.all([mutate(PIPELINES_KEY), mutate(pipelineDetailKey(id))]);
      return response.json() as Promise<{ active: boolean }>;
    },
    [fetch, mutate]
  );
};
