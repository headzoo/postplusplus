'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  DeletePipelineScheduleSlotPayload,
  DeletePipelineScheduleSlotResult,
} from '@gitroom/frontend/components/pipelines/pipeline.types';
import { parseApiError } from '@gitroom/frontend/components/pipelines/pipeline.utils';
import { pipelineDetailKey } from '@gitroom/frontend/components/pipelines/use.pipeline.detail';
import { PIPELINES_KEY } from '@gitroom/frontend/components/pipelines/use.pipeline.list';

export const useDeletePipelineScheduleSlot = (globalScheduleKey?: string) => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (pipelineId: string, payload: DeletePipelineScheduleSlotPayload) => {
      const response = await fetch(
        `${pipelineDetailKey(pipelineId)}/schedule`,
        {
          method: 'DELETE',
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      const result =
        (await response.json()) as DeletePipelineScheduleSlotResult;
      await Promise.all([
        globalScheduleKey ? mutate(globalScheduleKey) : Promise.resolve(),
        mutate(PIPELINES_KEY),
        mutate(pipelineDetailKey(pipelineId)),
      ]);
      return result;
    },
    [fetch, globalScheduleKey, mutate]
  );
};
