'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { PipelineScheduleOccurrence } from '@gitroom/frontend/components/pipelines/pipeline.types';
import { loadPipelineGlobalSchedule } from '@gitroom/frontend/components/pipelines/pipeline.utils';

export const pipelineGlobalScheduleKey = (startDate: string, endDate: string) =>
  `/pipelines/schedule?startDate=${encodeURIComponent(
    startDate
  )}&endDate=${encodeURIComponent(endDate)}`;

export const usePipelineGlobalSchedule = (
  startDate?: string,
  endDate?: string
) => {
  const fetch = useFetch();
  const key =
    startDate && endDate ? pipelineGlobalScheduleKey(startDate, endDate) : null;

  const load = useCallback(async () => {
    return loadPipelineGlobalSchedule(fetch, key!);
  }, [fetch, key]);

  return useSWR<PipelineScheduleOccurrence[]>(key, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};
